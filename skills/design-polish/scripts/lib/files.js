'use strict';
// Collects the files to scan. `git ls-files` is the source of truth when available
// because it respects .gitignore and *includes untracked files* (vibe-coded repos
// have many uncommitted files; `--cached` alone would miss them, and that was the
// single largest cause of inflated or deflated counts in the v1 scanner).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', '.next', '.nuxt', 'dist', 'build', 'out', 'coverage', '.turbo',
  'storybook-static', 'vendor', '.venv', 'site-packages', 'public', '.design-polish',
  'design-audit', '_workspace', // leftovers from earlier versions of this tool
]);
// Test, story and type-declaration files describe code; they are not the UI users see.
const EXCLUDE_FILE_RE = /(\.(test|spec|stories|story|cy|e2e)\.[cm]?[jt]sx?$)|(\.d\.ts$)|(^|\/)(__tests__|__mocks__|__snapshots__)\//;
// 1.5 MB: larger source files are bundles or generated data, never hand-written UI.
const MAX_FILE_BYTES = 1.5 * 1024 * 1024;
const CODE_EXT = { '.tsx': 'tsx', '.jsx': 'jsx', '.ts': 'ts', '.js': 'js', '.mjs': 'js', '.cjs': 'js' };
const STYLE_EXT = { '.css': 'css', '.scss': 'scss', '.pcss': 'css' };
// Server-rendered templates carry CSS in <style> blocks; those blocks are read as stylesheets (markup is not scanned).
const TEMPLATE_EXT = new Set(['.html', '.htm', '.ftl', '.ftlh', '.hbs', '.ejs', '.erb', '.twig', '.njk', '.jsp', '.php', '.mustache', '.liquid']);

function kindOf(rel) {
  const ext = path.extname(rel).toLowerCase();
  if (CODE_EXT[ext]) return CODE_EXT[ext];
  if (STYLE_EXT[ext]) return rel.endsWith('.module.css') || rel.endsWith('.module.scss') ? 'module.' + STYLE_EXT[ext] : STYLE_EXT[ext];
  if (TEMPLATE_EXT.has(ext)) return 'template';
  return null;
}

// An installed skill or plugin folder (ours or anyone's) is tooling, not the product: skip it wherever it sits
// (.claude/skills, .agents/skills, skills/, .cursor/…), and skip every dot-directory (.github, .moai, .gstack…).
function isToolingDir(root, relDir, cache) {
  if (cache.has(relDir)) return cache.get(relDir);
  let tooling = false;
  const parts = relDir.split('/');
  if (parts.some((p) => p.startsWith('.') && p !== '.')) tooling = true;
  else { try { tooling = fs.existsSync(path.join(root, relDir, 'SKILL.md')) || fs.existsSync(path.join(root, relDir, '.claude-plugin', 'plugin.json')); } catch (_) { tooling = false; } }
  cache.set(relDir, tooling);
  return tooling;
}

function listWithGit(root) {
  try {
    const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: root, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024,
    });
    const rels = out.toString('utf8').split('\0').filter(Boolean);
    return rels;
  } catch (_) {
    return null;
  }
}

function walk(root) {
  const rels = [];
  const stack = [''];
  while (stack.length) {
    const relDir = stack.pop();
    const absDir = path.join(root, relDir);
    let entries;
    try { entries = fs.readdirSync(absDir, { withFileTypes: true }); } catch (_) { continue; }
    for (const e of entries) {
      const rel = relDir ? `${relDir}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!EXCLUDE_DIRS.has(e.name) && !e.name.startsWith('.')) stack.push(rel);
      } else if (e.isFile()) {
        rels.push(rel);
      }
    }
  }
  return rels.sort();
}

function isGenerated(text) {
  // Generated files carry a marker in the first lines; scanning them counts machine output as design.
  const head = text.slice(0, 400);
  return /@generated|DO NOT EDIT|This file was automatically generated|eslint-disable.*openapi/i.test(head);
}

/**
 * @param {string} root absolute path
 * @param {{ includeTests?: boolean, includeDirs?: string[], excludeDirs?: string[] }} opts
 */
function collect(root, opts = {}) {
  root = path.resolve(root);
  let rels = listWithGit(root);
  const listSource = rels ? 'git' : 'walk';
  if (!rels) rels = walk(root);
  // Our own output never counts as part of the project (it would make every re-scan differ).
  rels = rels.filter((r) => !r.startsWith('.design-polish/'));
  const extraExclude = new Set(opts.excludeDirs || []);
  const skipped = { 'excluded-dir': [], test: [], generated: [], 'too-large': [], 'not-ui': 0, unreadable: [] };
  const files = [];
  const toolingCache = new Map();
  for (const rel of rels) {
    const parts = rel.split('/');
    if (parts.some((p) => EXCLUDE_DIRS.has(p) || extraExclude.has(p))) { skipped['excluded-dir'].push(rel); continue; }
    // any ancestor directory that is a dot-dir or holds a SKILL.md / plugin manifest
    let tooling = false;
    for (let i = 1; i < parts.length; i++) { if (isToolingDir(root, parts.slice(0, i).join('/'), toolingCache)) { tooling = true; break; } }
    if (tooling) { skipped['excluded-dir'].push(rel); continue; }
    if (opts.includeDirs && opts.includeDirs.length && !opts.includeDirs.some((d) => rel === d || rel.startsWith(d.replace(/\/$/, '') + '/'))) { skipped['excluded-dir'].push(rel); continue; }
    const kind = kindOf(rel);
    if (!kind) { skipped['not-ui']++; continue; }
    if (!opts.includeTests && EXCLUDE_FILE_RE.test(rel)) { skipped.test.push(rel); continue; }
    const abs = path.join(root, rel);
    let stat;
    try { stat = fs.statSync(abs); } catch (_) { skipped.unreadable.push(rel); continue; }
    if (!stat.isFile()) continue;
    if (stat.size > MAX_FILE_BYTES) { skipped['too-large'].push(rel); continue; }
    let text;
    try { text = fs.readFileSync(abs, 'utf8'); } catch (_) { skipped.unreadable.push(rel); continue; }
    if (isGenerated(text)) { skipped.generated.push(rel); continue; }
    files.push({ abs, rel, kind, size: stat.size, text });
  }
  files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  return { root, listSource, listed: rels.length, files, skipped };
}

module.exports = { collect, kindOf, EXCLUDE_DIRS, EXCLUDE_FILE_RE, MAX_FILE_BYTES, TEMPLATE_EXT };
