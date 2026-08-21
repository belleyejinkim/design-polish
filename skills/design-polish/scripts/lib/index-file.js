'use strict';
// Parses one source file with the project's TypeScript and extracts what the
// scanner needs: imports, top-level declarations, exports, components (with
// their render roots and prop defaults) and every JSX element with attributes,
// parent pointers and a stable JSX path. Nothing here interprets design values;
// it only makes the code navigable for the modules that do.

const path = require('path');

const CODE_EXTS = ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs'];

function lineCol(sf, pos) {
  const lc = sf.getLineAndCharacterOfPosition(pos);
  return { line: lc.line + 1, col: lc.character + 1 };
}

function isComponentName(name) {
  return /^[A-Z]/.test(name) || name.includes('.');
}

function tagNameText(ts, tagName, sf) {
  return tagName.getText(sf);
}

/**
 * Resolve an import specifier to a file in the scanned set.
 * @param {string} fromRel importing file (repo-relative, posix)
 * @param {string} spec    import specifier
 * @param {{ files: Set<string>, paths?: Record<string,string[]>, baseUrl?: string }} ctx
 * @returns {{ rel: string|null, kind: 'local'|'package'|'unresolved', pkg?: string }}
 */
function resolveImport(fromRel, spec, ctx) {
  const tryFile = (base) => {
    const candidates = [];
    for (const ext of CODE_EXTS) candidates.push(base + ext);
    candidates.push(base); // already has extension
    for (const ext of CODE_EXTS) candidates.push(base + '/index' + ext);
    for (const c of candidates) {
      const norm = path.posix.normalize(c).replace(/^\.\//, '');
      if (ctx.files.has(norm)) return norm;
    }
    return null;
  };
  if (spec.startsWith('.') || spec.startsWith('/')) {
    const base = spec.startsWith('/') ? spec.slice(1) : path.posix.join(path.posix.dirname(fromRel), spec);
    const rel = tryFile(base);
    return rel ? { rel, kind: 'local' } : { rel: null, kind: 'unresolved' };
  }
  // tsconfig paths: "@/*": ["./src/*"]
  if (ctx.paths) {
    for (const [pattern, targets] of Object.entries(ctx.paths)) {
      const star = pattern.indexOf('*');
      const prefix = star >= 0 ? pattern.slice(0, star) : pattern;
      const suffix = star >= 0 ? pattern.slice(star + 1) : '';
      if (!spec.startsWith(prefix) || !spec.endsWith(suffix)) continue;
      const middle = star >= 0 ? spec.slice(prefix.length, spec.length - suffix.length) : '';
      for (const t of targets) {
        const target = t.replace('*', middle);
        const base = path.posix.join(ctx.baseUrl || '.', target);
        const rel = tryFile(base);
        if (rel) return { rel, kind: 'local' };
      }
    }
  }
  // baseUrl-relative bare import (rare)
  if (ctx.baseUrl && ctx.baseUrl !== '.') {
    const rel = tryFile(path.posix.join(ctx.baseUrl, spec));
    if (rel) return { rel, kind: 'local' };
  }
  const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
  return { rel: null, kind: 'package', pkg };
}

/** Collect names (and defaults) from a component's first parameter. */
function paramsOf(ts, fn, sf) {
  const info = { names: [], defaults: {}, rest: null, propsName: null };
  const p = fn.parameters && fn.parameters[0];
  if (!p) return info;
  if (ts.isObjectBindingPattern(p.name)) {
    for (const el of p.name.elements) {
      const local = el.name.getText(sf);
      if (el.dotDotDotToken) { info.rest = local; continue; }
      const prop = el.propertyName ? el.propertyName.getText(sf) : local;
      info.names.push(prop);
      if (el.initializer) info.defaults[prop] = literalValue(ts, el.initializer, sf);
    }
  } else if (ts.isIdentifier(p.name)) {
    info.propsName = p.name.text;
  }
  return info;
}

function literalValue(ts, node, sf) {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isParenthesizedExpression(node)) return literalValue(ts, node.expression, sf);
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression?.(node)) return literalValue(ts, node.expression, sf);
  return { expr: node.getText(sf) };
}

