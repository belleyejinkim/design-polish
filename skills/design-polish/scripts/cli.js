#!/usr/bin/env node
'use strict';
// design-polish CLI — the zero-AI half of the tool.
//
//   design-polish [inventory] [path]   scan + render the inventory report and open it (no model needed)
//   design-polish check [path]         compare against .design-polish/baseline.json; exit 1 on regressions
//   design-polish scan|diagnose|render|verify|serve|apply|diff …   the individual steps (used by the skill)
//
const path = require('path');
const { spawnSync } = require('child_process');

const STEPS = { scan: 'scan.js', diagnose: 'diagnose.js', propose: 'propose.js', specimens: 'render-specimens.js', render: 'render.js', verify: 'verify.js', check: 'check.js', serve: 'serve.js', apply: 'apply.js', diff: 'diff-runs.js', baseline: 'baseline.js' };

function run(script, args) {
  const r = spawnSync(process.execPath, [path.join(__dirname, script), ...args], { stdio: 'inherit' });
  return r.status == null ? 1 : r.status;
}

function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0] && !argv[0].startsWith('-') && !/[\\/]/.test(argv[0]) && argv[0] !== '.' ? argv[0] : null;
  if (cmd === 'help' || argv.includes('--help') || argv.includes('-h')) {
    console.log(`design-polish — see every color, size, spacing, radius, shadow and form control in your app on one page.

  npx design-polish [path]            inventory report, no AI needed (opens in your browser)
  npx design-polish check [path]      fail if new hardcoded styles appeared since the baseline
  npx design-polish <step> …          steps: ${Object.keys(STEPS).join(', ')}

In Claude Code / Codex / Cursor, say "polish my design" to diagnose, choose and apply changes.`);
    process.exit(0);
  }
  if (cmd === 'check') process.exit(run('baseline.js', argv.slice(1)));
  if (cmd && STEPS[cmd] && cmd !== 'check') process.exit(run(STEPS[cmd], argv.slice(1)));
  // default: inventory pipeline
  const target = path.resolve(cmd === 'inventory' ? (argv[1] || '.') : (argv[0] || '.'));
  const rest = argv.filter((a) => a.startsWith('-'));
  process.exit(run('inventory.js', [target, ...rest]));
}

main();
