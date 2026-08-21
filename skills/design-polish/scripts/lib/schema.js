'use strict';
// A deliberately small JSON-Schema subset, enough to seal the hand-offs between
// scripts (the v2 harness lost data silently when one agent wrote `count` and the
// next read `usage_count`; a schema check between steps makes that impossible).
// Supported: type (incl. arrays of types), required, properties, additionalProperties,
// items, enum, const, pattern, minimum, maximum, minItems, nullable via type arrays,
// $ref to #/definitions/<name>, anyOf/oneOf (first match wins), allOf.

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v; // 'object' | 'string' | 'number' | 'boolean'
}

function validate(schema, value, opts = {}) {
  const errors = [];
  const root = opts.root || schema;
  const defs = root.definitions || root.$defs || {};
  function check(s, v, p) {
    if (!s || typeof s !== 'object') return;
    if (s.$ref) {
      const m = /^#\/(?:definitions|\$defs)\/(.+)$/.exec(s.$ref);
      const target = m && defs[m[1]];
      if (!target) { errors.push(`${p}: unknown $ref ${s.$ref}`); return; }
      return check(target, v, p);
    }
    if (s.allOf) s.allOf.forEach((sub) => check(sub, v, p));
    if (s.anyOf || s.oneOf) {
      const subs = s.anyOf || s.oneOf;
      const ok = subs.some((sub) => validate({ ...sub, definitions: defs }, v, { root }).ok);
      if (!ok) errors.push(`${p}: matches none of ${subs.length} alternatives`);
    }
    if (s.type) {
      const types = Array.isArray(s.type) ? s.type : [s.type];
      const t = typeOf(v);
      const okType = types.some((tt) => tt === t || (tt === 'integer' && t === 'number' && Number.isInteger(v)));
      if (!okType) { errors.push(`${p}: expected ${types.join('|')}, got ${t}`); return; }
    }
    if (s.enum && !s.enum.some((e) => e === v)) errors.push(`${p}: ${JSON.stringify(v)} not in enum`);
    if (Object.prototype.hasOwnProperty.call(s, 'const') && s.const !== v) errors.push(`${p}: expected const ${JSON.stringify(s.const)}`);
    if (typeof v === 'string' && s.pattern && !new RegExp(s.pattern).test(v)) errors.push(`${p}: "${v}" does not match /${s.pattern}/`);
    if (typeof v === 'number') {
      if (s.minimum !== undefined && v < s.minimum) errors.push(`${p}: ${v} < minimum ${s.minimum}`);
      if (s.maximum !== undefined && v > s.maximum) errors.push(`${p}: ${v} > maximum ${s.maximum}`);
    }
    if (Array.isArray(v)) {
      if (s.minItems !== undefined && v.length < s.minItems) errors.push(`${p}: fewer than ${s.minItems} items`);
      if (s.items) v.forEach((item, i) => check(s.items, item, `${p}[${i}]`));
    }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const r of s.required || []) if (!(r in v)) errors.push(`${p}: missing required "${r}"`);
      const props = s.properties || {};
      for (const [k, sub] of Object.entries(props)) if (k in v) check(sub, v[k], `${p}.${k}`);
      if (s.additionalProperties === false) {
        for (const k of Object.keys(v)) if (!(k in props)) errors.push(`${p}: unexpected property "${k}"`);
      } else if (s.additionalProperties && typeof s.additionalProperties === 'object') {
        for (const k of Object.keys(v)) if (!(k in props)) check(s.additionalProperties, v[k], `${p}.${k}`);
      }
    }
  }
  check(schema, value, '$');
  return { ok: errors.length === 0, errors };
}

module.exports = { validate };
