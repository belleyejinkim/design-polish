#!/usr/bin/env node
'use strict';
// design-polish apply: turns an approved card into exact edits, then applies them.
//
//   design-polish apply plan  <run-dir> <card-id>                 → apply/<card>.plan.json (no files touched)
//   design-polish apply apply <run-dir> <card-id> [--commit] [--typecheck] [--dry-run]
//   design-polish apply summary <run-dir> <card-id>               → human-readable summary of the plan
//
// Planning is mechanical for the safe kinds (same-value token swaps, merges, rounding, dead
// tokens, guardrails). Anything that needs judgement is left in `skipped` with a reason for the
// planner agent or the person. Applying is two-phase: every edit's `before` text must be found
// at its line (±3 lines, unique) or nothing is written at all. No sed, no regex over files.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const color = require('./lib/color');

const COLOR_PREFIXES = ['ring-offset', 'inset-shadow', 'border-x', 'border-y', 'border-t', 'border-r', 'border-b', 'border-l', 'border-s', 'border-e', 'placeholder', 'decoration', 'outline', 'border', 'accent', 'caret', 'stroke', 'shadow', 'divide', 'ring', 'fill', 'from', 'via', 'text', 'bg', 'to'];
const SPACING_PREFIXES = ['space-x', 'space-y', 'gap-x', 'gap-y', 'gap', 'px', 'py', 'pt', 'pr', 'pb', 'pl', 'ps', 'pe', 'p', 'mx', 'my', 'mt', 'mr', 'mb', 'ml', 'ms', 'me', 'm'];
// Line numbers drift when a file is edited above the site; we accept a unique match within this window.
const DRIFT_WINDOW = 3;

function read(runDir, f) { const p = path.join(runDir, f); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; }
function splitVariants(cls) { let depth = 0, cur = '', parts = []; for (const ch of cls) { if (ch === '[') depth++; if (ch === ']') depth--; if (ch === ':' && depth === 0) { parts.push(cur); cur = ''; continue; } cur += ch; } parts.push(cur); const base = parts.pop(); return { variants: parts, base, important: base.startsWith('!') }; }
function joinVariants(variants, base) { return [...variants, base].join(':'); }
function tokenSuffix(token) { return token.name.replace(/^--(color|radius|shadow|text|font|spacing)-/, '').replace(/^--/, ''); }

