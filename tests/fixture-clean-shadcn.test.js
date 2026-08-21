'use strict';
// False-positive control: a small, tidy shadcn/ui app must come out clean — no finding above "info",
// no card except guardrails, every axis at 100 — and the report must say so.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPTS = path.join(__dirname, '..', 'skills', 'design-polish', 'scripts');
const FIXTURE = path.join(__dirname, '..', 'skills', 'design-polish', 'evals', 'fixtures', 'clean-shadcn');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-clean-'));
const r = spawnSync(process.execPath, [path.join(SCRIPTS, 'inventory.js'), FIXTURE, '--out', out, '--no-open', '--quiet'], { encoding: 'utf8' });
if (r.status !== 0) throw new Error(r.stderr);
const read = (f) => JSON.parse(fs.readFileSync(path.join(out, f), 'utf8'));
const inv = read('inventory.json'), findings = read('findings.json'), cards = read('cards.json');

test('clean app: every axis scores 100 and no raw value is the project\'s own', () => {
  for (const k of ['color', 'typography', 'spacing', 'radius', 'shadow', 'component']) assert.equal(inv.scores[k], 100, `${k} score`);
  assert.equal(inv.tokens.colors.values.filter((v) => v.ownHardcodedCount > 0).length, 0);
  // shadcn's own `rounded-[4px]` checkbox is inventoried as vendored, not as the project's drift
  const four = inv.tokens.radius.values.find((v) => v.id === 'tok:radius:4');
  assert.ok(four && four.vendoredCount === 3 && four.ownHardcodedCount === 0, JSON.stringify(four && { v: four.vendoredCount, o: four.ownHardcodedCount }));
});

test('clean app: nothing above info, and the base-set tokens are reported but kept', () => {
  const above = findings.findings.filter((f) => f.severity !== 'info');
  assert.deepEqual(above.map((f) => f.rule), [], `unexpected findings: ${above.map((f) => f.id + ' ' + f.title).join('; ')}`);
  const dead = findings.findings.find((f) => f.rule === 'DEAD-TOKEN');
  assert.ok(dead && dead.counts.librarySet === dead.counts.tokens, 'all unused tokens belong to the shadcn base set');
  assert.deepEqual(findings.okAxes.map((a) => a.axis || a).sort(), ['color', 'radius', 'shadow', 'spacing', 'typography']);
});

test('clean app: only the guardrails card is proposed and the report says what is consistent', () => {
  assert.deepEqual(cards.cards.map((c) => c.kind), ['guardrails']);
  const html = fs.readFileSync(path.join(out, 'report.html'), 'utf8');
  assert.ok(/No change proposed|변경 제안 없음/.test(html));
  const v = spawnSync(process.execPath, [path.join(SCRIPTS, 'verify.js'), out, '--quick'], { encoding: 'utf8' });
  assert.equal(v.status, 0, v.stdout.split('\n').filter((l) => l.startsWith('FAIL')).join('; '));
});

test('clean app: siblings of different kinds are not compared', () => {
  // a checkbox next to a small button in one row is a form, not a mismatch
  const groups = inv.relationships.siblingGroups;
  for (const g of groups) assert.equal(new Set(g.memberTypes.map((t) => ({ checkbox: 'mark', radio: 'mark', toggle: 'mark', button: 'box', 'text-field': 'box', select: 'box' })[t] || t)).size, 1, `mixed group ${g.id}`);
});
