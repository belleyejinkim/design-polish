#!/usr/bin/env node
'use strict';
// Report template dev loop: render an existing run in the browser and re-render on every template/renderer change.
//
//   node tools/report-dev.js [messy-next|clean-shadcn|vite-router|freemarker] [--target <project>] [--lang ko|en]
//                            [--fresh] [--no-open] [--no-narrative]
//
// Data is scanned once into .dev/report/<name>/ (repo-local, git-ignored). After that only render.js runs (~100 ms)
// whenever skills/design-polish/templates/** or scripts/render*.js / scripts/lib/** change, and the open tab reloads
// itself (the served report polls /api/version every 3 s and keeps its scroll position).

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, 'skills', 'design-polish');
const S = path.join(SKILL, 'scripts');
const args = process.argv.slice(2);
const get = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const name = args.find((a) => !a.startsWith('-') && !['ko', 'en'].includes(a) && a !== get('--target') && a !== get('--lang')) || 'messy-next';
const target = get('--target') ? path.resolve(get('--target')) : path.join(SKILL, 'evals', 'fixtures', name);
const lang = get('--lang') || 'ko';
const runDir = path.join(ROOT, '.dev', 'report', get('--target') ? path.basename(target) : name);
const run = (script, extra, opts = {}) => spawnSync(process.execPath, [path.join(S, script), ...extra], { encoding: 'utf8', ...opts });

if (!fs.existsSync(target)) { console.error(`no such fixture or project: ${target}`); process.exit(2); }

// 1. data: scan once (or --fresh)
if (args.includes('--fresh') || !fs.existsSync(path.join(runDir, 'inventory.json'))) {
  fs.mkdirSync(runDir, { recursive: true });
  const r = run('inventory.js', [target, '--out', runDir, '--no-open', '--lang', lang, '--project', path.basename(target)]);
  if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
  process.stdout.write(r.stderr.split('\n').filter(Boolean).slice(-4).join('\n') + '\n');
}
// 2. narrative: a sample next to the fixture shows the "with model" state of the template
const sample = path.join(target, `narrative.sample.${lang}.json`);
if (!args.includes('--no-narrative') && fs.existsSync(sample)) {
  const nar = JSON.parse(fs.readFileSync(sample, 'utf8'));
  nar.run_id = path.basename(runDir);
  fs.writeFileSync(path.join(runDir, 'narrative.json'), JSON.stringify(nar, null, 2));
}

function render(reason) {
  const t0 = Date.now();
  const r = run('render.js', [runDir, '--lang', lang, '--project', path.basename(target)]);
  if (r.status !== 0) { console.error(`✖ render failed (${reason}):\n${(r.stderr || r.stdout).split('\n').slice(0, 12).join('\n')}`); return false; }
  const v = run('verify.js', [runDir, '--quick']);
  const fails = (v.stdout || '').split('\n').filter((l) => l.startsWith('FAIL'));
  process.stdout.write(`✓ rendered in ${Date.now() - t0} ms (${reason})${fails.length ? `\n  ${fails.join('\n  ')}` : ''}\n`);
  return true;
}
render('start');

// 3. serve + open
let url = null;
const started = run('serve.js', ['start', runDir]);
url = (started.stdout || '').trim().split('\n')[0] || null;
if (!url) { console.error('could not start the local server'); process.exit(1); }
process.stdout.write(`${url}\n  data: ${runDir}\n  edit: skills/design-polish/templates/{report.css,report.js,i18n/*.json}, scripts/render.js — the tab reloads by itself\n`);
if (!args.includes('--no-open')) { const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'; try { spawn(cmd, process.platform === 'win32' ? ['/c', 'start', '', url] : [url], { detached: true, stdio: 'ignore' }).unref(); } catch (_) { /* no opener */ } }

// 4. watch → render → reload
const reload = () => fetch(url + 'api/reload', { method: 'POST' }).catch(() => {});
let timer = null;
const onChange = (what) => { clearTimeout(timer); timer = setTimeout(() => { if (render(what)) reload(); }, 150); };
const watchDir = (dir, label) => { try { fs.watch(dir, { recursive: true }, (ev, file) => { if (file && !/\.(css|js|json|html)$/.test(file)) return; onChange(`${label}/${file || ev}`); }); } catch (e) { console.error(`watch failed for ${dir}: ${e.message}`); } };
watchDir(path.join(SKILL, 'templates'), 'templates');
watchDir(path.join(S, 'lib'), 'lib');
for (const f of ['render.js', 'render-specimens.js']) fs.watchFile(path.join(S, f), { interval: 400 }, () => onChange(f));
process.on('SIGINT', () => { run('serve.js', ['stop', runDir]); process.stdout.write('\nstopped\n'); process.exit(0); });