/** Rewrite one class to use a token. Returns null when the class cannot be rewritten mechanically. */
function rewriteClass(cls, axis, target, ctx) {
  const { variants, base } = splitVariants(cls);
  const b = base.replace(/^!/, '');
  if (axis === 'color') {
    const m = /^([a-z-]+?)-(\[.+\]|[a-z]+(?:-\d+)?)(\/[\d.]+)?$/.exec(b);
    if (!m) return null;
    let prefix = COLOR_PREFIXES.find((p) => b.startsWith(p + '-'));
    if (!prefix) return null;
    const rest = b.slice(prefix.length + 1);
    const alphaOpacity = (() => { const am = /^\[(#[0-9a-f]{8}|#[0-9a-f]{4})\]$/i.exec(rest); if (!am) return null; const c = color.parse(am[1]); return c && c.a < 1 ? Math.round(c.a * 100) : null; })();
    const opacity = /\/([\d.]+)$/.exec(rest) ? '/' + /\/([\d.]+)$/.exec(rest)[1] : alphaOpacity != null ? `/${alphaOpacity}` : '';
    return joinVariants(variants, `${prefix}-${tokenSuffix(target)}${opacity}`);
  }
  if (axis === 'radius') {
    const m = /^(rounded(?:-[tlbrse]{1,2})?)-(.+)$/.exec(b);
    if (!m) return null;
    const suffix = tokenSuffix(target); // --radius-sm → sm
    return joinVariants(variants, suffix === 'DEFAULT' || suffix === 'radius' ? m[1] : `${m[1]}-${suffix}`);
  }
  if (axis === 'spacing') {
    const prefix = SPACING_PREFIXES.find((p) => b.startsWith(p + '-'));
    if (!prefix || ctx.basePx == null) return null;
    const px = Number(target.replace(/^tok\+?:spacing[.:]/, ''));
    if (!isFinite(px)) return null;
    const n = px / ctx.basePx;
    const step = Number.isInteger(n) ? String(n) : Number.isInteger(n * 2) && n < 4 ? String(n) : null;
    if (!step) return null;
    return joinVariants(variants, `${prefix}-${step}`);
  }
  return null;
}

function cssVarFor(token) { return `var(${token.rawVar || token.name})`; }

function tokenDeclarations(inv, entryCss, name, value) {
  // Insert following the project's own convention: raw var in :root (+ .dark) and an @theme inline alias, or directly in @theme.
  const usesInlineAlias = /@theme\s+inline/.test(entryCss) && /--color-[\w-]+:\s*var\(--[\w-]+\)/.test(entryCss);
  const short = name.replace(/^--color-/, '');
  if (usesInlineAlias) {
    return [
      { block: ':root', line: `  --${short}: ${value};` },
      { block: '.dark', line: `  --${short}: ${value};` },
      { block: '@theme inline', line: `  --color-${short}: var(--${short});` },
    ];
  }
  return [{ block: '@theme', line: `  --color-${short}: ${value};` }];
}

function insertIntoBlock(text, blockSelector, line) {
  // find `blockSelector {` and insert before its closing brace (after the last declaration)
  const re = new RegExp(`(^|\\n)(\\s*)${blockSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`);
  const m = re.exec(text);
  if (!m) return null;
  let i = m.index + m[0].length, depth = 1;
  while (i < text.length && depth > 0) { if (text[i] === '{') depth++; else if (text[i] === '}') depth--; i++; }
  const close = i - 1;
  const before = text.slice(0, close).replace(/\s+$/, '');
  const lineNo = before.split('\n').length + 1;
  return { text: before + '\n' + line + '\n' + text.slice(close), line: lineNo };
}

function plan(runDir, cardId, opts = {}) {
  const inv = read(runDir, 'inventory.json');
  const cards = read(runDir, 'cards.json');
  const proposal = read(runDir, 'proposal.json') || { newTokens: [] };
  const decisions = read(runDir, 'decisions.json');
  if (!inv || !cards) throw new Error('inventory.json and cards.json are required');
  const card = cards.cards.find((c) => c.id === cardId);
  if (!card) throw new Error(`card ${cardId} not found (have ${cards.cards.map((c) => c.id).join(', ')})`);
  const root = inv.meta.root;
  const declared = new Map(inv.tokens.declared.map((d) => [d.id, d]));
  const newTokens = new Map(proposal.newTokens.map((t) => [t.id, t]));
  const valueById = new Map();
  for (const axis of ['colors', 'typography', 'spacing', 'radius', 'border', 'shadows']) for (const v of inv.tokens[axis].values) valueById.set(v.id, v);
  const edits = [], skipped = [], newTokenDecls = [], notes = [];
  const decided = new Map((decisions && decisions.entries || []).map((e) => [e.id, e]));
  const basePx = inv.tokens.spacing.basePx;
  const entryRel = inv.meta.css.entry;
  const entryAbs = entryRel ? path.join(root, entryRel) : null;
  const entryCss = entryAbs && fs.existsSync(entryAbs) ? fs.readFileSync(entryAbs, 'utf8') : '';
  const seenEdit = new Set();
  // the same literal is recorded once per rendered instance; it is edited once
  const addEdit = (e) => { const k = `${e.file}|${e.line || ''}|${e.col || ''}|${e.before || ''}|${e.after || ''}|${e.kind}`; if (seenEdit.has(k)) return; seenEdit.add(k); edits.push(e); };
  const vendoredDirs = (inv.meta.vendored && inv.meta.vendored.dirs) || [];
  const includeVendored = !!(opts.includeVendored || (decisions && decisions.includeVendored));
  const isVendored = (file) => !includeVendored && vendoredDirs.some((d) => file === d || file.startsWith(d + '/'));
  let vendoredSkipped = 0;

  // The person's row decisions override the card's entries: a row set to "leave" is skipped, a changed target is honoured.
  const entries = card.entries.map((e) => { const d = decided.get(e.source); if (!d) return e; if (d.action === 'leave') return { ...e, skip: 'left by user' }; if (d.action === 'merge' && d.target && d.target !== e.target) return { ...e, target: d.target, userTarget: true }; if (d.action === 'keep') return { ...e, skip: 'kept by user' }; return e; });

  if (card.kind === 'guardrails') {
    const tokens = inv.tokens.declared.filter((d) => d.source === 'project');
    const lines = [`# Design tokens`, ``, `Generated by design-polish on ${new Date().toISOString().slice(0, 10)}. Use these tokens (Tailwind utilities or CSS variables) instead of raw values.`, ``, `| Token | Light | Dark | Uses | Role |`, `|---|---|---|---|---|`];
    for (const d of tokens.sort((a, b) => (a.axis === b.axis ? (a.name < b.name ? -1 : 1) : a.axis < b.axis ? -1 : 1))) lines.push(`| \`${d.name}\` | ${d.hex || d.light || ''} | ${d.darkHex || d.dark || ''} | ${d.refs.total} | ${d.role || d.axis} |`);
    lines.push('', '## Rules for coding agents', '', '- Colors: use the tokens above (`bg-primary`, `text-muted-foreground`, `var(--brand)`), never a raw hex.', `- Spacing: multiples of ${basePx || 4}px via the scale utilities (\`p-4\`, \`gap-2\`), no arbitrary \`p-[18px]\`.`, '- Corners: `rounded-sm` / `rounded-md` / `rounded-lg` from `--radius`; neighbours in one row share a radius.', '- Controls: use the existing component for every button, checkbox, input, select, toggle; do not restyle one instance with extra classes.', '- Run `npx design-polish check` before finishing; it fails when new raw values appear.');
    addEdit({ file: 'DESIGN-TOKENS.md', kind: 'write', before: null, after: lines.join('\n') + '\n', confidence: 'exact', role: 'docs' });
    const pointer = '\n## Design tokens\nRead `DESIGN-TOKENS.md` before styling anything: use its tokens and components, never raw values. Run `npx design-polish check` before finishing.\n';
    for (const f of ['CLAUDE.md', 'AGENTS.md']) { const p = path.join(root, f); const exists = fs.existsSync(p); if (!exists && f === 'AGENTS.md') continue; const cur = exists ? fs.readFileSync(p, 'utf8') : ''; if (cur.includes('DESIGN-TOKENS.md')) continue; addEdit({ file: f, kind: 'append', before: null, after: pointer, confidence: 'exact', role: 'docs' }); }
    addEdit({ file: '.design-polish/baseline.json', kind: 'baseline', before: null, after: null, confidence: 'exact', role: 'docs' });
    notes.push('guardrails: DESIGN-TOKENS.md, agent pointer, baseline');
  } else if (card.kind === 'delete-dead-tokens') {
    for (const e of entries) {
      if (e.skip) { skipped.push({ id: e.source, reason: e.skip }); continue; }
      const d = declared.get(e.source);
      if (!d || !entryCss) { skipped.push({ id: e.source, reason: 'token not found in css entry' }); continue; }
      const names = [d.name, d.rawVar].filter(Boolean);
      const lines = entryCss.split('\n');
      lines.forEach((ln, i) => { for (const nm of names) { const re = new RegExp(`^\\s*${nm.replace(/[-]/g, '\\-')}\\s*:`); if (re.test(ln)) addEdit({ file: entryRel, line: i + 1, before: ln.trim(), after: '', kind: 'css-line', valueId: e.source, role: 'token', confidence: 'exact' }); } });
    }
  } else {
    for (const e of entries) {
      if (e.skip) { skipped.push({ id: e.source, reason: e.skip }); continue; }
      const v = valueById.get(e.source);
      if (!v) { skipped.push({ id: e.source, reason: 'not a value id (component looks need the planner agent)' }); continue; }
      const target = declared.get(e.target) || newTokens.get(e.target) || (String(e.target).startsWith('tok+:spacing') ? { id: e.target, name: e.target, spacing: true } : null);
      if (!target) { skipped.push({ id: e.source, reason: `target ${e.target} unknown` }); continue; }
      if (newTokens.has(e.target) && !newTokenDecls.some((t) => t.id === e.target)) { const nt = newTokens.get(e.target); newTokenDecls.push({ id: nt.id, name: nt.name, value: nt.value }); }
      for (const site of v.sites) {
        const origin = site.origin || { file: site.file, line: site.line };
        if (site.where === 'token' || site.where === 'scale') continue; // already goes through the system
        if (isVendored(origin.file)) { vendoredSkipped += 1; continue; }
        if (site.where === 'class-arbitrary' || site.where === 'palette' || site.where === 'scale') {
          if (!site.cls) { skipped.push({ id: e.source, file: origin.file, line: origin.line, reason: 'class unknown' }); continue; }
          const after = rewriteClass(site.cls, v.axis, target.spacing ? e.target : target, { basePx });
          if (!after) { skipped.push({ id: e.source, file: origin.file, line: origin.line, cls: site.cls, reason: 'no mechanical rewrite for this class' }); continue; }
          addEdit({ file: origin.file, line: origin.line, before: site.cls, after, kind: 'class', valueId: e.source, target: e.target, role: site.prop, confidence: site.origin ? 'exact' : 'likely', visualChange: e.visualChange });
        } else if (site.where === 'inline-style' || site.where === 'css-literal') {
          if (v.axis !== 'color' || target.spacing) { skipped.push({ id: e.source, file: site.file, line: site.line, reason: `${site.where} ${v.axis} needs review` }); continue; }
          addEdit({ file: site.file, line: site.line, before: site.raw, after: cssVarFor(target), kind: site.where, valueId: e.source, target: e.target, role: site.prop, confidence: 'exact', visualChange: e.visualChange });
        } else if (site.where === 'js-literal') {
          skipped.push({ id: e.source, file: site.file, line: site.line, reason: 'color literal in JS (chart/config): needs review' });
        }
      }
    }
  }
  // new token declarations
  if (newTokenDecls.length && entryRel) for (const nt of newTokenDecls) for (const decl of tokenDeclarations(inv, entryCss, nt.name, nt.value)) addEdit({ file: entryRel, kind: 'css-insert', block: decl.block, after: decl.line, before: null, valueId: nt.id, role: 'token', confidence: 'exact' });
  if (vendoredSkipped) { skipped.push({ id: null, reason: `vendored library files left alone (${vendoredSkipped} sites); pass --include-vendored to edit them`, count: vendoredSkipped }); notes.push(`vendored: ${vendoredSkipped} sites in ${vendoredDirs.join(', ')} not edited`); }
  const files = new Set(edits.map((e) => e.file));
  const out = { schema: 'design-polish.plan/1', runId: path.basename(runDir), cardId, kind: card.kind, createdAt: new Date().toISOString(), edits, skipped, newTokens: newTokenDecls, summary: { edits: edits.length, files: files.size, skipped: skipped.length, vendoredSkipped, visualChange: card.visualChange, safety: card.safety }, notes };
  fs.mkdirSync(path.join(runDir, 'apply'), { recursive: true });
  fs.writeFileSync(path.join(runDir, 'apply', `${cardId}.plan.json`), JSON.stringify(out, null, 2));
  return out;
}

function findLine(lines, line, before) {
  const has = (i) => i >= 0 && i < lines.length && lines[i].includes(before);
  if (has(line - 1)) return line - 1;
  const hits = [];
  for (let d = 1; d <= DRIFT_WINDOW; d++) { if (has(line - 1 - d)) hits.push(line - 1 - d); if (has(line - 1 + d)) hits.push(line - 1 + d); }
  return hits.length === 1 ? hits[0] : -1;
}

function replaceToken(lineText, before, after) {
  // class tokens are bounded by whitespace, quotes, backticks or template braces
  const re = new RegExp(`(^|[\\s"'\`{}])${before.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[\\s"'\`{}])`, 'g');
  return lineText.replace(re, (m, p1) => p1 + after);
}

async function applyPlan(runDir, cardId, opts = {}) {
  const inv = read(runDir, 'inventory.json');
  const p = read(runDir, `apply/${cardId}.plan.json`);
  if (!p) throw new Error(`no plan for ${cardId}; run "apply plan" first`);
  const root = inv.meta.root;
  const byFile = new Map();
  for (const e of p.edits) { if (!byFile.has(e.file)) byFile.set(e.file, []); byFile.get(e.file).push(e); }
  const results = { applied: [], skipped: [], files: [] };
  const pending = [];
  // phase 1: resolve every edit against the current file content
  for (const [rel, list] of byFile) {
    const abs = path.join(root, rel);
    let text = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
    if (list.some((e) => e.kind === 'write')) { pending.push({ rel, abs, text: list.find((e) => e.kind === 'write').after, edits: list }); continue; }
    if (list.some((e) => e.kind === 'append')) { pending.push({ rel, abs, text: (text || '') + list.find((e) => e.kind === 'append').after, edits: list }); continue; }
    if (list.some((e) => e.kind === 'baseline')) { pending.push({ rel, abs, text: null, baseline: true, edits: list }); continue; }
    if (text == null) { for (const e of list) results.skipped.push({ ...e, reason: 'file missing' }); continue; }
    const orig = text;
    let lines = text.split('\n');
    const inserts = list.filter((e) => e.kind === 'css-insert');
    for (const e of list.filter((e) => e.kind !== 'css-insert').sort((a, b) => (b.line || 0) - (a.line || 0))) {
      if (e.confidence === 'review' && !opts.includeReview) { results.skipped.push({ ...e, reason: 'marked for human review (pass --include-review to apply)' }); continue; }
      const i = findLine(lines, e.line, e.before);
      if (i < 0) { results.skipped.push({ ...e, reason: 'before text not found near its line' }); continue; }
      if (e.kind === 'css-line') { lines.splice(i, 1); results.applied.push({ ...e, line: i + 1 }); continue; }
      // jsx edits replace an exact snippet once (props, wrappers); class edits respect token boundaries
      const next = e.kind === 'jsx' ? lines[i].replace(e.before, e.after) : replaceToken(lines[i], e.before, e.after);
      if (next === lines[i]) { results.skipped.push({ ...e, reason: 'token boundary mismatch' }); continue; }
      lines[i] = next;
      results.applied.push({ ...e, line: i + 1 });
    }
    let out = lines.join('\n');
    for (const e of inserts) { const r = insertIntoBlock(out, e.block, e.after); if (!r) { results.skipped.push({ ...e, reason: `block ${e.block} not found` }); continue; } out = r.text; results.applied.push({ ...e, line: r.line }); }
    pending.push({ rel, abs, text: out, orig, edits: list });
  }
  if (opts.dryRun) return { ...results, dryRun: true, plan: p, preview: pending.filter((w) => w.orig != null).map((w) => ({ file: w.rel, before: w.orig, after: w.text })) };
  // phase 2: write
  for (const w of pending) {
    if (w.baseline) { const { check } = require('./baseline'); results.files.push(w.rel); results.baselinePromise = check(root, { update: true }); continue; }
    if (w.text == null) continue;
    w.existed = fs.existsSync(w.abs);
    if (w.existed && w.orig == null) w.orig = fs.readFileSync(w.abs, 'utf8');
    fs.mkdirSync(path.dirname(w.abs), { recursive: true });
    fs.writeFileSync(w.abs, w.text);
    results.files.push(w.rel);
    for (const e of w.edits) if (e.kind === 'write' || e.kind === 'append') results.applied.push({ ...e, after: undefined });
  }
  const finish = async () => {
    if (results.baselinePromise) { await results.baselinePromise; delete results.baselinePromise; }
    if (opts.typecheck) {
      const hasTs = fs.existsSync(path.join(root, 'tsconfig.json')) && fs.existsSync(path.join(root, 'node_modules', 'typescript'));
      if (!hasTs) results.typecheck = { status: null, output: 'skipped: no tsconfig.json or no node_modules/typescript in the project' };
      else {
        const tsc = spawnSync(process.execPath, [path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit', '-p', root], { cwd: root, encoding: 'utf8', timeout: 240000 });
        results.typecheck = { status: tsc.status, output: (tsc.stdout || '') + (tsc.stderr || '') };
        if (tsc.status !== 0) {
          // put every file back exactly as it was; nothing is committed
          for (const w of pending) { if (w.text == null) continue; if (w.existed) fs.writeFileSync(w.abs, w.orig); else fs.rmSync(w.abs, { force: true }); }
          results.reverted = true;
          results.applied = [];
        }
      }
    }
    if (opts.commit && results.files.length && !results.reverted) {
      const msg = opts.message || `design-polish: ${cardId} ${p.kind} (${results.applied.length} edit${results.applied.length === 1 ? '' : 's'} in ${results.files.length} file${results.files.length === 1 ? '' : 's'})`;
      const add = spawnSync('git', ['add', '--', ...results.files], { cwd: root, encoding: 'utf8' });
      const commit = add.status === 0 ? spawnSync('git', ['commit', '-q', '-m', msg], { cwd: root, encoding: 'utf8' }) : add;
      results.commit = { status: commit.status, sha: commit.status === 0 ? spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim() : null, output: (commit.stdout || '') + (commit.stderr || '') };
    }
    const result = { schema: 'design-polish.apply-result/1', runId: p.runId, cardId, appliedAt: new Date().toISOString(), applied: results.applied.length, skipped: results.skipped, files: results.reverted ? [] : results.files, reverted: !!results.reverted, typecheck: results.typecheck || null, commit: results.commit || null };
    fs.writeFileSync(path.join(runDir, 'apply', `${cardId}.result.json`), JSON.stringify(result, null, 2));
    return result;
  };
  return finish();
}

function summary(runDir, cardId, lang = 'en') {
  const p = read(runDir, `apply/${cardId}.plan.json`);
  if (!p) return `no plan for ${cardId}`;
  const byChange = new Map();
  for (const e of p.edits.filter((x) => x.kind === 'class' || x.kind === 'inline-style' || x.kind === 'css-literal')) { const k = `${e.before} → ${e.after}`; byChange.set(k, (byChange.get(k) || 0) + 1); }
  const files = new Set(p.edits.map((e) => e.file));
  const lines = [];
  lines.push(lang === 'ko' ? `${cardId}: 변경 ${p.edits.length}건 · 파일 ${files.size}개 · 건너뜀 ${p.skipped.length}건 · 화면 변화 ${p.summary.visualChange}` : `${cardId}: ${p.edits.length} edits · ${files.size} files · ${p.skipped.length} skipped · visual change ${p.summary.visualChange}`);
  for (const [k, n] of [...byChange.entries()].slice(0, 8)) lines.push(`  ${k}${n > 1 ? ` ×${n}` : ''}`);
  if (byChange.size > 8) lines.push(`  … ${byChange.size - 8} more`);
  if (p.newTokens.length) lines.push((lang === 'ko' ? '  새 토큰: ' : '  new tokens: ') + p.newTokens.map((t) => `${t.name} = ${t.value}`).join(', '));
  if (p.skipped.length) lines.push((lang === 'ko' ? '  건너뜀: ' : '  skipped: ') + [...new Set(p.skipped.map((s) => s.reason))].join('; '));
  return lines.join('\n');
}

if (require.main === module) {
  const [cmd, runDir, cardId, ...rest] = process.argv.slice(2);
  if (!cmd || !runDir || !cardId) { console.error('usage: apply.js plan|apply|summary <run-dir> <card-id> [--include-vendored] [--commit] [--typecheck] [--dry-run] [--include-review] [--lang ko]'); process.exit(2); }
  const li = rest.indexOf('--lang');
  if (cmd === 'plan') { const p = plan(runDir, cardId, { includeVendored: rest.includes('--include-vendored') }); console.log(summary(runDir, cardId, li >= 0 ? rest[li + 1] : 'en')); console.log(`→ ${path.join(runDir, 'apply', `${cardId}.plan.json`)}`); }
  else if (cmd === 'summary') console.log(summary(runDir, cardId, li >= 0 ? rest[li + 1] : 'en'));
  else if (cmd === 'apply') applyPlan(runDir, cardId, { commit: rest.includes('--commit'), typecheck: rest.includes('--typecheck'), dryRun: rest.includes('--dry-run'), includeReview: rest.includes('--include-review') }).then((r) => {
    if (r.dryRun) {
      // a line-level preview the person can read: "- old line" / "+ new line" per changed line
      for (const f of r.preview) { const a = f.before.split('\n'), b = f.after.split('\n'); console.log(`--- ${f.file}`); const n = Math.max(a.length, b.length); for (let i = 0; i < n; i++) if (a[i] !== b[i]) { if (a[i] !== undefined) console.log(`-${i + 1}: ${a[i]}`); if (b[i] !== undefined) console.log(`+${i + 1}: ${b[i]}`); } }
      for (const sk of r.skipped) console.log(`skip ${sk.file || ''}${sk.line ? ':' + sk.line : ''} — ${sk.reason}`);
      console.log(`dry run: ${r.applied.length} edits would be written to ${new Set(r.applied.map((e) => e.file)).size} files`);
      return;
    }
    console.log(JSON.stringify({ applied: r.applied, skipped: r.skipped.length, files: r.files, reverted: r.reverted, typecheck: r.typecheck && r.typecheck.status, commit: r.commit && r.commit.sha }, null, 1));
    if (r.typecheck && r.typecheck.status) { console.error(r.typecheck.output.slice(0, 2000)); process.exit(1); }
  }).catch((e) => { console.error(e.message); process.exit(1); });
  else { console.error('unknown command'); process.exit(2); }
}
module.exports = { plan, applyPlan, summary, rewriteClass, replaceToken, insertIntoBlock };
