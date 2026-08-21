#!/usr/bin/env node
'use strict';
// design-polish propose: turns inventory + findings into a proposal (token mapping)
// and action cards. Mechanical: it maps every current value to keep / promote /
// merge / round and bundles the mappings into cards graded by size and by how
// visible the change is. Names for new tokens are suggestions the model or the
// user can override; nothing here is pre-approved.
//
//   design-polish propose <run-dir>

const fs = require('fs');
const path = require('path');
const color = require('./lib/color');
const { hash, proposedTokId } = require('./lib/ids');

// Visual change bands (the product's three labels): none = identical value; subtle = below ΔE 2 / 2px; visible = everything else.
const SUBTLE_DE = 2.0;
const SUBTLE_PX = 2;
// Card sizes: S ≤ 30 occurrences, M ≤ 100; larger cards are split so the reviewer's attention holds.
const GRADE_S = 30;
const GRADE_M = 100;

function visualOfDe(de) { return de == null ? 'visible' : de < 1.0 ? 'none' : de < SUBTLE_DE ? 'subtle' : 'visible'; }
function visualOfPx(d) { return d === 0 ? 'none' : Math.abs(d) < SUBTLE_PX ? 'subtle' : 'visible'; }
function worst(a, b) { const o = { none: 0, subtle: 1, visible: 2 }; return o[a] >= o[b] ? a : b; }

const HUES = [[15, 'red'], [45, 'orange'], [70, 'yellow'], [160, 'green'], [195, 'teal'], [260, 'blue'], [290, 'purple'], [335, 'pink'], [360, 'red']];
function suggestColorName(hex, existing) {
  const c = color.parse(hex);
  if (!c) return 'color-unnamed';
  const ok = color.toOklch(c);
  const step = Math.max(50, Math.min(950, Math.round((1 - ok.L) * 10) * 100)) || 50;
  let base;
  if (color.isAchromatic(c)) base = `gray-${step}`;
  else { const h = ((ok.h % 360) + 360) % 360; base = `${(HUES.find(([deg]) => h < deg) || HUES[HUES.length - 1])[1]}-${step}`; }
  let name = base, i = 2;
  while (existing.has(name)) name = `${base}-${i++}`;
  existing.add(name);
  return name;
}

