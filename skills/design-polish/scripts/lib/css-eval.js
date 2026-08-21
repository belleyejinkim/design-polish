'use strict';
// Resolves CSS values statically: var() substitution against a theme table, calc()
// arithmetic, unit conversion to px, shorthand expansion, shadow parsing, and
// extraction of theme variables (light/dark) from a parsed stylesheet.
// Rule: a value that cannot be resolved statically returns null — e.g. percentages
// of an unknown parent, or a var() with no definition — never a guessed number.

// 16px: the browser default root font size; rem/em values in UI code assume it.
const ROOT_FONT_SIZE = 16;
const MAX_VAR_DEPTH = 8;

function resolveVars(value, vars, opts = {}) {
  const maxDepth = opts.maxDepth || MAX_VAR_DEPTH;
  const get = (name) => (vars instanceof Map ? vars.get(name) : vars ? vars[name] : undefined);
  let out = String(value);
  for (let depth = 0; depth < maxDepth; depth++) {
    if (!out.includes('var(')) break;
    const next = replaceVar(out, get);
    if (next === out) break;
    out = next;
  }
  return out;
}

function replaceVar(str, get) {
  const idx = str.indexOf('var(');
  if (idx < 0) return str;
  let depth = 0, end = -1;
  for (let i = idx + 3; i < str.length; i++) { if (str[i] === '(') depth++; else if (str[i] === ')') { depth--; if (depth === 0) { end = i; break; } } }
  if (end < 0) return str;
  const inner = str.slice(idx + 4, end);
  const comma = topLevelComma(inner);
  const name = (comma < 0 ? inner : inner.slice(0, comma)).trim();
  const fallback = comma < 0 ? null : inner.slice(comma + 1).trim();
  const v = get(name);
  let replacement;
  if (v !== undefined && v !== null && String(v).trim() !== '') replacement = String(v).trim();
  else if (fallback !== null) replacement = fallback;
  else return str.slice(0, end + 1) + replaceVar(str.slice(end + 1), get); // leave unresolved, continue after it
  return str.slice(0, idx) + replacement + replaceVar(str.slice(end + 1), get);
}

function topLevelComma(s) {
  let depth = 0;
  for (let i = 0; i < s.length; i++) { if (s[i] === '(') depth++; else if (s[i] === ')') depth--; else if (s[i] === ',' && depth === 0) return i; }
  return -1;
}

