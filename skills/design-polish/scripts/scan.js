#!/usr/bin/env node
'use strict';
// design-polish scanner: builds inventory.json for a web codebase.
//
//   design-polish scan <root> [--out <dir>] [--css <entry.css>] [--include-tests] [--include-catalog]
//                            [--src a,b] [--exclude dir,dir] [--mode auto|ast|regex] [--quiet] [--json]
//
// It counts; it does not judge. Every number in the report traces back to this file's output.
// The scanner borrows the project's own TypeScript (for JSX) and Tailwind (for values) so it
// needs no installation of its own. Anything it cannot resolve is reported as unresolved.

const fs = require('fs');
const path = require('path');
const files = require('./lib/files');
const tsLoader = require('./lib/ts-loader');
const { parseFile, readTsconfig, resolveImport } = require('./lib/index-file');
const { evaluate, fromString, CN_FUNCS } = require('./lib/class-eval');
const { expandUsage } = require('./lib/resolve-usage');
const classify = require('./lib/classify');
const signature = require('./lib/signature');
const routes = require('./lib/routes');
const siblings = require('./lib/siblings');
const tokens = require('./lib/tokens');
const twBridge = require('./lib/tw-bridge');
const cssEval = require('./lib/css-eval');
const cssParse = require('./lib/css-parse');
const color = require('./lib/color');
const ids = require('./lib/ids');

const SCANNER_VERSION = '3.0.0';
// Radius ≥ this many px is "fully round" (Tailwind's rounded-full is calc(infinity * 1px), often 9999px in hand-written CSS).
const FULL_RADIUS_PX = 999;
// KRDS shape rule: radius ≈ height × 0.125, rounded up to an even number, capped at 12px.
const KRDS_RATIO = 0.125;
const KRDS_MAX_PX = 12;

function parseArgs(argv) {
  const args = { root: null, out: null, css: null, includeTests: false, includeCatalog: false, src: null, exclude: [], mode: 'auto', quiet: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i];
    else if (a === '--css') args.css = argv[++i];
    else if (a === '--include-tests') args.includeTests = true;
    else if (a === '--include-catalog') args.includeCatalog = true;
    else if (a === '--src') args.src = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--exclude') args.exclude = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--mode') args.mode = argv[++i];
    else if (a === '--quiet') args.quiet = true;
    else if (a === '--json') args.json = true;
    else if (!a.startsWith('-') && !args.root) args.root = a;
  }
  return args;
}

// Vendored component libraries (shadcn/ui copies and the like) are inventoried but not edited by default.
// `components.json` (shadcn) names the ui alias; otherwise any `components/ui` directory counts.
function detectVendored(root, files) {
  const dirs = new Set();
  const cj = path.join(root, 'components.json');
  if (fs.existsSync(cj)) {
    try {
      const conf = JSON.parse(fs.readFileSync(cj, 'utf8'));
      const alias = conf.aliases && conf.aliases.ui;
      if (alias) {
        const m = /^@\/(.+)$/.exec(alias);
        const candidates = m ? ['src/' + m[1], m[1]] : [alias];
        for (const c of candidates) { const d = c.replace(/\/$/, ''); if (files.some((f) => f.startsWith(d + '/'))) { dirs.add(d); break; } }
      }
    } catch (_) { /* unreadable config: fall through to the path rule */ }
  }
  for (const f of files) { const m = /^(.*components\/ui)\/[^/]+$/.exec(f); if (m) dirs.add(m[1]); }
  const list = [...dirs].sort();
  const isVendored = (file) => list.some((d) => file === d || file.startsWith(d + '/'));
  return { dirs: list, isVendored, files: files.filter(isVendored).length, basis: fs.existsSync(cj) ? 'components.json' : list.length ? 'components/ui' : 'none' };
}

function detectCssEntry(cssFiles, explicit) {
  if (explicit) return explicit;
  const score = (f) => {
    let s = 0;
    if (/@import\s+["']tailwindcss["']|@tailwind\s+base/.test(f.text)) s += 100;
    if (/(^|\/)(globals|global|app|index|main|styles|style|tailwind)\.css$/.test(f.rel)) s += 10;
    if (f.rel.startsWith('src/app/') || f.rel.startsWith('app/')) s += 5;
    if (/@theme|:root/.test(f.text)) s += 3;
    return s + Math.min(f.size / 100000, 2);
  };
  const candidates = cssFiles.filter((f) => f.kind === 'css' || f.kind === 'scss').sort((a, b) => score(b) - score(a));
  return candidates.length && score(candidates[0]) > 0 ? candidates[0].rel : null;
}

const THEME_SELECTOR_RE = /^(:root|:host|html|body|\.dark|\.light|\[data-theme[^\]]*\]|@theme|@property|@utility|@layer)/;

/** Literal declarations in the project's own CSS (outside theme blocks). */
function cssLiteralsOf(cssFiles) {
  const out = [];
  for (const f of cssFiles) {
    let sheet;
    try { sheet = cssParse.parse(cssParse.stripComments(f.text)); } catch (_) { continue; }
    for (const rule of sheet.rules) {
      if (!rule.selector || THEME_SELECTOR_RE.test(rule.selector.trim())) continue;
      for (const d of rule.declarations) out.push({ file: f.rel, line: rule.line, prop: d.prop, value: d.value, selector: rule.selector });
    }
  }
  return out;
}

const COLOR_LITERAL_RE = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![0-9a-z])|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\([^)]*\)/gi;

