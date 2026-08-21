'use strict';
// A signature is "one look": the set of resolved CSS declarations that style a
// control, with placement-only utilities removed. Two elements with the same
// signature render identically wherever they are. Identity is a hash of the
// declarations, so `px-4 py-2` and `p-[16px_8px]` produce the same id while
// `rounded-md` and `rounded-[6px]` do not.

const { sigId } = require('./ids');

// Utilities that place an element in its parent rather than style it. They differ
// legitimately from usage to usage and would split one look into dozens.
const PLACEMENT_RE = /^(?:(?:-?m[trblxyse]?)-|w-|min-w-|max-w-|basis-|grow|shrink|flex-(?:1|auto|initial|none|\d)|col-(?:span|start|end)-|row-(?:span|start|end)-|self-|place-self-|justify-self-|order-|z-|absolute$|relative$|fixed$|sticky$|static$|inset-|top-|right-|bottom-|left-|float-|clear-|translate-|isolate$|hidden$|block$|sr-only$|not-sr-only$|ml-auto$|mr-auto$|mx-auto$|my-auto$|mt-auto$|mb-auto$)/;
// Same idea at the CSS property level (covers arbitrary values and plain CSS).
const PLACEMENT_PROPS = new Set(['margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'margin-inline', 'margin-block', 'margin-inline-start', 'margin-inline-end', 'width', 'min-width', 'max-width', 'flex', 'flex-grow', 'flex-shrink', 'flex-basis', 'grid-column', 'grid-column-start', 'grid-column-end', 'grid-row', 'grid-row-start', 'grid-row-end', 'align-self', 'justify-self', 'place-self', 'order', 'z-index', 'position', 'top', 'right', 'bottom', 'left', 'inset', 'inset-inline', 'inset-block', 'float', 'clear', 'translate', 'isolation', 'scroll-margin', 'container-type', 'container-name']);
// Variant prefixes that are placement/layout-only when they wrap a placement token are filtered with it.

function stripVariantPrefix(token) {
  // "md:hover:px-3" → { variants: ['md','hover'], base: 'px-3' } (bracket-aware: data-[state=open]:bg-x)
  const parts = [];
  let depth = 0, cur = '';
  for (const ch of token) {
    if (ch === '[') depth++;
    if (ch === ']') depth--;
    if (ch === ':' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  parts.push(cur);
  const base = parts.pop();
  return { variants: parts, base: base.startsWith('!') ? base.slice(1) : base, important: base.startsWith('!') };
}

function isPlacementToken(token) {
  const { base } = stripVariantPrefix(token);
  return PLACEMENT_RE.test(base);
}

function canonicalScopes(scopes) {
  // scopes: { base: {prop: value}, hover: {...}, ... } → sorted, placement props removed
  const out = {};
  for (const scope of Object.keys(scopes).sort()) {
    const decls = scopes[scope];
    const keys = Object.keys(decls).filter((p) => !PLACEMENT_PROPS.has(p) && !p.startsWith('--tw-')).sort();
    if (!keys.length) continue;
    out[scope] = {};
    for (const k of keys) out[scope][k] = String(decls[k]).replace(/\s+/g, ' ').trim().toLowerCase();
  }
  return out;
}

/**
 * @param {string} type component type
 * @param {object} scopes resolved declarations by scope (from tw-bridge), placement already filtered or not
 * @param {string[]} spellings class strings that produced it
 * @param {{ idBasis: 'decl'|'tokens', tokens?: string[] }} opts
 */
function build(type, scopes, spellings, opts = {}) {
  const canonical = canonicalScopes(scopes || {});
  let key;
  let idBasis = 'decl';
  if (Object.keys(canonical).length) key = JSON.stringify(canonical);
  else { idBasis = 'tokens'; key = (opts.tokens || []).filter((t) => !isPlacementToken(t)).sort().join(' '); }
  return { id: sigId(type, key), key, idBasis, canonical, spellings: [...new Set(spellings)] };
}

module.exports = { build, isPlacementToken, stripVariantPrefix, canonicalScopes, PLACEMENT_RE, PLACEMENT_PROPS };
