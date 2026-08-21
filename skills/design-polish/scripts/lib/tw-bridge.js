'use strict';
// Resolves class names to CSS declarations using the target project's *own*
// Tailwind engine (v4: `@tailwindcss/node` / `tailwindcss`). We never ship a
// table of what `rounded-md` means, because the project's @theme decides that.
// Projects without Tailwind fall back to their plain CSS files. When nothing can
// resolve a class, it is reported as unresolved (and, if it looks like a utility,
// as invalid) — never approximated.

const fs = require('fs');
const path = require('path');
const { parse: parseCss, splitClassSelector, stripComments } = require('./css-parse');

// Tailwind v4 default breakpoints, used only to label responsive scopes in the report.
const BREAKPOINTS = { '40rem': 'sm', '48rem': 'md', '64rem': 'lg', '80rem': 'xl', '96rem': '2xl', '640px': 'sm', '768px': 'md', '1024px': 'lg', '1280px': 'xl', '1536px': '2xl' };
// Prefixes that, with an unknown suffix, are almost certainly a misspelled or undeclared utility.
const UTILITY_PREFIX_RE = /^(?:-?(?:p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y|space-x|space-y|w|h|size|min-w|min-h|max-w|max-h|inset|top|right|bottom|left|z|order|basis|grow|shrink|rounded|rounded-[tlbr]{1,2}|rounded-[se][se]?|border|border-[xytrbl]|ring|ring-offset|outline|shadow|bg|text|font|leading|tracking|decoration|underline-offset|fill|stroke|opacity|blur|brightness|contrast|grayscale|saturate|scale|rotate|translate|skew|origin|duration|delay|ease|transition|animate|columns|aspect|cursor|select|resize|scroll|snap|list|accent|caret|placeholder|divide|from|via|to|indent|align|whitespace|break|hyphens|content|object|overflow|overscroll|float|clear|box|display|visible|invisible|flex|grid|col|row|auto-cols|auto-rows|justify|items|self|place|table|caption|touch|will-change|backdrop|mix-blend|bg-blend|isolation|line-clamp|truncate|sr-only|not-sr-only|forced-color-adjust|field-sizing|mask|perspective|transform|inline|block|hidden|static|fixed|absolute|relative|sticky|container|prose))(?:-|$)/;

function ancestors(dir) {
  const out = [];
  let d = path.resolve(dir);
  for (let i = 0; i < 8; i++) { out.push(d); const p = path.dirname(d); if (p === d) break; d = p; }
  return out;
}

function tryResolve(spec, paths) {
  try { return require.resolve(spec, { paths }); } catch (_) { return null; }
}

/** Locate the project's Tailwind engine. Returns { kind, version, nodeApi, coreApi, from } or null. */
function locateEngine(root) {
  // search order: the project and its ancestors → DESIGN_POLISH_TW (a directory whose node_modules holds Tailwind)
  // → this checkout's own dev dependencies (the repository; absent in the npm package) → the global npm root
  const paths = [...ancestors(root)];
  if (process.env.DESIGN_POLISH_TW) paths.push(process.env.DESIGN_POLISH_TW);
  paths.push(path.join(__dirname, '..', '..', '..', '..'));
  // pnpm nests @tailwindcss/node under the postcss/vite/cli package; realpath gets us there.
  const hosts = ['@tailwindcss/postcss', '@tailwindcss/vite', '@tailwindcss/cli'];
  for (const host of hosts) {
    const pkgJson = tryResolve(`${host}/package.json`, paths);
    if (pkgJson) paths.unshift(fs.realpathSync(path.dirname(pkgJson)));
  }
  let corePkg = tryResolve('tailwindcss/package.json', paths);
  if (!corePkg) {
    // last resort, only when nothing closer exists (spawning npm costs ~100 ms)
    try { const g = require('child_process').execFileSync('npm', ['root', '-g'], { encoding: 'utf8', timeout: 5000 }).trim(); if (g) { paths.push(path.dirname(g)); corePkg = tryResolve('tailwindcss/package.json', paths); } } catch (_) { /* no npm on PATH */ }
  }
  if (!corePkg) return null;
  const version = JSON.parse(fs.readFileSync(corePkg, 'utf8')).version || '0';
  const major = parseInt(version.split('.')[0], 10);
  if (major >= 4) {
    const nodeEntry = tryResolve('@tailwindcss/node', paths);
    let nodeApi = null;
    if (nodeEntry) { try { nodeApi = require(nodeEntry); } catch (_) { nodeApi = null; } }
    let coreApi = null;
    try { coreApi = require(path.dirname(corePkg)); } catch (_) { /* esm-only? */ }
    return { kind: 'tailwind4', version, nodeApi, coreApi, from: nodeEntry || path.dirname(corePkg), corePkgDir: path.dirname(corePkg) };
  }
  return { kind: 'tailwind3', version, from: path.dirname(corePkg), corePkgDir: path.dirname(corePkg) };
}

