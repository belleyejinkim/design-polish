'use strict';
// Evaluates a className expression statically into an ordered set of class tokens.
// Handles the ways AI-written React code composes classes: string literals,
// template literals, cn()/clsx()/twMerge(), cva() variant functions, const maps
// (BTN_VARIANT[variant]), conditionals and object syntax. Anything that cannot be
// decided statically is recorded under `unknown`/`conditional` instead of being
// guessed; the report then says "N sites could not be resolved".

const CN_FUNCS = new Set(['cn', 'clsx', 'classNames', 'classnames', 'twMerge', 'twJoin', 'cx', 'clsxm', 'cls', 'classList']);
// Following wrappers deeper than this almost always means a design-system library, not app code.
const MAX_DEPTH = 6;

function emptySet() { return { tokens: [], conditional: [], unknown: [], slots: [], origins: {} }; }

// origin: where the literal that produced these tokens is written ({ file, line, col }); apply.js edits there.
function fromString(str, origin) {
  const set = emptySet();
  const tokens = String(str).split(/\s+/).filter(Boolean);
  addTokens(set, tokens);
  if (origin) for (const t of tokens) set.origins[t] = origin;
  return set;
}

function originOf(node, ctx) {
  if (!node || !ctx || !ctx.sf || !ctx.index) return null;
  try { const lc = ctx.sf.getLineAndCharacterOfPosition(node.getStart(ctx.sf)); return { file: ctx.index.rel, line: lc.line + 1, col: lc.character + 1 }; } catch (_) { return null; }
}

// Keep the LAST occurrence of a duplicate token so "later wins" ordering is preserved.
function addTokens(set, tokens) {
  for (const t of tokens) {
    const i = set.tokens.indexOf(t);
    if (i >= 0) set.tokens.splice(i, 1);
    set.tokens.push(t);
  }
}

function merge(into, from) {
  if (!from) return into;
  addTokens(into, from.tokens);
  if (from.origins) Object.assign(into.origins, from.origins);
  into.conditional.push(...from.conditional);
  into.unknown.push(...from.unknown);
  for (const s of from.slots) if (!into.slots.includes(s)) into.slots.push(s);
  if (from.cva && !into.cva) into.cva = from.cva;
  return into;
}

function conditional(set, condition, tokensSet) {
  if (!tokensSet) return set;
  if (tokensSet.tokens.length) set.conditional.push({ condition: String(condition).slice(0, 80), tokens: tokensSet.tokens.slice() });
  set.conditional.push(...tokensSet.conditional);
  set.unknown.push(...tokensSet.unknown);
  return set;
}

function unknownSet(text) {
  const set = emptySet();
  set.unknown.push(String(text).slice(0, 120));
  return set;
}

/** Resolve an identifier in order: caller env → local declaration → import. */
function resolveIdent(name, ctx) {
  if (ctx.env && Object.prototype.hasOwnProperty.call(ctx.env, name)) return { kind: 'env', value: ctx.env[name] };
  const index = ctx.index;
  if (ctx.locals && ctx.locals.has(name)) {
    const d = ctx.locals.get(name);
    return { kind: 'decl', init: d.init, index, name, local: true };
  }
  if (index && index.decls.has(name)) {
    const d = index.decls.get(name);
    return { kind: 'decl', init: d.init, index, name };
  }
  if (index) {
    const imp = index.imports.find((i) => i.local === name);
    if (imp && ctx.project) {
      const target = ctx.project.resolve(index.rel, imp.spec);
      if (target.kind === 'local' && target.rel) {
        const tIndex = ctx.project.indexes.get(target.rel);
        if (tIndex) {
          const exportedName = imp.kind === 'default' ? 'default' : imp.imported;
          const localName = followExport(tIndex, exportedName, ctx.project, 0);
          if (localName) return { kind: 'decl', init: localName.index.decls.get(localName.name)?.init || null, index: localName.index, name: localName.name };
        }
      }
      return { kind: 'package', pkg: target.pkg || imp.spec, spec: imp.spec, imported: imp.imported, importKind: imp.kind };
    }
  }
  return { kind: 'unknown' };
}

/** Follow `export { X as Y }` / `export * from` chains to the declaring file. */
function followExport(index, exportedName, project, depth) {
  if (depth > 4) return null;
  if (index.exports.has(exportedName)) {
    const local = index.exports.get(exportedName);
    if (index.decls.has(local)) return { index, name: local };
  }
  for (const re of index.reexports) {
    const target = project.resolve(index.rel, re.spec);
    if (target.kind !== 'local' || !target.rel) continue;
    const tIndex = project.indexes.get(target.rel);
    if (!tIndex) continue;
    if (re.names === '*') { const hit = followExport(tIndex, exportedName, project, depth + 1); if (hit) return hit; }
    else { const m = re.names.find((n) => n.exported === exportedName); if (m) { const hit = followExport(tIndex, m.imported, project, depth + 1); if (hit) return hit; } }
  }
  return null;
}