/** Color literals in JS/TS string literals that are not class strings (chart configs, style props). */
function jsLiteralsOf(ts, index, routesOf) {
  const out = [];
  const sf = index.sf;
  const isClassContext = (node) => {
    let n = node.parent;
    while (n) {
      if (ts.isJsxAttribute(n)) return /^(className|class|classList|style)$/.test(n.name.getText(sf)); // style objects are counted as inline styles
      if (ts.isCallExpression(n)) { const callee = n.expression.getText(sf); const name = callee.split('.').pop(); if (CN_FUNCS.has(name) || name === 'cva' || name === 'tv') return true; }
      if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return true;
      if (ts.isJsxElement(n) || ts.isBlock(n) || ts.isSourceFile(n)) return false;
      n = n.parent;
    }
    return false;
  };
  const visit = (n) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
      const text = n.text;
      if (text && COLOR_LITERAL_RE.test(text)) {
        COLOR_LITERAL_RE.lastIndex = 0;
        if (!isClassContext(n) && !/\[#|\[(rgb|hsl|oklch)/.test(text)) {
          const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
          for (const m of text.matchAll(COLOR_LITERAL_RE)) {
            if (color.parse(m[0])) out.push({ file: index.rel, line: line + 1, value: m[0], context: text.slice(0, 60), routes: routesOf(index.rel) });
          }
        }
      }
      COLOR_LITERAL_RE.lastIndex = 0;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

function mergeScopes(tokenList, byClass) {
  const scopes = {};
  const unresolved = [];
  for (const t of tokenList) {
    const entry = byClass.get(t);
    if (!entry) { unresolved.push(t); continue; }
    for (const [scope, decls] of Object.entries(entry.scopes)) {
      scopes[scope] = scopes[scope] || {};
      for (const [prop, value] of Object.entries(decls)) scopes[scope][prop] = value;
    }
  }
  return { scopes, unresolved };
}

function pxOf(scopes, prop, theme, mode) {
  const s = mode === 'dark' ? { ...(scopes.base || {}), ...(scopes.dark || {}) } : (scopes.base || {});
  if (s[prop] === undefined) return null;
  const v = cssEval.resolveVars(s[prop], mode === 'dark' ? new Map([...theme.light, ...theme.dark]) : theme.light);
  if (cssEval.hasUnresolved(v)) return null;
  return cssEval.toPx(v);
}

function colorOf(scopes, prop, theme, mode) {
  const s = mode === 'dark' ? { ...(scopes.base || {}), ...(scopes.dark || {}) } : (scopes.base || {});
  if (s[prop] === undefined) return null;
  const v = cssEval.resolveVars(s[prop], mode === 'dark' ? new Map([...theme.light, ...theme.dark]) : theme.light);
  if (cssEval.hasUnresolved(v)) return null;
  const c = color.parse(v);
  return c ? color.toHex(c) : (v === 'transparent' ? 'transparent' : null);
}

function computedOf(scopes, theme) {
  const base = scopes.base || {};
  const out = {};
  out.heightPx = pxOf(scopes, 'height', theme, 'light');
  out.minHeightPx = pxOf(scopes, 'min-height', theme, 'light');
  // radius: shorthand, else the largest corner
  let radius = pxOf(scopes, 'border-radius', theme, 'light');
  if (radius == null) {
    const corners = ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius', 'border-start-start-radius', 'border-start-end-radius', 'border-end-start-radius', 'border-end-end-radius'].map((p) => pxOf(scopes, p, theme, 'light')).filter((v) => v != null);
    if (corners.length) radius = Math.max(...corners);
  }
  out.radiusPx = radius == null ? null : (radius >= FULL_RADIUS_PX ? 'full' : Math.round(radius * 100) / 100);
  const pad = (inline, start, end, shorthandIndex) => {
    const a = pxOf(scopes, inline, theme, 'light'); if (a != null) return a;
    const b = pxOf(scopes, start, theme, 'light'); const c = pxOf(scopes, end, theme, 'light');
    if (b != null || c != null) return b != null ? b : c;
    if (base.padding !== undefined) { const v = cssEval.resolveVars(base.padding, theme.light); const l = cssEval.lengthsOf(v); if (l) return shorthandIndex === 'x' ? l.left : l.top; }
    return null;
  };
  out.paddingX = pad('padding-inline', 'padding-left', 'padding-right', 'x');
  out.paddingY = pad('padding-block', 'padding-top', 'padding-bottom', 'y');
  out.fontSizePx = pxOf(scopes, 'font-size', theme, 'light');
  const fw = base['font-weight'];
  out.fontWeight = fw === undefined ? null : (/^\d+$/.test(String(fw).trim()) ? Number(fw) : ({ normal: 400, bold: 700, medium: 500, semibold: 600, light: 300 }[String(fw).trim()] ?? null));
  const lh = base['line-height'];
  out.lineHeight = lh === undefined ? null : cssEval.lineHeightToNumber(cssEval.resolveVars(lh, theme.light), out.fontSizePx || 16);
  let bw = pxOf(scopes, 'border-width', theme, 'light');
  if (bw == null) { const sides = ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width', 'border-inline-width', 'border-block-width'].map((p) => pxOf(scopes, p, theme, 'light')).filter((v) => v != null); if (sides.length) bw = Math.max(...sides); }
  out.borderWidthPx = bw;
  out.bg = { light: colorOf(scopes, 'background-color', theme, 'light'), dark: colorOf(scopes, 'background-color', theme, 'dark') };
  out.fg = { light: colorOf(scopes, 'color', theme, 'light'), dark: colorOf(scopes, 'color', theme, 'dark') };
  out.border = { light: colorOf(scopes, 'border-color', theme, 'light'), dark: colorOf(scopes, 'border-color', theme, 'dark') };
  const sh = base['box-shadow'] !== undefined ? base['box-shadow'] : base['--tw-shadow'];
  out.shadow = sh === undefined ? null : cssEval.normalizeValue('box-shadow', cssEval.resolveVars(sh, theme.light));
  if (out.heightPx && out.radiusPx != null && out.radiusPx !== 'full') {
    const krds = Math.min(KRDS_MAX_PX, Math.ceil((out.heightPx * KRDS_RATIO) / 2) * 2);
    out.krds = { expectedPx: krds, ratio: Math.round((out.radiusPx / out.heightPx) * 1000) / 1000 };
  } else out.krds = null;
  return out;
}

function statesOf(scopes, tag) {
  const keys = Object.keys(scopes);
  const has = (k) => keys.some((s) => s.split(':').includes(k));
  const base = scopes.base || {};
  const outlineRemoved = /none/.test(String(base['outline-style'] || base.outline || '')) || /none/.test(String(base['--tw-outline-style'] || ''));
  const native = ['button', 'input', 'select', 'textarea', 'a'].includes(tag);
  return {
    hover: has('hover') ? 'yes' : 'no',
    focusVisible: has('focus-visible') ? 'yes' : (has('focus') ? 'focus-only' : (outlineRemoved ? 'removed' : (native ? 'ua-default' : 'no'))),
    active: has('active') ? 'yes' : 'no',
    disabled: has('disabled') ? 'yes' : (native ? 'ua-default' : 'no'),
    dark: has('dark') ? 'yes' : 'no',
    checked: has('checked') ? 'yes' : 'n/a',
  };
}

function nowIso() { return new Date().toISOString(); }

async function scan(rootArg, opts = {}) {
  const root = path.resolve(rootArg);
  const t0 = Date.now();
  const log = (msg) => { if (!opts.quiet) process.stderr.write(msg + '\n'); };

  // 1. files
  const collected = files.collect(root, { includeTests: opts.includeTests, includeDirs: opts.src, excludeDirs: opts.exclude });
  const codeFiles = collected.files.filter((f) => ['tsx', 'jsx', 'ts', 'js'].includes(f.kind));
  const vendored = detectVendored(root, codeFiles.map((f) => f.rel));
  const cssFiles = collected.files.filter((f) => f.kind.includes('css') || f.kind.includes('scss'));
  log(`files: ${collected.listed} listed (${collected.listSource}), ${codeFiles.length} code + ${cssFiles.length} css scanned`);

  // 2. parser
  const tsInfo = opts.mode === 'regex' ? null : tsLoader.load(root);
  if (!tsInfo) {
    return { error: 'no-typescript', message: 'TypeScript not found in the project; regex mode is not implemented in this build yet', meta: { mode: 'regex' } };
  }
  const ts = tsInfo.ts;

  // 3. indexes
  const indexes = new Map();
  const parseFailed = [];
  for (const f of codeFiles) {
    try { const idx = parseFile(ts, f); indexes.set(f.rel, idx); if (idx.parseDiagnostics) parseFailed.push({ file: f.rel, error: `${idx.parseDiagnostics} parse diagnostics` }); }
    catch (e) { parseFailed.push({ file: f.rel, error: e.message }); }
  }
  const tsconfig = readTsconfig(root, ts);
  const fileSet = new Set(collected.files.map((f) => f.rel));
  const resolve = (from, spec) => resolveImport(from, spec, { files: fileSet, ...tsconfig });
  const project = { indexes, resolve };
  for (const idx of indexes.values()) idx.project = project;
  log(`parsed ${indexes.size} files in ${Date.now() - t0}ms`);

  // 4. routes
  const isNext = fs.existsSync(path.join(root, 'next.config.js')) || fs.existsSync(path.join(root, 'next.config.mjs')) || fs.existsSync(path.join(root, 'next.config.ts')) || (() => { try { const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')); return !!((pkg.dependencies || {}).next || (pkg.devDependencies || {}).next); } catch (_) { return false; } })();
  for (const idx of indexes.values()) idx.ts = ts;
  const discovered = routes.discover(indexes, [...indexes.keys()], { next: isNext });
  const attributed = routes.attribute(indexes, discovered.routeFiles, resolve);
  const routeById = new Map(discovered.routes.map((r) => [r.id, r]));
  const routesOf = (rel) => { const fr = attributed.fileRoutes.get(rel); return fr ? fr.routes : []; }; // pages only; layouts are kept in layoutScope
  const isCatalogFile = (rel) => { const fr = attributed.fileRoutes.get(rel); const own = discovered.routeFiles.get(rel); if (own && own.catalogLike) return true; return !!(fr && fr.routes.length && fr.routes.every((id) => routeById.get(id) && routeById.get(id).catalogLike)); };

  // 5. component usage sites: who renders whom, and how many instances each definition has.
  //    A control written once inside a component definition appears once per rendered instance of
  //    that component, so counts follow usages (SettingsForm used once → its Save button counts 1;
  //    Radio used 3× → its <input type=radio> counts 3). Unreached components count 0.
  const usageSites = new Map(); // `${file}#${name}` -> [{ file, owner }]
  const { followExport } = require('./lib/class-eval');
  const componentOf = (idx, name) => idx.components.find((c) => c.name === name) || null;
  for (const idx of indexes.values()) {
    for (const j of idx.jsx) {
      if (!j.isComponent) continue;
      const base = j.tag.split('.')[0];
      let key = null;
      if (idx.decls.has(base)) key = `${idx.rel}#${base}`;
      else {
        const imp = idx.imports.find((i) => i.local === base);
        if (imp) {
          const r = resolve(idx.rel, imp.spec);
          if (r.kind === 'local' && r.rel) {
            const tIndex = indexes.get(r.rel);
            const hit = tIndex && followExport(tIndex, imp.kind === 'default' ? 'default' : imp.imported, project, 0);
            if (hit) key = `${hit.index.rel}#${hit.name}`;
          }
        }
      }
      if (!key) continue;
      if (!usageSites.has(key)) usageSites.set(key, []);
      usageSites.get(key).push({ file: idx.rel, owner: j.owner });
    }
  }
  const usageCount = new Map([...usageSites.entries()].map(([k, v]) => [k, v.length]));
  const instanceMemo = new Map();
  const isRouteFile = (rel) => discovered.routeFiles.has(rel);
  // instances of (file, component): { main, catalog } rendered instances, following the usage graph
  function instancesOf(file, owner, depth = 0) {
    const catalogHere = isCatalogFile(file);
    if (!owner) return catalogHere ? { main: 0, catalog: 1 } : { main: 1, catalog: 0 };
    const key = `${file}#${owner}`;
    if (instanceMemo.has(key)) return instanceMemo.get(key);
    if (depth > 12) return { main: 1, catalog: 0 };
    instanceMemo.set(key, { main: 0, catalog: 0 }); // cycle guard
    const sites = usageSites.get(key) || [];
    let main = 0, catalog = 0;
    for (const st of sites) { const inst = instancesOf(st.file, st.owner, depth + 1); if (isCatalogFile(st.file)) catalog += inst.main + inst.catalog; else { main += inst.main; catalog += inst.catalog; } }
    if (!sites.length) {
      const idx = indexes.get(file);
      const fr = attributed.fileRoutes.get(file) || { reachability: 'no-router' };
      const entry = isRouteFile(file) || fr.reachability === 'reached' || fr.reachability === 'no-router';
      const comp = idx && componentOf(idx, owner);
      const exportedOrDefault = comp && (comp.exported || idx.exports.get('default') === owner);
      if (entry && (exportedOrDefault || !comp)) { if (catalogHere) catalog = 1; else main = 1; }
    }
    const out = { main, catalog };
    instanceMemo.set(key, out);
    return out;
  }

  // 6. every JSX element: own class tokens (for container layout detection and, later, token counts), inline styles
  const inlineStyles = [];
  const dynamicClassSites = [];
  const cvaCache = new Map();
  // Under the owner's default props: every named prop is present (undefined unless it has a default), so
  // `className ?? ""` and `VARIANTS[variant]` resolve the same way they do for a usage that passes nothing.
  const ownerEnv = (idx, j) => { const c = idx.components.find((x) => x.name === j.owner); if (!c) return { env: {}, locals: null }; const env = {}; for (const n of c.params.names || []) env[n] = undefined; Object.assign(env, c.params.defaults); return { env, locals: c.locals }; };
  const classesOfElement = new Map(); // node -> own tokens under the owner's default props
  const originsOfElement = new Map(); // node -> token -> { file, line, col } where the literal is written
  for (const idx of indexes.values()) {
    const fileRoutes = routesOf(idx.rel);
    for (const j of idx.jsx) {
      const oe = ownerEnv(idx, j);
      const ctx = { ts, sf: idx.sf, index: idx, project, env: oe.env, locals: oe.locals, depth: 0, cvaCache };
      const a = j.attrs.className || j.attrs.class;
      let set = null;
      if (a) {
        if (a.kind === 'string') set = fromString(a.value, { file: idx.rel, line: j.line, col: j.col });
        else if (a.kind === 'expr' && a.node) set = evaluate(a.node, ctx);
      }
      classesOfElement.set(j.node, set ? set.tokens : []);
      originsOfElement.set(j.node, set ? set.origins || {} : {});
      if (set && set.unknown.length && a.kind === 'expr' && /\$\{|\+/.test(a.text || '')) dynamicClassSites.push({ file: idx.rel, line: j.line, tag: j.tag, expr: (a.text || '').slice(0, 80), unknown: set.unknown.slice(0, 3) });
      const st = j.attrs.style;
      if (st && st.kind === 'expr' && st.node && ts.isObjectLiteralExpression(st.node)) {
        for (const p of st.node.properties) {
          if (!ts.isPropertyAssignment(p)) continue;
          const key = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : p.name.getText(idx.sf);
          const { staticValue } = require('./lib/class-eval');
          const v = staticValue(p.initializer, ctx);
          if (v !== undefined && v !== null) inlineStyles.push({ file: idx.rel, line: j.line, prop: key, value: String(v), tag: j.tag, routes: fileRoutes });
        }
      }
    }
  }

  // 7. occurrences
  //    Each component definition has one "control root": its render root if that is a control, else the
  //    first control inside it (Radio = <label><input type=radio/></label>). The control root is the
  //    implementation; usages are the occurrences. Every other control written inside a definition
  //    (Chip's × button) is an occurrence counted once per rendered instance of the definition.
  const absorbed = new Set();
  const effByNode = new Map(); // every expanded element: { eff, inst }
  const implementations = new Map(); // id -> impl
  const rawOccurrences = [];
  const controlRoots = new Map(); // `${file}#${name}` -> { node, eff, det }
  const ctxFor = (idx, j) => { const oe = ownerEnv(idx, j); return { ts, sf: idx.sf, index: idx, project, env: oe.env, locals: oe.locals, depth: 0, cvaCache }; };
  // A component "is" a control when its root classifies as one (with the component's own name as a hint:
  // Chip's root span is a chip). Small wrappers whose root is a label/div around one control (Radio =
  // <label><input type=radio/></label>) use that control. Pages, forms and toolbars are not controls.
  const WRAPPER_MAX_ELEMENTS = 4;
  const subtreeSize = (j) => 1 + j.children.reduce((n, c) => n + subtreeSize(c), 0);
  const findControlRoot = (idx, comp) => {
    for (const root of comp.roots) {
      const rootInfo = idx.jsxByNode.get(root.node);
      if (!rootInfo) continue;
      const eff = expandUsage(rootInfo, ctxFor(idx, rootInfo));
      const det = classify.detect(eff, rootInfo, { componentName: comp.name });
      if (det && det.type) return { node: rootInfo.node, eff, det, rootInfo, isRoot: true };
      const wrapperLike = classify.nameHint([comp.name]) || subtreeSize(rootInfo) <= WRAPPER_MAX_ELEMENTS;
      if (!wrapperLike) continue;
      const queue = [...rootInfo.children];
      let guard = 0;
      while (queue.length && guard++ < 50) {
        const j = queue.shift();
        const e2 = expandUsage(j, ctxFor(idx, j));
        const d2 = classify.detect(e2, j);
        if (d2 && d2.type && d2.confidence !== 'partial') return { node: j.node, eff: e2, det: d2, rootInfo, isRoot: false };
        for (const c of j.children) queue.push(c);
      }
    }
    return null;
  };
  // A small DOM sketch of a definition (root + parts such as indicators, thumbs, chevrons) so specimens
  // can render the real markup with the real classes. Depth and width are capped; it is a sketch, not a clone.
  const SKELETON_DEPTH = 3, SKELETON_WIDTH = 8;
  const KEEP_ATTRS = new Set(['type', 'role', 'placeholder', 'aria-label', 'aria-hidden', 'data-slot', 'data-state', 'disabled', 'checked', 'value', 'rows', 'href']);
  const skeletonOf = (idx, j, depth) => {
    const eff = expandUsage(j, ctxFor(idx, j));
    const node = { tag: eff.tag || (j.isComponent ? null : j.tag), classes: eff.classSet.tokens.join(' '), attrs: {}, text: j.textLabels[0] || null, children: [], component: j.isComponent ? j.tag : null };
    for (const [k, v] of Object.entries(eff.attrs || {})) if (KEEP_ATTRS.has(k) && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) node.attrs[k] = v;
    if (eff.implRef && eff.implRef.kind === 'library' && eff.tag === 'svg') node.icon = j.tag;
    if (eff.tag === null && eff.absorbed) node.tag = null;
    if (depth < SKELETON_DEPTH) for (const c of j.children.slice(0, SKELETON_WIDTH)) { if (c.inRenderProp) continue; node.children.push(skeletonOf(idx, c, depth + 1)); }
    return node;
  };
  for (const idx of indexes.values()) for (const comp of idx.components) { const cr = findControlRoot(idx, comp); if (cr) { const ci = idx.jsxByNode.get(cr.node); controlRoots.set(`${idx.rel}#${comp.name}`, { ...cr, comp, idx, skeleton: ci ? skeletonOf(idx, ci, 0) : null }); } }
  const controlRootNodes = new Map([...controlRoots.values()].map((cr) => [cr.node, cr]));

  for (const idx of indexes.values()) {
    const fileRoutes = routesOf(idx.rel);
    const fr = attributed.fileRoutes.get(idx.rel) || { routes: [], layouts: [], reachability: 'no-router' };
    const contentByNode = new Map(); // dropdown content usage node -> raw occurrence (items fold into it)
    for (const j of idx.jsx) {
      if (absorbed.has(j.node)) continue;
      const ctx = ctxFor(idx, j);
      const cr = controlRootNodes.get(j.node);
      if (cr) {
        // implementation record
        const key = `${idx.rel}#${cr.comp.name}`;
        const inst = instancesOf(idx.rel, cr.comp.name);
        const uses = usageCount.get(key) || 0;
        const implId = ids.implId(cr.det.type, idx.rel, cr.comp.name);
        // A root that itself resolves through another local component (PrimaryButton → Button) is a wrapper, not an implementation.
        const wraps = cr.eff.chain && cr.eff.chain.length && cr.eff.implRef && cr.eff.implRef.kind === 'local-component' ? ids.implId(cr.det.type, cr.eff.implRef.file, cr.eff.implRef.name) : null;
        const isWrapper = !!wraps || !!cr.eff.asChild || (cr.eff.chain && cr.eff.chain.length > 0 && cr.eff.implRef && cr.eff.implRef.kind === 'library' && cr.eff.tag === null);
        if (!implementations.has(implId) && cr.det.subtype !== 'item') implementations.set(implId, { id: implId, type: cr.det.type, kind: isWrapper ? 'wrapper' : 'local-component', vendored: vendored.isVendored(idx.rel), wraps, skeleton: cr.skeleton || null, name: cr.comp.name, file: idx.rel, primitive: (cr.eff.implRef && cr.eff.implRef.primitive) || null, usages: uses, instances: inst.main + inst.catalog, reachability: fr.reachability, routes: fileRoutes, axes: cr.eff.classSet.cva || null, count: 0, catalogCount: 0, signatures: new Set(), controlRootIsRoot: cr.isRoot });
        if (uses > 0 || (inst.main + inst.catalog) === 0) continue; // counted through usages, or unreached
        // reached without JSX usages (route entry, dynamic import): count the control root itself once
      }
      const owner = j.owner;
      const inst = instancesOf(idx.rel, owner);
      if (inst.main + inst.catalog === 0) continue; // inside an unreached component
      let eff = expandUsage(j, ctx);
      effByNode.set(j.node, { eff, inst });
      if (eff.absorbed) absorbed.add(eff.absorbed.node);
      let det = classify.detect(eff, j);
      // A component usage whose root is not a control but which contains one (Radio → label > input): use that control.
      if ((!det || det.type === null) && j.isComponent && eff.chain.length) {
        const last = eff.chain[eff.chain.length - 1];
        const cr2 = controlRoots.get(`${last.file}#${last.name}`);
        if (cr2 && !cr2.isRoot) { eff = { ...cr2.eff, chain: [...eff.chain], implRef: { kind: 'local-component', name: last.name, file: last.file, primitive: (cr2.eff.implRef && cr2.eff.implRef.primitive) || null, via: eff.chain.slice(0, -1).map((c) => c.name) } }; det = cr2.det; effByNode.set(j.node, { eff, inst }); }
      }
      if (!det) continue;
      if (det.type === null && det.basis !== 'pending-heuristic') continue;
      if (det.type === 'dropdown-menu' && det.subtype === 'item') {
        // fold menu items into the nearest enclosing content occurrence
        let p = j.parent;
        while (p && !contentByNode.has(p.node)) p = p.parent;
        if (p) contentByNode.get(p.node).items.push(eff.classSet.tokens);
        continue;
      }
      if (det.type === 'dropdown-menu' && det.subtype !== 'item' && det.role !== 'menu' && det.basis !== 'name') continue;
      if (det.role === 'separator' || det.role === 'group') continue;
      const raw = { j, idx, eff, det, fileRoutes, fr, count: inst.main, catalogCount: inst.catalog, items: [] };
      if (det.type === 'dropdown-menu') contentByNode.set(j.node, raw);
      rawOccurrences.push(raw);
    }
  }

  // 8. token statistics: every element's effective classes × rendered instances (control roots of used
  //    components are skipped — their classes arrive through each usage), then resolve everything at once.
  const tokenStats = new Map();
  const addTokenSite = (t, idx, j, n, extra) => {
    if (!tokenStats.has(t)) tokenStats.set(t, { count: 0, sites: [] });
    const s = tokenStats.get(t); s.count += n;
    // the site where the class is written decides whether it is the project's own code or a vendored library copy
    const originFile = extra && extra.origin && extra.origin.file ? extra.origin.file : idx.rel;
    if (vendored.isVendored(originFile)) s.vendoredCount = (s.vendoredCount || 0) + n;
    if (s.sites.length < 200) s.sites.push({ file: idx.rel, line: j.line, col: j.col, count: n, vendored: vendored.isVendored(originFile), routes: routesOf(idx.rel), ...extra });
  };
  for (const idx of indexes.values()) {
    for (const j of idx.jsx) {
      const cr = controlRootNodes.get(j.node);
      if (cr && (usageCount.get(`${idx.rel}#${cr.comp.name}`) || 0) > 0) continue;
      if (absorbed.has(j.node)) continue;
      const hit = effByNode.get(j.node);
      const inst = hit ? hit.inst : instancesOf(idx.rel, j.owner);
      const n = inst.main + inst.catalog;
      if (n === 0) continue;
      let tokens, conditional = [], origins = {};
      if (hit && hit.eff.chain && hit.eff.chain.length) { tokens = hit.eff.classSet.tokens; conditional = hit.eff.classSet.conditional; origins = hit.eff.classSet.origins || {}; }
      else { tokens = classesOfElement.get(j.node) || []; origins = originsOfElement.get(j.node) || {}; }
      for (const t of tokens) addTokenSite(t, idx, j, n, { origin: origins[t] || null });
      for (const c of conditional) for (const t of c.tokens) addTokenSite(t, idx, j, n, { conditional: c.condition, origin: origins[t] || null });
    }
  }
  const cssEntry = detectCssEntry(cssFiles, opts.css);
  const bridge = await twBridge.create(root, { cssEntry, cssFiles: cssFiles.map((f) => ({ rel: f.rel, text: f.text })) });
  const allTokens = new Set(tokenStats.keys());
  for (const o of rawOccurrences) for (const t of o.eff.classSet.tokens) allTokens.add(t);
  const resolvedAll = bridge.resolve([...allTokens]);
  const theme = bridge.theme([...allTokens]);
  log(`css: engine=${bridge.engine}${bridge.version ? ' ' + bridge.version : ''} entry=${cssEntry || '-'} resolved=${resolvedAll.byClass.size}/${allTokens.size}${bridge.error ? ' error=' + bridge.error : ''}`);

  // 9. build occurrences with signatures
  const occurrences = [];
  const sigMap = new Map();
  const occByNode = new Map();
  for (const o of rawOccurrences) {
    const { j, idx, eff, fileRoutes, fr } = o;
    let det = o.det;
    const nonPlacement = eff.classSet.tokens.filter((t) => !signature.isPlacementToken(t));
    const { scopes, unresolved } = mergeScopes(nonPlacement, resolvedAll.byClass);
    if (o.items && o.items.length) { // dropdown menu: item declarations are part of the menu's look
      const itemTokens = [...new Set(o.items.flat())].filter((t) => !signature.isPlacementToken(t));
      const itemScopes = mergeScopes(itemTokens, resolvedAll.byClass).scopes;
      for (const [sc, decls] of Object.entries(itemScopes)) scopes[`item:${sc}`] = decls;
    }
    const computed = computedOf(scopes, theme);
    if (det.type === null) { // pending heuristic for span/div
      const h = classify.badgeLikeHeuristic({ base: scopes.base, computed });
      if (!h) continue;
      det = h;
    }
    if (det.confidence === 'candidate') { // <a> that may be a link-button
      if (!classify.linkButtonHeuristic({ base: scopes.base, computed })) continue;
      det = { ...det, confidence: 'heuristic' };
    }
    const sig = signature.build(det.type, scopes, [eff.classSet.tokens.join(' ')], { tokens: eff.classSet.tokens });
    const ownAttr = j.attrs.className || j.attrs.class;
    const usageTokens = ownAttr ? (ownAttr.kind === 'string' ? ownAttr.value.split(/\s+/) : (classesOfElement.get(j.node) || [])) : [];
    const adHocTokens = eff.chain.length ? usageTokens.filter((t) => t && !signature.isPlacementToken(t)) : [];
    const implRef = eff.implRef || { kind: 'native', name: eff.tag, file: idx.rel };
    const implKey = implRef.kind === 'native' ? ids.implId(det.type, 'native', implRef.name) : implRef.kind === 'library' ? ids.implId(det.type, `lib:${implRef.pkg || 'unknown'}`, implRef.name) : ids.implId(det.type, implRef.file, implRef.name);
    if (!implementations.has(implKey)) implementations.set(implKey, { id: implKey, type: det.type, kind: implRef.kind, name: implRef.name, file: implRef.kind === 'native' ? null : implRef.file, primitive: implRef.primitive || null, usages: 0, reachability: 'reached', routes: [], axes: null, count: 0, catalogCount: 0, signatures: new Set() });
    const impl = implementations.get(implKey);
    if (eff.classSet.cva && !impl.axes) impl.axes = eff.classSet.cva;
    const catalog = isCatalogFile(idx.rel) || (o.count === 0 && o.catalogCount > 0);
    const occ = {
      id: ids.occId(idx.rel, j.owner, j.jsxPath), sigId: sig.id, type: det.type, subtype: det.subtype || null, basis: det.basis, confidence: det.confidence,
      implId: implKey, file: idx.rel, line: j.line, col: j.col, endLine: j.endLine, endCol: j.endCol, tag: eff.tag, role: eff.role,
      componentName: j.isComponent ? j.tag : null, owner: j.owner, chain: eff.chain.map((c) => c.name), variantProps: eff.chain[0] && eff.chain[0].variantProps || null,
      classes: eff.classSet.tokens.join(' '), usageClasses: usageTokens.join(' '), adHoc: eff.chain.length ? adHocTokens.length > 0 : true, adHocTokens,
      unresolvedClasses: unresolved, unknownParts: eff.classSet.unknown, conditional: eff.classSet.conditional.map((c) => c.condition), spread: j.spread,
      style: eff.style, labels: j.textLabels.slice(0, 3), inMap: j.inMap, inConditional: j.inConditional, branch: eff.branch, asChild: eff.asChild,
      attrs: Object.fromEntries(Object.entries(eff.attrs || {}).filter(([k, v]) => KEEP_ATTRS.has(k) && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'))),
      itemClasses: o.items && o.items.length ? [...new Set(o.items.flat())].join(' ') : null,
      skeleton: (!j.isComponent && j.children.length) ? skeletonOf(idx, j, 0) : null,
      routes: fileRoutes, layoutScope: fr.layouts, reachability: fr.reachability, catalog, unresolvedReason: eff.unresolvedReason,
      parentOccId: null, siblingGroupId: null, computed, states: statesOf(scopes, eff.tag), scopes,
      count: o.count, catalogCount: o.catalogCount, vendored: vendored.isVendored(idx.rel), definedIn: j.owner && !j.isComponent ? { component: j.owner, file: idx.rel } : null,
    };
    occurrences.push(occ);
    occByNode.set(j.node, occ);
    impl.count += o.count;
    impl.catalogCount = (impl.catalogCount || 0) + o.catalogCount;
    impl.signatures.add(sig.id);
    const resolvedLook = Object.keys(sig.canonical).length > 0 || (eff.classSet.tokens.length === 0 && eff.classSet.unknown.length === 0);
    if (!sigMap.has(sig.id)) sigMap.set(sig.id, { ...sig, type: det.type, resolved: resolvedLook, implIds: new Set(), occurrences: [], spellings: new Set(), computed, states: occ.states, scopes, labels: new Set(), routes: new Set(), layoutScopes: new Set(), variantProps: occ.variantProps, adHoc: false, unresolvedClasses: new Set(unresolved), catalogCount: 0, count: 0, tag: eff.tag, role: eff.role, subtype: det.subtype || null, attrs: occ.attrs, itemClasses: occ.itemClasses, skeleton: occ.skeleton, asChild: eff.asChild });
    const s = sigMap.get(sig.id);
    s.implIds.add(implKey);
    s.occurrences.push(occ.id);
    s.spellings.add(occ.classes);
    for (const l of occ.labels) s.labels.add(l);
    for (const r of fileRoutes) s.routes.add(r);
    for (const l of fr.layouts) s.layoutScopes.add(l);
    if (occ.adHoc) s.adHoc = true;
    s.count += o.count; s.catalogCount += o.catalogCount;
  }

  // 10. siblings
  const seeThrough = (el) => { const h = effByNode.get(el.node); return !!(h && h.eff.tag === null && !h.eff.unresolvedReason && h.eff.implRef && (h.eff.implRef.kind === 'library' || h.eff.implRef.primitive)); };
  const groups = siblings.groups(indexes, occByNode, (el) => classesOfElement.get(el.node) || [], attributed.fileRoutes, seeThrough);
  for (const g of groups) g.catalog = isCatalogFile(g.file);
  for (const g of groups) for (const oid of g.members) { const occ = occurrences.find((o) => o.id === oid); if (occ) occ.siblingGroupId = g.id; }

  // 11. tokens
  const jsLiterals = [];
  for (const idx of indexes.values()) jsLiterals.push(...jsLiteralsOf(ts, idx, routesOf));
  const tokenInv = tokens.inventory({ tokenStats, resolved: resolvedAll.byClass, unresolved: resolvedAll.unresolved, theme, cssLiterals: cssLiteralsOf(cssFiles.filter((f) => f.rel !== cssEntry || true)), inlineStyles, jsLiterals, fileRoutes: attributed.fileRoutes, isVendored: vendored.isVendored, shadcn: vendored.basis === 'components.json' });

  // 12. assemble
  const byType = {};
  for (const type of classify.TYPES) {
    const sigs = [...sigMap.values()].filter((s) => s.type === type).sort((a, b) => b.count - a.count || (a.id < b.id ? -1 : 1));
    const impls = [...implementations.values()].filter((i) => i.type === type).sort((a, b) => b.count - a.count || (a.id < b.id ? -1 : 1));
    byType[type] = {
      total: sigs.reduce((n, s) => n + s.count, 0),
      catalog: sigs.reduce((n, s) => n + s.catalogCount, 0),
      looks: sigs.filter((s) => s.count > 0 && s.resolved).length,
      unresolvedLooks: sigs.filter((s) => s.count > 0 && !s.resolved).length,
      catalogOnlyLooks: sigs.filter((s) => s.count === 0 && s.catalogCount > 0).length,
      implementations: impls.map((i) => ({ ...i, signatures: [...i.signatures].sort(), usages: i.count || i.usages, skeleton: i.skeleton || null })),
      signatures: sigs.map((s) => ({
        id: s.id, type: s.type, idBasis: s.idBasis, resolved: s.resolved, count: s.count, catalogCount: s.catalogCount, adHoc: s.adHoc,
        tag: s.tag, role: s.role, subtype: s.subtype, attrs: s.attrs, itemClasses: s.itemClasses, skeleton: s.skeleton, asChild: !!s.asChild,
        implIds: [...s.implIds].sort(), variantProps: s.variantProps, canonical: s.canonical,
        spelling: [...s.spellings][0], spellings: [...s.spellings].sort(), computed: s.computed, states: s.states,
        labels: [...s.labels].slice(0, 5), routes: [...s.routes].sort(), layoutScopes: [...s.layoutScopes].sort(), unresolvedClasses: [...s.unresolvedClasses].sort(),
        occurrences: s.occurrences,
      })),
    };
  }
  const unresolvedTokens = resolvedAll.unresolved.map((u) => ({ ...u, count: (tokenStats.get(u.cls) || { count: 0 }).count, sites: (tokenStats.get(u.cls) || { sites: [] }).sites.slice(0, 5).map((s) => ({ file: s.file, line: s.line })) })).sort((a, b) => b.count - a.count || (a.cls < b.cls ? -1 : 1));
  const inventory = {
    schema: 'design-polish.inventory/1',
    meta: {
      scannerVersion: SCANNER_VERSION, generatedAt: nowIso(), root, durationMs: Date.now() - t0,
      mode: 'ast', parser: { name: 'typescript', version: tsInfo.version, source: tsInfo.source },
      css: { engine: bridge.engine, version: bridge.version, entry: cssEntry, error: bridge.error, darkStrategy: theme.darkStrategy, darkSelector: theme.darkSelector, executedConfig: bridge.executedConfig },
      files: { listSource: collected.listSource, listed: collected.listed, scanned: collected.files.length, code: codeFiles.length, css: cssFiles.length, parseFailed, skipped: Object.fromEntries(Object.entries(collected.skipped).map(([k, v]) => [k, Array.isArray(v) ? { count: v.length, samples: v.slice(0, 5) } : { count: v }])) },
      router: discovered.router,
      vendored: { basis: vendored.basis, dirs: vendored.dirs, files: vendored.files },
      options: { includeTests: !!opts.includeTests, includeCatalog: !!opts.includeCatalog, src: opts.src || null, exclude: opts.exclude || [] },
    },
    routes: discovered.routes,
    components: byType,
    occurrences: occurrences.map(({ scopes, ...o }) => o).sort((a, b) => (a.file === b.file ? a.line - b.line || a.col - b.col : a.file < b.file ? -1 : 1)),
    relationships: { status: 'ok', siblingGroups: groups },
    tokens: tokenInv,
    classes: { unique: tokenStats.size, resolved: resolvedAll.byClass.size, unresolved: unresolvedTokens, dynamicSites: dynamicClassSites },
    coverage: { unreachedFiles: [...attributed.fileRoutes.entries()].filter(([k, v]) => v.reachability === 'unreached' && indexes.get(k) && indexes.get(k).components.length).map(([k]) => k).sort(), inlineStyleCount: inlineStyles.length, jsLiteralCount: jsLiterals.length },
    scores: { ...tokenInv.scores },
  };
  // component axis: share of occurrences that are not ad-hoc (one of the implementation's defined looks)
  const occMain = occurrences.filter((o) => o.count > 0);
  const mainN = occMain.reduce((n, o) => n + o.count, 0);
  const adHocN = occMain.filter((o) => o.adHoc).reduce((n, o) => n + o.count, 0);
  inventory.scores.component = mainN ? Math.round(((mainN - adHocN) / mainN) * 1000) / 10 : null;
  const axesForComposite = ['color', 'typography', 'spacing', 'radius', 'shadow', 'component'];
  const weights = { color: tokenInv.axes.color.onToken + tokenInv.axes.color.hardcoded, typography: tokenInv.axes.typography.onToken + tokenInv.axes.typography.hardcoded, spacing: tokenInv.axes.spacing.onScale + tokenInv.axes.spacing.offScale, radius: tokenInv.axes.radius.onToken + tokenInv.axes.radius.hardcoded, shadow: tokenInv.axes.shadow.onToken + tokenInv.axes.shadow.hardcoded, component: mainN };
  let wsum = 0, acc = 0;
  for (const a of axesForComposite) { const s = inventory.scores[a]; if (s == null) continue; acc += s * weights[a]; wsum += weights[a]; }
  inventory.scores.composite = wsum ? Math.round((acc / wsum) * 10) / 10 : null;
  inventory.scores.weights = weights;
  return inventory;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.root) { console.error('usage: scan.js <root> [--out <dir>] [--css <entry>] [--include-tests] [--include-catalog] [--src a,b] [--exclude d,e] [--quiet]'); process.exit(2); }
  const inv = await scan(args.root, args);
  if (inv.error) { console.error(`error: ${inv.error} — ${inv.message}`); process.exit(1); }
  const outDir = args.out || path.join(path.resolve(args.root), '.design-polish', 'runs', inv.meta.generatedAt.replace(/[:.]/g, '-').slice(0, 19));
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'inventory.json');
  fs.writeFileSync(outFile, JSON.stringify(inv, null, 2));
  if (args.json) { process.stdout.write(JSON.stringify(inv)); return; }
  const c = inv.components;
  const lines = [
    `design-polish scan ${SCANNER_VERSION} — ${inv.meta.files.code} code files, ${inv.routes.length} routes (${inv.meta.router}), ${inv.meta.durationMs}ms`,
    `css: ${inv.meta.css.engine}${inv.meta.css.version ? ' ' + inv.meta.css.version : ''}${inv.meta.css.entry ? ' · ' + inv.meta.css.entry : ''}${inv.meta.css.error ? ' · ' + inv.meta.css.error : ''}`,
    `classes: ${inv.classes.unique} unique, ${inv.classes.unresolved.length} unresolved, ${inv.classes.dynamicSites.length} dynamic sites`,
    ...classify.TYPES.map((t) => `${t.padEnd(14)} ${String(c[t].total).padStart(4)} uses · ${c[t].looks} looks${c[t].unresolvedLooks ? ` (+${c[t].unresolvedLooks} unresolved)` : ''} · ${c[t].implementations.filter((i) => (i.count > 0 || i.usages > 0) && i.kind !== 'wrapper').length} impl${c[t].catalog ? ` (+${c[t].catalog} uses / ${c[t].catalogOnlyLooks} looks only in catalog pages)` : ''}`),
    `colors: ${inv.tokens.colors.values.length} values · ${inv.tokens.declared.filter((d) => d.axis === 'color').length} declared · ${inv.tokens.colors.clusters.length} near-duplicate clusters`,
    `spacing step: ${inv.tokens.spacing.dominantStep || 'none'} · off-scale: ${inv.tokens.spacing.offScale.join(', ') || '-'}`,
    `sibling groups: ${inv.relationships.siblingGroups.length} (radius mismatch: ${inv.relationships.siblingGroups.filter((g) => g.mismatch.radius).length})`,
    `scores: ${Object.entries(inv.scores).filter(([k]) => k !== 'weights').map(([k, v]) => `${k} ${v == null ? '-' : v}`).join(' · ')}`,
    `→ ${outFile}`,
  ];
  process.stdout.write(lines.join('\n') + '\n');
}

if (require.main === module) main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
module.exports = { scan, SCANNER_VERSION, computedOf, statesOf, mergeScopes, detectCssEntry };
