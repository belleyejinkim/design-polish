'use strict';
// Builds the token inventory on five axes (color, typography, spacing, radius/border,
// shadow) from three sources: the project's declared CSS variables, the classes
// actually used in JSX (resolved to declarations by tw-bridge), and inline styles,
// CSS literals and JS color literals. Counts are rendered instances in code;
// "screens" come from route attribution. Near-duplicate colors are clustered with
// CIEDE2000. Tailwind's own scale (text-sm, rounded-full, gray-500) is "the system",
// never hardcoding; arbitrary values (text-[13px], bg-[#222]) are.

const color = require('./color');
const cssEval = require('./css-eval');
const { tokId, declaredTokId, clusterId } = require('./ids');

// CIEDE2000 ≤ 2.0: two colors a careful viewer can only tell apart side by side. 1.0 is the
// just-noticeable difference; below it we call the pair "indistinguishable".
const NEAR_DUP_DE = 2.0;
const TWIN_DE = 1.0;
// A cluster has a clear winner when the most-used member is used at least 3× as much as the rest combined.
const DOMINANCE_RATIO = 3;
// Spacing steps to try when the project has no --spacing base; a step fits when ≥ 75% of distinct values land on it.
const SPACING_STEPS = [8, 4, 2];
const SCALE_FIT = 0.75;
// Radius at or beyond this many px is "fully round" (Tailwind's rounded-full compiles to a huge length).
const FULL_RADIUS_PX = 999;

