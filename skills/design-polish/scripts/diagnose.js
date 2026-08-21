#!/usr/bin/env node
'use strict';
// design-polish diagnose: turns inventory.json into findings.json.
//
//   design-polish diagnose <run-dir> [--thresholds <file>]
//
// Every rule is mechanical and listed in thresholds.json. Findings carry the ids
// of their subjects and counts recomputed from the inventory, so the report and
// the verifier can check them. Severity is a ranking aid; the person decides.

const fs = require('fs');
const path = require('path');
const { findingId } = require('./lib/ids');

const INTERACTIVE = new Set(['button', 'checkbox', 'radio', 'toggle', 'select', 'text-field', 'textarea']);

function loadThresholds(file) {
  const raw = JSON.parse(fs.readFileSync(file || path.join(__dirname, 'thresholds.json'), 'utf8'));
  const t = {};
  for (const [k, v] of Object.entries(raw)) if (k !== '_comment') t[k] = v;
  return t;
}

function sev(level, screens, T) {
  if (level !== 'high' && screens >= T.screensHigh.value && level !== 'info') return 'high';
  return level;
}

function make(rule, axis, subjects, opts) {
  const f = {
    id: findingId(rule, subjects), rule, axis, severity: opts.severity, title: opts.title, summary: opts.summary,
    params: opts.params || {}, subjects, counts: opts.counts || {}, screens: [...new Set(opts.screens || [])].sort(),
    evidence: opts.evidence || { kind: 'list', refs: subjects, sites: [] },
    recommendation: opts.recommendation || null, needsUserConfirmation: !!opts.needsUserConfirmation, basis: opts.basis,
  };
  return f;
}

