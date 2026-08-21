'use strict';
// A small nested-CSS parser that flattens rules. It exists because the scanner must
// read three kinds of CSS with one code path: the project's source (Tailwind v4
// @theme blocks, @utility, nested &:hover), Tailwind's generated output (nested
// variants wrapped in @media) and plain stylesheets. It is string-, paren- and
// bracket-aware, keeps line numbers, and never throws on unbalanced input: it
// returns what it could parse. Unparsable → skipped, never guessed.

function stripComments(css) {
  let out = '';
  let i = 0;
  let quote = null;
  while (i < css.length) {
    const ch = css[i];
    if (quote) { out += ch; if (ch === '\\') { out += css[i + 1] || ''; i += 2; continue; } if (ch === quote) quote = null; i++; continue; }
    if (ch === '"' || ch === "'") { quote = ch; out += ch; i++; continue; }
    if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      const stop = end < 0 ? css.length : end + 2;
      out += css.slice(i, stop).replace(/[^\n]/g, ' '); // keep newlines so line numbers survive
      i = stop; continue;
    }
    out += ch; i++;
  }
  return out;
}

/** Split on a separator at nesting depth 0 (strings, parens, brackets aware). */
function splitTopLevel(str, sep) {
  const out = [];
  let depth = 0, quote = null, cur = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (quote) { cur += ch; if (ch === '\\') { cur += str[i + 1] || ''; i++; continue; } if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === '\\') { cur += ch + (str[i + 1] || ''); i++; continue; }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    if (ch === ')' || ch === ']' || ch === '}') depth--;
    if (depth === 0 && ch === sep) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim() !== '' || out.length === 0) out.push(cur);
  return out.map((s) => s.trim()).filter((s, i, arr) => s !== '' || arr.length === 1);
}

/** Tokenize into a tree: { type: 'rule'|'at'|'decl'|'statement', ... , children } */
function parseTree(css) {
  const root = { type: 'root', children: [] };
  const stack = [root];
  let i = 0, line = 1;
  const n = css.length;
  const readPrelude = () => {
    let depth = 0, quote = null, buf = '';
    const startLine = line;
    while (i < n) {
      const ch = css[i];
      if (ch === '\n') line++;
      if (quote) { buf += ch; if (ch === '\\') { buf += css[i + 1] || ''; if (css[i + 1] === '\n') line++; i += 2; continue; } if (ch === quote) quote = null; i++; continue; }
      if (ch === '"' || ch === "'") { quote = ch; buf += ch; i++; continue; }
      if (ch === '\\') { buf += ch + (css[i + 1] || ''); i += 2; continue; }
      if (ch === '(' || ch === '[') depth++;
      else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
      else if (depth === 0 && (ch === '{' || ch === ';' || ch === '}')) return { text: buf, stop: ch, startLine };
      buf += ch; i++;
    }
    return { text: buf, stop: null, startLine };
  };
  while (i < n) {
    while (i < n && /\s/.test(css[i])) { if (css[i] === '\n') line++; i++; }
    if (i >= n) break;
    if (css[i] === '}') { i++; if (stack.length > 1) stack.pop(); continue; }
    const { text, stop, startLine } = readPrelude();
    const prelude = text.trim();
    const parent = stack[stack.length - 1];
    if (stop === '{') {
      i++;
      const node = prelude.startsWith('@') ? { type: 'at', prelude, line: startLine, children: [] } : { type: 'rule', prelude, line: startLine, children: [] };
      parent.children.push(node);
      stack.push(node);
    } else if (stop === ';' || stop === '}' || stop === null) {
      if (stop === ';') i++;
      if (prelude) {
        if (prelude.startsWith('@')) parent.children.push({ type: 'statement', prelude, line: startLine });
        else {
          const colon = prelude.indexOf(':');
          if (colon > 0) {
            const prop = prelude.slice(0, colon).trim();
            let value = prelude.slice(colon + 1).trim();
            let important = false;
            if (/!important$/i.test(value)) { important = true; value = value.replace(/\s*!important$/i, '').trim(); }
            parent.children.push({ type: 'decl', prop, value, important, line: startLine });
          }
        }
      }
      if (stop === '}') { i++; if (stack.length > 1) stack.pop(); }
    }
  }
  return root;
}

function combineSelectors(parents, child) {
  const kids = splitTopLevel(child, ',');
  if (!parents || !parents.length) return kids;
  const out = [];
  for (const p of parents) for (const k of kids) {
    if (k.includes('&')) out.push(k.replace(/&/g, p));
    else out.push(`${p} ${k}`);
  }
  return out;
}

