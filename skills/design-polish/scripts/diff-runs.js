#!/usr/bin/env node
'use strict';
// design-polish diff: compares two runs (before → after) and writes delta.json into the after run.
//
//   design-polish diff <before-run-dir> <after-run-dir>
//
// Matching uses stable ids: values by normalized value, looks by signature id, findings by id
// (rule + subjects). Scores are compared only when both runs used the same scanner version.

const fs = require('fs');
const path = require('path');

function read(dir, f) { const p = path.join(dir, f); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; }

function diff(beforeDir, afterDir) {
  const a = read(beforeDir, 'inventory.json'), b = read(afterDir, 'inventory.json');
  if (!a || !b) throw new Error('both runs need inventory.json');
  const fa = read(beforeDir, 'findings.json'), fb = read(afterDir, 'findings.json');
  const sameScanner = a.meta.scannerVersion === b.meta.scannerVersion;
  const scores = {};
  for (const k of ['color', 'typography', 'spacing', 'radius', 'shadow', 'component', 'composite']) scores[k] = { before: a.scores[k], after: b.scores[k], delta: a.scores[k] != null && b.scores[k] != null ? Math.round((b.scores[k] - a.scores[k]) * 10) / 10 : null };
  const looks = {};
  for (const type of Object.keys(b.components)) looks[type] = { before: a.components[type] ? a.components[type].looks : null, after: b.components[type].looks, usesBefore: a.components[type] ? a.components[type].total : null, usesAfter: b.components[type].total };
  const hard = (inv) => inv.tokens.colors.values.filter((v) => v.hardcodedCount > 0);
  const values = { rawColors: { before: hard(a).length, after: hard(b).length }, rawColorUses: { before: a.tokens.axes.color.hardcoded, after: b.tokens.axes.color.hardcoded }, offScaleSpacing: { before: a.tokens.spacing.offScale.length, after: b.tokens.spacing.offScale.length }, rawRadiusUses: { before: a.tokens.axes.radius.hardcoded, after: b.tokens.axes.radius.hardcoded }, deadTokens: { before: a.tokens.declared.filter((d) => d.source === 'project' && d.refs.total === 0).length, after: b.tokens.declared.filter((d) => d.source === 'project' && d.refs.total === 0).length }, siblingRadiusMismatches: { before: a.relationships.siblingGroups.filter((g) => g.mismatch.radius && !g.catalog).length, after: b.relationships.siblingGroups.filter((g) => g.mismatch.radius && !g.catalog).length } };
  const idsA = new Set((fa ? fa.findings : []).map((f) => f.id)), idsB = new Set((fb ? fb.findings : []).map((f) => f.id));
  const findings = { resolved: [...idsA].filter((id) => !idsB.has(id)), remaining: [...idsA].filter((id) => idsB.has(id)), new: [...idsB].filter((id) => !idsA.has(id)) };
  // occurrences that changed look
  const occA = new Map(a.occurrences.map((o) => [o.id, o]));
  const moved = [];
  for (const o of b.occurrences) { const p = occA.get(o.id); if (p && p.sigId !== o.sigId) moved.push({ id: o.id, type: o.type, file: o.file, line: o.line, routes: o.routes || [], label: (o.labels && o.labels[0]) || null, from: p.sigId, to: o.sigId }); }
  const gone = [...occA.keys()].filter((id) => !b.occurrences.some((o) => o.id === id)).length;
  const added = b.occurrences.filter((o) => !occA.has(o.id)).length;
  // what was applied between the two runs (from the before run's apply results)
  const applied = [];
  const applyDir = path.join(beforeDir, 'apply');
  if (fs.existsSync(applyDir)) for (const f of fs.readdirSync(applyDir).filter((f) => f.endsWith('.result.json')).sort()) { const r = JSON.parse(fs.readFileSync(path.join(applyDir, f), 'utf8')); applied.push({ cardId: r.cardId, applied: r.applied, skipped: (r.skipped || []).length, files: (r.files || []).length, commit: r.commit && r.commit.sha ? r.commit.sha : null, typecheck: r.typecheck && r.typecheck.status != null ? r.typecheck.status === 0 : null }); }
  const skippedSites = [];
  if (fs.existsSync(applyDir)) for (const f of fs.readdirSync(applyDir).filter((f) => f.endsWith('.result.json')).sort()) { const r = JSON.parse(fs.readFileSync(path.join(applyDir, f), 'utf8')); for (const sk of r.skipped || []) skippedSites.push({ cardId: r.cardId, file: sk.file || null, line: sk.line || null, reason: sk.reason }); }
  // the token list that survives: declared project tokens in the after run, with refs
  const tokens = b.tokens.declared.filter((d) => d.source === 'project').map((d) => ({ id: d.id, name: d.name, axis: d.axis, light: d.hex || d.light, dark: d.darkHex || d.dark, refs: d.refs.total, isNew: !a.tokens.declared.some((x) => x.id === d.id) }));
  const removedTokens = a.tokens.declared.filter((d) => d.source === 'project' && !b.tokens.declared.some((x) => x.id === d.id)).map((d) => d.name);
  const out = { schema: 'design-polish.delta/1', baseline: path.basename(beforeDir), after: path.basename(afterDir), comparable: { sameScanner, filesBefore: a.meta.files.code, filesAfter: b.meta.files.code }, applied, scores: sameScanner ? scores : null, looks, values, findings, occurrences: { moved, gone, added }, skipped: skippedSites, tokens, removedTokens };
  fs.writeFileSync(path.join(afterDir, 'delta.json'), JSON.stringify(out, null, 2));
  return out;
}

if (require.main === module) {
  const [before, after] = process.argv.slice(2);
  if (!before || !after) { console.error('usage: diff-runs.js <before-run-dir> <after-run-dir>'); process.exit(2); }
  const d = diff(before, after);
  const lines = [];
  if (d.scores) for (const [k, v] of Object.entries(d.scores)) if (v.delta) lines.push(`${k}: ${v.before} → ${v.after}`);
  for (const [k, v] of Object.entries(d.looks)) if (v.before !== v.after) lines.push(`${k} looks: ${v.before} → ${v.after}`);
  for (const [k, v] of Object.entries(d.values)) if (v.before !== v.after) lines.push(`${k}: ${v.before} → ${v.after}`);
  lines.push(`findings: ${d.findings.resolved.length} resolved · ${d.findings.remaining.length} remaining · ${d.findings.new.length} new`);
  lines.push(`occurrences moved to another look: ${d.occurrences.moved.length}`);
  console.log(lines.join('\n'));
}
module.exports = { diff };
