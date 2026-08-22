#!/usr/bin/env node
'use strict';
// design-polish check: the schema gate between steps.
//
//   design-polish check <kind> <file.json>     kind = inventory | findings | proposal | cards | decisions | narrative | plan | verification | delta | baseline
//
// A producer may not claim success until its file passes; a consumer must not read
// a file that has not passed. Cross-references (e.g. a card's subjects must exist in
// the inventory) are checked when the sibling file is present in the same directory.

const fs = require('fs');
const path = require('path');
const { validate } = require('./lib/schema');

const KINDS = ['inventory', 'findings', 'proposal', 'cards', 'decisions', 'narrative', 'plan', 'verification', 'delta', 'baseline'];

function loadSchema(kind) {
  const p = path.join(__dirname, '..', 'schemas', `${kind}.schema.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function collectIds(inv) {
  const ids = new Set();
  for (const r of inv.routes || []) ids.add(r.id);
  for (const t of Object.values(inv.components || {})) { for (const s of t.signatures) ids.add(s.id); for (const i of t.implementations) ids.add(i.id); }
  for (const o of inv.occurrences || []) ids.add(o.id);
  for (const g of (inv.relationships && inv.relationships.siblingGroups) || []) ids.add(g.id);
  const tok = inv.tokens || {};
  for (const d of tok.declared || []) ids.add(d.id);
  for (const axis of ['colors', 'typography', 'spacing', 'radius', 'border', 'shadows']) for (const v of (tok[axis] && tok[axis].values) || []) ids.add(v.id);
  for (const c of (tok.colors && tok.colors.clusters) || []) ids.add(c.id);
  for (const u of (inv.classes && inv.classes.unresolved) || []) ids.add(`cls:${u.cls}`);
  return ids;
}

function crossCheck(kind, value, dir) {
  const errors = [];
  const invPath = path.join(dir, 'inventory.json');
  const inv = fs.existsSync(invPath) ? JSON.parse(fs.readFileSync(invPath, 'utf8')) : null;
  if (kind === 'inventory') {
    // internal integrity: every occurrence's sigId exists, Σ signature.count == type.total
    const sigs = new Set();
    for (const [type, t] of Object.entries(value.components)) {
      let sum = 0, cat = 0;
      for (const s of t.signatures) { sigs.add(s.id); sum += s.count; cat += s.catalogCount; if (s.type !== type) errors.push(`signature ${s.id} listed under ${type}`); }
      if (sum !== t.total) errors.push(`${type}: Σ signature.count ${sum} ≠ total ${t.total}`);
      if (cat !== t.catalog) errors.push(`${type}: Σ signature.catalogCount ${cat} ≠ catalog ${t.catalog}`);
    }
    const occIds = new Set();
    for (const o of value.occurrences) { if (!sigs.has(o.sigId)) errors.push(`occurrence ${o.id} references unknown signature ${o.sigId}`); if (occIds.has(o.id)) errors.push(`duplicate occurrence id ${o.id}`); occIds.add(o.id); }
    for (const g of value.relationships.siblingGroups) for (const m of g.members) if (!occIds.has(m)) errors.push(`sibling group ${g.id} references unknown occurrence ${m}`);
    const routeIds = new Set(value.routes.map((r) => r.id));
    for (const o of value.occurrences) for (const r of o.routes) if (!routeIds.has(r)) errors.push(`occurrence ${o.id} references unknown route ${r}`);
  }
  if (kind === 'findings' && inv) {
    const ids = collectIds(inv);
    for (const f of value.findings) for (const s of f.subjects) if (!ids.has(s)) errors.push(`finding ${f.id} subject ${s} not in inventory`);
    const routeIds = new Set(inv.routes.map((r) => r.id));
    for (const f of value.findings) for (const r of f.screens) if (!routeIds.has(r)) errors.push(`finding ${f.id} screen ${r} not in inventory`);
  }
  if ((kind === 'cards' || kind === 'proposal') && inv) {
    const ids = collectIds(inv);
    const findingsPath = path.join(dir, 'findings.json');
    const fids = fs.existsSync(findingsPath) ? new Set(JSON.parse(fs.readFileSync(findingsPath, 'utf8')).findings.map((f) => f.id)) : null;
    const cards = kind === 'cards' ? value.cards : (value.cards || []);
    for (const c of cards || []) {
      for (const e of c.entries || []) {
        if (!ids.has(e.source)) errors.push(`card ${c.id} entry source ${e.source} not in inventory`);
        if (e.target && !ids.has(e.target) && !String(e.target).startsWith('tok+:')) errors.push(`card ${c.id} entry target ${e.target} not in inventory or proposal`);
      }
      if (fids) for (const f of c.findings || []) if (!fids.has(f)) errors.push(`card ${c.id} cites unknown finding ${f}`);
    }
  }
  if (kind === 'decisions' && inv) {
    const ids = collectIds(inv);
    for (const e of value.entries || []) { if (!ids.has(e.id)) errors.push(`decision references unknown id ${e.id}`); if (e.target && !ids.has(e.target) && !String(e.target).startsWith('tok+:')) errors.push(`decision ${e.id} target ${e.target} unknown`); }
  }
  if (kind === 'narrative') {
    const json = JSON.stringify(value);
    // The model may not write numbers: every digit sequence outside ids/keys is suspicious.
    const stripped = JSON.stringify(value, (k, v) => (k === 'run_id' || k === 'schema' ? undefined : v)).replace(/"(?:F:|C\d|sig:|occ:|tok|route:|cl:|grp:|impl:|typo:)[^"]*"/g, '""');
    const nums = stripped.match(/\d+(?:[.,]\d+)?/g) || [];
    if (nums.length) errors.push(`narrative contains ${nums.length} numeric literal(s): ${[...new Set(nums)].slice(0, 8).join(', ')} — numbers come from the inventory, not the model`);
    void json;
  }
  return errors;
}

function check(kind, file) {
  if (!KINDS.includes(kind)) return { ok: false, errors: [`unknown kind ${kind}`] };
  let value;
  try { value = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return { ok: false, errors: [`cannot read ${file}: ${e.message}`] }; }
  const schema = loadSchema(kind);
  const errors = [];
  if (schema) { const r = validate(schema, value); errors.push(...r.errors); }
  else errors.push(`(no schema for ${kind} yet — structural check skipped)`);
  errors.push(...crossCheck(kind, value, path.dirname(path.resolve(file))));
  const hard = errors.filter((e) => !e.startsWith('('));
  return { ok: hard.length === 0, errors, value };
}

function main() {
  const [kind, file] = process.argv.slice(2);
  if (!kind || !file) { console.error(`usage: check.js <${KINDS.join('|')}> <file.json>`); process.exit(2); }
  const r = check(kind, file);
  for (const e of r.errors) console.error((e.startsWith('(') ? 'note ' : 'FAIL ') + e);
  console.log(`${r.ok ? 'OK' : 'FAIL'} ${kind} ${file}`);
  process.exit(r.ok ? 0 : 1);
}

if (require.main === module) main();
module.exports = { check, collectIds, KINDS };