/** Find the function-like node that defines a component, unwrapping forwardRef/memo/HOCs. */
function unwrapComponentInit(ts, init) {
  let node = init;
  for (let i = 0; i < 4 && node; i++) {
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) { node = node.expression; continue; }
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return node;
    if (ts.isCallExpression(node)) {
      // forwardRef(fn), memo(fn), React.memo(fn), styled... -> look for a function argument
      const fnArg = node.arguments.find((a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a));
      if (fnArg) return fnArg;
      const first = node.arguments[0];
      if (first && (ts.isCallExpression(first) || ts.isParenthesizedExpression(first))) { node = first; continue; }
      return null;
    }
    return null;
  }
  return null;
}

/** Collect JSX render roots returned by a function body (handles branches). */
function renderRootsOf(ts, fn, sf) {
  const roots = [];
  // cond: { node, negate } lets resolve-usage pick the branch that matches the props it was given.
  const visitExpr = (e, branch, cond) => {
    if (!e) return;
    if (ts.isParenthesizedExpression(e)) return visitExpr(e.expression, branch, cond);
    if (ts.isJsxElement(e) || ts.isJsxSelfClosingElement(e) || ts.isJsxFragment(e)) { roots.push({ node: e, branch, cond }); return; }
    if (ts.isConditionalExpression(e)) { visitExpr(e.whenTrue, `${e.condition.getText(sf)}`, { node: e.condition, negate: false }); visitExpr(e.whenFalse, `!${e.condition.getText(sf)}`, { node: e.condition, negate: true }); return; }
    if (ts.isBinaryExpression(e) && (e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken || e.operatorToken.kind === ts.SyntaxKind.BarBarToken || e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)) { visitExpr(e.right, e.left.getText(sf), { node: e.left, negate: e.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken }); visitExpr(e.left, null, null); return; }
  };
  const visitStmt = (s, branch, cond) => {
    if (!s) return;
    if (ts.isReturnStatement(s)) return visitExpr(s.expression, branch, cond);
    if (ts.isBlock(s)) return s.statements.forEach((x) => visitStmt(x, branch, cond));
    if (ts.isIfStatement(s)) { visitStmt(s.thenStatement, s.expression.getText(sf), { node: s.expression, negate: false }); visitStmt(s.elseStatement, `!${s.expression.getText(sf)}`, { node: s.expression, negate: true }); return; }
    if (ts.isTryStatement(s)) { visitStmt(s.tryBlock, branch, cond); if (s.catchClause) visitStmt(s.catchClause.block, branch, cond); return; }
    if (ts.isSwitchStatement(s)) { s.caseBlock.clauses.forEach((c) => c.statements.forEach((x) => visitStmt(x, c.getText(sf).slice(0, 40), null))); return; }
    if (ts.isLabeledStatement(s)) return visitStmt(s.statement, branch, cond);
  };
  if (ts.isBlock(fn.body)) visitStmt(fn.body, null, null);
  else visitExpr(fn.body, null, null);
  return roots;
}

function attrValue(ts, init, sf) {
  if (!init) return { kind: 'true' };
  if (ts.isStringLiteral(init)) return { kind: 'string', value: init.text };
  if (ts.isJsxExpression(init)) {
    const e = init.expression;
    if (!e) return { kind: 'expr', node: null, text: '' };
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return { kind: 'string', value: e.text, node: e };
    if (ts.isNumericLiteral(e)) return { kind: 'number', value: Number(e.text), node: e };
    if (e.kind === ts.SyntaxKind.TrueKeyword) return { kind: 'true', node: e };
    if (e.kind === ts.SyntaxKind.FalseKeyword) return { kind: 'false', node: e };
    return { kind: 'expr', node: e, text: e.getText(sf) };
  }
  return { kind: 'expr', node: init, text: init.getText(sf) };
}

/**
 * @returns FileIndex
 */