const COLOR_PROPS = new Set(['color', 'background-color', 'border-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline-color', 'fill', 'stroke', 'accent-color', 'caret-color', 'text-decoration-color', '--tw-ring-color', '--tw-ring-offset-color', '--tw-shadow-color', '--tw-gradient-from', '--tw-gradient-to', '--tw-gradient-via', 'background', 'border', 'outline']);
const ROLE_OF_PROP = { color: 'text', 'background-color': 'bg', background: 'bg', 'border-color': 'border', 'border-top-color': 'border', 'border-right-color': 'border', 'border-bottom-color': 'border', 'border-left-color': 'border', border: 'border', 'outline-color': 'outline', outline: 'outline', fill: 'fill', stroke: 'stroke', 'accent-color': 'accent', 'caret-color': 'text', 'text-decoration-color': 'text', '--tw-ring-color': 'ring', '--tw-ring-offset-color': 'ring', '--tw-shadow-color': 'shadow', '--tw-gradient-from': 'bg', '--tw-gradient-to': 'bg', '--tw-gradient-via': 'bg', js: 'js' };
// Spacing = padding and gaps: what sits between and inside things. Margins are placement and are excluded.
const SPACING_PROPS = new Set(['padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'padding-inline', 'padding-block', 'padding-inline-start', 'padding-inline-end', 'gap', 'row-gap', 'column-gap']);
const SEMANTIC_NAME_RE = /(destructive|error|danger|warn|warning|success|ok|info|muted|accent|secondary|foreground|background|border|input|ring|card|popover|sidebar|chart|surface|subtle|on-|link|focus|selected|disabled|placeholder|overlay|text|fg|bg)/i;
const BRAND_NAME_RE = /(brand|primary|accent)/i;
const DEFAULT_PALETTE_RE = /^--color-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}$|^--color-(?:black|white)$/;
const THEME_NS_RE = /^--(color|radius|shadow|inset-shadow|text|font|leading|tracking|font-weight|spacing|breakpoint|container|ease|animate|blur|perspective|aspect|drop-shadow|text-shadow)(-|$)/;
const HARD_WHERE = new Set(['class-arbitrary', 'inline-style', 'css-literal', 'js-literal']);

function axisOfVar(name, value) {
  if (/^--(color|colors)-/.test(name)) return 'color';
  if (/^--(radius)/.test(name)) return 'radius';
  if (/^--(shadow|inset-shadow|drop-shadow)/.test(name)) return 'shadow';
  if (/^--(text|font|leading|tracking|font-weight)-/.test(name) || name === '--font-sans' || name === '--font-mono') return 'typography';
  if (/^--(spacing|space|gap|padding)/.test(name)) return 'spacing';
  if (/^--(border-width|border)/.test(name)) return 'border';
  if (/^--(breakpoint|container|ease|animate|blur|perspective|aspect|default|tw-|font-feature|font-variation|z-|duration)/.test(name)) return null;
  const v = String(value || '').trim();
  if (color.parse(v)) return 'color';
  if (/radius|rounded/i.test(name)) return 'radius';
  if (/shadow/i.test(name)) return 'shadow';
  if (/(^|-)(space|gap|pad|inset)/i.test(name)) return 'spacing';
  if (/font|text|leading|tracking/i.test(name)) return 'typography';
  return null;
}

function resolveValue(value, theme, mode) {
  const vars = mode === 'dark' ? new Map([...theme.light, ...theme.dark]) : theme.light;
  return cssEval.resolveVars(value, vars);
}

function newValueEntry(axis, id, value) {
  return { id, axis, value, normalized: null, count: 0, hardcodedCount: 0, ownHardcodedCount: 0, vendoredCount: 0, whereCounts: {}, files: new Set(), routes: new Set(), sites: [], where: new Set(), roles: {}, viaTokens: new Set() };
}

/** Declared tokens with alias resolution: `--color-primary: var(--primary)` is one logical token named --color-primary. */
// The shadcn/ui base set: declared by `shadcn init` for every project, often unused until a component needs them.
// Unused members are reported, but never proposed for deletion (a later `shadcn add` expects them).
const SHADCN_SET_RE = /^--(?:color-)?(?:background|foreground|card(?:-foreground)?|popover(?:-foreground)?|primary(?:-foreground)?|secondary(?:-foreground)?|muted(?:-foreground)?|accent(?:-foreground)?|destructive(?:-foreground)?|border|input|ring|chart-[1-5]|sidebar(?:-[\w-]+)?|radius(?:-(?:sm|md|lg|xl|2xl|3xl|4xl))?)$/;

function buildDeclared(theme, opts = {}) {
  const projectNames = new Set((theme.sources || []).map((s) => s.name));
  const aliasTarget = (name) => { const v = theme.light.get(name) ?? theme.dark.get(name); const m = v && /^var\((--[\w-]+)\)$/.exec(String(v).trim()); return m ? m[1] : null; };
  const aliasedBy = new Map(); // raw var -> theme name that aliases it
  for (const name of theme.light.keys()) { if (!THEME_NS_RE.test(name)) continue; const t = aliasTarget(name); if (t) aliasedBy.set(t, name); }
  const declared = [];
  const byName = new Map();
  const all = new Set([...theme.light.keys(), ...theme.dark.keys()]);
  for (const name of all) {
    if (aliasedBy.has(name)) continue; // represented by its theme alias
    const rawVar = aliasTarget(name);
    const light = theme.light.has(name) ? resolveValue(theme.light.get(name), theme, 'light') : null;
    const darkRaw = theme.dark.has(name) ? theme.dark.get(name) : (rawVar && theme.dark.has(rawVar) ? theme.dark.get(rawVar) : null);
    const dark = darkRaw != null ? resolveValue(darkRaw, theme, 'dark') : null;
    const axis = axisOfVar(name, light ?? dark);
    if (!axis) continue;
    const isProject = projectNames.has(name) || (rawVar && projectNames.has(rawVar));
    const entry = {
      id: declaredTokId(axis, name), axis, name, rawVar, light, dark, rawLight: theme.light.get(name) ?? null, rawDark: darkRaw,
      source: isProject ? 'project' : (DEFAULT_PALETTE_RE.test(name) || !isProject ? 'tailwind-default' : 'project'),
      refs: { classes: 0, vars: 0, total: 0 }, darkMissing: false, role: null, roleBasis: null, hex: null, darkHex: null, srgb: null, alpha: 1,
      librarySet: !!(opts.shadcn && (SHADCN_SET_RE.test(name) || (rawVar && SHADCN_SET_RE.test(rawVar)))),
    };
    if (axis === 'color') {
      const c = light ? color.parse(light) : null;
      const d = dark ? color.parse(dark) : null;
      entry.hex = c ? color.toHex(c) : null; entry.darkHex = d ? color.toHex(d) : null; entry.srgb = c ? [c.r, c.g, c.b] : null; entry.alpha = c ? c.a : 1;
      entry.darkSrgb = d ? [d.r, d.g, d.b] : null;
      // A token whose dark value differs noticeably is mode-varying: mapping a constant onto it changes dark mode.
      entry.modeVarying = !!(c && d && color.deltaE2000(color.toLab(c), color.toLab(d)) >= NEAR_DUP_DE);
      if (c && color.isAchromatic(c)) { entry.role = 'neutral'; entry.roleBasis = 'achromatic'; }
      else if (BRAND_NAME_RE.test(name)) { entry.role = 'brand'; entry.roleBasis = 'name'; }
      else if (SEMANTIC_NAME_RE.test(name)) { entry.role = 'semantic'; entry.roleBasis = 'name'; }
      else { entry.role = 'unclassified'; entry.roleBasis = null; }
      if (theme.darkStrategy !== 'none' && entry.source === 'project' && light != null && dark == null) entry.darkMissing = true;
    }
    declared.push(entry);
    byName.set(name, entry);
    if (rawVar) byName.set(rawVar, entry);
  }
  return { declared, byName, projectNames };
}

function isOnSpacingScale(px, basePx) {
  if (!basePx) return null;
  const n = px / basePx;
  const near = (x) => Math.abs(x - Math.round(x)) < 1e-6;
  if (near(n)) return true;
  if (n < 4 && near(n * 2)) return true; // Tailwind's half steps: 0.5 1.5 2.5 3.5
  return false;
}

/**
 * @param {object} input
 *   tokenStats: Map<cls, { count, sites: [{file,line,col,routes}] }>
 *   resolved:   Map<cls, { scopes, source }>
 *   theme:      { light: Map, dark: Map, darkStrategy, sources }
 *   cssLiterals: [{ file, line, prop, value, selector }]
 *   inlineStyles: [{ file, line, prop, value, routes }]
 *   jsLiterals:  [{ file, line, value, context, routes }]
 *   fileRoutes:  Map<rel, {routes, layouts}>
 */
function inventory(input) {
  const { tokenStats, resolved, theme } = input;
  const isVendored = input.isVendored || (() => false);
  const routesOf = (file) => { const fr = input.fileRoutes && input.fileRoutes.get(file); return fr ? fr.routes : []; };
  const { declared, byName } = buildDeclared(theme, { shadcn: !!input.shadcn });
  const values = { color: new Map(), typography: new Map(), spacing: new Map(), radius: new Map(), border: new Map(), shadow: new Map() };
  const fontSizes = new Map(), fontWeights = new Map(), lineHeights = new Map(), fontFamilies = new Map(), letterSpacings = new Map();
  const paletteUse = new Map();
  const axes = { color: { onToken: 0, hardcoded: 0, palette: 0 }, typography: { onToken: 0, hardcoded: 0 }, spacing: { onScale: 0, offScale: 0 }, radius: { onToken: 0, hardcoded: 0 }, shadow: { onToken: 0, hardcoded: 0 } };
  const spacingBase = theme.light.has('--spacing') ? cssEval.toPx(resolveValue(theme.light.get('--spacing'), theme, 'light')) : null;
  const spacingValues = new Map();

  const varsIn = (text) => [...String(text).matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]);
  // `@theme inline` bakes token values into utilities, so `rounded-md` never mentions --radius-md in CSS.
  // Recover the reference from the utility name (Tailwind v4 namespaces).
  const themeVarsForClass = (cls) => {
    const base = cls.split(':').pop().replace(/^!/, '').replace(/^-/, '').replace(/\/[\w.]+$/, '');
    const out = [];
    let m;
    if ((m = /^rounded(?:-[tlbrse]{1,2})?-([\w-]+)$/.exec(base)) && !/^\[/.test(m[1])) out.push(`--radius-${m[1]}`);
    if ((m = /^(?:bg|text|border|ring|fill|stroke|accent|caret|outline|decoration|from|via|to|shadow|inset-shadow|ring-offset|divide|placeholder)-([\w-]+)$/.exec(base)) && !/^\[/.test(m[1])) { out.push(`--color-${m[1]}`); }
    if ((m = /^text-([\w-]+)$/.exec(base)) && !/^\[/.test(m[1])) out.push(`--text-${m[1]}`);
    if ((m = /^font-([\w-]+)$/.exec(base)) && !/^\[/.test(m[1])) { out.push(`--font-${m[1]}`); out.push(`--font-weight-${m[1]}`); }
    if ((m = /^shadow-([\w-]+)$/.exec(base)) && !/^\[/.test(m[1])) out.push(`--shadow-${m[1]}`);
    if ((m = /^leading-([\w-]+)$/.exec(base)) && !/^\[/.test(m[1])) out.push(`--leading-${m[1]}`);
    if ((m = /^tracking-([\w-]+)$/.exec(base)) && !/^\[/.test(m[1])) out.push(`--tracking-${m[1]}`);
    return out;
  };
  const countRefs = (text, count, kind) => { for (const v of varsIn(text)) { const d = byName.get(v); if (d) { d.refs[kind] += count; d.refs.total += count; } } };
  const classifyWhere = (cls, raw, isArbitrary, origin) => {
    if (origin) return origin; // inline-style, css-literal, js-literal
    const vars = varsIn(raw);
    const projectVar = vars.some((v) => { const d = byName.get(v); return d && d.source === 'project'; });
    if (isArbitrary && !projectVar) return 'class-arbitrary';
    if (projectVar) return 'token';
    if (vars.some((v) => DEFAULT_PALETTE_RE.test(v))) return 'palette';
    return 'scale';
  };
  const record = (axis, rawValue, resolvedValue, prop, site, count, where, viaVars, allSites) => {
    const map = values[axis];
    let norm, display = resolvedValue;
    if (axis === 'color') {
      const c = color.parse(resolvedValue);
      if (!c || c.a === 0) return false;
      norm = color.toHex(c); display = norm;
    } else if (axis === 'shadow') { norm = cssEval.normalizeValue('box-shadow', resolvedValue); display = norm; }
    else {
      const px = cssEval.toPx(resolvedValue);
      if (px == null) return false;
      norm = (axis === 'radius' && px >= FULL_RADIUS_PX) || px === Infinity ? 'full' : String(Math.round(px * 100) / 100);
      display = norm;
    }
    const id = tokId(axis, norm);
    if (!map.has(id)) map.set(id, newValueEntry(axis, id, display));
    const e = map.get(id);
    e.normalized = norm;
    e.where.add(where);
    const role = ROLE_OF_PROP[prop] || prop;
    e.roles[role] = (e.roles[role] || 0) + count;
    e.count += count;
    e.whereCounts[where] = (e.whereCounts[where] || 0) + count;
    if (HARD_WHERE.has(where)) {
      e.hardcodedCount = (e.hardcodedCount || 0) + count;
      // raw values inside vendored library files are the library's choice, not the project's drift
      const vend = site.vendoredCount != null ? site.vendoredCount : (isVendored(site.file) ? count : 0);
      e.vendoredCount = (e.vendoredCount || 0) + vend;
      e.ownHardcodedCount = (e.ownHardcodedCount || 0) + (count - vend);
    }
    e.files.add(site.file);
    for (const r of site.routes || []) e.routes.add(r);
    for (const v of viaVars || []) { const d = byName.get(v); if (d) e.viaTokens.add(d.id); }
    const list = allSites && allSites.length ? allSites : [site];
    for (const st of list) { if (e.sites.length >= 200) break; e.sites.push({ file: st.file, line: st.line, col: st.col, cls: st.cls || null, origin: st.origin || null, raw: String(rawValue).slice(0, 80), prop, where, conditional: st.conditional || undefined }); }
    return true;
  };

  // ---- classes ----
  for (const [cls, stat] of tokenStats) {
    const entry = resolved.get(cls);
    if (!entry) continue;
    const isArbitrary = /\[[^\]]+\]/.test(cls) || /\((--[\w-]+)\)/.test(cls);
    const firstSite = stat.sites[0] || { file: '?', line: 0 };
    const site = { file: firstSite.file, line: firstSite.line, vendoredCount: stat.vendoredCount || 0, routes: [...new Set(stat.sites.flatMap((s) => s.routes || []))] };
    const clsSites = stat.sites.map((st) => ({ file: st.file, line: st.line, col: st.col, cls, conditional: st.conditional, origin: st.origin || null }));
    for (const v of themeVarsForClass(cls)) { const d = byName.get(v); if (d && d.source === 'project' && !varsIn(JSON.stringify(entry.scopes)).includes(v)) { d.refs.classes += stat.count; d.refs.total += stat.count; } }
    const isSpaceBetween = /^(?:[\w\[\]&:-]*:)?space-[xy]-/.test(cls); // margins between children act as a gap
    for (const [scope, decls] of Object.entries(entry.scopes)) {
      if (scope.includes('descendant') && !isSpaceBetween) continue;
      const mode = scope.includes('dark') ? 'dark' : 'light';
      for (const [prop, raw] of Object.entries(decls)) {
        const rv = resolveValue(raw, theme, mode);
        countRefs(raw, stat.count, 'classes');
        const vars = varsIn(raw);
        const where = classifyWhere(cls, raw, isArbitrary, null);
        if (COLOR_PROPS.has(prop)) {
          if (cssEval.hasUnresolved(rv) || /^(transparent|currentcolor|inherit|initial)$/i.test(rv)) continue;
          if (!record('color', raw, rv, prop, site, stat.count, where, vars, clsSites)) continue;
          if (mode === 'light') {
            if (where === 'token') axes.color.onToken += stat.count;
            else if (where === 'palette' || where === 'scale') { axes.color.palette += stat.count; for (const v of vars) if (DEFAULT_PALETTE_RE.test(v)) paletteUse.set(v, (paletteUse.get(v) || 0) + stat.count); }
            else axes.color.hardcoded += stat.count;
          }
        } else if (prop === 'font-size') {
          const px = cssEval.toPx(rv); if (px == null) continue;
          fontSizes.set(px, (fontSizes.get(px) || 0) + stat.count);
          if (where === 'class-arbitrary') axes.typography.hardcoded += stat.count; else axes.typography.onToken += stat.count;
          record('typography', raw, rv, prop, site, stat.count, where, vars, clsSites);
        } else if (prop === 'font-weight') { const w = cssEval.hasUnresolved(rv) ? raw : rv; fontWeights.set(String(w), (fontWeights.get(String(w)) || 0) + stat.count); }
        else if (prop === 'line-height') { if (!cssEval.hasUnresolved(rv)) lineHeights.set(String(rv), (lineHeights.get(String(rv)) || 0) + stat.count); }
        else if (prop === 'letter-spacing') { if (!cssEval.hasUnresolved(rv)) letterSpacings.set(String(rv), (letterSpacings.get(String(rv)) || 0) + stat.count); }
        else if (prop === 'font-family') { fontFamilies.set(String(rv).slice(0, 80), (fontFamilies.get(String(rv).slice(0, 80)) || 0) + stat.count); }
        else if (SPACING_PROPS.has(prop) || (isSpaceBetween && /^margin-(block|inline)-(start|end)$/.test(prop) && !/1 - var/.test(raw))) {
          const px = cssEval.toPx(rv.replace(/\* var\(--tw-space-[xy]-reverse\)/, '* 0').replace(/calc\(1 - 0\)/, '1')); if (px == null || px < 0) continue;
          if (isSpaceBetween && px === 0) continue;
          spacingValues.set(px, (spacingValues.get(px) || 0) + stat.count);
          record('spacing', raw, rv, isSpaceBetween ? 'gap' : prop, site, stat.count, where, vars, clsSites);
        } else if (/^border(-[a-z-]+)?-radius$/.test(prop)) {
          if (!record('radius', raw, rv, prop, site, stat.count, where, vars, clsSites)) continue;
          if (mode === 'light') { if (where === 'class-arbitrary') axes.radius.hardcoded += stat.count; else axes.radius.onToken += stat.count; }
        } else if (/^border(-[a-z-]+)?-width$/.test(prop)) {
          record('border', raw, rv, prop, site, stat.count, where, vars, clsSites);
        } else if (prop === '--tw-shadow' || (prop === 'box-shadow' && !/var\(--tw-/.test(raw))) {
          if (/^(none|0 0 #0000)/.test(rv) || cssEval.hasUnresolved(rv)) continue;
          if (!record('shadow', raw, rv, 'box-shadow', site, stat.count, where, vars, clsSites)) continue;
          if (mode === 'light') { if (where === 'class-arbitrary') axes.shadow.hardcoded += stat.count; else axes.shadow.onToken += stat.count; }
        }
      }
    }
  }

  // ---- inline styles, CSS literals, JS literals ----
  for (const s of input.inlineStyles || []) {
    const prop = s.prop.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
    const v = String(s.value);
    const site = { file: s.file, line: s.line, routes: s.routes };
    if (COLOR_PROPS.has(prop) || /color/i.test(prop)) { if (record('color', v, v, s.prop, site, 1, 'inline-style')) axes.color.hardcoded += 1; }
    else if (prop === 'font-size') { const px = cssEval.toPx(v); if (px != null) { fontSizes.set(px, (fontSizes.get(px) || 0) + 1); axes.typography.hardcoded += 1; record('typography', v, v, prop, site, 1, 'inline-style'); } }
    else if (SPACING_PROPS.has(prop)) { const px = cssEval.toPx(v); if (px != null && px >= 0) { spacingValues.set(px, (spacingValues.get(px) || 0) + 1); record('spacing', v, v, prop, site, 1, 'inline-style'); } }
    else if (prop === 'border-radius') { if (record('radius', v, v, prop, site, 1, 'inline-style')) axes.radius.hardcoded += 1; }
    else if (prop === 'box-shadow') { if (record('shadow', v, v, prop, site, 1, 'inline-style')) axes.shadow.hardcoded += 1; }
  }
  for (const l of input.cssLiterals || []) {
    const prop = l.prop, raw = l.value;
    if (/var\(/.test(raw)) countRefs(raw, 1, 'vars');
    const rv = resolveValue(raw, theme, 'light');
    if (cssEval.hasUnresolved(rv)) continue;
    const site = { file: l.file, line: l.line, routes: routesOf(l.file) };
    const isVar = /var\(/.test(raw);
    const where = isVar ? 'token' : 'css-literal';
    if (COLOR_PROPS.has(prop)) { if (!isVar && record('color', raw, rv, prop, site, 1, 'css-literal')) axes.color.hardcoded += 1; }
    else if (prop === 'font-size') { const px = cssEval.toPx(rv); if (px != null) { fontSizes.set(px, (fontSizes.get(px) || 0) + 1); record('typography', raw, rv, prop, site, 1, where); if (isVar) axes.typography.onToken += 1; else axes.typography.hardcoded += 1; } }
    else if (SPACING_PROPS.has(prop)) { const px = cssEval.toPx(rv); if (px != null && px >= 0) { spacingValues.set(px, (spacingValues.get(px) || 0) + 1); record('spacing', raw, rv, prop, site, 1, where); } }
    else if (prop === 'border-radius') { if (record('radius', raw, rv, prop, site, 1, where)) { if (isVar) axes.radius.onToken += 1; else axes.radius.hardcoded += 1; } }
    else if (prop === 'box-shadow') { if (record('shadow', raw, rv, prop, site, 1, where)) { if (isVar) axes.shadow.onToken += 1; else axes.shadow.hardcoded += 1; } }
  }
  for (const j of input.jsLiterals || []) {
    if (record('color', j.value, j.value, 'js', { file: j.file, line: j.line, routes: j.routes }, 1, 'js-literal')) axes.color.hardcoded += 1;
  }

  // ---- colors: twins and clusters ----
  const HARD = new Set(['class-arbitrary', 'inline-style', 'css-literal', 'js-literal']);
  const colorList = [...values.color.values()];
  const projectColorTokens = declared.filter((d) => d.axis === 'color' && d.source === 'project' && d.srgb && d.alpha >= 0.99);
  for (const e of colorList) {
    const c = color.parse(e.value);
    e.srgb = c ? [c.r, c.g, c.b] : null; e.lab = c ? color.toLab(c) : null; e.alpha = c ? c.a : null; e.achromatic = c ? color.isAchromatic(c) : false;
    e.hardcoded = [...e.where].some((w) => HARD.has(w));
    e.twinOf = null;
    if (!e.hardcoded || !e.lab) continue;
    // Prefer tokens that look the same in both modes; a mode-varying twin is still reported but flagged.
    let best = null;
    for (const d of projectColorTokens) { const de = color.deltaE2000(e.lab, color.toLab({ r: d.srgb[0], g: d.srgb[1], b: d.srgb[2] })); if (de < TWIN_DE && (!best || (best.modeVarying && !d.modeVarying) || (best.modeVarying === !!d.modeVarying && de < best.de))) best = { id: d.id, de, modeVarying: !!d.modeVarying }; }
    if (best) { e.twinOf = best.id; e.twinModeVarying = best.modeVarying; }
  }
  const clusters = clusterColors(colorList, projectColorTokens);

  // ---- typography, spacing scale ----
  const distinctSizes = [...fontSizes.keys()].sort((a, b) => a - b);
  const spacingSorted = [...spacingValues.keys()].filter((v) => v > 0 && isFinite(v)).sort((a, b) => a - b);
  let dominantStep = null, scaleBasis = null;
  if (spacingBase) { dominantStep = spacingBase; scaleBasis = '--spacing'; }
  else for (const step of SPACING_STEPS) { const fit = spacingSorted.filter((v) => Math.abs(v / step - Math.round(v / step)) < 1e-6).length / (spacingSorted.length || 1); if (spacingSorted.length && fit >= SCALE_FIT) { dominantStep = step; scaleBasis = 'inferred'; break; } }
  const onScale = (px) => (scaleBasis === '--spacing' ? isOnSpacingScale(px, spacingBase) : dominantStep ? Math.abs(px / dominantStep - Math.round(px / dominantStep)) < 1e-6 : true);
  const offScale = spacingSorted.filter((v) => !onScale(v));
  for (const [px, n] of spacingValues) { if (offScale.includes(px)) axes.spacing.offScale += n; else axes.spacing.onScale += n; }

  const finalize = (m) => [...m.values()].map((e) => ({ ...e, files: [...e.files].sort(), routes: [...e.routes].sort(), where: [...e.where].sort(), viaTokens: [...e.viaTokens].sort(), fileCount: e.files.size, tokenDriven: ![...e.where].some((w) => HARD.has(w)) })).sort((a, b) => b.count - a.count || (a.id < b.id ? -1 : 1));
  const score = (ok, off) => (ok + off === 0 ? null : Math.round((ok / (ok + off)) * 1000) / 10);
  // Raw values written inside vendored library files are the library's choice (shadcn's `rounded-[4px]` checkbox):
  // they stay in the inventory but do not count against the project's consistency.
  for (const [axis, m] of Object.entries(values)) {
    const key = axis === 'shadow' ? 'shadow' : axis === 'border' ? null : axis;
    if (!key || !axes[key]) continue;
    let vend = 0; for (const e of m.values()) vend += e.vendoredCount || 0;
    axes[key].hardcodedVendored = vend;
    axes[key].hardcodedOwn = Math.max(0, (axes[key].hardcoded || 0) - vend);
  }
  const scores = {
    color: score(axes.color.onToken + axes.color.palette + axes.color.hardcodedVendored, axes.color.hardcodedOwn), // palette use is the Tailwind scale: legal, reported separately
    typography: score(axes.typography.onToken + axes.typography.hardcodedVendored, axes.typography.hardcodedOwn),
    spacing: score(axes.spacing.onScale, axes.spacing.offScale),
    radius: score(axes.radius.onToken + axes.radius.hardcodedVendored, axes.radius.hardcodedOwn),
    shadow: score(axes.shadow.onToken + axes.shadow.hardcodedVendored, axes.shadow.hardcodedOwn),
  };

  return {
    declared: declared.sort((a, b) => (a.axis === b.axis ? (a.name < b.name ? -1 : 1) : a.axis < b.axis ? -1 : 1)),
    colors: { values: finalize(values.color), clusters, palette: [...paletteUse.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count), perTheme: { light: { unique: colorList.filter((e) => (e.alpha == null || e.alpha >= 0.99)).length, achromatic: colorList.filter((e) => e.achromatic && (e.alpha == null || e.alpha >= 0.99)).length } } },
    typography: { values: finalize(values.typography), fontSizes: distinctSizes.map((px) => ({ px, count: fontSizes.get(px) })), fontWeights: [...fontWeights.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count), lineHeights: [...lineHeights.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count), letterSpacings: [...letterSpacings.entries()].map(([value, count]) => ({ value, count })), fontFamilies: [...fontFamilies.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count) },
    spacing: { values: finalize(values.spacing), sorted: spacingSorted, dominantStep, scaleBasis, basePx: spacingBase, offScale },
    radius: { values: finalize(values.radius) },
    border: { values: finalize(values.border) },
    shadows: { values: finalize(values.shadow) },
    axes, scores,
  };
}

function clusterColors(colorEntries, projectTokens) {
  // Clusters describe drift: values that should have been a token. Each project token is an anchor;
  // hardcoded and palette values within ΔE 2.0 of it belong to that anchor's cluster (nearest anchor
  // wins). Hardcoded values near no token cluster among themselves. Tokens never cluster with tokens.
  const opaque = (e) => e.lab && (e.alpha == null || e.alpha >= 0.99);
  const loose = colorEntries.filter((e) => opaque(e) && (e.hardcoded || [...e.where].includes('palette'))).map((e) => ({ id: e.id, lab: e.lab, count: e.hardcodedCount || e.count, achromatic: e.achromatic, kind: e.hardcoded ? 'hardcoded' : 'palette' }));
  const anchors = projectTokens.map((d) => ({ id: d.id, lab: color.toLab({ r: d.srgb[0], g: d.srgb[1], b: d.srgb[2] }), darkLab: d.darkSrgb ? color.toLab({ r: d.darkSrgb[0], g: d.darkSrgb[1], b: d.darkSrgb[2] }) : null, modeVarying: !!d.modeVarying, count: d.refs.total, achromatic: color.isAchromatic({ r: d.srgb[0], g: d.srgb[1], b: d.srgb[2] }), kind: 'token' }));
  const byAnchor = new Map();
  const unanchored = [];
  for (const v of loose) {
    let best = null;
    // nearest anchor wins; among equally near anchors a mode-invariant one beats a mode-varying one
    for (const a of anchors) { const de = color.deltaE2000(v.lab, a.lab); if (de <= NEAR_DUP_DE && (!best || (best.a.modeVarying && !a.modeVarying && de <= best.de + 0.5) || (best.a.modeVarying === a.modeVarying && (de < best.de || (de === best.de && a.count > best.a.count))))) best = { a, de }; }
    if (best) { if (!byAnchor.has(best.a.id)) byAnchor.set(best.a.id, { anchor: best.a, members: [] }); byAnchor.get(best.a.id).members.push({ ...v, de: best.de, deDark: best.a.darkLab ? Math.round(color.deltaE2000(v.lab, best.a.darkLab) * 100) / 100 : null }); }
    else unanchored.push(v);
  }
  const out = [];
  for (const { anchor, members } of byAnchor.values()) {
    // Tokens that share the anchor's value are listed as aliases so the user can pick the right role.
    const aliases = anchors.filter((a) => a.id !== anchor.id && color.deltaE2000(a.lab, anchor.lab) < TWIN_DE).map((a) => a.id);
    const all = [anchor, ...members.sort((x, y) => y.count - x.count)];
    const maxDe = Math.max(...members.map((m) => m.de));
    const maxDeDark = anchor.modeVarying ? Math.max(...members.map((m) => m.deDark || 0)) : null;
    out.push({ id: clusterId('color', all.map((m) => m.id)), axis: 'color', members: all.map((m) => m.id), kinds: [...new Set(all.map((m) => m.kind))].sort(), maxDeltaE: Math.round(maxDe * 100) / 100, maxDeltaEDark: maxDeDark, anchorModeVarying: anchor.modeVarying, indistinguishable: maxDe < TWIN_DE, achromatic: all.every((m) => m.achromatic), dominant: anchor.id, aliases, needsUserConfirmation: anchor.modeVarying });
  }
  // hardcoded values near no token: single-linkage among themselves (palette values are the scale and are not linked here)
  const hard = unanchored.filter((v) => v.kind === 'hardcoded');
  const parent = hard.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < hard.length; i++) for (let j = i + 1; j < hard.length; j++) if (color.deltaE2000(hard[i].lab, hard[j].lab) <= NEAR_DUP_DE) parent[find(i)] = find(j);
  const groups = new Map();
  hard.forEach((it, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(it); });
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    let maxDe = 0;
    for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) maxDe = Math.max(maxDe, color.deltaE2000(members[i].lab, members[j].lab));
    const sorted = [...members].sort((a, b) => b.count - a.count);
    const top = sorted[0], rest = sorted.slice(1).reduce((s, m) => s + m.count, 0);
    const dominant = top.count > 0 && top.count >= DOMINANCE_RATIO * Math.max(rest, 1) ? top.id : null;
    out.push({ id: clusterId('color', sorted.map((m) => m.id)), axis: 'color', members: sorted.map((m) => m.id), kinds: ['hardcoded'], maxDeltaE: Math.round(maxDe * 100) / 100, indistinguishable: maxDe < TWIN_DE, achromatic: members.every((m) => m.achromatic), dominant, aliases: [], needsUserConfirmation: !dominant });
  }
  return out.sort((a, b) => b.members.length - a.members.length || (a.id < b.id ? -1 : 1));
}

module.exports = { inventory, clusterColors, axisOfVar, buildDeclared, isOnSpacingScale, SHADCN_SET_RE, NEAR_DUP_DE, TWIN_DE, DOMINANCE_RATIO, SPACING_STEPS, SCALE_FIT, COLOR_PROPS, SPACING_PROPS, DEFAULT_PALETTE_RE };
