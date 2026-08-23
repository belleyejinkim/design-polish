'use strict';
// A Spring Boot + Freemarker project: no package.json, no TypeScript, no React. The inventory must still run in
// CSS-only mode (stylesheets + <style> blocks in templates), and tooling folders inside the project — an installed
// skill under .agents/skills or skills/, dot-directories — must never be scanned as product code.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPTS = path.join(__dirname, '..', 'skills', 'design-polish', 'scripts');
const FIXTURE = path.join(__dirname, '..', 'skills', 'design-polish', 'evals', 'fixtures', 'freemarker');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-ftl-'));
fs.cpSync(FIXTURE, dir, { recursive: true });
// an installed skill (ours or anyone's) and a dot-directory full of React code must be ignored
for (const d of ['.agents/skills/some-skill', 'skills/other-skill', '.moai/templates']) {
  fs.mkdirSync(path.join(dir, d, 'src'), { recursive: true });
  if (!d.startsWith('.moai')) fs.writeFileSync(path.join(dir, d, 'SKILL.md'), '---\nname: x\n---\n');
  fs.writeFileSync(path.join(dir, d, 'src', 'page.tsx'), 'export default function P(){ return <button className="rounded-lg bg-[#ff0000] p-[18px]">x</button> }');
  fs.writeFileSync(path.join(dir, d, 'src', 'globals.css'), '@import "tailwindcss";\n.tool { color: #ff00ff; }');
}
spawnSync('git', ['init', '-q'], { cwd: dir });
const r = spawnSync(process.execPath, [path.join(SCRIPTS, 'inventory.js'), dir, '--no-open', '--quiet'], { encoding: 'utf8' });
if (r.status !== 0) throw new Error(r.stderr + r.stdout);
const runDir = JSON.parse(fs.readFileSync(path.join(dir, '.design-polish', 'latest.json'), 'utf8')).dir;
const read = (f) => JSON.parse(fs.readFileSync(path.join(runDir, f), 'utf8'));
const inv = read('inventory.json'), cards = read('cards.json');

test('css-only mode: no code files, stylesheets and template <style> blocks are read', () => {
  assert.equal(inv.meta.mode, 'css-only');
  assert.equal(inv.meta.files.code, 0);
  assert.equal(inv.meta.files.css, 2, 'style.css + index.ftl <style>');
  assert.equal(inv.meta.templates, 1);
  const green = inv.tokens.colors.values.find((v) => v.id === 'tok:color:#1aa44d');
  assert.ok(green && green.sites.some((s) => s.file.endsWith('index.ftl') && s.line === 3), 'cites the .ftl line');
  assert.equal(green.twinOf, 'tok:color:var:--brand');
  assert.equal(inv.tokens.colors.values.filter((v) => v.ownHardcodedCount > 0).length, 4);
});

test('tooling folders are not product code', () => {
  assert.ok(!inv.tokens.colors.values.some((v) => v.id === 'tok:color:#ff0000' || v.id === 'tok:color:#ff00ff'), 'colours from skill folders leaked in');
  assert.ok(inv.meta.files.skipped['excluded-dir'].count >= 6);
  assert.equal(inv.meta.css.engine, 'plain');
});

test('cards make sense without components, and a token that will be promoted to is not deleted', () => {
  const kinds = cards.cards.map((c) => c.kind);
  assert.ok(kinds.includes('register-tokens'));
  assert.ok(!kinds.includes('delete-dead-tokens'), '--brand is unused now but #1aa44d is promoted to it');
  const html = fs.readFileSync(path.join(runDir, 'report.html'), 'utf8');
  assert.ok(/CSS.?only|CSS만/.test(html));
  const v = spawnSync(process.execPath, [path.join(SCRIPTS, 'verify.js'), runDir, '--quick'], { encoding: 'utf8' });
  assert.equal(v.status, 0, v.stdout.split('\n').filter((l) => l.startsWith('FAIL')).join('; '));
});