function parseFile(ts, file) {
  const sf = ts.createSourceFile(file.rel, file.text, ts.ScriptTarget.Latest, true, file.kind === 'ts' || file.kind === 'js' ? (file.kind === 'ts' ? ts.ScriptKind.TS : ts.ScriptKind.JS) : ts.ScriptKind.TSX);
  const index = {
    rel: file.rel,
    kind: file.kind,
    sf,
    imports: [],        // { spec, local, imported, kind: 'default'|'named'|'namespace', typeOnly }
    decls: new Map(),   // name -> { kind: 'const'|'let'|'var'|'function'|'class', node, init }
    exports: new Map(), // exportedName -> localName ('default' -> local)
    reexports: [],      // { spec, names: [{imported, exported}] | '*' }
    components: [],     // { name, fn, params, roots: [{node, branch}], exported: bool }
    jsx: [],            // JsxInfo[]
    parseDiagnostics: sf.parseDiagnostics ? sf.parseDiagnostics.length : 0,
    usesClient: /^\s*['"]use client['"]/.test(file.text),
  };

  // --- imports / exports / declarations (top level) ---
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st)) {
      const spec = st.moduleSpecifier.text;
      const typeOnly = !!(st.importClause && st.importClause.isTypeOnly);
      if (!st.importClause) continue;
      if (st.importClause.name) index.imports.push({ spec, local: st.importClause.name.text, imported: 'default', kind: 'default', typeOnly });
      const nb = st.importClause.namedBindings;
      if (nb) {
        if (ts.isNamespaceImport(nb)) index.imports.push({ spec, local: nb.name.text, imported: '*', kind: 'namespace', typeOnly });
        else for (const el of nb.elements) index.imports.push({ spec, local: el.name.text, imported: (el.propertyName || el.name).text, kind: 'named', typeOnly: typeOnly || !!el.isTypeOnly });
      }
      continue;
    }
    if (ts.isExportDeclaration(st)) {
      if (st.moduleSpecifier) {
        const spec = st.moduleSpecifier.text;
        if (st.exportClause && ts.isNamedExports(st.exportClause)) index.reexports.push({ spec, names: st.exportClause.elements.map((el) => ({ imported: (el.propertyName || el.name).text, exported: el.name.text })) });
        else index.reexports.push({ spec, names: '*' });
      } else if (st.exportClause && ts.isNamedExports(st.exportClause)) {
        for (const el of st.exportClause.elements) index.exports.set(el.name.text, (el.propertyName || el.name).text);
      }
      continue;
    }
    if (ts.isExportAssignment(st)) { // export default X
      if (ts.isIdentifier(st.expression)) index.exports.set('default', st.expression.text);
      else { index.decls.set('default', { kind: 'const', node: st, init: st.expression }); index.exports.set('default', 'default'); }
      continue;
    }
    const isExported = !!(ts.canHaveModifiers(st) && ts.getModifiers(st) || []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    const isDefault = !!(ts.canHaveModifiers(st) && ts.getModifiers(st) || []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
    if (ts.isVariableStatement(st)) {
      const kind = st.declarationList.flags & ts.NodeFlags.Const ? 'const' : st.declarationList.flags & ts.NodeFlags.Let ? 'let' : 'var';
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) {
          index.decls.set(d.name.text, { kind, node: d, init: d.initializer || null });
          if (isExported) index.exports.set(d.name.text, d.name.text);
        }
      }
    } else if (ts.isFunctionDeclaration(st) && st.name) {
      index.decls.set(st.name.text, { kind: 'function', node: st, init: st });
      if (isExported) index.exports.set(isDefault ? 'default' : st.name.text, st.name.text);
    } else if (ts.isFunctionDeclaration(st) && isDefault) {
      index.decls.set('default', { kind: 'function', node: st, init: st });
      index.exports.set('default', 'default');
    } else if (ts.isClassDeclaration(st) && st.name) {
      index.decls.set(st.name.text, { kind: 'class', node: st, init: st });
      if (isExported) index.exports.set(isDefault ? 'default' : st.name.text, st.name.text);
    }
  }

  // --- dynamic imports: import('./x') / next/dynamic(() => import('./x')) / require('./x') ---
  const visitDyn = (n) => {
    if (ts.isCallExpression(n) && n.arguments.length && ts.isStringLiteral(n.arguments[0])) {
      const isImport = n.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(n.expression) && n.expression.text === 'require';
      if (isImport || isRequire) index.imports.push({ spec: n.arguments[0].text, local: null, imported: '*', kind: 'dynamic', typeOnly: false });
    }
    ts.forEachChild(n, visitDyn);
  };
  visitDyn(sf);

  // --- components: declarations whose function body returns JSX ---
  for (const [name, d] of index.decls) {
    let fn = null;
    if (d.kind === 'function') fn = d.node;
    else if (d.init) fn = unwrapComponentInit(ts, d.init);
    if (!fn || !fn.body) continue;
    const roots = renderRootsOf(ts, fn, sf);
    if (!roots.length) continue;
    // Function-scoped declarations such as `const Comp = asChild ? Slot : "button"`.
    const locals = new Map();
    if (ts.isBlock(fn.body)) {
      for (const st of fn.body.statements) {
        if (!ts.isVariableStatement(st)) continue;
        for (const dcl of st.declarationList.declarations) if (ts.isIdentifier(dcl.name)) locals.set(dcl.name.text, { kind: 'local', node: dcl, init: dcl.initializer || null });
      }
    }
    index.components.push({ name, fn, params: paramsOf(ts, fn, sf), roots, locals, exported: [...index.exports.values()].includes(name) });
  }
  const rootNodeToComponent = new Map();
  for (const c of index.components) for (const r of c.roots) rootNodeToComponent.set(r.node, { component: c, branch: r.branch, cond: r.cond });

  // --- JSX elements ---
  const jsxByNode = new Map();
  function ownerComponentOf(node) {
    let n = node.parent;
    let innermostFn = null;
    while (n) {
      if (ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isMethodDeclaration(n)) {
        // Named components: function declarations or variable initializers (incl. forwardRef/memo wrappers)
        let name = null;
        if (ts.isFunctionDeclaration(n) && n.name) name = n.name.text;
        else {
          let p = n.parent;
          while (p && (ts.isCallExpression(p) || ts.isParenthesizedExpression(p) || ts.isAsExpression(p))) p = p.parent;
          if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) name = p.name.text;
          else if (p && ts.isPropertyAssignment(p)) name = p.name.getText(sf);
        }
        if (name && index.decls.has(name)) return name;
        if (!innermostFn) innermostFn = name;
      }
      n = n.parent;
    }
    return innermostFn;
  }
  function structuralChildren(elNode) {
    // Direct JSX children including those nested inside expressions ({cond && <X/>}, {list.map(() => <X/>)})
    const out = [];
    if (!ts.isJsxElement(elNode) && !ts.isJsxFragment(elNode)) return out;
    const visit = (n, flags) => {
      if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) { out.push({ node: n, ...flags }); return; }
      if (ts.isJsxFragment(n)) { n.children.forEach((c) => visit(c, flags)); return; }
      if (ts.isJsxText(n)) return;
      if (ts.isJsxExpression(n)) { if (n.expression) visit(n.expression, flags); return; }
      if (ts.isParenthesizedExpression(n)) return visit(n.expression, flags);
      if (ts.isConditionalExpression(n)) { visit(n.whenTrue, { ...flags, inConditional: true }); visit(n.whenFalse, { ...flags, inConditional: true }); return; }
      if (ts.isBinaryExpression(n)) { visit(n.left, { ...flags, inConditional: true }); visit(n.right, { ...flags, inConditional: true }); return; }
      if (ts.isCallExpression(n)) {
        const calleeText = n.expression.getText(sf);
        const isMap = /\.(map|flatMap|filter)$/.test(calleeText);
        for (const a of n.arguments) {
          if (ts.isArrowFunction(a) || ts.isFunctionExpression(a)) {
            if (ts.isBlock(a.body)) renderRootsOf(ts, a, sf).forEach((r) => visit(r.node, { ...flags, inMap: flags.inMap || isMap }));
            else visit(a.body, { ...flags, inMap: flags.inMap || isMap });
          } else visit(a, flags);
        }
        return;
      }
      if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) { if (ts.isBlock(n.body)) renderRootsOf(ts, n, sf).forEach((r) => visit(r.node, flags)); else visit(n.body, flags); return; }
    };
    elNode.children.forEach((c) => visit(c, { inMap: false, inConditional: false }));
    return out;
  }
  function renderPropChildren(opening) {
    // JSX passed through attributes (render={() => <Input/>}, icon={<Icon/>}) is rendered by the component too.
    const out = [];
    for (const a of opening.attributes.properties) {
      if (!ts.isJsxAttribute(a) || !a.initializer || !ts.isJsxExpression(a.initializer) || !a.initializer.expression) continue;
      const visit = (n, flags) => {
        if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) { out.push({ node: n, ...flags }); return; }
        if (ts.isJsxFragment(n)) { n.children.forEach((c) => visit(c, flags)); return; }
        if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) { if (ts.isBlock(n.body)) renderRootsOf(ts, n, sf).forEach((r) => visit(r.node, flags)); else visit(n.body, flags); return; }
        if (ts.isParenthesizedExpression(n) || ts.isConditionalExpression(n) || ts.isBinaryExpression(n)) { ts.forEachChild(n, (c) => visit(c, { ...flags, inConditional: true })); return; }
        if (ts.isJsxExpression(n) && n.expression) return visit(n.expression, flags);
      };
      visit(a.initializer.expression, { inMap: false, inConditional: false, inRenderProp: a.name.getText(sf) });
    }
    return out;
  }

  function record(node, parentInfo, childIndex, flags) {
    const opening = ts.isJsxElement(node) ? node.openingElement : node;
    const tag = tagNameText(ts, opening.tagName, sf);
    const attrs = {};
    let spread = false;
    for (const a of opening.attributes.properties) {
      if (ts.isJsxSpreadAttribute(a)) { spread = true; continue; }
      const name = a.name.getText(sf);
      attrs[name] = attrValue(ts, a.initializer, sf);
    }
    const start = lineCol(sf, node.getStart(sf));
    const end = lineCol(sf, node.getEnd());
    const rootMeta = rootNodeToComponent.get(node);
    const owner = rootMeta ? rootMeta.component.name : ownerComponentOf(node);
    const jsxPath = parentInfo ? `${parentInfo.jsxPath}.${childIndex}` : (rootMeta ? 'r' : `f${start.line}`);
    const info = {
      node, tag, isComponent: isComponentName(tag), attrs, spread,
      line: start.line, col: start.col, endLine: end.line, endCol: end.col,
      parent: parentInfo, children: [], jsxPath, owner,
      isRenderRoot: !!rootMeta, branch: rootMeta ? rootMeta.branch : null, branchCond: rootMeta ? rootMeta.cond : null,
      inMap: !!(flags && flags.inMap), inConditional: !!(flags && flags.inConditional),
      textLabels: [],
    };
    // text labels: JsxText children and {'literal'} expressions (first level only)
    if (ts.isJsxElement(node)) {
      for (const c of node.children) {
        if (ts.isJsxText(c)) { const t = c.text.replace(/\s+/g, ' ').trim(); if (t) info.textLabels.push(t); }
        else if (ts.isJsxExpression(c) && c.expression && (ts.isStringLiteral(c.expression) || ts.isNoSubstitutionTemplateLiteral(c.expression))) info.textLabels.push(c.expression.text);
      }
    }
    jsxByNode.set(node, info);
    index.jsx.push(info);
    const kids = [...structuralChildren(node), ...renderPropChildren(opening)];
    kids.forEach((k, i) => {
      if (jsxByNode.has(k.node)) return;
      const childInfo = record(k.node, info, i, { inMap: k.inMap, inConditional: k.inConditional });
      if (k.inRenderProp) childInfo.inRenderProp = k.inRenderProp;
      info.children.push(childInfo);
    });
    return info;
  }

  // Walk the whole file; record any JSX element not already recorded as a child.
  const visitAll = (n) => {
    if ((ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) && !jsxByNode.has(n)) {
      record(n, null, 0, null);
      return; // children recorded recursively
    }
    ts.forEachChild(n, visitAll);
  };
  visitAll(sf);
  // Ensure deterministic order by position
  index.jsx.sort((a, b) => a.node.getStart(sf) - b.node.getStart(sf));
  index.jsxByNode = jsxByNode;
  return index;
}