function propose(inv, findings) {
  const tok = inv.tokens;
  const hasDark = inv.meta.css && inv.meta.css.darkStrategy && inv.meta.css.darkStrategy !== 'none';
  const vendoredDirs = (inv.meta.vendored && inv.meta.vendored.dirs) || [];
  const isVendored = (file) => vendoredDirs.some((d) => file === d || file.startsWith(d + '/'));
  // Occurrences that a card would touch: vendored (copied-library) sites are counted apart and left alone by default.
  const counted = (v) => {
    const sites = v.sites || [];
    if (!sites.length) return { occurrences: v.hardcodedCount || v.count, vendored: 0 };
    let inDefault = 0, vend = 0;
    for (const s of sites) {
      if (s.where === 'token' || s.where === 'scale') continue; // reached through the system already: nothing to edit
      const f = (s.origin && s.origin.file) || s.file;
      if (isVendored(f)) vend += s.count || 1; else inDefault += s.count || 1;
    }
    return { occurrences: inDefault, vendored: vend };
  };
  // ΔE against the token's dark value: a raw colour is the same in both modes, a mode-varying token is not.
  const darkDelta = (v, t) => {
    if (!hasDark || !t || !t.modeVarying || !t.darkSrgb || !v.srgb) return { de: null, visual: 'none', varying: false };
    const de = color.deltaE2000(color.toLab({ r: v.srgb[0], g: v.srgb[1], b: v.srgb[2] }), color.toLab({ r: t.darkSrgb[0], g: t.darkSrgb[1], b: t.darkSrgb[2] }));
    return { de: Math.round(de * 100) / 100, visual: visualOfDe(de), varying: true };
  };
  const findingsBy = (rule) => findings.findings.filter((f) => f.rule === rule);
  const declared = tok.declared;
  const declaredById = new Map(declared.map((d) => [d.id, d]));
  const colorById = new Map(tok.colors.values.map((v) => [v.id, v]));
  const routeNames = new Map(inv.routes.map((r) => [r.id, r.display || r.path]));
  const mapping = [];
  const newTokens = [];
  const usedNames = new Set(declared.map((d) => d.name.replace(/^--(color-)?/, '')));
  const mapped = new Set();
  const add = (entry) => { if (mapped.has(entry.source)) return; mapped.add(entry.source); mapping.push(entry); };

  // 1. promote twins (value == token): no visual change
  for (const v of tok.colors.values) {
    if (!v.twinOf || v.where.every((w) => w === 'token')) continue;
    const t = declaredById.get(v.twinOf);
    const de = t && t.srgb && v.srgb ? color.deltaE2000(color.toLab({ r: v.srgb[0], g: v.srgb[1], b: v.srgb[2] }), color.toLab({ r: t.srgb[0], g: t.srgb[1], b: t.srgb[2] })) : null;
    const dark = darkDelta(v, t);
    add({ source: v.id, axis: 'color', action: 'promote', target: v.twinOf, visualChange: worst(visualOfDe(de), dark.visual), metric: { deltaE: de == null ? null : Math.round(de * 100) / 100, deltaEDark: dark.de }, occurrences: counted(v).occurrences, vendored: counted(v).vendored, files: v.files, screens: v.routes, basis: (findingsBy('TOKEN-TWIN')[0] || {}).id || null, modeVarying: dark.varying, needsUserConfirmation: dark.varying, note: dark.varying ? 'the token looks different in dark mode; a constant colour mapped onto it would change there' : undefined });
  }
  // 2. merge near-duplicate clusters into the dominant / declared member
  for (const c of tok.colors.clusters) {
    const target = c.dominant || c.members.find((m) => declaredById.has(m)) || null;
    if (!target) continue; // needs a human choice; stays a finding
    const tSrgb = (declaredById.get(target) || colorById.get(target) || {}).srgb;
    for (const m of c.members) {
      if (m === target || declaredById.has(m)) continue;
      const v = colorById.get(m);
      if (!v || !v.srgb || !tSrgb) continue;
      const de = color.deltaE2000(color.toLab({ r: v.srgb[0], g: v.srgb[1], b: v.srgb[2] }), color.toLab({ r: tSrgb[0], g: tSrgb[1], b: tSrgb[2] }));
      const dark = darkDelta(v, declaredById.get(target));
      add({ source: m, axis: 'color', action: 'merge', target, visualChange: worst(visualOfDe(de), dark.visual), metric: { deltaE: Math.round(de * 100) / 100, deltaEDark: dark.de }, occurrences: counted(v).occurrences, vendored: counted(v).vendored, files: v.files, screens: v.routes, basis: findings.findings.find((f) => f.rule === 'NEAR-DUP' && f.subjects.includes(m))?.id || null, needsUserConfirmation: c.needsUserConfirmation || dark.varying, modeVarying: dark.varying, note: dark.varying ? 'the token looks different in dark mode; a constant colour mapped onto it would change there' : undefined });
    }
  }
  // 3. remaining hardcoded colors used ≥ 3 times → new tokens (named by hue/lightness, to be renamed)
  for (const v of tok.colors.values) {
    if (mapped.has(v.id) || v.where.every((w) => w === 'token' || w === 'palette')) continue;
    if (v.count < 3) { add({ source: v.id, axis: 'color', action: 'keep', target: null, visualChange: 'none', metric: {}, occurrences: v.count, files: v.files, screens: v.routes, basis: null, note: 'used fewer than 3 times; decide in the report' }); continue; }
    const name = suggestColorName(v.value, usedNames);
    const id = proposedTokId('color', name);
    newTokens.push({ id, axis: 'color', name: `--color-${name}`, value: v.value, nameBasis: 'auto', absorbs: [v.id], occurrences: v.count });
    add({ source: v.id, axis: 'color', action: 'new-token', target: id, visualChange: 'none', metric: {}, occurrences: v.count, files: v.files, screens: v.routes, basis: findingsBy('HARDCODE').find((f) => f.axis === 'color')?.id || null });
  }
  // 4. radius: arbitrary values → nearest declared radius token (within 1px = none, else subtle/visible)
  const radiusTokens = declared.filter((d) => d.axis === 'radius' && d.light != null).map((d) => ({ d, px: require('./lib/css-eval').toPx(d.light) })).filter((x) => x.px != null);
  for (const v of tok.radius.values) {
    if (v.where.every((w) => w === 'token' || w === 'scale')) continue;
    const px = v.normalized === 'full' ? Infinity : Number(v.normalized);
    if (!isFinite(px)) continue;
    let best = null;
    for (const t of radiusTokens) { const dist = Math.abs(t.px - px); if (!best || dist < best.dist) best = { token: t.d, px: t.px, dist }; }
    if (best && best.dist <= SUBTLE_PX * 2) add({ source: v.id, axis: 'radius', action: best.dist === 0 ? 'promote' : 'round', target: best.token.id, visualChange: visualOfPx(best.dist), metric: { px: best.dist }, occurrences: v.hardcodedCount || v.count, files: v.files, screens: v.routes, basis: findingsBy('HARDCODE').find((f) => f.axis === 'radius')?.id || null });
    else add({ source: v.id, axis: 'radius', action: 'keep', target: null, visualChange: 'none', metric: {}, occurrences: v.count, files: v.files, screens: v.routes, basis: null, note: 'no radius token within 4px' });
  }
  // 5. spacing off-scale → nearest step
  if (tok.spacing.dominantStep) {
    for (const v of tok.spacing.values) {
      const px = Number(v.normalized);
      if (!isFinite(px) || !tok.spacing.offScale.includes(px)) continue;
      const step = tok.spacing.dominantStep;
      const rounded = Math.round(px / step) * step;
      add({ source: v.id, axis: 'spacing', action: 'round', target: `tok+:spacing.${rounded}`, visualChange: visualOfPx(rounded - px), metric: { px: rounded - px }, occurrences: v.count, files: v.files, screens: v.routes, basis: (findingsBy('OFF-SCALE')[0] || {}).id || null });
    }
  }
  // 6. everything else on the token axes: keep
  for (const axis of ['typography', 'shadows', 'border']) for (const v of tok[axis].values) if (!mapped.has(v.id)) add({ source: v.id, axis: axis === 'shadows' ? 'shadow' : axis, action: 'keep', target: null, visualChange: 'none', metric: {}, occurrences: v.count, files: v.files, screens: v.routes, basis: null });

  // ---- cards ----
  const cards = [];
  const mk = (kind, axis, entries, opts) => {
    if (!entries.length) return;
    const occ = entries.reduce((n, e) => n + (e.occurrences || 0), 0);
    const files = new Set(entries.flatMap((e) => e.files || []));
    const screens = new Set(entries.flatMap((e) => e.screens || []));
    const visual = entries.reduce((w, e) => worst(w, e.visualChange || 'none'), 'none');
    const safety = opts.safety || (visual === 'none' ? 'none' : visual === 'subtle' ? 'approve' : 'design');
    const grade = occ <= GRADE_S ? 'S' : occ <= GRADE_M ? 'M' : 'L';
    const key = hash(`${kind}|${axis}|${entries.map((e) => e.source).sort().join(',')}`, 8);
    const vendored = entries.reduce((n, e) => n + (e.vendored || 0), 0);
    cards.push({ id: null, key, kind, axis, title: opts.title, summary: opts.summary, findings: [...new Set(entries.map((e) => e.basis).filter(Boolean).concat(opts.findings || []))], entries: entries.map((e) => ({ source: e.source, target: e.target, action: e.action, occurrences: e.occurrences, vendored: e.vendored || 0, screens: e.screens, files: (e.files || []).length, visualChange: e.visualChange, metric: e.metric, modeVarying: !!e.modeVarying })), impact: { occurrences: occ, vendored, screens: screens.size, files: files.size, weight: occ }, grade, visualChange: visual, safety, prereq: opts.prereq || [], advanced: !!opts.advanced, status: 'proposed', type: opts.type || 'migrate', needsUserConfirmation: entries.some((e) => e.needsUserConfirmation) });
  };
  const promotes = mapping.filter((m) => m.action === 'promote' && m.axis === 'color' && !m.modeVarying);
  mk('register-tokens', 'color', promotes, { title: 'Replace hardcoded colors that equal an existing token', summary: `${promotes.length} color values are identical to a declared token; swapping them changes nothing on screen.`, safety: 'none' });
  const darkPromotes = mapping.filter((m) => m.axis === 'color' && (m.action === 'promote' || m.action === 'merge') && m.modeVarying);
  mk('merge-values', 'color', darkPromotes, { title: 'Decide: colors that match a token only in light mode', summary: `${darkPromotes.length} raw color${darkPromotes.length > 1 ? 's' : ''} equal a token in light mode, but that token changes in dark mode. Mapping them is a design decision, not a cleanup.`, safety: 'design', type: 'design' });
  const newTok = mapping.filter((m) => m.action === 'new-token');
  mk('register-tokens', 'color', newTok, { title: 'Register frequently used raw colors as tokens', summary: `${newTok.length} raw colors used 3+ times get a token each; values stay identical.`, safety: 'none', type: 'design' });
  const merges = mapping.filter((m) => m.action === 'merge' && !m.modeVarying);
  const byCluster = new Map();
  for (const m of merges) { const k = m.target; if (!byCluster.has(k)) byCluster.set(k, []); byCluster.get(k).push(m); }
  for (const [target, list] of byCluster) { const name = (declaredById.get(target) || colorById.get(target) || { name: target }).name || (colorById.get(target) || {}).value || target; mk('merge-values', 'color', list, { title: `Merge ${list.length} near-duplicate color${list.length > 1 ? 's' : ''} into ${name}`, summary: `Colors within ΔE ${Math.max(...list.map((l) => l.metric.deltaE || 0))} of ${name} become ${name}.` }); }
  const radiusMoves = mapping.filter((m) => m.axis === 'radius' && (m.action === 'promote' || m.action === 'round'));
  mk('register-tokens', 'radius', radiusMoves.filter((m) => m.visualChange === 'none'), { title: 'Replace raw corner radii that equal a radius token', summary: 'Arbitrary radius values identical to a token value are swapped for the token.', safety: 'none' });
  mk('merge-values', 'radius', radiusMoves.filter((m) => m.visualChange !== 'none'), { title: 'Snap odd corner radii to the nearest radius token', summary: 'Radii within a few px of a token are rounded to it.' });
  const rounds = mapping.filter((m) => m.axis === 'spacing' && m.action === 'round');
  mk('merge-values', 'spacing', rounds, { title: `Round ${rounds.length} off-grid spacing value${rounds.length > 1 ? 's' : ''} to the ${tok.spacing.dominantStep}px grid`, summary: 'Values between grid steps move to the nearest step.' });
  // sibling radius groups → align-neighbors: one card per radius pattern (all "6 / 8px" rows together),
  // so a project with eight such rows reviews one card, not eight.
  const byPattern = new Map();
  for (const f of findingsBy('SIB-RADIUS')) {
    const g = (inv.relationships.siblingGroups || []).find((x) => x.id === f.evidence.refs[0]);
    if (!g) continue;
    const pattern = [...new Set((g.radiusPx || []).map((r) => (r == null ? '?' : String(r))))].sort((a, b) => Number(a) - Number(b)).join('/');
    if (!byPattern.has(pattern)) byPattern.set(pattern, { findings: [], entries: [], rows: 0 });
    const bucket = byPattern.get(pattern);
    bucket.findings.push(f.id); bucket.rows += 1;
    const occs = g.members.map((id) => inv.occurrences.find((o) => o.id === id)).filter(Boolean);
    const maxGap = Math.max(...(g.radiusPx || []).filter((r) => typeof r === 'number')) - Math.min(...(g.radiusPx || []).filter((r) => typeof r === 'number'));
    for (const o of occs) bucket.entries.push({ source: o.id, target: null, action: 'align', occurrences: 1, files: [o.file], screens: o.routes, visualChange: isFinite(maxGap) && maxGap >= SUBTLE_PX * 2 ? 'visible' : 'subtle', metric: { px: isFinite(maxGap) ? maxGap : null, group: g.id }, basis: f.id });
  }
  for (const [pattern, b] of byPattern) {
    const label = pattern.split('/').map((r) => (r === '?' ? '?' : r + 'px')).join(' / ');
    mk('align-neighbors', 'radius', b.entries, { title: b.rows > 1 ? `Give ${b.rows} rows of neighbours one corner radius (${label})` : `Neighbors with different corner radii (${label})`, summary: b.rows > 1 ? `${b.rows} rows mix ${label}; each row's minority members adopt the majority radius.` : `Controls in one row use ${label}; the minority adopts the majority radius.`, findings: b.findings, safety: 'approve' });
  }
  // dead tokens
  const dead = findingsBy('DEAD-TOKEN')[0];
  if (dead) mk('delete-dead-tokens', 'tokens', dead.subjects.map((s) => ({ source: s, target: null, action: 'delete', occurrences: 0, files: [], screens: [], visualChange: 'none', metric: {}, basis: dead.id })), { title: dead.title, summary: dead.summary, findings: [dead.id], safety: 'none' });
  // ad-hoc looks → align-signature (design-level)
  for (const f of findingsBy('SIG-SPRAWL')) {
    const type = f.axis.replace('component:', '');
    const base = f.recommendation && f.recommendation.to;
    const entries = f.subjects.map((sid) => { const s = inv.components[type].signatures.find((x) => x.id === sid); return s ? { source: sid, target: base, action: 'align', occurrences: s.count, files: [...new Set(s.occurrences.map((oid) => (inv.occurrences.find((o) => o.id === oid) || {}).file).filter(Boolean))], screens: s.routes, visualChange: 'visible', metric: {}, basis: f.id } : null; }).filter(Boolean);
    mk('align-signature', f.axis, entries, { title: `Bring ${entries.length} one-off ${type} looks back to the base ${type}`, summary: f.summary, findings: [f.id], safety: 'design' });
  }
  for (const f of findingsBy('STATE-GAP')) {
    const type = f.axis.replace('component:', '');
    const entries = f.subjects.map((sid) => { const s = inv.components[type].signatures.find((x) => x.id === sid); return s ? { source: sid, target: null, action: 'add-state', occurrences: s.count, files: [], screens: s.routes, visualChange: 'subtle', metric: {}, basis: f.id } : null; }).filter(Boolean);
    mk('add-state', f.axis, entries, { title: `Add a keyboard focus style to ${entries.length} ${type} look${entries.length > 1 ? 's' : ''}`, summary: f.summary, findings: [f.id], safety: 'approve' });
  }
  const invalid = findingsBy('INVALID-CLASS')[0];
  if (invalid) mk('fix-class', 'classes', invalid.subjects.map((s) => ({ source: s, target: null, action: 'fix', occurrences: invalid.counts.uses || 1, files: [], screens: [], visualChange: 'visible', metric: {}, basis: invalid.id })), { title: invalid.title, summary: invalid.summary, findings: [invalid.id], safety: 'approve' });
  // guardrails: always offered
  cards.push({ id: null, key: hash('guardrails', 8), kind: 'guardrails', axis: 'tokens', title: 'Write DESIGN-TOKENS.md and tell the agent to use it', summary: 'Documents the surviving tokens, adds a one-line pointer to CLAUDE.md/AGENTS.md and a baseline for `design-polish check`, so the next generation reuses what exists.', findings: [], entries: [], impact: { occurrences: 0, screens: 0, files: 2, weight: 0 }, grade: 'S', visualChange: 'none', safety: 'none', prereq: [], advanced: false, status: 'proposed', type: 'docs' });

  // split L cards by file so each stays reviewable
  const finalCards = [];
  for (const c of cards) {
    if (c.grade !== 'L') { finalCards.push(c); continue; }
    const byFile = new Map();
    for (const e of c.entries) { const k = (inv.occurrences.find((o) => o.id === e.source) || {}).file || (colorById.get(e.source) || {}).files?.[0] || 'misc'; if (!byFile.has(k)) byFile.set(k, []); byFile.get(k).push(e); }
    let part = 1;
    let bucket = [];
    const flush = () => { if (!bucket.length) return; const occ = bucket.reduce((n, e) => n + (e.occurrences || 0), 0); finalCards.push({ ...c, key: hash(`${c.key}|${part}`, 8), title: `${c.title} (part ${part})`, entries: bucket, impact: { ...c.impact, occurrences: occ, weight: occ, files: new Set(bucket.map((e) => e.source)).size }, grade: occ <= GRADE_S ? 'S' : 'M' }); part++; bucket = []; };
    for (const [, list] of byFile) { bucket.push(...list); if (bucket.reduce((n, e) => n + (e.occurrences || 0), 0) >= GRADE_M * 0.8) flush(); }
    flush();
  }
  // order: safest first, smallest first; then number
  const safetyRank = { none: 0, approve: 1, design: 2 };
  finalCards.sort((a, b) => safetyRank[a.safety] - safetyRank[b.safety] || (a.kind === 'guardrails') - (b.kind === 'guardrails') || b.impact.occurrences - a.impact.occurrences || (a.key < b.key ? -1 : 1));
  finalCards.forEach((c, i) => { c.id = `C${i + 1}`; });
  const guard = finalCards.find((c) => c.kind === 'guardrails');
  if (guard) guard.prereq = finalCards.filter((c) => c.kind === 'register-tokens').map((c) => c.id);

  const proposal = {
    schema: 'design-polish.proposal/1', generatedAt: new Date().toISOString(),
    architecture: { layers: declared.length > 0 ? 2 : 1, note: 'Raw values → semantic tokens (project CSS variables). A component-token layer is not proposed: it pays off only past ~200 files.' },
    newTokens, mapping, unmapped: [], summary: { mapped: mapping.length, promote: mapping.filter((m) => m.action === 'promote').length, merge: mapping.filter((m) => m.action === 'merge').length, round: mapping.filter((m) => m.action === 'round').length, newToken: newTokens.length, keep: mapping.filter((m) => m.action === 'keep').length },
  };
  const cardsOut = { schema: 'design-polish.cards/1', generatedAt: proposal.generatedAt, runId: null, cards: finalCards };
  return { proposal, cards: cardsOut };
}

