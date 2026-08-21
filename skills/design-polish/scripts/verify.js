#!/usr/bin/env node
'use strict';
// design-polish verify: the checks that make the numbers trustworthy. Exit 1 on failure.
//
//   design-polish verify <run-dir> [--seed N] [--samples N] [--json]
//
//   V0 schema & id integrity     every file validates; every referenced id exists
//   V1 coverage                  files listed − skipped = scanned; parse failures disclosed
//   V2 citation validity         sampled occurrences point at a line that contains the element
//   V3 aggregate consistency     Σ signature counts = totals; findings' counts recomputed
//   V4 report numbers            every data-metric in report.html equals the JSON value
//   V5 specimens                 every resolved look has a specimen built from its own classes
//   V6 determinism               a second scan equals the first (without timestamps)
//   V7 narrative honesty         narrative.json contains no numbers and references existing ids
//   V8 forbidden copy            banned phrases absent from narrative and report
//   V9 proposal integrity        every mapping source exists; every card entry resolves
// Missing artifacts make a check "pending", never "passed".

const fs = require('fs');
const path = require('path');
const { check } = require('./check');
const { collectIds } = require('./check');

// A fixed seed makes the sample reproducible across runs; different from the scanner's own internal order.
const DEFAULT_SEED = 20260821;
const DEFAULT_SAMPLES = 12;
const BANNED = [/외 \d+종/, /디자이너의 판단/, /롱테일/, /long tail/i, /and so on/i, /\betc\.?\b/i, /in my opinion/i, /I think/i];

function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function sample(arr, n, seed) { const rnd = mulberry32(seed); const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); }
function getPath(obj, p) { return p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj); }