/** Truthiness of a condition if statically known. */
function evalCond(node, ctx) {
  const { ts, sf } = ctx;
  if (!node) return undefined;
  if (ts.isParenthesizedExpression(node)) return evalCond(node.expression, ctx);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword || node.kind === ts.SyntaxKind.NullKeyword) return false;
  if (ts.isStringLiteral(node)) return node.text.length > 0;
  if (ts.isNumericLiteral(node)) return Number(node.text) !== 0;
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) { const v = evalCond(node.operand, ctx); return v === undefined ? undefined : !v; }
  if (ts.isIdentifier(node)) {
    const r = resolveIdent(node.text, ctx);
    if (r.kind === 'env') { const v = r.value; if (v === undefined || (v && typeof v === 'object' && v.expr)) return undefined; return !!v; }
    return undefined;
  }
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
    const base = resolveIdent(node.expression.text, ctx);
    if (base.kind === 'env' && base.value && typeof base.value === 'object' && !base.value.expr) { const v = base.value[node.name.text]; return v === undefined ? undefined : !!v; }
    return undefined;
  }
  if (ts.isBinaryExpression(node)) {
    const k = node.operatorToken.kind;
    if (k === ts.SyntaxKind.EqualsEqualsEqualsToken || k === ts.SyntaxKind.EqualsEqualsToken || k === ts.SyntaxKind.ExclamationEqualsEqualsToken || k === ts.SyntaxKind.ExclamationEqualsToken) {
      const l = staticValue(node.left, ctx); const r = staticValue(node.right, ctx);
      if (l === undefined || r === undefined) return undefined;
      const eq = l === r;
      return (k === ts.SyntaxKind.EqualsEqualsEqualsToken || k === ts.SyntaxKind.EqualsEqualsToken) ? eq : !eq;
    }
    if (k === ts.SyntaxKind.AmpersandAmpersandToken) { const l = evalCond(node.left, ctx); if (l === false) return false; const r = evalCond(node.right, ctx); if (l === true) return r; return r === false ? false : undefined; }
    if (k === ts.SyntaxKind.BarBarToken) { const l = evalCond(node.left, ctx); if (l === true) return true; const r = evalCond(node.right, ctx); if (l === false) return r; return r === true ? true : undefined; }
  }
  return undefined;
}

/** A primitive value if statically known (string/number/boolean), else undefined. */
function staticValue(node, ctx) {
  const { ts } = ctx;
  if (!node) return undefined;
  if (ts.isParenthesizedExpression(node)) return staticValue(node.expression, ctx);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isIdentifier(node)) {
    const r = resolveIdent(node.text, ctx);
    if (r.kind === 'env') return (r.value && typeof r.value === 'object') ? undefined : r.value;
    if (r.kind === 'decl' && r.init && (ts.isStringLiteral(r.init) || ts.isNumericLiteral(r.init))) return staticValue(r.init, { ...ctx, index: r.index, env: null });
    return undefined;
  }
  return undefined;
}

/** Evaluate an object literal of string values (const map) into { key: ClassSet }. */
function objectModel(node, ctx) {
  const { ts, sf } = ctx;
  if (!node || !ts.isObjectLiteralExpression(node)) return null;
  const entries = new Map();
  for (const p of node.properties) {
    if (!ts.isPropertyAssignment(p)) continue;
    const key = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) || ts.isNumericLiteral(p.name) ? p.name.text : p.name.getText(sf);
    entries.set(key, p.initializer);
  }
  return { kind: 'object', entries };
}