/** @returns {{ rules: Rule[], statements: Array<{name, params, line}> }} */
function parse(css) {
  const tree = parseTree(css);
  const rules = [];
  const statements = [];
  const walk = (node, selectors, atRules) => {
    for (const child of node.children) {
      if (child.type === 'statement') {
        const m = /^@([\w-]+)\s*(.*)$/s.exec(child.prelude);
        if (m) statements.push({ name: m[1], params: m[2].trim(), line: child.line, selectors: selectors ? selectors.slice() : [] });
        continue;
      }
      if (child.type === 'decl') continue;
      if (child.type === 'at') {
        const m = /^@([\w-]+)\s*(.*)$/s.exec(child.prelude);
        const name = m ? m[1] : child.prelude.slice(1);
        const params = m ? m[2].trim() : '';
        const decls = child.children.filter((c) => c.type === 'decl').map((c) => ({ prop: c.prop, value: c.value, important: c.important }));
        if (name === 'theme' || name === 'property' || name === 'utility' || name === 'font-face' || name === 'page' || name === 'keyframes' || name === 'counter-style' || name === 'font-feature-values' || name === 'view-transition') {
          const sel = name === 'theme' ? '@theme' : `@${name}${params ? ' ' + params : ''}`;
          if (decls.length) rules.push({ selector: sel, selectors: [sel], declarations: decls, atRules: atRules.slice(), line: child.line });
          if (name === 'keyframes') continue;
          walk(child, selectors && selectors.length ? selectors : [sel], atRules);
          continue;
        }
        const chain = [...atRules, { name, params }];
        if (decls.length && selectors && selectors.length) rules.push({ selector: selectors.join(', '), selectors: selectors.slice(), declarations: decls, atRules: chain, line: child.line });
        walk(child, selectors, chain);
        continue;
      }
      if (child.type === 'rule') {
        const sels = combineSelectors(selectors, child.prelude);
        const decls = child.children.filter((c) => c.type === 'decl').map((c) => ({ prop: c.prop, value: c.value, important: c.important }));
        if (decls.length) rules.push({ selector: sels.join(', '), selectors: sels, declarations: decls, atRules: atRules.slice(), line: child.line });
        walk(child, sels, atRules);
      }
    }
  };
  walk(tree, null, []);
  return { rules, statements };
}

/** Unescape a CSS identifier (\: \[ \# \/ \. \3a  etc.). */
function unescapeIdent(s) {
  return s.replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16))).replace(/\\(.)/g, '$1');
}

/** Class tokens in a selector: [{ raw, name, start, end }], escapes preserved in raw. */
function classTokens(selector) {
  const out = [];
  let i = 0, quote = null, depth = 0;
  while (i < selector.length) {
    const ch = selector[i];
    if (quote) { if (ch === '\\') { i += 2; continue; } if (ch === quote) quote = null; i++; continue; }
    if (ch === '"' || ch === "'") { quote = ch; i++; continue; }
    if (ch === '\\') { i += 2; continue; }
    if (ch === '[') depth++;
    if (ch === ']') depth = Math.max(0, depth - 1);
    if (ch === '.' && depth === 0) {
      let j = i + 1, raw = '';
      while (j < selector.length) {
        const c = selector[j];
        if (c === '\\') { raw += c + (selector[j + 1] || ''); j += 2; continue; }
        if (/[\w-]/.test(c) || c.charCodeAt(0) > 127) { raw += c; j++; continue; }
        break;
      }
      if (raw) { out.push({ raw, name: unescapeIdent(raw), start: i, end: j }); i = j; continue; }
    }
    i++;
  }
  return out;
}

/**
 * Pick the class a selector is "about" and return the remainder.
 * Tailwind output: the escaped utility class (last escaped one if several, e.g. .group:hover .group-hover\:x).
 * Plain CSS: the first class. `descendant` is true when the declarations style something inside/after the class.
 */
function splitClassSelector(selector) {
  const toks = classTokens(selector);
  if (!toks.length) return null;
  const escaped = toks.filter((t) => t.raw.includes('\\'));
  const pick = escaped.length ? escaped[escaped.length - 1] : toks[0];
  const before = selector.slice(0, pick.start).trim();
  const after = selector.slice(pick.end);
  const descendant = /^[\s>+~]/.test(after) && after.trim() !== '';
  const rest = `${before}${before && after.trim() ? ' ' : ''}${descendant ? ' ' + after.trim() : after.trim()}`.trim();
  return { className: pick.name, rest: descendant ? ' ' + rest : rest, raw: pick.raw, descendant };
}

function unescapeClassSelector(selector) { const s = splitClassSelector(selector); return s ? s.className : null; }

function serialize(sheet) {
  return sheet.rules.map((r) => {
    const open = r.atRules.map((a) => `@${a.name} ${a.params} {`).join(' ');
    const close = r.atRules.map(() => '}').join(' ');
    const decls = r.declarations.map((d) => `${d.prop}: ${d.value}${d.important ? ' !important' : ''};`).join(' ');
    return `${open}${open ? ' ' : ''}${r.selector} { ${decls} }${close ? ' ' + close : ''}`;
  }).join('\n');
}

module.exports = { parse, parseTree, stripComments, splitTopLevel, splitClassSelector, unescapeClassSelector, unescapeIdent, classTokens, combineSelectors, serialize };
