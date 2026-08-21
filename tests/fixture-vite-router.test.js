'use strict';
// Vite + React Router + a const-map Button (no cva, no clsx): routes come from createBrowserRouter,
// variants resolve through VARIANTS[variant], and the one hand-written button is the only one-off.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPTS = path.join(__dirname, '..', 'skills', 'design-polish', 'scripts');
const FIXTURE = path.join(__dirname, '..', 'skills', 'design-polish', 'evals', 'fixtures', 'vite-router');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-vr-'));
const r = spawnSync(process.execPath, [path.join(SCRIPTS, 'inventory.js'), FIXTURE, '--out', out, '--no-open', '--quiet'], { encoding: 'utf8' });
if (r.status !== 0) throw new Error(r.stderr);
const read = (f) => JSON.parse(fs.readFileSync(path.join(out, f), 'utf8'));
const inv = read('inventory.json'), findings = read('findings.json');

test('react-router: routes and the layout come from createBrowserRouter, not from file names', () => {
  assert.equal(inv.meta.router, 'react-router');
  assert.deepEqual(inv.routes.map((x) => x.id).sort(), ['route:/', 'route:/#layout', 'route:/participants/:id', 'route:/reports']);
  assert.equal(inv.routes.find((x) => x.id === 'route:/').display, 'Interviews this week');
  const layout = inv.routes.find((x) => x.kind === 'layout');
  assert.equal(layout.file, 'src/components/shell.tsx');
  for (const o of inv.occurrences) assert.ok(o.routes.length === 1 && !o.routes[0].includes('/home'), `${o.file}:${o.line} → ${o.routes}`);
});

test('const-map variants resolve per usage: three Button looks plus one hand-written button', () => {
  const b = inv.components.button;
  assert.equal(b.total, 6);
  assert.equal(b.looks, 4);
  const oneOff = b.signatures.filter((s) => s.adHoc && s.count > 0);
  assert.equal(oneOff.length, 1);
  assert.ok(oneOff[0].spelling.includes('rounded-lg'));
  assert.equal(inv.classes.dynamicSites.length, 0, JSON.stringify(inv.classes.dynamicSites));
  // the secondary variant's token is used, so nothing is dead
  assert.deepEqual(inv.tokens.declared.filter((d) => d.source === 'project' && d.refs.total === 0).map((d) => d.name), []);
});

test('the hand-written button is caught as a sibling mismatch and a duplicate implementation', () => {
  const sib = findings.findings.find((f) => f.rule === 'SIB-RADIUS');
  assert.ok(sib, 'SIB-RADIUS finding');
  assert.deepEqual(sib.screens, ['route:/reports']);
  assert.ok(findings.findings.some((f) => f.rule === 'DUP-IMPL' && f.axis === 'component:button'));
});