function hasUnresolved(value) { return /var\(/.test(String(value)); }

function parseLength(token, ctx) {
  const t = String(token).trim().toLowerCase();
  if (t === '0') return { value: 0, unit: 'px' };
  if (t === 'infinity' || t === 'inf') return { value: Infinity, unit: '' };
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(px|rem|em|%|vh|vw|pt|ch|ex|cm|mm|in)?$/.exec(t);
  if (!m) return null;
  const v = parseFloat(m[1]);
  const unit = m[2] || '';
  const root = (ctx && ctx.rootFontSize) || ROOT_FONT_SIZE;
  const em = (ctx && ctx.fontSize) || root;
  if (unit === 'px') return { value: v, unit: 'px' };
  if (unit === 'rem') return { value: v * root, unit: 'px' };
  if (unit === 'em') return { value: v * em, unit: 'px' };
  if (unit === 'pt') return { value: (v * 4) / 3, unit: 'px' };
  if (unit === 'in') return { value: v * 96, unit: 'px' };
  if (unit === 'cm') return { value: (v * 96) / 2.54, unit: 'px' };
  if (unit === 'mm') return { value: (v * 96) / 25.4, unit: 'px' };
  if (unit === '%') return { value: v, unit: '%' };
  if (unit === '') return { value: v, unit: '' };
  return null; // vh/vw/ch/ex depend on the viewport or font metrics
}

/** Evaluate calc()/min()/max()/clamp() and plain lengths. Returns { value, unit } or null. */
function evalCalc(expr, ctx) {
  const s = String(expr).trim();
  if (!s) return null;
  try { return parseExpr(s, ctx); } catch (_) { return null; }
}

function parseExpr(s, ctx) {
  let i = 0;
  const peek = () => s[i];
  const skip = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  const add = (a, b, sign) => {
    if (a.unit === b.unit) return { value: a.value + sign * b.value, unit: a.unit };
    if (a.unit === '' && a.value === 0) return { value: sign * b.value, unit: b.unit };
    if (b.unit === '' && b.value === 0) return a;
    throw new Error('mixed units');
  };
  function primary() {
    skip();
    if (peek() === '(') { i++; const v = sum(); skip(); if (peek() !== ')') throw new Error('paren'); i++; return v; }
    const fn = /^(calc|min|max|clamp|round)\(/i.exec(s.slice(i));
    if (fn) {
      const name = fn[1].toLowerCase();
      i += fn[0].length;
      const args = [];
      for (;;) { args.push(sum()); skip(); if (peek() === ',') { i++; continue; } if (peek() === ')') { i++; break; } throw new Error('fn'); }
      if (name === 'calc') return args[0];
      if (args.some((a) => a.unit !== args[0].unit)) throw new Error('mixed units');
      if (name === 'min') return { value: Math.min(...args.map((a) => a.value)), unit: args[0].unit };
      if (name === 'max') return { value: Math.max(...args.map((a) => a.value)), unit: args[0].unit };
      if (name === 'clamp') return { value: Math.min(Math.max(args[1].value, args[0].value), args[2].value), unit: args[0].unit };
      if (name === 'round') return { value: Math.round(args[0].value), unit: args[0].unit };
    }
    let j = i;
    if (s[j] === '+' || s[j] === '-') j++;
    while (j < s.length && /[\w.%]/.test(s[j])) j++;
    const tok = s.slice(i, j);
    if (!tok) throw new Error('token');
    i = j;
    const len = parseLength(tok, ctx);
    if (!len) throw new Error('bad length ' + tok);
    return len;
  }
  function product() {
    let a = primary();
    for (;;) {
      skip();
      if (peek() === '*') { i++; const b = primary(); if (a.unit && b.unit) throw new Error('unit*unit'); a = { value: a.value * b.value, unit: a.unit || b.unit }; continue; }
      if (peek() === '/') { i++; const b = primary(); if (b.unit) throw new Error('div by unit'); if (b.value === 0) throw new Error('div0'); a = { value: a.value / b.value, unit: a.unit }; continue; }
      return a;
    }
  }
  function sum() {
    let a = product();
    for (;;) {
      skip();
      if (peek() === '+') { i++; a = add(a, product(), 1); continue; }
      if (peek() === '-' && /\s/.test(s[i - 1] || '')) { i++; a = add(a, product(), -1); continue; }
      return a;
    }
  }
  const result = sum();
  skip();
  if (i < s.length) throw new Error('trailing');
  return result;
}

function toPx(value, ctx) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s || hasUnresolved(s)) return null;
  if (/^(auto|none|inherit|initial|unset|fit-content|max-content|min-content)$/i.test(s)) return null;
  const r = evalCalc(s, ctx);
  if (!r) return null;
  if (r.unit === '%') return null;
  if (r.unit === '' && r.value !== 0 && !isFinite(r.value)) return Infinity;
  if (r.unit === '' && r.value !== 0) return null; // unitless non-zero length is invalid CSS (line-height is handled separately)
  return r.value;
}

function splitSpace(value) {
  const out = []; let depth = 0, cur = '';
  for (const ch of String(value)) { if (ch === '(') depth++; if (ch === ')') depth--; if (/\s/.test(ch) && depth === 0) { if (cur) out.push(cur); cur = ''; continue; } cur += ch; }
  if (cur) out.push(cur);
  return out;
}

function lengthsOf(shorthand, ctx) {
  const parts = splitSpace(shorthand);
  if (!parts.length || parts.length > 4) return null;
  const px = parts.map((p) => toPx(p, ctx));
  if (px.some((v) => v == null)) return null;
  const [a, b = a, c = a, d = b] = px;
  return { top: a, right: b, bottom: c, left: d };
}

