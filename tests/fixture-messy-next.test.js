'use strict';
// The fixture is built so that its numbers are known by construction (see the fixture's
// GROUND-TRUTH.md). Any drift here is a scanner regression or a deliberate redefinition
// that must be explained in the same commit.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { scan } = require('../skills/design-polish/scripts/scan');

const FIXTURE = path.join(__dirname, '..', 'skills', 'design-polish', 'evals', 'fixtures', 'messy-next');
const gt = require(path.join(FIXTURE, 'ground-truth.json'));

let inv;
test.before(async () => { inv = await scan(FIXTURE, { quiet: true }); assert.ok(!inv.error, inv.message); });

test('stack detection', () => {
  assert.equal(inv.meta.mode, 'ast');
  assert.equal(inv.meta.css.engine, 'tailwind4');
  assert.equal(inv.meta.css.entry, 'src/app/globals.css');
  assert.equal(inv.meta.router, 'next-app');
  assert.equal(inv.meta.css.darkStrategy, 'class');
});

test('excluded files are not scanned', () => {
  assert.equal(inv.occurrences.some((o) => o.file.includes('__tests__')), false);
  assert.equal(inv.tokens.colors.values.some((v) => v.id.includes('ff0000') || v.id.includes('00ff00')), false, 'test file and commented-out colors must not count');
});

test('occurrences per type match the ground truth (main and catalog)', () => {
  for (const [type, g] of Object.entries(gt.counts.total.byType)) {
    assert.equal(inv.components[type].total, g.occurrences, `${type} main occurrences`);
  }
  for (const [type, g] of Object.entries(gt.counts.catalog.byType)) {
    assert.equal(inv.components[type].catalog, g.occurrences, `${type} catalog occurrences`);
  }
});

test('distinct looks per type match the ground truth', () => {
  for (const [type, g] of Object.entries(gt.counts.total.byType)) {
    assert.equal(inv.components[type].looks, g.signatures, `${type} looks`);
  }
  assert.equal(inv.components.button.unresolvedLooks, 1, 'the dynamic-class button is an unresolved look');
});

test('implementations: two checkbox implementations, Button is one implementation with wrappers', () => {
  const cb = inv.components.checkbox.implementations.filter((i) => i.count > 0).map((i) => i.name).sort();
  assert.deepEqual(cb, ['Checkbox', 'LegacyCheckbox']);
  const btn = inv.components.button.implementations;
  assert.equal(btn.find((i) => i.name === 'Button').count, 13);
  assert.equal(btn.find((i) => i.name === 'PrimaryButton').kind, 'wrapper');
  assert.equal(btn.find((i) => i.name === 'OldButton').reachability, 'unreached');
  assert.deepEqual(inv.coverage.unreachedFiles, ['src/components/shared/unused/old-button.tsx']);
});

test('hardcoded colors, twin, palette use', () => {
  const hard = inv.tokens.colors.values.filter((v) => v.hardcodedCount > 0).map((v) => v.id.replace('tok:color:', '')).sort();
  assert.deepEqual(hard, ['#1aa44d', '#222222', '#22c55e', '#333333', '#4f46e5', '#d93025']);
  const twin = inv.tokens.colors.values.find((v) => v.id === 'tok:color:#1aa44d');
  assert.equal(twin.twinOf, 'tok:color:var:--color-brand');
  const palette = inv.tokens.colors.palette.map((p) => p.name).sort();
  assert.ok(palette.includes('--color-gray-500') && palette.includes('--color-white'));
});

test('declared tokens: dead tokens and missing dark values', () => {
  const dead = inv.tokens.declared.filter((d) => d.source === 'project' && d.refs.total === 0).map((d) => d.name).sort();
  assert.deepEqual(dead, gt.deadTokens.items.map((i) => i.name).sort());
  const darkMissing = inv.tokens.declared.filter((d) => d.darkMissing).map((d) => d.name);
  assert.deepEqual(darkMissing, ['--color-brand-soft']);
});

test('spacing scale and off-scale values', () => {
  assert.equal(inv.tokens.spacing.basePx, 4);
  assert.deepEqual(inv.tokens.spacing.offScale, [18]);
});

test('invalid classes and dynamic class sites', () => {
  const invalid = inv.classes.unresolved.filter((u) => u.reason === 'invalid-utility').map((u) => u.cls);
  assert.deepEqual(invalid, ['rounded-card']);
  assert.equal(inv.classes.dynamicSites.length, 1);
  assert.equal(inv.classes.dynamicSites[0].file, 'src/components/shared/dynamic-button.tsx');
});

test('sibling radius mismatches', () => {
  const mismatches = inv.relationships.siblingGroups.filter((g) => g.mismatch.radius && !g.catalog).map((g) => `${g.file}:${g.line}`).sort();
  assert.deepEqual(mismatches, ['src/components/forms/settings-form.tsx:30', 'src/components/shared/toolbar.tsx:12']);
  const settings = inv.relationships.siblingGroups.find((g) => g.file.endsWith('settings-form.tsx') && g.line === 30);
  assert.deepEqual(settings.radiusPx, [6, 8]);
  assert.deepEqual(settings.heightPx, [36, 36]);
});

test('repeated raw button and hover-without-focus-visible', () => {
  const rawA = inv.components.button.signatures.find((s) => s.spelling.includes('rounded-[6px] border px-3 py-1.5'));
  assert.ok(rawA, 'RAW-A signature exists');
  assert.equal(rawA.count, 3);
  assert.equal(rawA.states.hover, 'yes');
  assert.equal(rawA.states.focusVisible, 'ua-default');
  const occFiles = rawA.occurrences.map((id) => inv.occurrences.find((o) => o.id === id).file);
  assert.equal(new Set(occFiles).size, 3);
});

test('routes: five pages with titles, catalog route flagged, layout-scoped element visible everywhere', () => {
  const pages = inv.routes.filter((r) => r.kind === 'page');
  assert.deepEqual(pages.map((r) => r.path).sort(), ['/', '/dashboard', '/design-system', '/orders/[id]', '/settings']);
  assert.deepEqual(pages.map((r) => r.display).sort(), ['Dashboard', 'Design System', 'Home', 'Order', 'Settings']);
  assert.equal(pages.find((r) => r.path === '/design-system').catalogLike, true);
  const rawB = inv.occurrences.find((o) => o.file === 'src/app/layout.tsx' && o.type === 'button');
  assert.equal(rawB.routes.length, 5, 'root layout button appears on every page');
});

test('determinism: two scans produce identical inventories', async () => {
  const again = await scan(FIXTURE, { quiet: true });
  const strip = (x) => JSON.stringify(x, (k, v) => (k === 'generatedAt' || k === 'durationMs' ? undefined : v));
  assert.equal(strip(again), strip(inv));
});
