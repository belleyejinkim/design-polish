'use strict';
// Repository shape: versions agree, plugin agents mirror the skill manuals, skill frontmatter is within limits,
// every script prints usage, and the templates keep the paper rules (one measure, no left accent, no remote URLs).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, 'skills', 'design-polish');
const read = (p) => fs.readFileSync(p, 'utf8');

test('versions agree across package.json, plugin.json, marketplace.json and SKILL.md', () => {
  const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
  const plugin = JSON.parse(read(path.join(ROOT, '.claude-plugin', 'plugin.json')));
  const market = JSON.parse(read(path.join(ROOT, '.claude-plugin', 'marketplace.json')));
  assert.equal(plugin.version, pkg.version);
  const entry = (market.plugins || []).find((p) => p.name === 'design-polish');
  assert.ok(entry, 'marketplace lists design-polish');
  if (entry.version) assert.equal(entry.version, pkg.version);
  const skill = read(path.join(SKILL, 'SKILL.md'));
  assert.ok(skill.includes(`version: ${pkg.version}`), 'SKILL.md metadata.version matches');
});

test('plugin agents are generated from the skill manuals', () => {
  const { sync } = require('../tools/sync-agents');
  assert.deepEqual(sync({ check: true }), []);
});

test('SKILL.md frontmatter is within Claude Code limits', () => {
  const text = read(path.join(SKILL, 'SKILL.md'));
  const fm = text.split('---')[1];
  assert.ok(/^name: design-polish$/m.test(fm));
  const desc = /description: >-\n([\s\S]*?)\nargument-hint/.exec(fm)[1].replace(/\n\s+/g, ' ').trim();
  assert.ok(desc.length <= 1024, `description ${desc.length} chars`);
  assert.ok(desc.includes('디자인') && desc.includes('polish'), 'bilingual triggers');
  assert.ok(text.split('\n').length <= 300, 'SKILL.md ≤ 300 lines');
  for (const f of ['agents/scanner.md', 'agents/verifier.md', 'agents/planner.md', 'references/narrative-rules.md', 'references/apply-contract.md']) assert.ok(fs.existsSync(path.join(SKILL, f)), f);
});

test('every script prints usage and exits 2 without arguments', () => {
  for (const s of ['scan.js', 'diagnose.js', 'propose.js', 'render-specimens.js', 'render.js', 'verify.js', 'check.js', 'serve.js', 'apply.js', 'diff-runs.js', 'brief.js']) {
    const r = spawnSync(process.execPath, [path.join(SKILL, 'scripts', s)], { encoding: 'utf8' });
    assert.equal(r.status, 2, `${s} exit ${r.status}: ${r.stderr.slice(0, 200)}`);
    assert.ok(/usage/i.test(r.stderr), `${s} prints usage`);
  }
});

test('templates keep the paper rules', () => {
  const css = read(path.join(SKILL, 'templates', 'report.css'));
  assert.equal((css.match(/max-width:\s*var\(--measure\)/g) || []).length >= 1, true);
  assert.ok(!/border-left:\s*[3-9]px/.test(css), 'no thick left accent bars');
  for (const f of ['report.css', 'report.js']) assert.ok(!/https?:\/\//.test(read(path.join(SKILL, 'templates', f)).replace(/\/\/[^\n]*/g, '')), `${f} has no remote URL`);
});
