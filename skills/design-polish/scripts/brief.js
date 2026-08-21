#!/usr/bin/env node
'use strict';
// design-polish brief: a compact, model-facing digest of a run (≤ ~40KB) so the agent can write
// narrative.json and talk to the user without loading inventory.json.
//
//   design-polish brief <run-dir> [--lang en|ko] [--max-findings 40]

const fs = require('fs');
const path = require('path');

function read(dir, f) { const p = path.join(dir, f); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; }

function brief(runDir, opts = {}) {
  const inv = read(runDir, 'inventory.json');
  if (!inv) throw new Error('inventory.json missing');
  const findings = read(runDir, 'findings.json') || { findings: [] };
  const cards = read(runDir, 'cards.json') || { cards: [] };
  const spec = read(runDir, 'specimens.json');
  const ver = read(runDir, 'verification.json');
  const delta = read(runDir, 'delta.json');
  const maxF = opts.maxFindings || 40;
  const routeName = new Map(inv.routes.map((r) => [r.id, r.display || r.path]));
  const name = (id) => {
    if (!id) return '';
    const d = inv.tokens.declared.find((x) => x.id === id); if (d) return d.name;
    for (const axis of ['colors', 'typography', 'spacing', 'radius', 'border', 'shadows']) { const v = inv.tokens[axis].values.find((x) => x.id === id); if (v) return v.value; }
    for (const [type, t] of Object.entries(inv.components)) { const s = t.signatures.find((x) => x.id === id); if (s) return `${type} look "${(s.spelling || '').slice(0, 60)}"${s.count ? ' ×' + s.count : ''}`; const i = t.implementations.find((x) => x.id === id); if (i) return `${i.name || i.id} (${i.file || 'native'})`; }
    const o = inv.occurrences.find((x) => x.id === id); if (o) return `${o.type} at ${o.file}:${o.line}${o.labels && o.labels[0] ? ' "' + o.labels[0] + '"' : ''}`;
    const g = inv.relationships.siblingGroups.find((x) => x.id === id); if (g) return `row in ${g.file}:${g.line}`;
    return id;
  };
  const L = [];
  L.push(`# design-polish brief · run ${path.basename(runDir)}`);
  L.push(`project: ${path.basename(inv.meta.root)} · ${inv.meta.files.code} code files · ${inv.routes.length} screens · parser ${inv.meta.mode} · css ${inv.meta.css.engine}${inv.meta.css.error ? ' (ERROR: ' + inv.meta.css.error + ')' : ''} · dark: ${inv.meta.css.darkStrategy}`);
  L.push(`vendored (counted, not edited by default): ${inv.meta.vendored && inv.meta.vendored.dirs.length ? inv.meta.vendored.dirs.join(', ') + ' · ' + inv.meta.vendored.files + ' files' : 'none'}`);
  L.push(`scores: ${Object.entries(inv.scores).filter(([k]) => k !== 'weights').map(([k, v]) => `${k} ${v == null ? '–' : v}`).join(' · ')}`);
  L.push('');
  L.push('## Screens (id → display name; fix names in narrative.screens when the display is a path)');
  for (const r of inv.routes) L.push(`- ${r.id} → "${r.display || r.path}"${r.catalogLike ? ' (catalog, counted separately)' : ''}${r.kind === 'layout' ? ' (layout)' : ''}`);
  L.push('');
  L.push('## Tokens');
  const ax = inv.tokens.axes;
  for (const k of Object.keys(ax)) { const a = ax[k]; const on = (a.onToken || 0) + (a.onScale || 0) + (a.palette || 0); const off = (a.hardcoded || 0) + (a.offScale || 0); L.push(`- ${k}: ${on + off} uses · ${off} raw/off-scale${a.palette ? ` · ${a.palette} via Tailwind palette` : ''} · score ${inv.scores[k] == null ? '–' : inv.scores[k]}`); }
  const ownHard = (v) => (v.ownHardcodedCount != null ? v.ownHardcodedCount : v.hardcodedCount);
  const raw = inv.tokens.colors.values.filter((v) => ownHard(v) > 0).slice(0, 20);
  const vendOnly = inv.tokens.colors.values.filter((v) => v.hardcodedCount > 0 && ownHard(v) === 0);
  L.push(`- raw colors in the project's own code (${inv.tokens.colors.values.filter((v) => ownHard(v) > 0).length}): ${raw.map((v) => `${v.value}×${ownHard(v)}${v.twinOf ? '=' + name(v.twinOf) : ''}`).join(', ') || 'none'}${vendOnly.length ? ` · only inside vendored files: ${vendOnly.map((v) => v.value).join(', ')}` : ''}`);
  const dead = inv.tokens.declared.filter((d) => d.source === 'project' && d.refs.total === 0);
  L.push(`- unused tokens (${dead.length}): ${dead.map((d) => d.name + (d.librarySet ? ' (shadcn base set, kept)' : '')).join(', ') || 'none'}`);
  const darkMissing = inv.tokens.declared.filter((d) => d.darkMissing);
  L.push(`- tokens without dark value (${darkMissing.length}): ${darkMissing.map((d) => d.name).join(', ') || 'none'}`);
  L.push(`- spacing base ${inv.tokens.spacing.basePx || '?'}px (${inv.tokens.spacing.scaleBasis || 'inferred'}) · off-scale: ${inv.tokens.spacing.offScale.map((v) => v + 'px').join(', ') || 'none'}`);
  L.push(`- font sizes (px×uses; narrative.samples keys are typo:<px>): ${inv.tokens.typography.values.filter((v) => /^\d+(\.\d+)?$/.test(v.value)).sort((a, b) => Number(a.value) - Number(b.value)).map((v) => v.value + '×' + v.count).join(', ')}`);
  L.push('');
  L.push('## Components (looks = distinct resolved style sets; one-off = a usage that overrides the base with its own classes)');
  for (const [type, t] of Object.entries(inv.components)) if (t.total || t.implementations.length) L.push(`- ${type}: ${t.total} uses · ${t.looks} looks · ${t.signatures.filter((s) => s.adHoc && s.count > 0).length} one-off${t.catalog ? ` · ${t.catalog} on catalog pages` : ''} · impl: ${t.implementations.map((i) => `${i.name || i.id}${i.kind === 'native' ? ' (raw tag)' : ''}${i.vendored ? ' [vendored]' : ''}${i.reachability === 'unreached' ? ' [unreached]' : ''}`).join(', ') || 'none'}`);
  L.push('');
  L.push(`## Findings (${findings.findings.length}; ids are stable — cite them as F:…)`);
  for (const f of findings.findings.slice(0, maxF)) {
    L.push(`- ${f.id} [${f.severity}] ${f.rule} · ${f.title}`);
    L.push(`  subjects: ${f.subjects.slice(0, 6).map(name).join(' | ')}${f.subjects.length > 6 ? ` | +${f.subjects.length - 6}` : ''}`);
    L.push(`  screens: ${f.screens.slice(0, 6).map((r) => routeName.get(r) || r).join(', ') || '–'} · counts: ${JSON.stringify(f.counts)}${f.needsUserConfirmation ? ' · NEEDS USER CONFIRMATION' : ''}`);
    if (f.recommendation && f.recommendation.text) L.push(`  recommendation: ${f.recommendation.text}`);
  }
  if (findings.findings.length > maxF) L.push(`- … ${findings.findings.length - maxF} more in findings.json`);
  if (findings.okAxes && findings.okAxes.length) L.push(`ok axes (say so): ${findings.okAxes.map((a) => a.axis || a).join(', ')}`);
  L.push('');
  L.push(`## Cards (${cards.cards.length}) — visual: none = identical pixels · subtle = ΔE<2 or <2px · visible = a design decision`);
  for (const c of cards.cards) L.push(`- ${c.id} ${c.kind}/${c.axis} · ${c.title} · ${c.impact.occurrences} places${c.impact.vendored ? ` (+${c.impact.vendored} vendored, skipped)` : ''} · ${c.impact.screens} screens · visual ${c.visualChange} · safety ${c.safety} · grade ${c.grade}${c.needsUserConfirmation ? ' · NEEDS USER CONFIRMATION' : ''}${c.prereq.length ? ' · after ' + c.prereq.join(',') : ''}`);
  L.push('');
  L.push('## Render & verification');
  if (spec) L.push(`specimens: ${spec.items.filter((i) => i.html).length}/${spec.items.length} rendered (${spec.engine}${spec.status !== 'ok' ? ', ' + spec.status + (spec.reason ? ': ' + spec.reason : '') : ''})`);
  L.push(`unresolved classes: ${inv.classes.unresolved.length} (${inv.classes.unresolved.slice(0, 8).map((u) => u.cls).join(', ')}) · dynamic class sites: ${inv.classes.dynamicSites.length} · parse failures: ${Array.isArray(inv.meta.files.parseFailed) ? inv.meta.files.parseFailed.length : inv.meta.files.parseFailed || 0}`);
  if (ver) L.push(`verify: ${ver.summary.passed} passed · ${ver.summary.failed} failed · ${ver.summary.pending} pending${ver.summary.failed ? ' — FAILED: ' + ver.checks.filter((c) => c.passed === false).map((c) => c.id + ' ' + c.text).join('; ') : ''}`);
  if (delta) L.push(`delta vs ${delta.baseline}: findings ${delta.findings.resolved.length} resolved / ${delta.findings.remaining.length} remaining / ${delta.findings.new.length} new · ${Object.entries(delta.values).filter(([, v]) => v.before !== v.after).map(([k, v]) => `${k} ${v.before}→${v.after}`).join(' · ')}`);
  const text = L.join('\n');
  return text.length > 60000 ? text.slice(0, 60000) + '\n… (truncated)' : text;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const runDir = args.find((a) => !a.startsWith('-'));
  if (!runDir) { console.error('usage: brief.js <run-dir> [--max-findings N]'); process.exit(2); }
  const i = args.indexOf('--max-findings');
  process.stdout.write(brief(path.resolve(runDir), { maxFindings: i >= 0 ? Number(args[i + 1]) : undefined }) + '\n');
}
module.exports = { brief };