function lineHeightToNumber(value, fontSizePx) {
  const s = String(value).trim();
  if (!s || hasUnresolved(s)) return null;
  if (s === 'normal') return 1.2; // browsers use ≈1.2 for "normal"
  if (/^[\d.]+$/.test(s)) return parseFloat(s);
  if (/%$/.test(s)) return parseFloat(s) / 100;
  const px = toPx(s, { fontSize: fontSizePx });
  if (px == null || !fontSizePx) return null;
  return Math.round((px / fontSizePx) * 1000) / 1000;
}

function parseShadow(value) {
  const s = String(value).trim();
  if (!s || s === 'none' || hasUnresolved(s)) return null;
  const layers = [];
  for (const layer of splitTopLevelComma(s)) {
    const parts = splitSpace(layer);
    const out = { inset: false, x: null, y: null, blur: 0, spread: 0, color: null };
    const nums = [];
    for (const p of parts) {
      if (p === 'inset') { out.inset = true; continue; }
      const px = toPx(p);
      if (px != null && nums.length < 4) { nums.push(px); continue; }
      out.color = p;
    }
    if (nums.length < 2) return null;
    [out.x, out.y, out.blur = 0, out.spread = 0] = nums;
    layers.push(out);
  }
  return layers;
}

function splitTopLevelComma(s) {
  const out = []; let depth = 0, cur = '';
  for (const ch of s) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; } cur += ch; }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Canonical form for hashing: lowercase hex, collapsed whitespace, 0px → 0. */
function normalizeValue(prop, value) {
  let v = String(value).trim().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ');
  v = v.replace(/#[0-9A-Fa-f]{3,8}\b/g, (m) => m.toLowerCase());
  v = v.replace(/(^|[\s(,])0(?:px|rem|em)(?=$|[\s),])/g, '$10');
  return v;
}

const LIGHT_SELECTORS = /^(:root|:host|html|:root\s*,\s*:host|:host\s*,\s*:root|@theme)$/;
function darkSelectorKind(selector) {
  const s = selector.trim();
  if (/^(\.dark|html\.dark|body\.dark|\.dark\s*\*|:is\(\.dark\s*\*\)|:where\(\.dark\s*\*\)|\.dark\s+:root|:root\.dark|\.dark\s+body|\.dark body)$/.test(s)) return 'class';
  if (/\[data-theme=["']?dark["']?\]/.test(s) || /\[data-mode=["']?dark["']?\]/.test(s)) return 'data-attr';
  return null;
}

function extractThemeVars(sheet) {
  const light = new Map(), dark = new Map();
  const sources = [];
  let darkStrategy = 'none', darkSelector = null;
  for (const rule of sheet.rules) {
    const sels = rule.selectors.map((x) => x.trim());
    const isDarkMedia = rule.atRules.some((a) => a.name === 'media' && /prefers-color-scheme:\s*dark/.test(a.params));
    for (const sel of sels) {
      const lightSel = LIGHT_SELECTORS.test(sel) || sel === '@theme' || /^@theme\b/.test(sel);
      const darkKind = darkSelectorKind(sel);
      if (!lightSel && !darkKind) continue;
      const target = (darkKind || (isDarkMedia && lightSel)) ? dark : light;
      if (darkKind) { darkStrategy = darkKind; darkSelector = darkSelector || sel; }
      else if (isDarkMedia && lightSel) { darkStrategy = darkStrategy === 'none' ? 'media' : darkStrategy; }
      for (const d of rule.declarations) {
        if (!d.prop.startsWith('--')) continue;
        target.set(d.prop, d.value);
        sources.push({ name: d.prop, selector: sel, line: rule.line, theme: target === dark ? 'dark' : 'light' });
      }
    }
  }
  return { light, dark, darkStrategy, darkSelector, sources };
}

module.exports = { resolveVars, hasUnresolved, evalCalc, toPx, lengthsOf, lineHeightToNumber, parseShadow, normalizeValue, extractThemeVars, parseLength, splitSpace, ROOT_FONT_SIZE };
