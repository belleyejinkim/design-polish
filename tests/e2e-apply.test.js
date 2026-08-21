'use strict';
// End to end on a git copy of the messy-next fixture: inventory → plan/apply the safe cards
// (one commit each) → recheck → delta. Guards the whole "polish" loop without a model.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPTS = path.join(__dirname, '..', 'skills', 'design-polish', 'scripts');
const FIXTURE = path.join(__dirname, '..', 'skills', 'design-polish', 'evals', 'fixtures', 'messy-next');
const node = (args, cwd) => { const r = spawnSync(process.execPath, args, { cwd, encoding: 'utf8' }); if (r.status !== 0) throw new Error(`${args.join(' ')}\n${r.stdout}\n${r.stderr}`); return r.stdout; };
const git = (args, cwd) => spawnSync('git', args, { cwd, encoding: 'utf8' }).stdout.trim();
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

function copyFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-e2e-'));
  fs.cpSync(FIXTURE, dir, { recursive: true, filter: (src) => !/\/(node_modules|\.design-polish|\.git)(\/|$)/.test(src) });
  spawnSync('git', ['init', '-q'], { cwd: dir });
  spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A'], { cwd: dir });
  spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'init'], { cwd: dir });
  return dir;
}

test('polish loop: inventory → apply safe cards → recheck shows the delta', { timeout: 120000 }, () => {
  const dir = copyFixture();
  try {
    node([path.join(SCRIPTS, 'inventory.js'), '.', '--no-open', '--quiet'], dir);
    const run1 = readJson(path.join(dir, '.design-polish', 'latest.json')).dir;
    const inv1 = readJson(path.join(run1, 'inventory.json'));
    assert.equal(inv1.meta.css.error, null, 'tailwind must compile without a node_modules in the target (borrowed engine)');
    assert.deepEqual(inv1.meta.vendored.dirs, ['src/components/ui']);
    const cards = readJson(path.join(run1, 'cards.json')).cards;
    const safe = cards.filter((c) => c.safety === 'none' && ['register-tokens', 'delete-dead-tokens', 'guardrails'].includes(c.kind));
    assert.ok(safe.length >= 3, `expected safe cards, got ${cards.map((c) => c.kind + ':' + c.safety).join(', ')}`);
    // mode-varying token targets are never in a safe card
    for (const c of safe) for (const e of c.entries) assert.equal(e.modeVarying, false, `${c.id} maps onto a token that changes in dark mode`);
    const before = git(['rev-parse', 'HEAD'], dir);
    for (const c of safe) {
      node([path.join(SCRIPTS, 'apply.js'), 'plan', run1, c.id], dir);
      const plan = readJson(path.join(run1, 'apply', `${c.id}.plan.json`));
      // vendored files are never edited by default
      for (const e of plan.edits) assert.ok(!e.file.startsWith('src/components/ui/'), `${c.id} edits vendored ${e.file}`);
      // the same literal is planned once
      const keys = plan.edits.map((e) => `${e.file}|${e.line}|${e.before}|${e.after}|${e.kind}`);
      assert.equal(new Set(keys).size, keys.length, `${c.id} has duplicate edits`);
      spawnSync('git', ['config', 'user.email', 't@t'], { cwd: dir }); spawnSync('git', ['config', 'user.name', 't'], { cwd: dir });
      const out = JSON.parse(node([path.join(SCRIPTS, 'apply.js'), 'apply', run1, c.id, '--commit'], dir));
      assert.ok(out.commit, `${c.id} should commit`);
    }
    const commits = git(['rev-list', '--count', `${before}..HEAD`], dir);
    assert.equal(Number(commits), safe.length, 'one commit per card');
    assert.equal(git(['status', '--porcelain', '--untracked-files=no'], dir), '', 'working tree clean after apply');
    assert.ok(fs.existsSync(path.join(dir, 'DESIGN-TOKENS.md')));
    assert.ok(fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8').includes('DESIGN-TOKENS.md'));
    assert.ok(fs.existsSync(path.join(dir, '.design-polish', 'baseline.json')));
    // the legacy checkbox now uses the brand token instead of the raw hex
    assert.ok(fs.readFileSync(path.join(dir, 'src/components/shared/legacy-checkbox.tsx'), 'utf8').includes('var(--brand)'));
    // recheck
    node([path.join(SCRIPTS, 'inventory.js'), '.', '--recheck', '--no-open', '--quiet'], dir);
    const run2 = readJson(path.join(dir, '.design-polish', 'latest.json')).dir;
    assert.notEqual(run2, run1);
    const delta = readJson(path.join(run2, 'delta.json'));
    assert.equal(delta.baseline, path.basename(run1));
    // 4 unused tokens: 2 project tokens are removed, the 2 shadcn base-set tokens (chart-1, chart-2) are kept
    assert.equal(delta.values.deadTokens.before, 4);
    assert.equal(delta.values.deadTokens.after, 2);
    const css = fs.readFileSync(path.join(dir, 'src/app/globals.css'), 'utf8');
    assert.ok(!css.includes('--legacy-blue') && !css.includes('--promo-yellow'), 'project dead tokens removed');
    assert.ok(css.includes('--chart-1') && css.includes('--chart-2'), 'shadcn base-set tokens kept');
    assert.ok(delta.values.rawColors.after < delta.values.rawColors.before);
    assert.ok(delta.values.rawRadiusUses.after < delta.values.rawRadiusUses.before);
    assert.equal(delta.findings.new.length, 0, 'no new findings after safe cards');
    assert.ok(delta.findings.resolved.length >= 2);
    assert.equal(delta.applied.length, safe.length);
    const html = fs.readFileSync(path.join(run2, 'report.html'), 'utf8');
    assert.ok(html.includes('data-metric="delta.values.deadTokens.after"'));
    // baseline check passes right after guardrails
    const chk = spawnSync(process.execPath, [path.join(SCRIPTS, 'baseline.js'), '.'], { cwd: dir, encoding: 'utf8' });
    assert.equal(chk.status, 0, chk.stdout + chk.stderr);
    // undo one card with git revert and the tree is still clean
    const r = spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'revert', '--no-edit', 'HEAD'], { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