function main() {
  const runDir = process.argv.slice(2).find((a) => !a.startsWith('-'));
  if (!runDir) { console.error('usage: propose.js <run-dir>'); process.exit(2); }
  const inv = JSON.parse(fs.readFileSync(path.join(runDir, 'inventory.json'), 'utf8'));
  const findings = JSON.parse(fs.readFileSync(path.join(runDir, 'findings.json'), 'utf8'));
  const { proposal, cards } = propose(inv, findings);
  cards.runId = path.basename(runDir);
  fs.writeFileSync(path.join(runDir, 'proposal.json'), JSON.stringify(proposal, null, 2));
  fs.writeFileSync(path.join(runDir, 'cards.json'), JSON.stringify(cards, null, 2));
  process.stdout.write(`mapping: ${proposal.summary.mapped} (promote ${proposal.summary.promote} · merge ${proposal.summary.merge} · round ${proposal.summary.round} · new ${proposal.summary.newToken} · keep ${proposal.summary.keep})\n`);
  for (const c of cards.cards) process.stdout.write(`${c.id.padEnd(4)} ${c.grade} ${c.safety.padEnd(7)} ${c.visualChange.padEnd(7)} ${c.kind.padEnd(18)} ${c.title} · ${c.impact.occurrences} occ · ${c.impact.screens} screens\n`);
  process.stdout.write(`→ ${path.join(runDir, 'proposal.json')}, cards.json\n`);
}

if (require.main === module) main();
module.exports = { propose, suggestColorName, GRADE_S, GRADE_M };