async function verify(runDir, opts = {}) {
  const seed = opts.seed || DEFAULT_SEED;
  const samples = opts.samples || DEFAULT_SAMPLES;
  const checks = [];
  const add = (id, passed, text, evidence) => checks.push({ id, passed, text, evidence: evidence || '' });
  const read = (f) => (fs.existsSync(path.join(runDir, f)) ? JSON.parse(fs.readFileSync(path.join(runDir, f), 'utf8')) : null);
  const inv = read('inventory.json');
  if (!inv) { add('V0', false, 'inventory.json present', 'missing'); return finish(); }
  const root = inv.meta.root;

  // V0
  for (const kind of ['inventory', 'findings', 'proposal', 'cards', 'decisions', 'narrative']) {
    const f = path.join(runDir, `${kind}.json`);
    if (!fs.existsSync(f)) { if (kind === 'inventory') add('V0', false, `${kind}.json validates`, 'missing'); continue; }
    const r = check(kind, f);
    add('V0', r.ok, `${kind}.json validates against its schema and cross-references`, r.ok ? `${r.errors.filter((e) => !e.startsWith('(')).length} errors` : r.errors.slice(0, 5).join('; '));
  }
  // V1
  const f = inv.meta.files;
  const skippedTotal = Object.values(f.skipped).reduce((n, v) => n + (v.count || 0), 0);
  add('V1', f.listed - skippedTotal === f.scanned, 'listed − skipped = scanned', `${f.listed} − ${skippedTotal} = ${f.listed - skippedTotal} vs scanned ${f.scanned}`);
  add('V1', f.parseFailed.length === 0 || f.parseFailed.length / Math.max(1, f.code) <= 0.01, 'parse failures ≤ 1% (or disclosed)', `${f.parseFailed.length} failed`);
  // V2
  const occs = sample(inv.occurrences, samples, seed);
  let bad = [];
  for (const o of occs) {
    const file = path.join(root, o.file);
    if (!fs.existsSync(file)) { bad.push(`${o.file} missing`); continue; }
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    const window = lines.slice(Math.max(0, o.line - 2), o.line + 1).join('\n');
    const needle = o.componentName || o.tag || '';
    if (!needle || !window.includes(`<${needle}`)) bad.push(`${o.file}:${o.line} lacks <${needle}>`);
  }
  add('V2', bad.length === 0, `${occs.length} sampled occurrences point at their element (seed ${seed})`, bad.slice(0, 4).join('; ') || `${occs.length}/${occs.length} ok`);
  // V3
  let agg = [];
  for (const [type, t] of Object.entries(inv.components)) {
    const sum = t.signatures.reduce((n, s) => n + s.count, 0);
    if (sum !== t.total) agg.push(`${type}: Σ ${sum} ≠ ${t.total}`);
    const occSum = inv.occurrences.filter((o) => o.type === type).reduce((n, o) => n + o.count, 0);
    if (occSum !== t.total) agg.push(`${type}: occurrences ${occSum} ≠ ${t.total}`);
  }
  add('V3', agg.length === 0, 'signature and occurrence sums equal each type total', agg.join('; ') || 'all equal');
  const findings = read('findings.json');
  if (findings) {
    let fbad = [];
    for (const fd of findings.findings) {
      if (fd.rule === 'NEAR-DUP') { const cl = inv.tokens.colors.clusters.find((c) => c.members.every((m) => fd.subjects.includes(m))); if (!cl || cl.members.length !== fd.counts.members) fbad.push(`${fd.id} members`); }
      if (fd.rule === 'SIG-SPRAWL') { const type = fd.axis.replace('component:', ''); const n = inv.components[type].signatures.filter((s) => s.adHoc && s.count > 0).length; if (n !== fd.counts.adHoc) fbad.push(`${fd.id} adHoc ${n}≠${fd.counts.adHoc}`); }
      if (fd.rule === 'DEAD-TOKEN') { const n = inv.tokens.declared.filter((d) => d.source === 'project' && d.refs.total === 0).length; if (n !== fd.counts.tokens) fbad.push(`${fd.id} dead ${n}≠${fd.counts.tokens}`); }
    }
    add('V3', fbad.length === 0, 'finding counts recompute from the inventory', fbad.join('; ') || `${findings.findings.length} findings checked`);
  } else add('V3', null, 'finding counts recompute from the inventory', 'no findings.json');
  // V4
  const reportPath = path.join(runDir, 'report.html');
  if (fs.existsSync(reportPath)) {
    const html = fs.readFileSync(reportPath, 'utf8');
    const re = /data-metric="([^"]+)">([^<]*)</g;
    let m, checked = 0, mism = [];
    const derived = {
      'routes.pages': inv.routes.filter((r) => r.kind === 'page').length,
      'tokens.colors.hardcoded': inv.tokens.colors.values.filter((v) => (v.ownHardcodedCount != null ? v.ownHardcodedCount : v.hardcodedCount) > 0).length,
      'components.looks': Object.values(inv.components).reduce((n, t) => n + t.looks, 0),
      'components.adhoc': Object.values(inv.components).reduce((n, t) => n + t.signatures.filter((s) => s.count > 0 && s.adHoc && s.resolved).length, 0),
      'findings.length': findings ? findings.findings.length : null,
      'cards.length': (read('cards.json') || { cards: [] }).cards.length,
      'tokens.declared.color': inv.tokens.declared.filter((d) => d.axis === 'color' && d.source === 'project').length,
      'relationships.mismatches': inv.relationships.siblingGroups.filter((g) => (g.mismatch.radius || g.mismatch.height) && !g.catalog).length,
      'proposal.newTokens.length': (read('proposal.json') || { newTokens: [] }).newTokens.length,
    };
    while ((m = re.exec(html))) {
      const [, metric, shown] = m;
      const expected = metric in derived ? derived[metric] : getPath(inv, metric);
      if (expected === undefined || expected === null) continue;
      checked++;
      const shownNum = parseFloat(String(shown).replace(/[^\d.-]/g, ''));
      if (Math.abs(shownNum - Number(expected)) > 0.051) mism.push(`${metric}: ${shown} vs ${expected}`);
    }
    add('V4', mism.length === 0, `${checked} numbers in report.html equal the inventory`, mism.slice(0, 5).join('; ') || 'all equal');
  } else add('V4', null, 'report numbers equal the inventory', 'no report.html');
  // V5
  const spec = read('specimens.json');
  if (spec) {
    const byId = new Map(spec.items.map((i) => [i.sigId, i]));
    let sbad = [];
    for (const t of Object.values(inv.components)) for (const s of t.signatures) {
      if (!s.resolved || s.count === 0) continue;
      const it = byId.get(s.id);
      if (!it) { sbad.push(`${s.id} missing`); continue; }
      if (spec.status !== 'failed' && it.html && !it.html.includes(s.spelling.split(' ')[0])) sbad.push(`${s.id} html lacks its classes`);
    }
    add('V5', sbad.length === 0, 'every resolved look has a specimen built from its classes', sbad.slice(0, 4).join('; ') || `${spec.items.length} specimens`);
  } else add('V5', null, 'specimens present', 'no specimens.json');
  // V6
  if (!opts.skipDeterminism) {
    const { scan } = require('./scan');
    const again = await scan(root, { quiet: true, css: inv.meta.css.entry, src: inv.meta.options.src, exclude: inv.meta.options.exclude, includeTests: inv.meta.options.includeTests });
    const strip = (x) => JSON.stringify(x, (k, v) => (k === 'generatedAt' || k === 'durationMs' ? undefined : v));
    const same = strip(again) === strip(inv);
    add('V6', same, 'a second scan produces the same inventory', same ? 'identical' : 'differs (or the working tree changed since the run)');
  }
  // V7
  const narrative = read('narrative.json');
  if (narrative) {
    const ids = collectIds(inv);
    const unknown = [];
    for (const k of ['findings', 'cards', 'screens', 'recommendations', 'samples']) for (const id of Object.keys(narrative[k] || {})) if (!ids.has(id) && !(findings && findings.findings.some((x) => x.id === id)) && !(read('cards.json') || { cards: [] }).cards.some((c) => c.id === id) && !/^typo:/.test(id)) unknown.push(id);
    add('V7', unknown.length === 0, 'narrative references existing ids only', unknown.slice(0, 5).join(', ') || 'ok');
    const r = check('narrative', path.join(runDir, 'narrative.json'));
    add('V7', r.ok, 'narrative contains no numeric literals', r.errors.filter((e) => !e.startsWith('(')).slice(0, 2).join('; ') || 'ok');
  } else add('V7', null, 'narrative honesty', 'no narrative.json (inventory-only run)');
  // V8
  const texts = [narrative ? JSON.stringify(narrative) : '', fs.existsSync(reportPath) ? fs.readFileSync(reportPath, 'utf8').replace(/<script[\s\S]*?<\/script>/g, '') : ''];
  const hits = BANNED.filter((re) => texts.some((t) => re.test(t))).map(String);
  add('V8', hits.length === 0, 'no banned phrases in narrative or report', hits.join(', ') || 'none');
  // V9
  const proposal = read('proposal.json');
  if (proposal) {
    const ids = collectIds(inv);
    const missing = proposal.mapping.filter((m) => !ids.has(m.source)).map((m) => m.source);
    add('V9', missing.length === 0, 'every mapping source exists in the inventory', missing.slice(0, 4).join(', ') || `${proposal.mapping.length} mapped`);
    const hard = inv.tokens.colors.values.filter((v) => v.hardcodedCount > 0).map((v) => v.id);
    const unmapped = hard.filter((id) => !proposal.mapping.some((m) => m.source === id));
    add('V9', unmapped.length === 0, 'every hardcoded color has a mapping decision (keep counts)', unmapped.slice(0, 4).join(', ') || `${hard.length} covered`);
  } else add('V9', null, 'proposal integrity', 'no proposal.json');

  return finish();
  function finish() {
    const summary = { passed: checks.filter((c) => c.passed === true).length, failed: checks.filter((c) => c.passed === false).length, pending: checks.filter((c) => c.passed === null).length, total: checks.length };
    const out = { schema: 'design-polish.verification/1', verifiedAt: new Date().toISOString(), seed, checks, summary, passed: summary.failed === 0 };
    fs.writeFileSync(path.join(runDir, 'verification.json'), JSON.stringify(out, null, 2));
    return out;
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const runDir = args.find((a) => !a.startsWith('-'));
  if (!runDir) { console.error('usage: verify.js <run-dir> [--seed N] [--samples N] [--quick]'); process.exit(2); }
  const get = (f) => { const i = args.indexOf(f); return i >= 0 ? Number(args[i + 1]) : undefined; };
  verify(runDir, { seed: get('--seed'), samples: get('--samples'), skipDeterminism: args.includes('--quick') }).then((out) => {
    for (const c of out.checks) console.log(`${c.passed === true ? 'PASS' : c.passed === false ? 'FAIL' : 'PEND'} ${c.id} ${c.text}${c.evidence ? ' — ' + c.evidence : ''}`);
    console.log(`${out.summary.passed} passed · ${out.summary.failed} failed · ${out.summary.pending} pending → ${path.join(runDir, 'verification.json')}`);
    process.exit(out.passed ? 0 : 1);
  }).catch((e) => { console.error(e.stack || e.message); process.exit(1); });
}
module.exports = { verify };
