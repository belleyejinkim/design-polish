#!/usr/bin/env node
'use strict';
// design-polish inventory: the zero-AI pipeline — scan, diagnose, propose, render specimens,
// render the report, and open it. Used by `npx design-polish [path]`.
//
//   inventory.js <root> [--lang en|ko] [--no-open] [--serve] [--out <run-dir>] [--quiet]

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { scan } = require('./scan');
const { diagnose, loadThresholds } = require('./diagnose');
const { propose } = require('./propose');
const { renderSpecimens } = require('./render-specimens');
const { build } = require('./render');
const { openUrl } = require('./serve');

function runIdNow() { return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); }

function ensureOutputDir(root) {
  const base = path.join(root, '.design-polish');
  fs.mkdirSync(path.join(base, 'runs'), { recursive: true });
  const gi = path.join(base, '.gitignore');
  if (!fs.existsSync(gi)) fs.writeFileSync(gi, '# design-polish keeps its runs out of your repository; config.json and baseline.json are meant to be committed.\nruns/\nlatest.json\nserve.json\n*.draft.json\n');
  return base;
}

// The run to compare a recheck with: the latest run that had cards applied, else the latest run.
function previousRun(base, currentDir) {
  if (!base) return null;
  const runsDir = path.join(base, 'runs');
  if (!fs.existsSync(runsDir)) return null;
  const runs = fs.readdirSync(runsDir).filter((r) => path.join(runsDir, r) !== currentDir && fs.existsSync(path.join(runsDir, r, 'inventory.json'))).sort();
  const applied = runs.filter((r) => fs.existsSync(path.join(runsDir, r, 'apply')) && fs.readdirSync(path.join(runsDir, r, 'apply')).some((f) => f.endsWith('.result.json')));
  const pick = applied.length ? applied[applied.length - 1] : runs[runs.length - 1];
  return pick ? path.join(runsDir, pick) : null;
}

async function inventory(rootArg, opts = {}) {
  const root = path.resolve(rootArg);
  const t0 = Date.now();
  const log = (m) => { if (!opts.quiet) process.stderr.write(m + '\n'); };
  // With --out the run lives elsewhere and the target repo is left untouched.
  const base = opts.out ? null : ensureOutputDir(root);
  let runId = runIdNow();
  // two runs inside one second must not share a directory
  if (!opts.out) for (let n = 2; fs.existsSync(path.join(base, 'runs', runId)); n++) runId = `${runIdNow()}-${n}`;
  const runDir = opts.out || path.join(base, 'runs', runId);
  fs.mkdirSync(runDir, { recursive: true });
  const inv = await scan(root, { quiet: true, css: opts.css, src: opts.src, exclude: opts.exclude, includeTests: opts.includeTests });
  if (inv.error) throw new Error(`${inv.error}: ${inv.message}`);
  fs.writeFileSync(path.join(runDir, 'inventory.json'), JSON.stringify(inv, null, 2));
  log(`scan: ${inv.meta.files.code} files · ${inv.routes.length} routes · ${inv.meta.durationMs}ms`);
  const findings = diagnose(inv, loadThresholds());
  fs.writeFileSync(path.join(runDir, 'findings.json'), JSON.stringify(findings, null, 2));
  const { proposal, cards } = propose(inv, findings);
  cards.runId = path.basename(runDir);
  fs.writeFileSync(path.join(runDir, 'proposal.json'), JSON.stringify(proposal, null, 2));
  fs.writeFileSync(path.join(runDir, 'cards.json'), JSON.stringify(cards, null, 2));
  log(`diagnose: ${findings.findings.length} findings · ${cards.cards.length} cards`);
  // recheck: compare with the run whose cards were applied (or an explicit run) before rendering
  let baselineRun = null;
  if (opts.baseline) {
    const before = opts.baseline === 'auto' ? previousRun(base, runDir) : path.resolve(opts.baseline);
    if (before && fs.existsSync(path.join(before, 'inventory.json'))) { const { diff } = require('./diff-runs'); const d = diff(before, runDir); baselineRun = path.basename(before); log(`delta: vs ${baselineRun} · ${d.findings.resolved.length} resolved · ${d.findings.remaining.length} remaining · ${d.findings.new.length} new`); }
    else log('delta: no earlier run to compare with');
  }
  const spec = await renderSpecimens(runDir, { lang: opts.lang || 'en' });
  log(`specimens: ${spec.items.filter((i) => i.html).length}/${spec.items.length} (${spec.engine}${spec.status !== 'ok' ? ', ' + spec.status : ''})`);
  const { html, chat } = build(runDir, { lang: opts.lang || 'en', project: opts.project || path.basename(root) });
  const reportPath = path.join(runDir, 'report.html');
  fs.writeFileSync(reportPath, html);
  fs.writeFileSync(path.join(runDir, 'chat-summary.md'), chat + `\n→ ${reportPath}\n`);
  if (base) fs.writeFileSync(path.join(base, 'latest.json'), JSON.stringify({ run: path.basename(runDir), dir: runDir, generatedAt: inv.meta.generatedAt }, null, 2));
  fs.writeFileSync(path.join(runDir, 'manifest.json'), JSON.stringify({ schema: 'design-polish.manifest/1', runId: path.basename(runDir), mode: opts.mode || 'inventory', baselineRun, scannerVersion: inv.meta.scannerVersion, generatedAt: inv.meta.generatedAt, root, lang: opts.lang || 'en', model: false }, null, 2));
  let url = null;
  if (opts.serve) {
    const r = spawnSync(process.execPath, [path.join(__dirname, 'serve.js'), 'start', runDir], { encoding: 'utf8' });
    url = (r.stdout || '').trim().split('\n')[0] || null;
  }
  if (!opts.noOpen) openUrl(url || 'file://' + reportPath);
  log(`report: ${url || reportPath} (${Math.round(html.length / 1024)}KB) · ${Date.now() - t0}ms total`);
  return { runDir, reportPath, url, chat, inv, findings, cards };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const root = args.find((a) => !a.startsWith('-')) || '.';
  const get = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
  inventory(root, { lang: get('--lang') || 'en', noOpen: args.includes('--no-open'), serve: args.includes('--serve'), out: get('--out'), quiet: args.includes('--quiet'), css: get('--css'), project: get('--project'), baseline: args.includes('--recheck') ? 'auto' : get('--baseline'), mode: args.includes('--recheck') ? 'recheck' : 'inventory' })
    .then((r) => { process.stdout.write(r.chat + `\n→ ${r.url || r.reportPath}\n`); })
    .catch((e) => { console.error(e.message); process.exit(1); });
}
module.exports = { inventory, ensureOutputDir };
