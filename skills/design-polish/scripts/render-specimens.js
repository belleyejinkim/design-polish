#!/usr/bin/env node
'use strict';
// design-polish render-specimens: real-size specimens for every look.
//
//   design-polish specimens <run-dir>
//
// Compiles the project's own CSS for every class the inventory saw (Tailwind v4 via the
// project's engine, plain CSS by concatenation), adds state-simulation rules
// (:hover → [data-sim~="hover"] …) and writes one HTML snippet per signature built from
// the component's real markup sketch and real classes. Nothing is imitated: when the CSS
// cannot be compiled the specimen is marked as unavailable.

const fs = require('fs');
const path = require('path');
const files = require('./lib/files');
const twBridge = require('./lib/tw-bridge');
const cssParse = require('./lib/css-parse');

// Web fonts larger than this are not embedded (the report must stay a light single file).
const MAX_FONT_BYTES = 3 * 1024 * 1024;
const DEFAULT_LABELS = { en: { button: 'Button', checkbox: '', radio: '', toggle: '', select: 'Select an option', textarea: 'Write here…', 'text-field': 'Type here…', badge: 'Badge', tag: 'Tag', chip: 'Chip', 'dropdown-menu': 'Item' }, ko: { button: '버튼', checkbox: '', radio: '', toggle: '', select: '옵션 선택', textarea: '내용을 입력하세요', 'text-field': '입력', badge: '배지', tag: '태그', chip: '칩', 'dropdown-menu': '항목' } };
const ICONS = { check: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>', chevron: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>', x: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>', circle: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="12" cy="12" r="5"/></svg>', dot: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="12" cy="12" r="3"/></svg>', generic: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>' };

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function attrStr(attrs) { return Object.entries(attrs || {}).filter(([k]) => !['disabled', 'checked'].includes(k)).map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${esc(v)}"`)).join(''); }
function iconFor(name) {
  const n = String(name || '').toLowerCase();
  if (/check/.test(n)) return ICONS.check;
  if (/chevron|caret|arrow/.test(n)) return ICONS.chevron;
  if (/^x$|xicon|close/.test(n)) return ICONS.x;
  if (/circle|dot/.test(n)) return ICONS.circle;
  return ICONS.generic;
}

/** Rewrite interactive pseudo-classes into attribute selectors so a static specimen can show them. */
function stateCssFrom(css) {
  let sheet;
  try { sheet = cssParse.parse(css); } catch (_) { return ''; }
  const out = [];
  for (const rule of sheet.rules) {
    if (!/:(hover|focus-visible|active|focus)(?![\w-])/.test(rule.selector)) continue;
    const sels = rule.selectors.map((s) => s.replace(/:hover(?![\w-])/g, '[data-sim~="hover"]').replace(/:focus-visible(?![\w-])/g, '[data-sim~="focus-visible"]').replace(/:focus-within(?![\w-])/g, '[data-sim~="focus-visible"]').replace(/:focus(?![\w-])/g, '[data-sim~="focus-visible"]').replace(/:active(?![\w-])/g, '[data-sim~="active"]'));
    const at = rule.atRules.filter((a) => !(a.name === 'media' && /hover:\s*hover/.test(a.params)));
    const open = at.map((a) => `@${a.name} ${a.params}{`).join('');
    const close = at.map(() => '}').join('');
    out.push(`${open}${sels.join(',')}{${rule.declarations.map((d) => `${d.prop}:${d.value}${d.important ? ' !important' : ''}`).join(';')}}${close}`);
  }
  return out.join('\n');
}

/** Build markup for a signature from its skeleton (when the implementation has one) or a plain skeleton. */
function specimenHtml(sig, impl, lang) {
  const labels = DEFAULT_LABELS[lang] || DEFAULT_LABELS.en;
  const label = (sig.labels && sig.labels[0]) || labels[sig.type] || '';
  const classes = sig.spelling || '';
  const type = sig.type;
  const tag = sig.tag || 'div';
  const attrs = { ...(sig.attrs || {}) };
  const renderSkeleton = (node, isRoot) => {
    if (!node) return '';
    if (node.icon) return iconFor(node.icon);
    const t = node.tag || 'span';
    if (t === 'svg') return iconFor(node.component || node.classes);
    const kids = (node.children || []).map((c) => renderSkeleton(c, false)).join('');
    const text = node.text ? esc(node.text) : '';
    const cls = isRoot ? classes : node.classes;
    const a = { ...(node.attrs || {}) };
    if (isRoot) Object.assign(a, attrs);
    const inner = kids || text;
    if (t === 'input' || t === 'img' || t === 'br' || t === 'hr') return `<${t} class="${esc(cls)}"${attrStr(a)}${isRoot ? ' data-dp-root' : ''}>`;
    return `<${t} class="${esc(cls)}"${attrStr(a)}${isRoot ? ' data-dp-root' : ''}>${inner || (isRoot && !node.children.length && !text ? esc(label) : '')}</${t}>`;
  };
  // Prefer the implementation sketch (has indicators/thumbs/chevrons); use the signature's own for raw elements.
  const skel = sig.skeleton || (impl && impl.skeleton) || null;
  if (skel && (skel.tag || tag)) {
    const root = { ...skel, tag: skel.tag || tag };
    // For asChild usages the rendered tag differs from the sketch root
    if (sig.asChild && sig.tag) root.tag = sig.tag;
    const html = renderSkeleton(root, true);
    if (type === 'dropdown-menu' && sig.itemClasses) {
      const items = [labels['dropdown-menu'] + ' 1', labels['dropdown-menu'] + ' 2', labels['dropdown-menu'] + ' 3'].map((t) => `<div role="menuitem" class="${esc(sig.itemClasses)}">${esc(t)}</div>`).join('');
      return `<div class="${esc(classes)}" role="menu" data-state="open" data-side="bottom" data-dp-root style="position:static;transform:none">${items}</div>`;
    }
    return html;
  }
  switch (type) {
    case 'button': return `<${tag === 'a' ? 'a href="#"' : tag} class="${esc(classes)}"${attrStr(attrs)} data-dp-root>${esc(label)}</${tag === 'a' ? 'a' : tag}>`;
    case 'checkbox': return tag === 'input' ? `<input type="checkbox" class="${esc(classes)}"${attrStr(attrs)} data-dp-root>` : `<button role="checkbox" aria-checked="false" data-state="unchecked" class="${esc(classes)}" data-dp-root><span data-state="unchecked" style="display:none">${ICONS.check}</span></button>`;
    case 'radio': return tag === 'input' ? `<input type="radio" class="${esc(classes)}"${attrStr(attrs)} data-dp-root>` : `<button role="radio" aria-checked="false" data-state="unchecked" class="${esc(classes)}" data-dp-root></button>`;
    case 'toggle': return `<button role="switch" aria-checked="false" data-state="unchecked" class="${esc(classes)}" data-dp-root><span data-state="unchecked" class="pointer-events-none block size-4 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-4"></span></button>`;
    case 'select': return tag === 'select' ? `<select class="${esc(classes)}"${attrStr(attrs)} data-dp-root><option>${esc(label)}</option></select>` : `<button role="combobox" class="${esc(classes)}" data-dp-root><span>${esc(label)}</span>${ICONS.chevron}</button>`;
    case 'textarea': return `<textarea class="${esc(classes)}" rows="3" placeholder="${esc(label)}"${attrStr(attrs)} data-dp-root></textarea>`;
    case 'text-field': return `<input type="${esc(attrs.type || 'text')}" class="${esc(classes)}" placeholder="${esc(label)}" data-dp-root>`;
    case 'dropdown-menu': return `<div class="${esc(classes)}" role="menu" data-state="open" data-dp-root style="position:static;transform:none">${[1, 2, 3].map((i) => `<div role="menuitem" class="${esc(sig.itemClasses || '')}">${esc(labels['dropdown-menu'])} ${i}</div>`).join('')}</div>`;
    default: return `<${tag} class="${esc(classes)}"${attrStr(attrs)} data-dp-root>${esc(label)}</${tag}>`;
  }
}

/** Embed local @font-face files as data URIs (only small, local ones). */
function embedFonts(css, root, cssDir) {
  let total = 0;
  const fonts = [];
  const out = css.replace(/url\((['"]?)([^'")]+\.(?:woff2|woff|ttf|otf))\1\)/g, (m, q, rel) => {
    if (/^(https?:)?\/\//.test(rel) || rel.startsWith('data:')) return m;
    const candidates = [path.join(cssDir, rel), path.join(root, 'public', rel.replace(/^\//, '')), path.join(root, rel.replace(/^\//, ''))];
    const file = candidates.find((f) => fs.existsSync(f));
    if (!file) { fonts.push({ url: rel, status: 'missing' }); return m; }
    const size = fs.statSync(file).size;
    if (total + size > MAX_FONT_BYTES) { fonts.push({ url: rel, status: 'too-large', bytes: size }); return m; }
    total += size;
    const ext = path.extname(file).slice(1);
    const mime = ext === 'woff2' ? 'font/woff2' : ext === 'woff' ? 'font/woff' : ext === 'ttf' ? 'font/ttf' : 'font/otf';
    fonts.push({ url: rel, status: 'embedded', bytes: size });
    return `url(data:${mime};base64,${fs.readFileSync(file).toString('base64')})`;
  });
  return { css: out, fonts };
}

async function renderSpecimens(runDir, opts = {}) {
  const inv = JSON.parse(fs.readFileSync(path.join(runDir, 'inventory.json'), 'utf8'));
  const root = inv.meta.root;
  const lang = opts.lang || 'en';
  const collected = files.collect(root, { includeTests: false });
  const cssFiles = collected.files.filter((f) => f.kind.includes('css') || f.kind.includes('scss')).map((f) => ({ rel: f.rel, text: f.text }));
  const bridge = await twBridge.create(root, { cssEntry: inv.meta.css.entry, cssFiles });
  const candidates = new Set();
  for (const t of Object.values(inv.components)) for (const s of t.signatures) { for (const c of (s.spelling || '').split(/\s+/)) if (c) candidates.add(c); for (const c of (s.itemClasses || '').split(/\s+/)) if (c) candidates.add(c); const walk = (n) => { if (!n) return; for (const c of (n.classes || '').split(/\s+/)) if (c) candidates.add(c); (n.children || []).forEach(walk); }; walk(s.skeleton); }
  for (const t of Object.values(inv.components)) for (const i of t.implementations) { const walk = (n) => { if (!n) return; for (const c of (n.classes || '').split(/\s+/)) if (c) candidates.add(c); (n.children || []).forEach(walk); }; walk(i.skeleton); }
  // base classes the specimens themselves use (switch thumb etc.)
  ['block', 'size-4', 'rounded-full', 'bg-white', 'shadow', 'pointer-events-none', 'transition-transform', 'data-[state=checked]:translate-x-4'].forEach((c) => candidates.add(c));
  let liveCss = bridge.compile([...candidates]);
  let status = 'ok';
  let reason = null;
  if (!liveCss) {
    if (bridge.engine === 'plain' || bridge.engine === 'none') { liveCss = cssFiles.map((f) => `/* ${f.rel} */\n${f.text}`).join('\n'); status = cssFiles.length ? 'plain' : 'failed'; reason = cssFiles.length ? null : 'no css'; }
    else { status = 'failed'; reason = bridge.error || 'compile failed'; liveCss = ''; }
  }
  const cssDir = inv.meta.css.entry ? path.join(root, path.dirname(inv.meta.css.entry)) : root;
  const embedded = embedFonts(liveCss, root, cssDir);
  liveCss = embedded.css;
  const stateCss = stateCssFrom(liveCss);
  const items = [];
  for (const [type, t] of Object.entries(inv.components)) {
    const implById = new Map(t.implementations.map((i) => [i.id, i]));
    for (const s of t.signatures) {
      const impl = implById.get(s.implIds[0]) || null;
      const states = ['default'];
      if (s.states.hover === 'yes') states.push('hover');
      if (s.states.focusVisible === 'yes') states.push('focus-visible');
      if (['button', 'checkbox', 'radio', 'toggle', 'select', 'text-field', 'textarea'].includes(type)) states.push('disabled');
      if (['checkbox', 'radio', 'toggle'].includes(type)) states.push('checked');
      if (inv.meta.css.darkStrategy === 'class') states.push('dark');
      items.push({ sigId: s.id, type, html: status === 'failed' || !s.resolved ? null : specimenHtml(s, impl, lang), states, unresolved: s.unresolvedClasses || [] });
    }
  }
  // sibling rows: the members rendered next to each other
  const sigById = new Map(); for (const t of Object.values(inv.components)) for (const s of t.signatures) sigById.set(s.id, s);
  const occById = new Map(inv.occurrences.map((o) => [o.id, o]));
  const groups = [];
  for (const g of inv.relationships.siblingGroups || []) {
    if (!g.mismatch.radius && !g.mismatch.height) continue;
    const parts = g.members.map((oid) => { const o = occById.get(oid); const s = o && sigById.get(o.sigId); if (!s) return ''; const impl = (inv.components[s.type].implementations || []).find((i) => i.id === s.implIds[0]) || null; return status === 'failed' ? '' : specimenHtml(s, impl, lang); });
    groups.push({ groupId: g.id, html: `<div class="${g.containerClasses.replace(/"/g, '')}" style="flex-wrap:nowrap">${parts.join('')}</div>` });
  }
  const out = { schema: 'design-polish.specimens/1', generatedAt: new Date().toISOString(), status, reason, engine: bridge.engine, liveCss, stateCss, fonts: embedded.fonts, items, groups };
  fs.writeFileSync(path.join(runDir, 'specimens.json'), JSON.stringify(out));
  fs.writeFileSync(path.join(runDir, 'live.css'), liveCss + '\n/* design-polish state simulation */\n' + stateCss);
  return out;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const runDir = args.find((a) => !a.startsWith('-'));
  if (!runDir) { console.error('usage: render-specimens.js <run-dir> [--lang en|ko]'); process.exit(2); }
  const li = args.indexOf('--lang');
  renderSpecimens(runDir, { lang: li >= 0 ? args[li + 1] : 'en' }).then((out) => {
    process.stdout.write(`specimens: ${out.items.filter((i) => i.html).length}/${out.items.length} rendered · css ${Math.round(out.liveCss.length / 1024)}KB (${out.engine}, ${out.status}${out.reason ? ': ' + out.reason : ''}) · fonts ${out.fonts.filter((f) => f.status === 'embedded').length} embedded\n`);
  }).catch((e) => { console.error(e.stack || e.message); process.exit(1); });
}
module.exports = { renderSpecimens, specimenHtml, stateCssFrom };