function diagnose(inv, T) {
  const findings = [];
  const tok = inv.tokens;
  const colorById = new Map(tok.colors.values.map((v) => [v.id, v]));
  const declaredById = new Map(tok.declared.map((d) => [d.id, d]));
  const sigIndex = new Map();
  for (const [type, t] of Object.entries(inv.components)) for (const s of t.signatures) sigIndex.set(s.id, { ...s, type });
  const screensOf = (ids) => { const out = new Set(); for (const id of ids) { const v = colorById.get(id) || sigIndex.get(id); if (v) for (const r of v.routes || []) out.add(r); } return [...out]; };
  const sitesOf = (ids) => { const out = []; for (const id of ids) { const v = colorById.get(id); if (v) for (const s of (v.sites || []).slice(0, 2)) out.push({ file: s.file, line: s.line }); const g = sigIndex.get(id); if (g) { const occ = inv.occurrences.find((o) => o.sigId === id); if (occ) out.push({ file: occ.file, line: occ.line }); } } return out.slice(0, 6); };

  // NEAR-DUP
  for (const c of tok.colors.clusters) {
    const used = c.members.filter((m) => colorById.has(m));
    if (used.length < 2 && !(used.length === 1 && c.members.some((m) => declaredById.has(m)))) continue;
    const total = c.members.reduce((n, m) => n + ((colorById.get(m) || {}).count || (declaredById.get(m) || { refs: { total: 0 } }).refs.total), 0);
    const screens = screensOf(c.members);
    const target = c.dominant || c.members.find((m) => declaredById.has(m)) || null;
    findings.push(make('NEAR-DUP', 'color', c.members, {
      severity: c.indistinguishable ? 'medium' : 'low', // a look-alike is never urgent; the fix is what decides visibility
      title: `${c.members.length} ${c.achromatic ? 'grays' : 'colors'} within ΔE ${c.maxDeltaE}`,
      summary: `${c.members.length} ${c.achromatic ? 'grays' : 'colors'} differ by at most ΔE ${c.maxDeltaE}${c.indistinguishable ? ' (indistinguishable by eye)' : ''}; ${total} uses across ${screens.length} screens.`,
      params: { n: c.members.length, deltaE: c.maxDeltaE, achromatic: c.achromatic, indistinguishable: c.indistinguishable, uses: total },
      counts: { members: c.members.length, uses: total, screens: screens.length }, screens,
      evidence: { kind: 'swatch-strip', refs: c.members, sites: sitesOf(c.members) },
      recommendation: { action: 'merge', to: target }, needsUserConfirmation: c.needsUserConfirmation,
      basis: `CIEDE2000 ≤ ${T.nearDupDeltaE.value} single-linkage; dominant = ${c.dominant ? 'yes' : 'no'}`,
    }));
  }
  // TOKEN-TWIN (colors)
  const twins = tok.colors.values.filter((v) => v.twinOf && v.where.some((w) => w !== 'token'));
  if (twins.length) {
    const subjects = twins.map((v) => v.id);
    const uses = twins.reduce((n, v) => n + v.count, 0);
    const screens = screensOf(subjects);
    findings.push(make('TOKEN-TWIN', 'color', subjects, {
      severity: sev('medium', screens.length, T),
      title: `${twins.length} hardcoded colors equal an existing token`,
      summary: `${twins.length} hardcoded color values (${uses} uses) are the same color as a declared token; replacing them changes nothing visually.`,
      params: { n: twins.length, uses }, counts: { values: twins.length, uses, screens: screens.length }, screens,
      evidence: { kind: 'twin-list', refs: subjects, pairs: twins.map((v) => ({ value: v.id, token: v.twinOf })), sites: sitesOf(subjects) },
      recommendation: { action: 'promote', to: null }, basis: `ΔE2000 < ${T.twinDeltaE.value}`,
    }));
  }
  // OFF-SCALE
  if (tok.spacing.dominantStep && tok.spacing.offScale.length) {
    const vals = tok.spacing.values.filter((v) => tok.spacing.offScale.includes(Number(v.normalized)));
    const subjects = vals.map((v) => v.id);
    const uses = vals.reduce((n, v) => n + v.count, 0);
    const screens = screensOf(subjects);
    findings.push(make('OFF-SCALE', 'spacing', subjects, {
      severity: sev(uses >= 10 ? 'medium' : 'low', screens.length, T),
      title: `${vals.length} spacing values off the ${tok.spacing.dominantStep}px grid`,
      summary: `Spacing follows a ${tok.spacing.dominantStep}px step, but ${vals.length} values (${tok.spacing.offScale.join(', ')}px; ${uses} uses) fall between steps.`,
      params: { step: tok.spacing.dominantStep, values: tok.spacing.offScale, uses }, counts: { values: vals.length, uses, screens: screens.length }, screens,
      evidence: { kind: 'ruler', refs: subjects, sites: sitesOf(subjects) }, recommendation: { action: 'round', to: null },
      basis: `dominant step ${tok.spacing.dominantStep} fits ≥ ${T.spacingSteps.fit * 100}% of distinct values`,
    }));
  } else if (!tok.spacing.dominantStep && tok.spacing.sorted.length >= 6) {
    findings.push(make('NO-SCALE', 'spacing', [], { severity: 'medium', title: 'No spacing scale', summary: `${tok.spacing.sorted.length} distinct spacing values with no step that fits 75% of them.`, params: { values: tok.spacing.sorted.length }, counts: { values: tok.spacing.sorted.length }, screens: [], basis: 'no step in [8,4,2] fits ≥ 75%' }));
  }
  // SIG-SPRAWL / REPEAT-INLINE / DUP-IMPL / STATE-GAP / PAD-INCONS / RATIO per type
  for (const [type, t] of Object.entries(inv.components)) {
    if (!t.total) continue;
    const adHoc = t.signatures.filter((s) => s.adHoc && s.count > 0);
    if (adHoc.length >= T.sigSprawl.warn) {
      const subjects = adHoc.map((s) => s.id);
      const screens = screensOf(subjects);
      findings.push(make('SIG-SPRAWL', `component:${type}`, subjects, {
        severity: adHoc.length >= T.sigSprawl.severe ? 'high' : sev('medium', screens.length, T),
        title: `${adHoc.length} one-off ${type} looks`,
        summary: `${type}: ${t.signatures.length} distinct looks in ${t.total} uses; ${adHoc.length} of them are one-offs outside the base component's variants.`,
        params: { type, adHoc: adHoc.length, looks: t.signatures.length, uses: t.total }, counts: { adHoc: adHoc.length, looks: t.signatures.length, uses: t.total, screens: screens.length }, screens,
        evidence: { kind: 'specimen-row', refs: subjects, sites: sitesOf(subjects) }, recommendation: { action: 'align', to: (t.signatures.find((s) => !s.adHoc) || {}).id || null },
        basis: `ad-hoc looks ≥ ${T.sigSprawl.warn} warn / ≥ ${T.sigSprawl.severe} severe`,
      }));
    }
    const impls = t.implementations.filter((i) => i.count > 0 && i.kind !== 'wrapper');
    if (impls.length >= 2) {
      const subjects = impls.map((i) => i.id);
      const screens = [...new Set(impls.flatMap((i) => i.routes || []))];
      const bothWide = impls.filter((i) => (i.routes || []).length >= T.screensHigh.value).length >= 2;
      findings.push(make('DUP-IMPL', `component:${type}`, subjects, {
        severity: bothWide ? 'high' : 'medium',
        title: `${impls.length} different ${type} implementations`,
        summary: `${type} is built ${impls.length} different ways (${impls.map((i) => i.kind === 'native' ? `raw <${i.name}>` : i.name).join(', ')}).`,
        params: { type, n: impls.length, names: impls.map((i) => i.name) }, counts: { implementations: impls.length, uses: t.total }, screens,
        evidence: { kind: 'specimen-row', refs: impls.flatMap((i) => i.signatures.slice(0, 1)), sites: [] }, recommendation: { action: 'unify', to: impls.sort((a, b) => b.count - a.count)[0].id },
        basis: '≥ 2 implementations with usages',
      }));
    }
    if (INTERACTIVE.has(type)) {
      const gaps = t.signatures.filter((s) => s.count > 0 && (s.states.focusVisible === 'no' || s.states.focusVisible === 'removed'));
      if (gaps.length) {
        const subjects = gaps.map((s) => s.id);
        const screens = screensOf(subjects);
        const hoverOnly = gaps.filter((s) => s.states.hover === 'yes').length;
        findings.push(make('STATE-GAP', `component:${type}`, subjects, {
          severity: 'high',
          title: `${gaps.length} ${type} looks without a keyboard focus style`,
          summary: `${gaps.length} ${type} looks (${gaps.reduce((n, s) => n + s.count, 0)} uses) have no focus-visible style${hoverOnly ? `; ${hoverOnly} of them do style hover` : ''}.`,
          params: { type, n: gaps.length, hoverOnly }, counts: { looks: gaps.length, uses: gaps.reduce((n, s) => n + s.count, 0), screens: screens.length }, screens,
          evidence: { kind: 'specimen-row', refs: subjects, sites: sitesOf(subjects) }, recommendation: { action: 'add-state', to: 'focus-visible' }, basis: 'focus-visible scope absent or outline removed',
        }));
      }
    }
    const repeats = t.signatures.filter((s) => s.count >= T.repeatInlineMin.value && s.implIds.every((id) => id.includes(':native:')));
    for (const s of repeats) {
      findings.push(make('REPEAT-INLINE', `component:${type}`, [s.id], {
        severity: 'info', title: `The same raw ${type} repeated ${s.count} times`, summary: `A raw <${s.spelling.split(' ')[0] ? type : type}> with identical classes appears ${s.count} times across ${s.routes.length} screens without a shared component.`,
        params: { type, count: s.count }, counts: { uses: s.count, screens: s.routes.length }, screens: s.routes,
        evidence: { kind: 'specimen-row', refs: [s.id], sites: sitesOf([s.id]) }, recommendation: { action: 'confirm', to: null }, basis: `count ≥ ${T.repeatInlineMin.value}, native implementation only`,
      }));
    }
    // PAD-INCONS: same type & height, different horizontal padding
    const byHeight = new Map();
    for (const s of t.signatures) if (s.count > 0 && s.computed.heightPx != null && s.computed.paddingX != null) { const k = s.computed.heightPx; if (!byHeight.has(k)) byHeight.set(k, []); byHeight.get(k).push(s); }
    for (const [h, sigs] of byHeight) {
      const pads = [...new Set(sigs.map((s) => s.computed.paddingX))];
      if (pads.length < 2) continue;
      const subjects = sigs.map((s) => s.id);
      findings.push(make('PAD-INCONS', `component:${type}`, subjects, {
        severity: 'low', title: `${type}s of height ${h}px use ${pads.length} different paddings`, summary: `${sigs.length} ${type} looks share height ${h}px but use horizontal padding ${pads.sort((a, b) => a - b).join('/')}px.`,
        params: { type, height: h, paddings: pads }, counts: { looks: sigs.length, paddings: pads.length }, screens: screensOf(subjects),
        evidence: { kind: 'specimen-row', refs: subjects, sites: sitesOf(subjects) }, recommendation: { action: 'align', to: null }, basis: 'same computed height, ≥ 2 distinct padding-inline values',
      }));
    }
    // RATIO: radius/height outliers against the type's modal ratio
    const withRatio = t.signatures.filter((s) => s.count > 0 && s.computed.krds && typeof s.computed.radiusPx === 'number');
    if (withRatio.length >= 3) {
      const ratios = withRatio.map((s) => Math.round(s.computed.krds.ratio * 100) / 100);
      const modal = ratios.sort((a, b) => ratios.filter((x) => x === b).length - ratios.filter((x) => x === a).length)[0];
      const outliers = withRatio.filter((s) => Math.abs(s.computed.krds.ratio - modal) > T.ratioTolerance.value);
      if (outliers.length) {
        const subjects = outliers.map((s) => s.id);
        findings.push(make('RATIO', `component:${type}`, subjects, {
          severity: 'low', title: `${outliers.length} ${type} looks with an unusual corner ratio`, summary: `Most ${type}s round corners at ${Math.round(modal * 100)}% of their height; ${outliers.length} looks deviate (KRDS reference: height × 0.125, max 12px).`,
          params: { type, modal, n: outliers.length }, counts: { looks: outliers.length }, screens: screensOf(subjects),
          evidence: { kind: 'specimen-row', refs: subjects, sites: sitesOf(subjects) }, recommendation: { action: 'confirm', to: null }, basis: `|ratio − modal| > ${T.ratioTolerance.value}`,
        }));
      }
    }
  }
  // TOKEN-SPRAWL (achromatic, raw values) and PALETTE-GRAYS (Tailwind grays next to the project's own neutrals)
  const paletteGrays = tok.colors.values.filter((v) => v.achromatic && v.where.includes('palette') && !v.hardcodedCount);
  const ownNeutrals = tok.declared.filter((d) => d.axis === 'color' && d.source === 'project' && d.role === 'neutral');
  if (paletteGrays.length >= 3 && ownNeutrals.length >= 3) {
    const subjects = paletteGrays.map((v) => v.id);
    findings.push(make('PALETTE-GRAYS', 'color', subjects, {
      severity: 'medium', title: `${paletteGrays.length} Tailwind grays used beside ${ownNeutrals.length} neutral tokens`,
      summary: `${paletteGrays.length} grays come straight from Tailwind's palette (gray-100, gray-500…) although the project defines ${ownNeutrals.length} neutral tokens of its own; the two ramps drift apart.`,
      params: { n: paletteGrays.length, tokens: ownNeutrals.length }, counts: { values: paletteGrays.length, uses: paletteGrays.reduce((n, v) => n + v.count, 0), tokens: ownNeutrals.length }, screens: screensOf(subjects),
      evidence: { kind: 'swatch-strip', refs: subjects, sites: sitesOf(subjects) }, recommendation: { action: 'merge', to: null }, basis: '≥ 3 palette grays and ≥ 3 project neutral tokens',
    }));
  }
  const grays = tok.colors.values.filter((v) => v.achromatic && v.hardcodedCount > 0);
  if (grays.length >= T.achromaticSprawl.warn) {
    const subjects = grays.map((v) => v.id);
    findings.push(make('TOKEN-SPRAWL', 'color', subjects, {
      severity: grays.length >= T.achromaticSprawl.severe ? 'high' : 'medium', title: `${grays.length} distinct grays outside tokens`,
      summary: `${grays.length} different gray values are used directly (${grays.reduce((n, v) => n + v.count, 0)} uses); a deliberate ramp has 5–8.`,
      params: { n: grays.length }, counts: { values: grays.length, uses: grays.reduce((n, v) => n + v.count, 0) }, screens: screensOf(subjects),
      evidence: { kind: 'swatch-strip', refs: subjects, sites: sitesOf(subjects) }, recommendation: { action: 'merge', to: null }, basis: `≥ ${T.achromaticSprawl.warn} warn / ≥ ${T.achromaticSprawl.severe} severe`,
    }));
  }
  // HARDCODE per axis
  const bands = (ratio) => (ratio >= T.hardcodeBands.ok ? 'ok' : ratio >= T.hardcodeBands.partial ? 'partial' : ratio >= T.hardcodeBands.decorative ? 'decorative' : 'none');
  const axisTotals = { color: [tok.axes.color.onToken, tok.axes.color.hardcoded], typography: [tok.axes.typography.onToken, tok.axes.typography.hardcoded], radius: [tok.axes.radius.onToken, tok.axes.radius.hardcoded], shadow: [tok.axes.shadow.onToken, tok.axes.shadow.hardcoded] };
  for (const [axis, [on, off]] of Object.entries(axisTotals)) {
    const total = on + off;
    if (total < T.hardcodeMinOccurrences.value) continue;
    const ratio = on / total;
    const band = bands(ratio);
    if (band === 'ok') continue;
    const vals = tok[axis === 'shadow' ? 'shadows' : axis].values.filter((v) => !v.where.every((w) => w === 'token' || w === 'scale'));
    const subjects = vals.map((v) => v.id);
    findings.push(make('HARDCODE', axis, subjects, {
      severity: band === 'partial' ? 'medium' : 'high', title: `${Math.round((1 - ratio) * 100)}% of ${axis} values bypass tokens`,
      summary: `${off} of ${total} ${axis} occurrences use a raw value instead of a token (${Math.round(ratio * 100)}% compliance: ${band}).`,
      params: { axis, ratio: Math.round(ratio * 1000) / 10, band, on, off }, counts: { onToken: on, hardcoded: off, values: vals.length }, screens: screensOf(subjects),
      evidence: { kind: 'list', refs: subjects.slice(0, 30), sites: sitesOf(subjects.slice(0, 10)) }, recommendation: { action: 'promote', to: null }, basis: `bands ok ≥ ${T.hardcodeBands.ok}, partial ≥ ${T.hardcodeBands.partial}, decorative ≥ ${T.hardcodeBands.decorative}`,
    }));
  }
  // DEAD-TOKEN
  const dead = tok.declared.filter((d) => d.source === 'project' && d.refs.total === 0);
  if (dead.length) {
    const subjects = dead.map((d) => d.id);
    const twinned = dead.filter((d) => tok.colors.values.some((v) => v.twinOf === d.id));
    findings.push(make('DEAD-TOKEN', 'tokens', subjects, {
      severity: twinned.length ? 'medium' : 'low', title: `${dead.length} declared tokens are never used`,
      summary: `${dead.length} tokens are declared but referenced nowhere${twinned.length ? `; ${twinned.length} of them have a hardcoded twin in use` : ''}.`,
      params: { n: dead.length, twinned: twinned.length }, counts: { tokens: dead.length, twinned: twinned.length }, screens: [],
      evidence: { kind: 'token-list', refs: subjects, sites: [] }, recommendation: { action: twinned.length ? 'promote' : 'remove-token', to: null }, basis: 'refs.total == 0 among project-declared tokens',
    }));
  }
  // DARK-GAP
  const darkMissing = tok.declared.filter((d) => d.darkMissing);
  if (darkMissing.length) {
    const subjects = darkMissing.map((d) => d.id);
    findings.push(make('DARK-GAP', 'color', subjects, {
      severity: 'high', title: `${darkMissing.length} tokens have no dark value`, summary: `The project has a dark theme, but ${darkMissing.length} color tokens define only a light value; they keep the light color in dark mode.`,
      params: { n: darkMissing.length }, counts: { tokens: darkMissing.length }, screens: [], evidence: { kind: 'token-list', refs: subjects, sites: [] }, recommendation: { action: 'add-dark', to: null }, basis: 'dark strategy detected and .dark block lacks the variable',
    }));
  }
  // SIB-RADIUS / SIB-HEIGHT
  const groups = (inv.relationships.siblingGroups || []).filter((g) => !g.catalog); // catalog pages show every size on purpose
  const radiusGroups = groups.filter((g) => g.mismatch.radius);
  const heightGroups = groups.filter((g) => g.mismatch.height);
  const groupScreens = (gs) => [...new Set(gs.flatMap((g) => [...(g.routes || []), ...(g.layoutScope || [])]))];
  for (const g of radiusGroups) {
    findings.push(make('SIB-RADIUS', 'radius', g.members, {
      severity: 'medium', title: `Neighbors with different corner radii (${g.radiusPx.filter((r) => r != null).join(' / ')}px)`,
      summary: `${g.memberTypes.join(' and ')} sit in one ${g.layout} with radii ${g.radiusPx.map((r) => r == null ? '?' : r).join(' / ')}px.`,
      params: { types: g.memberTypes, radii: g.radiusPx, layout: g.layout }, counts: { members: g.members.length }, screens: [...(g.routes || []), ...(g.layoutScope || [])],
      evidence: { kind: 'sibling-row', refs: [g.id], sites: [{ file: g.file, line: g.line }] }, recommendation: { action: 'unify-radius', to: null }, basis: `≥ ${T.siblingMinDiffPx.value}px difference in one row/grid`,
    }));
  }
  for (const g of heightGroups) {
    findings.push(make('SIB-HEIGHT', 'spacing', g.members, {
      severity: 'medium', title: `Neighbors with different heights (${g.heightPx.filter((r) => r != null).join(' / ')}px)`,
      summary: `${g.memberTypes.join(' and ')} sit in one ${g.layout} with heights ${g.heightPx.map((r) => r == null ? '?' : r).join(' / ')}px.`,
      params: { types: g.memberTypes, heights: g.heightPx, layout: g.layout }, counts: { members: g.members.length }, screens: [...(g.routes || []), ...(g.layoutScope || [])],
      evidence: { kind: 'sibling-row', refs: [g.id], sites: [{ file: g.file, line: g.line }] }, recommendation: { action: 'unify-height', to: null }, basis: `≥ ${T.siblingMinDiffPx.value}px difference in one row/grid`,
    }));
  }
  if (radiusGroups.length >= T.siblingHighGroups.value) {
    findings.push(make('SIB-RADIUS-PATTERN', 'radius', radiusGroups.map((g) => g.id), { severity: 'high', title: `${radiusGroups.length} rows mix corner radii`, summary: `Corner radius mismatches between neighbors occur in ${radiusGroups.length} places across ${groupScreens(radiusGroups).length} screens.`, params: { n: radiusGroups.length }, counts: { groups: radiusGroups.length }, screens: groupScreens(radiusGroups), evidence: { kind: 'list', refs: radiusGroups.map((g) => g.id), sites: radiusGroups.slice(0, 5).map((g) => ({ file: g.file, line: g.line })) }, recommendation: { action: 'unify-radius', to: null }, basis: `≥ ${T.siblingHighGroups.value} mismatched groups` }));
  }
  // INVALID-CLASS
  const invalid = (inv.classes.unresolved || []).filter((u) => u.reason === 'invalid-utility');
  if (invalid.length) {
    findings.push(make('INVALID-CLASS', 'classes', invalid.map((u) => `cls:${u.cls}`), {
      severity: 'high', title: `${invalid.length} classes have no effect`, summary: `${invalid.length} utility-looking classes (${invalid.slice(0, 4).map((u) => u.cls).join(', ')}${invalid.length > 4 ? ', …' : ''}) match no generated or project CSS; they style nothing.`,
      params: { n: invalid.length, classes: invalid.map((u) => u.cls) }, counts: { classes: invalid.length, uses: invalid.reduce((n, u) => n + u.count, 0) }, screens: [],
      evidence: { kind: 'class-list', refs: invalid.map((u) => u.cls), sites: invalid.flatMap((u) => u.sites.slice(0, 2)) }, recommendation: { action: 'fix-class', to: null }, basis: 'no Tailwind output and no project CSS rule for the class',
    }));
  }
  // UNREACHED components with control implementations
  const unreachedImpls = Object.values(inv.components).flatMap((t) => t.implementations.filter((i) => i.reachability === 'unreached'));
  if (unreachedImpls.length) {
    findings.push(make('UNREACHED', 'components', unreachedImpls.map((i) => i.id), { severity: 'info', title: `${unreachedImpls.length} control components are not used by any screen`, summary: `${unreachedImpls.length} components (${unreachedImpls.map((i) => i.name).join(', ')}) are defined but reachable from no route.`, params: { n: unreachedImpls.length }, counts: { components: unreachedImpls.length }, screens: [], evidence: { kind: 'list', refs: unreachedImpls.map((i) => i.id), sites: unreachedImpls.map((i) => ({ file: i.file, line: 1 })) }, recommendation: { action: 'confirm', to: null }, basis: 'no import path from a route file' }));
  }

  // priority and ordering
  for (const f of findings) {
    const w = T.severityWeight[f.severity] || 1;
    const uses = f.counts.uses || f.counts.members || f.counts.values || 1;
    f.priority = Math.round((w * Math.max(1, f.screens.length) / Math.max(1, Math.log2(uses + 1))) * 100) / 100;
  }
  findings.sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : 1));
  findings.forEach((f, i) => { f.num = i + 1; });

  // axes that are fine, with the reason — the report must say what is good, too
  const okAxes = [];
  const s = inv.scores;
  const byAxis = (axis) => findings.filter((f) => f.axis === axis && f.severity !== 'info');
  for (const axis of ['color', 'typography', 'spacing', 'radius', 'shadow']) {
    const score = s[axis];
    const fs_ = byAxis(axis);
    if ((score == null || score >= 95) && !fs_.some((f) => f.severity === 'high')) okAxes.push({ axis, score, findings: fs_.length, reason: score == null ? 'no values on this axis' : `${score}% of occurrences use tokens/scale` });
  }
  return { schema: 'design-polish.findings/1', generatedAt: new Date().toISOString(), thresholds: Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v.value !== undefined ? v.value : v])), findings, okAxes, summary: { high: findings.filter((f) => f.severity === 'high').length, medium: findings.filter((f) => f.severity === 'medium').length, low: findings.filter((f) => f.severity === 'low').length, info: findings.filter((f) => f.severity === 'info').length } };
}

function main() {
  const args = process.argv.slice(2);
  const runDir = args.find((a) => !a.startsWith('-'));
  if (!runDir) { console.error('usage: diagnose.js <run-dir> [--thresholds <file>]'); process.exit(2); }
  const ti = args.indexOf('--thresholds');
  const T = loadThresholds(ti >= 0 ? args[ti + 1] : null);
  const inv = JSON.parse(fs.readFileSync(path.join(runDir, 'inventory.json'), 'utf8'));
  const out = diagnose(inv, T);
  fs.writeFileSync(path.join(runDir, 'findings.json'), JSON.stringify(out, null, 2));
  const lines = out.findings.map((f) => `${String(f.num).padStart(2)}. [${f.severity}] ${f.rule.padEnd(14)} ${f.title}`);
  process.stdout.write(`${out.findings.length} findings (high ${out.summary.high} · medium ${out.summary.medium} · low ${out.summary.low} · info ${out.summary.info}); ok axes: ${out.okAxes.map((a) => a.axis).join(', ') || '-'}\n${lines.join('\n')}\n→ ${path.join(runDir, 'findings.json')}\n`);
}

if (require.main === module) main();
module.exports = { diagnose, loadThresholds };