function evaluate(node, ctx) {
  const { ts, sf } = ctx;
  if (!node) return emptySet();
  if (ctx.depth > MAX_DEPTH) return unknownSet('depth');
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return fromString(node.text, originOf(node, ctx));
  if (ts.isJsxExpression(node)) return evaluate(node.expression, ctx);
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node) || (ts.isSatisfiesExpression && ts.isSatisfiesExpression(node)) || ts.isTypeAssertionExpression?.(node)) return evaluate(node.expression, ctx);
  if (ts.isTemplateExpression(node)) {
    // Rebuild the template as segments; a class token that contains a ${} placeholder is dynamic
    // (`btn-${kind}`) and must not leak its static fragment ("btn-") or the prop value as tokens.
    const set = emptySet();
    const segments = [{ text: node.head.text }];
    for (const span of node.templateSpans) { segments.push({ expr: span.expression }); segments.push({ text: span.literal.text }); }
    let cur = ''; // current token being assembled; null-safe marker when it contains an expression
    let curHasExpr = false;
    let curExprSet = null;
    const tplOrigin = originOf(node, ctx);
    const flush = () => {
      if (cur !== '' || curHasExpr) {
        if (curHasExpr) { if (cur === '') { if (curExprSet) merge(set, curExprSet); } else set.unknown.push(cur.replace(/\u0000/g, '${…}')); }
        else { addTokens(set, [cur]); if (tplOrigin) set.origins[cur] = tplOrigin; }
      }
      cur = ''; curHasExpr = false; curExprSet = null;
    };
    for (const seg of segments) {
      if (seg.expr) {
        // An expression glued to text (no whitespace around it) is part of the token.
        const sub = evaluate(seg.expr, ctx);
        if (cur === '') { flush(); cur = ''; curHasExpr = true; curExprSet = sub; cur = ''; continue; }
        curHasExpr = true; cur += '\u0000'; continue;
      }
      const text = seg.text;
      if (!text) continue;
      const parts = text.split(/(\s+)/);
      for (const part of parts) {
        if (part === '') continue;
        if (/^\s+$/.test(part)) { flush(); continue; }
        if (curHasExpr && cur === '' && curExprSet) {
          // expression immediately followed by text: glued → dynamic token
          curExprSet = null; cur = '\u0000' + part; continue;
        }
        cur += part;
      }
    }
    flush();
    return set;
  }
  if (ts.isArrayLiteralExpression(node)) {
    const set = emptySet();
    for (const el of node.elements) merge(set, evaluate(el, ctx));
    return set;
  }
  if (ts.isObjectLiteralExpression(node)) {
    // clsx object syntax: { 'a b': cond }
    const set = emptySet();
    for (const p of node.properties) {
      if (!ts.isPropertyAssignment(p)) { if (ts.isShorthandPropertyAssignment(p)) { const c = evalCond(p.name, ctx); if (c) addTokens(set, fromString(p.name.text).tokens); else if (c === undefined) conditional(set, p.name.text, fromString(p.name.text)); } continue; }
      const key = ts.isStringLiteral(p.name) || ts.isIdentifier(p.name) ? p.name.text : p.name.getText(sf);
      const c = evalCond(p.initializer, ctx);
      if (c === true) merge(set, fromString(key, originOf(p.name, ctx)));
      else if (c === undefined) conditional(set, p.initializer.getText(sf), fromString(key, originOf(p.name, ctx)));
    }
    return set;
  }
  if (ts.isConditionalExpression(node)) {
    const c = evalCond(node.condition, ctx);
    if (c === true) return evaluate(node.whenTrue, ctx);
    if (c === false) return evaluate(node.whenFalse, ctx);
    const set = emptySet();
    conditional(set, node.condition.getText(sf), evaluate(node.whenTrue, ctx));
    conditional(set, '!' + node.condition.getText(sf), evaluate(node.whenFalse, ctx));
    return set;
  }
  if (ts.isBinaryExpression(node)) {
    const k = node.operatorToken.kind;
    if (k === ts.SyntaxKind.AmpersandAmpersandToken) {
      const c = evalCond(node.left, ctx);
      if (c === true) return evaluate(node.right, ctx);
      if (c === false) return emptySet();
      return conditional(emptySet(), node.left.getText(sf), evaluate(node.right, ctx));
    }
    if (k === ts.SyntaxKind.BarBarToken || k === ts.SyntaxKind.QuestionQuestionToken) {
      const c = evalCond(node.left, ctx);
      if (c === true) return evaluate(node.left, ctx);
      if (c === false) return evaluate(node.right, ctx);
      const set = evaluate(node.left, ctx);
      conditional(set, '!' + node.left.getText(sf), evaluate(node.right, ctx));
      return set;
    }
    if (k === ts.SyntaxKind.PlusToken) { const set = evaluate(node.left, ctx); return merge(set, evaluate(node.right, ctx)); }
    return unknownSet(node.getText(sf));
  }
  if (ts.isIdentifier(node)) {
    const name = node.text;
    const r = resolveIdent(name, ctx);
    if (r.kind === 'env') {
      const v = r.value;
      const set = emptySet();
      if (name === 'className' || name === 'class') set.slots.push(name);
      if (typeof v === 'string') merge(set, fromString(v, v.__origin || null));
      else if (v && typeof v === 'object' && v.classSet) merge(set, v.classSet);
      else if (v && typeof v === 'object' && v.expr) set.unknown.push(v.expr);
      return set; // undefined prop → nothing
    }
    if (r.kind === 'decl') {
      if (!r.init) return unknownSet(name);
      const sub = { ...ctx, index: r.index, sf: r.index.sf, env: null, depth: (ctx.depth || 0) + 1 };
      if (ts.isStringLiteral(r.init) || ts.isNoSubstitutionTemplateLiteral(r.init) || ts.isTemplateExpression(r.init) || ts.isArrayLiteralExpression(r.init)) return evaluate(r.init, sub);
      if (ts.isObjectLiteralExpression(r.init)) return unknownSet(name + '(object)');
      return unknownSet(name);
    }
    return unknownSet(name);
  }
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    const objNode = node.expression;
    let key;
    if (ts.isPropertyAccessExpression(node)) key = node.name.text;
    else key = staticValue(node.argumentExpression, ctx);
    // props.className / props.class
    if (ts.isIdentifier(objNode)) {
      const base = resolveIdent(objNode.text, ctx);
      if (base.kind === 'env') {
        const v = base.value;
        if (v && typeof v === 'object' && !v.expr && key !== undefined && key in v) {
          const set = emptySet();
          if (key === 'className') set.slots.push('className');
          const inner = v[key];
          if (typeof inner === 'string') addTokens(set, fromString(inner).tokens);
          else if (inner && inner.classSet) merge(set, inner.classSet);
          return set;
        }
        if (key === 'className' || key === 'class') { const set = emptySet(); set.slots.push('className'); return set; }
        return unknownSet(node.getText(sf));
      }
      if (base.kind === 'decl' && base.init) {
        const model = objectModel(base.init, { ...ctx, index: base.index, sf: base.index.sf });
        if (model) {
          const sub = { ...ctx, index: base.index, sf: base.index.sf, env: null, depth: (ctx.depth || 0) + 1 };
          if (key !== undefined && model.entries.has(String(key))) return evaluate(model.entries.get(String(key)), sub);
          if (key === undefined) {
            // Unknown key: every entry is a possible alternative.
            const set = emptySet();
            for (const [k, v] of model.entries) conditional(set, `${objNode.text}[${k}]`, evaluate(v, sub));
            set.unknown.push(node.getText(sf));
            return set;
          }
          return emptySet();
        }
      }
      if (base.kind === 'package') return unknownSet(node.getText(sf)); // e.g. styles.button from CSS modules
    }
    return unknownSet(node.getText(sf));
  }
  if (ts.isCallExpression(node)) {
    const calleeText = node.expression.getText(sf);
    const calleeName = ts.isIdentifier(node.expression) ? node.expression.text : (ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : null);
    if (calleeName && CN_FUNCS.has(calleeName)) {
      const set = emptySet();
      for (const a of node.arguments) merge(set, evaluate(a, ctx));
      return set;
    }
    // cva variant function: buttonVariants({ variant, size, className })
    if (ts.isIdentifier(node.expression)) {
      const r = resolveIdent(node.expression.text, ctx);
      if (r.kind === 'decl' && r.init && ts.isCallExpression(r.init) && /(^|\.)cva$/.test(r.init.expression.getText(r.index.sf))) {
        const { parseCva, applyCva } = require('./cva');
        const model = ctx.cvaCache && ctx.cvaCache.get(r.index.rel + '#' + r.name) || parseCva(r.init, { ...ctx, index: r.index, sf: r.index.sf, env: null, depth: (ctx.depth || 0) + 1 });
        if (ctx.cvaCache) ctx.cvaCache.set(r.index.rel + '#' + r.name, model);
        const argEnv = {};
        let classNameSet = null;
        const arg = node.arguments[0];
        if (arg && ts.isObjectLiteralExpression(arg)) {
          for (const p of arg.properties) {
            let key, valueNode;
            if (ts.isShorthandPropertyAssignment(p)) { key = p.name.text; valueNode = p.name; }
            else if (ts.isPropertyAssignment(p)) { key = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : p.name.getText(sf); valueNode = p.initializer; }
            else continue;
            if (key === 'className' || key === 'class') { classNameSet = evaluate(valueNode, ctx); continue; }
            const v = staticValue(valueNode, ctx);
            argEnv[key] = v;
          }
        }
        const applied = applyCva(model, argEnv);
        const set = emptySet();
        addTokens(set, applied.tokens);
        for (const t of applied.tokens) if (applied.origins[t]) set.origins[t] = applied.origins[t];
        if (classNameSet) merge(set, classNameSet);
        set.cva = { name: r.name, file: r.index.rel, axes: applied.axesUsed, inferred: applied.inferred };
        return set;
      }
    }
    return unknownSet(calleeText + '(…)');
  }
  return unknownSet(node.getText(sf));
}

module.exports = { evaluate, evalCond, staticValue, resolveIdent, followExport, fromString, merge, emptySet, addTokens, CN_FUNCS, MAX_DEPTH };
