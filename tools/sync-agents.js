#!/usr/bin/env node
'use strict';
// Generates the plugin-level custom agents (agents/polish-*.md) from the skill's role manuals.
// The manuals in skills/design-polish/agents/ are the source of truth (they are what `npx skills add` installs);
// the plugin copies add the frontmatter Claude Code needs for a custom subagent type.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'skills', 'design-polish', 'agents');
const OUT = path.join(ROOT, 'agents');
const META = {
  scanner: { name: 'polish-scanner', description: 'design-polish scanner: runs the measuring scripts (scan, diagnose, propose, specimens, render) for a target project, retries with the right flags when the CSS entry or TypeScript is not found, validates the JSON, and returns a 15-line factual report. Use only from the design-polish skill.', tools: 'Bash, Read, Grep, Glob', model: 'sonnet' },
  verifier: { name: 'polish-verifier', description: 'design-polish verifier: independently checks a run (verify.js V0–V9, re-derives a sample of findings from the source, checks safe cards and the narrative) and returns a PASS/FAIL verdict with evidence. Changes nothing. Use only from the design-polish skill.', tools: 'Bash, Read, Grep, Glob', model: 'inherit' },
  planner: { name: 'polish-planner', description: 'design-polish planner: turns one card into an exact edit plan (apply/<card>.plan.json) by judging each site by role, never editing project files. Use only from the design-polish skill.', tools: 'Bash, Read, Grep, Glob, Write', model: 'inherit' },
};

function render(role) {
  const body = fs.readFileSync(path.join(SRC, `${role}.md`), 'utf8');
  const m = META[role];
  return `---\nname: ${m.name}\ndescription: ${m.description}\ntools: ${m.tools}\nmodel: ${m.model}\n---\n\n${body}`;
}

function sync({ check } = {}) {
  const diffs = [];
  for (const role of Object.keys(META)) {
    const out = path.join(OUT, `${META[role].name}.md`);
    const text = render(role);
    if (check) { if (!fs.existsSync(out) || fs.readFileSync(out, 'utf8') !== text) diffs.push(out); }
    else fs.writeFileSync(out, text);
  }
  return diffs;
}

if (require.main === module) {
  const check = process.argv.includes('--check');
  const diffs = sync({ check });
  if (check) { if (diffs.length) { console.error('out of sync: ' + diffs.join(', ') + '\nrun: node tools/sync-agents.js'); process.exit(1); } console.log('agents in sync'); }
  else console.log('wrote ' + Object.values(META).map((m) => `agents/${m.name}.md`).join(', '));
}
module.exports = { sync, META };
