#!/usr/bin/env node
'use strict';
// design-polish check: the guardrail. Compares the current scan with .design-polish/baseline.json
// and fails (exit 1) when raw values or one-off looks increased — so the next generation cannot
// quietly undo the cleanup.
//
//   design-polish check [path] [--update] [--quiet]

const fs = require('fs');
const path = require('path');
const { scan } = require('./scan');

function metrics(inv) {
  const looks = {};
  let adHoc = 0;
  for (const [type, t] of Object.entries(inv.components)) { looks[type] = t.looks; adHoc += t.signatures.filter((s) => s.count > 0 && s.adHoc && s.resolved).length; }
  return {
    rawColors: inv.tokens.colors.values.filter((v) => (v.ownHardcodedCount != null ? v.ownHardcodedCount : v.hardcodedCount) > 0).length,
    rawColorUses: (inv.tokens.axes.color.hardcodedOwn != null ? inv.tokens.axes.color.hardcodedOwn : inv.tokens.axes.color.hardcoded),
    offScaleSpacing: inv.tokens.spacing.offScale.length,
    rawRadiusUses: (inv.tokens.axes.radius.hardcodedOwn != null ? inv.tokens.axes.radius.hardcodedOwn : inv.tokens.axes.radius.hardcoded),
    rawShadowUses: (inv.tokens.axes.shadow.hardcodedOwn != null ? inv.tokens.axes.shadow.hardcodedOwn : inv.tokens.axes.shadow.hardcoded),
    invalidClasses: inv.classes.unresolved.filter((u) => u.reason === 'invalid-utility').length,
    adHocLooks: adHoc,
    siblingRadiusMismatches: inv.relationships.siblingGroups.filter((g) => g.mismatch.radius && !g.catalog).length,
    looks,
  };
}

async function check(rootArg, opts = {}) {
  const root = path.resolve(rootArg || '.');
  const file = path.join(root, '.design-polish', 'baseline.json');
  const inv = await scan(root, { quiet: true });
  if (inv.error) throw new Error(inv.message);
  const now = metrics(inv);
  if (opts.update || !fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ schema: 'design-polish.baseline/1', createdAt: new Date().toISOString(), scannerVersion: inv.meta.scannerVersion, metrics: now }, null, 2));
    return { status: 'written', file, metrics: now, regressions: [] };
  }
  const base = JSON.parse(fs.readFileSync(file, 'utf8'));
  const regressions = [];
  for (const k of ['rawColors', 'rawColorUses', 'offScaleSpacing', 'rawRadiusUses', 'rawShadowUses', 'invalidClasses', 'adHocLooks', 'siblingRadiusMismatches']) {
    if (now[k] > (base.metrics[k] ?? 0)) regressions.push({ metric: k, before: base.metrics[k] ?? 0, after: now[k] });
  }
  for (const [type, v] of Object.entries(now.looks)) if (v > ((base.metrics.looks || {})[type] ?? v)) regressions.push({ metric: `looks.${type}`, before: base.metrics.looks[type], after: v });
  return { status: regressions.length ? 'regressed' : 'ok', file, metrics: now, baseline: base.metrics, regressions };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const root = args.find((a) => !a.startsWith('-')) || '.';
  check(root, { update: args.includes('--update') }).then((r) => {
    if (r.status === 'written') { console.log(`baseline written: ${r.file}`); console.log(JSON.stringify(r.metrics, null, 2)); return; }
    if (r.status === 'ok') { console.log('design-polish check: OK — no new raw values or one-off looks since the baseline'); return; }
    console.log('design-polish check: FAILED — these grew since the baseline:');
    for (const x of r.regressions) console.log(`  ${x.metric.padEnd(26)} ${x.before} → ${x.after}`);
    console.log('Run `npx design-polish` to see where, or `npx design-polish check --update` to accept the new state.');
    process.exit(1);
  }).catch((e) => { console.error(e.message); process.exit(1); });
}
module.exports = { check, metrics };