/** Scope key from a selector remainder + enclosing at-rules (hover, dark:hover, responsive:md ...). */
function scopeOf(rest, atRules, isDescendant) {
  const parts = new Set();
  let descendant = !!isDescendant;
  let r = rest || '';
  for (const at of atRules || []) {
    if (at.name !== 'media' && at.name !== 'container') continue;
    const p = at.params.replace(/\s+/g, ' ');
    if (/prefers-color-scheme:\s*dark/.test(p)) parts.add('dark');
    else if (/hover:\s*hover/.test(p)) { /* wrapper only */ }
    else if (at.name === 'container') parts.add('container');
    else {
      const m = /(?:width\s*>=\s*|min-width:\s*)([\d.]+(?:rem|px))/.exec(p);
      if (m) parts.add('responsive:' + (BREAKPOINTS[m[1]] || m[1]));
      else if (/max-width|width\s*</.test(p)) parts.add('responsive:max');
      else if (/prefers-reduced-motion/.test(p)) parts.add('motion');
      else if (/print/.test(p)) parts.add('print');
      else parts.add('media');
    }
  }
  if (/:is\(\.dark \*\)|^\.dark\s|\.dark\s+&|\[data-theme=["']?dark|:where\(\.dark/.test(r)) parts.add('dark');
  if (/\.group/.test(r)) parts.add('group');
  if (/\.peer/.test(r)) parts.add('peer');
  if (/:hover/.test(r)) parts.add('hover');
  if (/:focus-visible/.test(r)) parts.add('focus-visible');
  else if (/:focus-within/.test(r)) parts.add('focus-within');
  else if (/:focus/.test(r)) parts.add('focus');
  if (/:active/.test(r)) parts.add('active');
  if (/:disabled|\[disabled\]|\[data-disabled\]|:is\(\[disabled\]/.test(r)) parts.add('disabled');
  if (/\[data-state=["']?checked|:checked|\[aria-checked=["']?true/.test(r)) parts.add('checked');
  if (/\[data-state=["']?unchecked/.test(r)) parts.add('unchecked');
  if (/\[data-state=["']?open|\[aria-expanded=["']?true/.test(r)) parts.add('open');
  if (/\[data-state=["']?(?:on|active)|\[aria-pressed=["']?true|\[aria-selected=["']?true/.test(r)) parts.add('on');
  if (/\[aria-invalid/.test(r)) parts.add('invalid');
  if (/::placeholder|::-webkit-input-placeholder/.test(r)) parts.add('placeholder');
  if (/::file-selector-button/.test(r)) parts.add('file');
  if (/::before|::after|::marker|::selection|::backdrop|::first-line|::first-letter/.test(r)) parts.add('pseudo');
  if (/:has\(/.test(r)) parts.add('has');
  if (/:first-child|:last-child|:nth-|:only-child|:first-of-type|:last-of-type/.test(r)) parts.add('nth');
  if (/:visited|:target|:empty|:autofill|:read-only|:required|:optional|:in-range|:out-of-range|:invalid|:indeterminate|:placeholder-shown|:default|:enabled|:link/.test(r)) parts.add('state');
  // Descendant / child / sibling combinators mean the declaration styles another element.
  const withoutFns = r.replace(/:(?:is|where|not|has)\([^)]*\)/g, '');
  if (/[\s>+~]/.test(withoutFns.trim()) && !/^\s*$/.test(withoutFns)) descendant = true;
  if (/^:where\(|^\s*\*/.test(r)) descendant = true;
  if (descendant) parts.add('descendant');
  const order = ['dark', 'responsive', 'container', 'media', 'motion', 'print', 'group', 'peer', 'has', 'nth', 'state', 'hover', 'focus-visible', 'focus-within', 'focus', 'active', 'disabled', 'checked', 'unchecked', 'open', 'on', 'invalid', 'placeholder', 'file', 'pseudo', 'descendant'];
  const sorted = [...parts].sort((a, b) => order.findIndex((o) => a.startsWith(o)) - order.findIndex((o) => b.startsWith(o)));
  return sorted.length ? sorted.join(':') : 'base';
}

/** Group a parsed stylesheet's rules by class name and scope. */
function collectClassDecls(stylesheet, into, source) {
  for (const rule of stylesheet.rules) {
    for (const sel of rule.selectors) {
      const split = splitClassSelector(sel);
      if (!split) continue;
      const scope = scopeOf(split.rest, rule.atRules, split.descendant);
      if (!into.has(split.className)) into.set(split.className, { scopes: {}, source, selectors: [] });
      const entry = into.get(split.className);
      entry.scopes[scope] = entry.scopes[scope] || {};
      for (const d of rule.declarations) {
        if (d.prop.startsWith('--tw-') && !/^--tw-(shadow|ring-color|ring-offset|gradient)/.test(d.prop)) { entry.internal = true; continue; } // internal plumbing (animation/transform inputs)
        entry.scopes[scope][d.prop] = d.value + (d.important ? ' !important' : '');
      }
      entry.selectors.push(sel);
    }
  }
}

function looksLikeUtility(cls) {
  const base = cls.split(':').pop().replace(/^!/, '').replace(/\/[\w.]+$/, '');
  return UTILITY_PREFIX_RE.test(base) || /^\[.+\]$/.test(base) || /^-?[a-z]+-\[/.test(base);
}

/**
 * @param {string} root absolute project root
 * @param {{ cssEntry: string|null, cssFiles: Array<{rel, text}> }} opts
 */
function projectUsesTailwind(root, cssFiles) {
  if ((cssFiles || []).some((f) => /@import\s+["']tailwindcss|@tailwind\s+(base|utilities|components)|@config\s|@plugin\s/.test(f.text))) return true;
  try { const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')); return !!((pkg.dependencies || {}).tailwindcss || (pkg.devDependencies || {}).tailwindcss); } catch (_) { return false; }
}

async function create(root, opts = {}) {
  // A Tailwind engine is used only for a project that uses Tailwind; plain CSS stays plain even when an engine
  // happens to be reachable (an ancestor workspace, a global install).
  const engine = projectUsesTailwind(root, opts.cssFiles) ? locateEngine(root) : null;
  const bridge = { engine: 'none', version: null, from: null, entry: opts.cssEntry || null, error: null, executedConfig: false };
  const projectCss = new Map(); // class → decls from the project's own CSS (any engine)
  for (const f of opts.cssFiles || []) {
    try { collectClassDecls(parseCss(stripComments(f.text)), projectCss, f.rel); } catch (e) { /* tolerated: reported via coverage */ }
  }
  let entryText = null;
  let entryAbs = null;
  if (opts.cssEntry) {
    entryAbs = path.join(root, opts.cssEntry);
    try { entryText = fs.readFileSync(entryAbs, 'utf8'); } catch (_) { entryText = null; }
  }

  let compiler = null;
  let designSystem = null;
  let nodeApi = null;
  if (engine && engine.kind === 'tailwind4' && entryText) {
    nodeApi = engine.nodeApi;
    bridge.engine = 'tailwind4';
    bridge.version = engine.version;
    bridge.from = engine.from;
    const base = path.dirname(entryAbs);
    try {
      if (nodeApi && nodeApi.compile) {
        // When Tailwind is borrowed from elsewhere (no node_modules in the target), resolve `@import "tailwindcss"` to the engine we found.
        const customCssResolver = (id, from) => {
          if (id === 'tailwindcss') return path.join(engine.corePkgDir, 'index.css');
          if (id.startsWith('tailwindcss/')) { const f = path.join(engine.corePkgDir, id.slice('tailwindcss/'.length)); return fs.existsSync(f) ? f : fs.existsSync(f + '.css') ? f + '.css' : undefined; }
          return undefined;
        };
        const twOpts = { base, onDependency: () => {}, customCssResolver };
        compiler = await nodeApi.compile(entryText, twOpts);
        if (nodeApi.__unstable__loadDesignSystem) {
          try { designSystem = await nodeApi.__unstable__loadDesignSystem(entryText, twOpts); } catch (_) { designSystem = null; }
        }
      } else if (engine.coreApi && engine.coreApi.compile) {
        // Core API needs loaders for @import "tailwindcss" and friends.
        const loadStylesheet = async (id, from) => {
          let file;
          if (id === 'tailwindcss') file = path.join(engine.corePkgDir, 'index.css');
          else if (id.startsWith('tailwindcss/')) file = path.join(engine.corePkgDir, id.slice('tailwindcss/'.length));
          else file = path.resolve(from || base, id);
          if (!path.extname(file)) file += '.css';
          return { base: path.dirname(file), content: fs.readFileSync(file, 'utf8'), path: file };
        };
        const loadModule = async (id, from) => { bridge.executedConfig = true; const p = require.resolve(id, { paths: [from || base, root] }); return { base: path.dirname(p), module: require(p), path: p }; };
        compiler = await engine.coreApi.compile(entryText, { base, loadStylesheet, loadModule });
        if (engine.coreApi.__unstable__loadDesignSystem) { try { designSystem = await engine.coreApi.__unstable__loadDesignSystem(entryText, { base, loadStylesheet, loadModule }); } catch (_) { designSystem = null; } }
      } else {
        bridge.error = 'tailwind v4 found but no usable compile() export';
      }
    } catch (e) {
      bridge.error = `tailwind compile failed: ${e.message}`;
      compiler = null;
    }
  } else if (engine && engine.kind === 'tailwind3') {
    bridge.engine = 'tailwind3';
    bridge.version = engine.version;
    bridge.from = engine.from;
    bridge.error = 'Tailwind v3 resolution is not supported yet (planned for 1.1); classes are counted but not resolved to values';
  } else if ((opts.cssFiles || []).some((f) => /@import\s+["']tailwindcss|@tailwind\s+(base|utilities)|@config\s/.test(f.text))) {
    // A Tailwind stylesheet without a reachable engine: classes cannot be compiled. Say so instead of
    // pretending the project is plain CSS (which would call every utility "invalid").
    bridge.engine = 'none';
    bridge.error = 'Tailwind stylesheet found but no Tailwind engine: run `npm install` in the project (or pass DESIGN_POLISH_TW=<dir with node_modules/@tailwindcss/node>)';
  } else if (opts.cssFiles && opts.cssFiles.length) {
    bridge.engine = 'plain';
  }

  function optimizeCss(css) {
    if (nodeApi && nodeApi.optimize) {
      try { const r = nodeApi.optimize(css, { minify: false }); return typeof r === 'string' ? r : (r && r.code) || css; } catch (_) { return css; }
    }
    return css;
  }

  /** Full stylesheet for the given candidates (for specimens). */
  bridge.compile = function compile(candidates) {
    if (!compiler) return null;
    try { return optimizeCss(compiler.build([...new Set(candidates)].sort())); } catch (e) { bridge.error = bridge.error || `build failed: ${e.message}`; return null; }
  };

  /** Per-class declarations by scope. */
  bridge.resolve = function resolve(candidates) {
    const uniq = [...new Set(candidates)];
    const byClass = new Map();
    const unresolved = [];
    let generated = new Map();
    if (compiler) {
      if (designSystem && designSystem.candidatesToCss) {
        let cssList = null;
        try { cssList = designSystem.candidatesToCss(uniq); } catch (_) { cssList = null; }
        if (cssList) {
          uniq.forEach((cls, i) => {
            const css = cssList[i];
            if (!css) return;
            const tmp = new Map();
            try { collectClassDecls(parseCss(optimizeCss(css)), tmp, 'tailwind'); } catch (_) { return; }
            // The optimized output may escape differently; take whichever single class came back.
            const entry = tmp.get(cls) || [...tmp.values()][0];
            if (entry) generated.set(cls, entry);
          });
        }
      }
      // candidatesToCss skips utilities that need wrapper selectors (space-y, divide-y, arbitrary variants):
      // build those in one batch and split the output by class.
      const missing = uniq.filter((cls) => !generated.has(cls));
      if (missing.length) {
        const css = bridge.compile(missing);
        if (css) { try { const tmp = new Map(); collectClassDecls(parseCss(css), tmp, 'tailwind'); for (const [k, v] of tmp) if (!generated.has(k)) generated.set(k, v); } catch (_) { /* ignore */ } }
      }
    }
    for (const cls of uniq) {
      if (/^(group|peer)(\/[\w-]+)?$/.test(cls)) { byClass.set(cls, { scopes: {}, source: 'marker', selectors: [] }); continue; } // markers emit no CSS by design
      const fromTw = generated.get(cls);
      const fromProject = projectCss.get(cls) || projectCss.get(cls.split(':').pop());
      if (fromTw && (fromTw.internal || Object.values(fromTw.scopes).some((s) => Object.keys(s).length))) byClass.set(cls, { ...fromTw, source: 'tailwind' });
      else if (fromProject) byClass.set(cls, { ...fromProject, source: 'project-css' });
      else unresolved.push({ cls, reason: bridge.engine === 'none' ? 'no-engine' : (looksLikeUtility(cls) ? 'invalid-utility' : 'unknown-class') });
    }
    return { byClass, unresolved };
  };

  /** Theme variables: compiled defaults (for what the project uses) overlaid with the project's own declarations. */
  bridge.theme = function theme(candidates) {
    const { extractThemeVars } = require('./css-eval');
    const merged = { light: new Map(), dark: new Map(), darkStrategy: 'none', darkSelector: null, sources: [] };
    const css = compiler ? bridge.compile(candidates || []) : null;
    if (css) {
      try { const t = extractThemeVars(parseCss(css)); for (const [k, v] of t.light) merged.light.set(k, v); for (const [k, v] of t.dark) merged.dark.set(k, v); merged.darkStrategy = t.darkStrategy; merged.darkSelector = t.darkSelector; } catch (_) { /* ignore */ }
    }
    for (const f of opts.cssFiles || []) {
      try {
        const t = extractThemeVars(parseCss(stripComments(f.text)));
        for (const [k, v] of t.light) merged.light.set(k, v);
        for (const [k, v] of t.dark) merged.dark.set(k, v);
        if (t.darkStrategy !== 'none') { merged.darkStrategy = t.darkStrategy; merged.darkSelector = t.darkSelector; }
        merged.sources.push(...(t.sources || []).map((s) => ({ ...s, file: f.rel })));
      } catch (_) { /* ignore */ }
    }
    if (entryText && /@custom-variant\s+dark\s*\((.*)\)\s*;/.test(entryText)) { merged.darkStrategy = 'class'; merged.darkSelector = RegExp.$1.trim(); }
    return merged;
  };

  bridge.projectCss = projectCss;
  return bridge;
}

module.exports = { create, locateEngine, scopeOf, collectClassDecls, looksLikeUtility, BREAKPOINTS };