// Strip line and block comments and trailing commas from JSONC without touching strings.
function stripJsonc(text) {
  let out = '';
  let i = 0;
  let inStr = false;
  while (i < text.length) {
    const ch = text[i];
    if (inStr) {
      out += ch;
      if (ch === '\\') { out += text[i + 1] || ''; i += 2; continue; }
      if (ch === '"') inStr = false;
      i++; continue;
    }
    if (ch === '"') { inStr = true; out += ch; i++; continue; }
    if (ch === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (ch === '/' && text[i + 1] === '*') { const end = text.indexOf('*/', i + 2); i = end < 0 ? text.length : end + 2; continue; }
    out += ch; i++;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

/** Read tsconfig paths/baseUrl if present (tolerates comments and trailing commas). */
function readTsconfig(root, ts) {
  const fs = require('fs');
  for (const name of ['tsconfig.json', 'jsconfig.json']) {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) continue;
    try {
      const raw = fs.readFileSync(p, 'utf8');
      let json;
      if (ts && ts.parseConfigFileTextToJson) json = ts.parseConfigFileTextToJson(p, raw).config || {};
      else json = JSON.parse(stripJsonc(raw));
      const co = json.compilerOptions || {};
      return { paths: co.paths || null, baseUrl: co.baseUrl || '.' };
    } catch (_) { return { paths: null, baseUrl: '.' }; }
  }
  return { paths: null, baseUrl: '.' };
}

module.exports = { parseFile, resolveImport, readTsconfig, stripJsonc, isComponentName, literalValue, renderRootsOf, unwrapComponentInit, CODE_EXTS };
