#!/usr/bin/env node
'use strict';
// design-polish render: builds the single-file HTML report from a run directory.
//
//   design-polish render <run-dir> [--lang en|ko] [--baseline <run-dir>] [--out report.html]
//
// Every number in the page is read from the JSON files and carries a data-metric path so
// verify.js can check it. The model's contribution (narrative.json) is prose only. The
// template enforces the typographic rules: one measure, neutral paper, no remote assets.

const fs = require('fs');
const path = require('path');
const { hash } = require('./lib/ids');

const TEMPLATES = path.join(__dirname, '..', 'templates');
const TYPES = ['button', 'checkbox', 'dropdown-menu', 'radio', 'select', 'textarea', 'text-field', 'toggle', 'badge', 'tag', 'chip'];
const TYPE_LABEL = { en: { button: 'Button', checkbox: 'Checkbox', 'dropdown-menu': 'Dropdown menu', radio: 'Radio', select: 'Select', textarea: 'Text area', 'text-field': 'Text field', toggle: 'Toggle', badge: 'Badge', tag: 'Tag', chip: 'Chip' }, ko: { button: '버튼', checkbox: '체크박스', 'dropdown-menu': '드롭다운 메뉴', radio: '라디오', select: '셀렉트', textarea: '텍스트 영역', 'text-field': '텍스트 필드', toggle: '토글', badge: '배지', tag: '태그', chip: '칩' } };
const AXIS_LABEL = { en: { color: 'Color', typography: 'Typography', spacing: 'Spacing', radius: 'Corners', shadow: 'Shadows', border: 'Borders', tokens: 'Tokens', classes: 'Classes', components: 'Components', component: 'Components' }, ko: { color: '색상', typography: '글자', spacing: '여백', radius: '모서리', shadow: '그림자', border: '테두리', tokens: '토큰', classes: '클래스', components: '컴포넌트', component: '컴포넌트' } };

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (s, vars) => String(s || '').replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] != null ? vars[k] : ''));
const readJson = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null);
const px = (v) => (v == null ? '–' : v === 'full' ? '∞' : `${Math.round(v * 100) / 100}px`);

function build(runDir, opts = {}) {
  const inv = readJson(path.join(runDir, 'inventory.json'));
  if (!inv) throw new Error(`no inventory.json in ${runDir}`);
  const findings = readJson(path.join(runDir, 'findings.json'));
  const proposal = readJson(path.join(runDir, 'proposal.json'));
  const cardsFile = readJson(path.join(runDir, 'cards.json'));
  const narrative = readJson(path.join(runDir, 'narrative.json'));
  const specimens = readJson(path.join(runDir, 'specimens.json'));
  const verification = readJson(path.join(runDir, 'verification.json'));
  const delta = readJson(path.join(runDir, 'delta.json'));
  const lang = opts.lang || (narrative && narrative.lang) || 'en';
  const T = JSON.parse(fs.readFileSync(path.join(TEMPLATES, 'i18n', `${lang === 'ko' ? 'ko' : 'en'}.json`), 'utf8'));
  const css = fs.readFileSync(path.join(TEMPLATES, 'report.css'), 'utf8');
  const js = fs.readFileSync(path.join(TEMPLATES, 'report.js'), 'utf8');
  if (/border-left\s*:\s*\d+px\s+solid/.test(css)) throw new Error('template uses a left accent border — forbidden by the design rules');
  if ((css.match(/max-width\s*:/g) || []).filter((m) => !/var\(--measure\)/.test(m)).length > 2) { /* tolerated: component-internal max-widths only */ }
  if (/url\(\s*['"]?https?:/.test(css)) throw new Error('template references a remote asset');
  const tl = TYPE_LABEL[lang] || TYPE_LABEL.en;
  const al = AXIS_LABEL[lang] || AXIS_LABEL.en;
  const project = opts.project || path.basename(inv.meta.root);
  const runId = path.basename(runDir);
  const inventoryHash = hash(JSON.stringify(inv.components) + JSON.stringify(inv.tokens.colors.values.map((v) => v.id)), 16);
  const n = (value, metric) => `<span class="num" data-metric="${esc(metric)}">${esc(value)}</span>`;
  const routeById = new Map(inv.routes.map((r) => [r.id, r]));
  const screenName = (id) => { const r = routeById.get(id); if (!r) return id.replace(/^route:/, ''); return (narrative && narrative.screens && narrative.screens[id]) || r.display || r.path; };
  const screenChips = (ids, max = 4) => { const list = [...new Set(ids || [])]; const shown = list.slice(0, max).map((id) => `<span class="pill">${esc(screenName(id))}</span>`).join(''); return shown + (list.length > max ? `<span class="pill">${esc(fmt(T.misc.and_more, { n: list.length - max }))}</span>` : ''); };
  const sigById = new Map(); for (const [type, t] of Object.entries(inv.components)) for (const s of t.signatures) sigById.set(s.id, { ...s, type });
  const occById = new Map(inv.occurrences.map((o) => [o.id, o]));
  const colorById = new Map(inv.tokens.colors.values.map((v) => [v.id, v]));
  const declaredById = new Map(inv.tokens.declared.map((d) => [d.id, d]));
  const specById = new Map((specimens && specimens.items || []).map((i) => [i.sigId, i]));
  const groupSpec = new Map((specimens && specimens.groups || []).map((g) => [g.groupId, g]));
  const mappingBySource = new Map((proposal && proposal.mapping || []).map((m) => [m.source, m]));
  const cards = (cardsFile && cardsFile.cards) || [];
  const cardBySource = new Map(); for (const c of cards) for (const e of c.entries) if (!cardBySource.has(e.source)) cardBySource.set(e.source, c);
  const newTokens = new Map((proposal && proposal.newTokens || []).map((t) => [t.id, t]));
  const nameOf = (id) => { if (!id) return '–'; const d = declaredById.get(id); if (d) return d.name; const v = colorById.get(id); if (v) return v.value; const s = sigById.get(id); if (s) return `${tl[s.type]} · ${s.variantProps && Object.keys(s.variantProps).length ? Object.entries(s.variantProps).map(([k, v]) => `${k}=${v}`).join(' ') : (s.adHoc ? T.components.adhoc : T.components.base)}`; const nt = newTokens.get(id); if (nt) return nt.name; const m = /^tok\+?:([a-z]+)[.:](.+)$/.exec(id); return m ? m[2] : id; };
  const sev = (s) => T.severity[s] || s;
  // Localized finding titles from rule + params (the model's narrative overrides these when present).
  const RULE_TITLES = {
    en: { 'NEAR-DUP': '{n} look-alike {kind}s (ΔE {deltaE})', 'TOKEN-TWIN': '{n} raw colors equal an existing token', 'OFF-SCALE': '{n} spacing values off the {step}px grid', 'NO-SCALE': 'No spacing scale', 'SIG-SPRAWL': '{adHoc} one-off {type} looks', 'TOKEN-SPRAWL': '{n} distinct raw grays', 'PALETTE-GRAYS': '{n} Tailwind grays beside {tokens} neutral tokens', 'HARDCODE': '{band}: {ratio}% of {axis} values go through tokens', 'DEAD-TOKEN': '{n} declared tokens are never used', 'DUP-IMPL': '{n} different {type} implementations', 'STATE-GAP': '{n} {type} looks without a keyboard focus style', 'DARK-GAP': '{n} tokens have no dark value', 'RATIO': '{n} {type} looks with an unusual corner ratio', 'SIB-RADIUS': 'Neighbors with different corner radii ({radii})', 'SIB-HEIGHT': 'Neighbors with different heights ({heights})', 'SIB-RADIUS-PATTERN': '{n} rows mix corner radii', 'PAD-INCONS': '{type}s of height {height}px use {paddings} paddings', 'INVALID-CLASS': '{n} classes have no effect', 'REPEAT-INLINE': 'The same raw {type} repeated {count} times', 'UNREACHED': '{n} control components are not used by any screen' },
    ko: { 'NEAR-DUP': '닮은 {kind} {n}개 (ΔE {deltaE})', 'TOKEN-TWIN': '기존 토큰과 같은 색을 직접 쓴 곳 {n}종', 'OFF-SCALE': '{step}px 격자 밖의 여백 값 {n}개', 'NO-SCALE': '여백 스케일이 없음', 'SIG-SPRAWL': '일회성 {type} 모양 {adHoc}가지', 'TOKEN-SPRAWL': '직접 쓴 회색 {n}종', 'PALETTE-GRAYS': '무채색 토큰 {tokens}개 옆에 Tailwind 회색 {n}종', 'HARDCODE': '{axis} 값의 {ratio}%만 토큰을 거침 ({band})', 'DEAD-TOKEN': '선언만 되고 안 쓰는 토큰 {n}개', 'DUP-IMPL': '{type} 구현이 {n}벌', 'STATE-GAP': '키보드 포커스 스타일이 없는 {type} 모양 {n}가지', 'DARK-GAP': '다크 값이 없는 토큰 {n}개', 'RATIO': '모서리 비율이 다른 {type} 모양 {n}가지', 'SIB-RADIUS': '이웃끼리 모서리가 다름 ({radii})', 'SIB-HEIGHT': '이웃끼리 높이가 다름 ({heights})', 'SIB-RADIUS-PATTERN': '모서리가 섞인 줄 {n}개', 'PAD-INCONS': '높이 {height}px {type}의 패딩이 {paddings}가지', 'INVALID-CLASS': '효과 없는 클래스 {n}개', 'REPEAT-INLINE': '같은 원시 {type}가 {count}번 반복', 'UNREACHED': '어느 화면에서도 쓰이지 않는 컨트롤 컴포넌트 {n}개' },
  };
  const CARD_TITLES = {
    en: { 'register-tokens': { title: 'Use the existing token where the same value is typed by hand', summary: '{n} distinct values are typed by hand although a token has the same value; switching them changes nothing on screen.' }, 'register-new': { title: 'Register {n} frequently used raw colours as tokens', summary: 'Each colour used three or more times gets a token with the same value; nothing changes on screen, the value just gets a name.' }, 'merge-values': { title: 'Merge look-alike {axis} values into {target}', summary: 'Values within ΔE {deltaE} of {target} become {target}.' }, 'align-neighbors': { title: 'Give neighbours in {rows} row(s) the same corner radius ({label})', summary: 'Controls that sit side by side get one radius; the minority adopts the majority.' }, 'align-signature': { title: 'Bring {n} one-off {type} looks back to the base {type}', summary: 'Usages with their own class overrides adopt a variant of the base component.' }, 'delete-dead-tokens': { title: 'Remove {n} tokens that nothing uses', summary: 'Declared tokens with no reference anywhere.' }, 'add-state': { title: 'Add a keyboard focus style to {n} {type} looks', summary: 'Interactive looks without a focus-visible style get one.' }, 'fix-class': { title: 'Fix {n} classes that have no effect', summary: 'Classes that match no generated or project CSS.' }, guardrails: { title: 'Write DESIGN-TOKENS.md and point the agent to it', summary: 'Documents the surviving tokens, adds a one-line pointer to CLAUDE.md/AGENTS.md and a baseline for `design-polish check`, so the next generation reuses what exists.' } },
    ko: { 'register-tokens': { title: '같은 값을 직접 쓴 곳을 기존 토큰으로', summary: '토큰과 같은 값 {n}종이 직접 쓰여 있습니다. 토큰으로 바꿔도 화면은 그대로입니다.' }, 'register-new': { title: '자주 쓰는 직접 쓴 색 {n}종을 토큰으로 등록', summary: '세 번 이상 쓰인 색마다 같은 값의 토큰을 만듭니다. 화면은 그대로이고 값에 이름이 생깁니다.' }, 'merge-values': { title: '닮은 {axis} 값을 {target}으로 합치기', summary: '{target}과 ΔE {deltaE} 이내의 값이 {target}이 됩니다.' }, 'align-neighbors': { title: '나란히 놓인 이웃 {rows}줄의 모서리를 맞추기 ({label})', summary: '한 줄에 놓인 컨트롤이 하나의 모서리 반지름을 갖게 됩니다. 소수가 다수를 따릅니다.' }, 'align-signature': { title: '일회성 {type} 모양 {n}가지를 기본 {type}으로 되돌리기', summary: '클래스를 덧붙인 사용처가 기본 컴포넌트의 변형을 쓰게 됩니다.' }, 'delete-dead-tokens': { title: '아무도 쓰지 않는 토큰 {n}개 제거', summary: '어디서도 참조되지 않는 선언 토큰입니다.' }, 'add-state': { title: '{type} 모양 {n}가지에 키보드 포커스 스타일 추가', summary: 'focus-visible 스타일이 없는 상호작용 모양에 추가합니다.' }, 'fix-class': { title: '효과 없는 클래스 {n}개 고치기', summary: '생성된 CSS에도 프로젝트 CSS에도 없는 클래스입니다.' }, guardrails: { title: 'DESIGN-TOKENS.md를 쓰고 에이전트에게 알리기', summary: '살아남은 토큰을 문서로 남기고 CLAUDE.md/AGENTS.md에 한 줄 포인터와 `design-polish check` 기준선을 추가해, 다음 생성이 기존 것을 재사용하게 합니다.' } },
  };
  const cardText = (c) => {
    let tpl = (CARD_TITLES[lang] || CARD_TITLES.en)[c.kind];
    if (!tpl) return { title: c.title, summary: c.summary };
    if (c.kind === 'register-tokens' && c.entries.length && c.entries.every((e) => e.action === 'new-token')) tpl = (CARD_TITLES[lang] || CARD_TITLES.en)['register-new'];
    const first = c.entries[0] || {};
    const rows = new Set(c.entries.map((e) => e.metric && e.metric.group).filter(Boolean)).size || 1;
    const label = /\(([^)]+)\)\s*$/.exec(c.title || '');
    const p = { n: c.entries.length, rows, label: label ? label[1] : '', axis: al[c.axis] || c.axis, target: first.target ? nameOf(first.target) : '', deltaE: Math.max(0, ...c.entries.map((e) => (e.metric && e.metric.deltaE) || 0)), type: tl[String(c.axis).replace('component:', '')] || '' };
    return { title: fmt(tpl.title, p), summary: fmt(tpl.summary, p) };
  };
  const ruleTitle = (f) => {
    const tpl = (RULE_TITLES[lang] || RULE_TITLES.en)[f.rule];
    if (!tpl) return f.title;
    const p = { ...f.params };
    if (p.type) p.type = tl[p.type] || p.type;
    if (p.axis) p.axis = al[p.axis] || p.axis;
    if (p.achromatic !== undefined) p.kind = p.achromatic ? (lang === 'ko' ? '회색' : 'gray') : (lang === 'ko' ? '색' : 'color');
    if (p.radii) p.radii = p.radii.map((r) => (r == null ? '?' : r === 'full' ? '∞' : r + 'px')).join(' / ');
    if (p.heights) p.heights = p.heights.map((r) => (r == null ? '?' : r + 'px')).join(' / ');
    if (p.paddings) p.paddings = p.paddings.length;
    if (p.band) p.band = lang === 'ko' ? ({ partial: '부분', decorative: '장식', none: '없음' }[p.band] || p.band) : p.band;
    return fmt(tpl, p);
  };
  const swatch = (hex, size) => `<span class="sw${size ? ' ' + size : ''}" title="${esc(hex)}"><i style="background:${esc(hex)}"></i></span>`;

  /* ---------- curation row ---------- */
  function curationControls(id, opts2) {
    const m = mappingBySource.get(id);
    const card = cardBySource.get(id);
    const targets = opts2.targets || [];
    const rec = m && m.target ? m : null;
    const recTarget = rec ? rec.target : (targets[0] && targets[0].id) || '';
    const options = targets.map((t) => `<option value="${esc(t.id)}" data-visual="${esc(t.visual || 'visible')}"${t.id === recTarget ? ' selected' : ''}>${esc(t.label)}</option>`).join('');
    const recoText = rec ? (rec.action === 'new-token' ? (lang === 'ko' ? `${rec.occurrences}곳에서 씁니다. 토큰으로 등록할 만합니다. 제안 이름은 <b>${esc(nameOf(rec.target))}</b>(자동, 바꿔도 됩니다).` : `Used ${rec.occurrences} times — worth a token; suggested name <b>${esc(nameOf(rec.target))}</b> (automatic, rename freely)`) : rec.action === 'promote' ? (lang === 'ko' ? `같은 값: <b>${esc(nameOf(rec.target))}</b>. 토큰으로 바꿔도 화면은 그대로입니다.` : `Same as <b>${esc(nameOf(rec.target))}</b> — switching to the token changes nothing on screen`) : rec.action === 'merge' ? (lang === 'ko' ? `닮은 색: <b>${esc(nameOf(rec.target))}</b> (ΔE ${rec.metric.deltaE ?? ''}). 합치면 ${T.cards.visual[rec.visualChange]}.` : `ΔE ${rec.metric.deltaE ?? ''} from <b>${esc(nameOf(rec.target))}</b> — merging is ${T.cards.visual[rec.visualChange]}`) : rec.action === 'round' ? (lang === 'ko' ? `스케일의 <b>${esc(nameOf(rec.target))}</b>로 맞추면 ${Math.abs(rec.metric.px || 0)}px 차이입니다.` : `${Math.abs(rec.metric.px || 0)}px from <b>${esc(nameOf(rec.target))}</b> on the scale`) : '') : (opts2.reco || '');
    const actions = opts2.actions || ['keep', 'merge', 'leave'];
    const labelOf = { keep: opts2.keepLabel || T.curation.keep, merge: T.curation.merge, leave: T.curation.leave };
    const seg = `<span class="seg" role="radiogroup">${actions.map((a) => `<label data-action="${a}"${a === 'leave' ? ' class="leave"' : ''}>${esc(labelOf[a])}</label>`).join('')}</span>`;
    const select = targets.length ? `<select class="hidden" aria-label="${esc(T.curation.target)}">${options}</select>` : '';
    return { recoText, controls: `<div class="ctl">${seg}${select}</div><div class="impact"></div>`, attrs: ` data-id="${esc(id)}" data-target="${esc(recTarget)}" data-visual="${esc(rec ? rec.visualChange : 'visible')}" data-card="${esc(card ? card.id : '')}"` };
  }

  // A word from the glossary gets a hover definition wherever it appears as a label.
  const term = (word) => { const def = (T.terms || {})[word]; return def ? `<span class="term" tabindex="0" data-tip="${esc(def)}">${esc(word)}</span>` : esc(word); };
  const termLabel = (label) => { for (const w of Object.keys(T.terms || {})) if (label.includes(w)) return label.split(w).map(esc).join(term(w)); return esc(label); };

  /* ---------- chapters ---------- */
  const parts = [];
  const chapterStats = (items) => `<div class="stats">${items.map(([k, v]) => `<span>${esc(k)} <b>${v}</b></span>`).join('')}</div>`;

  // cover
  const noModel = !narrative;
  parts.push(`<header class="cover"><div class="wrap">
    <h1>${esc(project)}</h1>
    <p class="sub">${esc(T.subtitle).replace(/\n/g, '<br>')}</p>
    <div class="meta"><span>${fmt(T.cover.scanned, { files: n(inv.meta.files.code, 'meta.files.code'), routes: n(inv.routes.filter((r) => r.kind === 'page').length, 'routes.pages'), classes: n(inv.classes.unique, 'classes.unique') })}</span><span>${esc(fmt(T.cover.generated, { date: inv.meta.generatedAt.slice(0, 10), run: runId }))}</span></div>
    <div class="badges">${inv.meta.mode === 'ast' ? `<span class="badge">${esc(T.cover.mode_ast)}</span>` : inv.meta.mode === 'css-only' ? `<span class="badge warn">${esc(fmt(T.cover.mode_css_only, { css: inv.meta.files.css, templates: inv.meta.templates || 0 }))}</span>` : `<span class="badge warn">${esc(T.cover.mode_regex)}</span>`}${inv.meta.css.engine !== 'none' ? `<span class="badge">${esc(fmt(T.cover.css_engine, { engine: `${inv.meta.css.engine}${inv.meta.css.version ? ' ' + inv.meta.css.version : ''}` }))}</span>` : `<span class="badge warn">${esc(T.cover.no_engine)}</span>`}${inv.meta.css.darkStrategy !== 'none' ? `<span class="badge">${esc(fmt(T.cover.dark, { strategy: inv.meta.css.darkStrategy }))}</span>` : ''}${specimens && specimens.status === 'failed' ? `<span class="badge warn">${esc(fmt(T.components.render_failed, { reason: specimens.reason }))}</span>` : ''}</div>
  </div></header>`);
  if (noModel) parts.push(`<div class="banner"><div class="wrap">${esc(T.cover.no_model)}</div></div>`);
  // nav
  const navIds = ['summary', 'screens', 'color', 'typography', 'spacing', 'radius', 'shadow', 'components', 'relations', 'proposal', 'cards', 'delta', 'method'];
  parts.push(`<nav class="topnav"><div class="wrap">${navIds.map((id) => `<a class="chip" href="#${id}">${esc(T.nav[id])}</a>`).join('')}<span class="spacer"></span><input id="search" class="search" type="search" placeholder="${esc(T.misc.search)}"><label class="toggle"><input type="checkbox" id="devToggle"> ${esc(T.dev.toggle)}</label></div></nav>`);
  parts.push('<main>');

  // 01 summary
  const scores = inv.scores;
  const totalLooks = TYPES.reduce((s, t) => s + inv.components[t].looks, 0);
  const typesPresent = TYPES.filter((t) => inv.components[t].total > 0).length;
  const adHocLooks = TYPES.reduce((s, t) => s + inv.components[t].signatures.filter((x) => x.count > 0 && x.adHoc && x.resolved).length, 0);
  const ownHard = (v) => (v.ownHardcodedCount != null ? v.ownHardcodedCount : v.hardcodedCount);
  const hardcodedColors = inv.tokens.colors.values.filter((v) => ownHard(v) > 0).length;
  const headline = (narrative && narrative.headline) || fmt(T.summary.headline_default, { project, looks: totalLooks, types: typesPresent, hardcoded: hardcodedColors, findings: findings ? findings.findings.length : 0 });
  const ringR = 50, circ = 2 * Math.PI * ringR;
  const comp = scores.composite == null ? 0 : scores.composite;
  const axisRows = ['color', 'typography', 'spacing', 'radius', 'shadow', 'component'].map((a) => { const v = scores[a]; const cls = v == null ? '' : v < 50 ? 'low' : v < 85 ? 'mid' : ''; return `<div class="axis"><span>${esc(T.summary.axes[a])}</span><span class="bar"><i class="${cls}" style="width:${v == null ? 0 : v}%"></i></span><span class="v">${v == null ? '–' : n(v, `scores.${a}`)}</span></div>`; }).join('');
  const topFindings = findings ? findings.findings.filter((f) => f.severity !== 'info').slice(0, 3) : [];
  const goodAxes = findings ? findings.okAxes : [];
  const tile = (metric, value, key, href) => `<a class="tile" href="${href}"><b>${n(value, metric)}</b><span>${termLabel(T.summary.tiles[key])}</span><span class="desc">${esc((T.summary.tile_desc || {})[key] || '')}</span></a>`;
  parts.push(`<section class="chapter" id="summary"><div class="wrap">
    <div class="band"><h2>${esc(T.summary.h)}</h2></div>
    <p class="headline">${esc(headline)}</p>${narrative && narrative.lede ? `<p class="lede">${esc(narrative.lede)}</p>` : ''}
    <div class="summary-grid">
      <div class="scorecard">
        <div class="caps">${esc(T.summary.score)}</div>
        <div class="score-body"><div class="ring"><svg viewBox="0 0 120 120"><circle class="bg" cx="60" cy="60" r="${ringR}"/><circle class="fg" cx="60" cy="60" r="${ringR}" stroke-dasharray="${(circ * comp) / 100} ${circ}"/></svg><div class="val">${scores.composite == null ? '–' : n(scores.composite, 'scores.composite')}</div></div><div class="axes">${axisRows}</div></div>
        <div class="small faint">${esc(T.summary.score_help)}</div>
      </div>
      <div class="tiles">
        ${tile('tokens.colors.values.length', inv.tokens.colors.values.length, 'colors', '#color')}
        ${tile('tokens.colors.hardcoded', hardcodedColors, 'hardcoded', '#color')}
        ${tile('components.looks', totalLooks, 'looks', '#components')}
        ${tile('components.adhoc', adHocLooks, 'adhoc', '#components')}
        ${findings ? tile('findings.length', findings.findings.length, 'findings', '#cards') : ''}
        ${cards.length ? tile('cards.length', cards.length, 'cards', '#cards') : ''}
      </div>
    </div>
    <div class="panels">
      <div class="panel"><h3>${esc(T.summary.top_findings)}${topFindings.length ? ` <span class="pill warn">${esc(T.summary.top_findings_badge)}</span>` : ''}</h3>${topFindings.length ? `<ul class="plain">${topFindings.map((f) => `<li><a href="#${f.id}"><b>F${f.num}</b> ${esc((narrative && narrative.findings && narrative.findings[f.id] && narrative.findings[f.id].title) || ruleTitle(f))}</a> <span class="pill ${f.severity === 'high' ? 'bad' : f.severity === 'medium' ? 'warn' : ''}">${esc(sev(f.severity))}</span></li>`).join('')}</ul>` : `<p class="muted">–</p>`}</div>
      <div class="panel"><h3>${esc(T.summary.good)}</h3><ul class="plain">${goodAxes.length ? goodAxes.map((a) => `<li>${esc(fmt(T.summary.good_axis, { axis: al[a.axis], score: a.score == null ? '–' : a.score, n: (inv.scores.weights || {})[a.axis] || 0 }))}</li>`).join('') : `<li class="muted">${esc(T.summary.good_none)}</li>`}</ul></div>
    </div>
  </div></section>`);

  // 02 screens
  const pages = inv.routes.filter((r) => r.kind === 'page');
  const occByRoute = (id) => inv.occurrences.filter((o) => o.routes.includes(id));
  parts.push(`<section class="chapter" id="screens"><div class="wrap">
    <div class="band"><h2>${esc(T.screens.h)}</h2>${chapterStats([[T.misc.screens, n(pages.length, 'routes.pages')]])}</div>
    <p class="help">${esc(T.screens.help)}</p>
    ${pages.length ? `<div class="tablewrap"><table class="t"><thead><tr>${T.screens.cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${pages.map((r) => { const occ = occByRoute(r.id); return `<tr data-search="${esc(screenName(r.id) + ' ' + r.path)}"><td><b>${esc(screenName(r.id))}</b>${r.catalogLike ? ` <span class="pill warn">${esc(T.screens.catalog)}</span>` : ''}</td><td class="mono">${esc(r.path)}</td><td class="r">${occ.reduce((s, o) => s + (o.count || 0) + (o.catalogCount || 0), 0)}</td><td class="r">${new Set(occ.map((o) => o.sigId)).size}</td></tr>`; }).join('')}</tbody></table></div>` : `<p class="muted">${esc(T.screens.none)}</p>`}
  </div></section>`);

  // findings helper per axis
  const findingCard = (f) => {
    const nf = narrative && narrative.findings && narrative.findings[f.id];
    const title = (nf && nf.title) || ruleTitle(f);
    const explanation = (nf && nf.explanation) || f.summary;
    let evidence = '';
    const refs = f.evidence.refs || [];
    if (f.evidence.kind === 'swatch-strip' || f.evidence.kind === 'twin-list' || f.evidence.kind === 'list' && refs.every((r) => r.startsWith('tok:color'))) {
      const hexes = refs.map((id) => { const v = colorById.get(id); if (v) return v.value; const d = declaredById.get(id); return d && d.hex; }).filter(Boolean);
      if (hexes.length) evidence = `<span class="strip">${hexes.slice(0, 12).map((h) => `<i style="background:${esc(h)}" title="${esc(h)}"></i>`).join('')}</span><span class="small mono muted">${refs.slice(0, 6).map(nameOf).map(esc).join(' · ')}${refs.length > 6 ? ' ' + esc(fmt(T.misc.and_more, { n: refs.length - 6 })) : ''}</span>`;
    } else if (f.evidence.kind === 'specimen-row') {
      evidence = refs.slice(0, 4).map((id) => specimenBlock(id, { compact: true })).join('');
    } else if (f.evidence.kind === 'sibling-row') {
      const g = groupSpec.get(refs[0]);
      if (g) evidence = `<div class="stage" data-html="${esc(g.html)}"><iframe title="row" loading="lazy"></iframe></div>`;
    } else if (f.evidence.kind === 'token-list' || f.evidence.kind === 'class-list') {
      evidence = `<span class="tags">${refs.slice(0, 12).map((r) => `<span class="pill mono">${esc(nameOf(r).replace(/^cls:/, ''))}</span>`).join('')}${refs.length > 12 ? `<span class="pill">${esc(fmt(T.misc.and_more, { n: refs.length - 12 }))}</span>` : ''}</span>`;
    } else if (f.evidence.kind === 'ruler') {
      evidence = `<span class="tags">${refs.map((r) => `<span class="pill mono">${esc(nameOf(r))}px</span>`).join('')}</span>`;
    }
    const sites = (f.evidence.sites || []).slice(0, 6).map((s) => `<li>${esc(s.file)}:${s.line}</li>`).join('');
    return `<article class="fnd ${f.severity}" id="${f.id}" data-search="${esc(title + ' ' + f.rule)}">
      <div class="head"><span class="id">F${f.num}</span><h4>${esc(title)}</h4><span class="sev">${esc(sev(f.severity))}</span></div>
      <div class="body"><p>${esc(explanation)}</p>${evidence ? `<div class="ev">${evidence}</div>` : ''}
      <div class="foot">${screenChips(f.screens)}${f.needsUserConfirmation ? `<span class="pill warn">?</span>` : ''}</div>
      ${sites ? `<details class="dev devonly"><summary>${esc(T.dev.sites)} · ${esc(T.dev.basis)}: ${esc(f.basis)}</summary><ul>${sites}</ul></details>` : ''}</div>
    </article>`;
  };
  const findingsFor = (pred) => (findings ? findings.findings.filter(pred) : []);
  const findingsBlock = (list) => (list.length ? `<div class="part"><h3>${esc(T.chapter.findings)} <span class="n">${list.length}</span></h3><div class="findings">${list.map(findingCard).join('')}</div></div>` : '');
  const decisionsBlock = () => `<div class="part"><h3>${esc(T.chapter.decisions)}</h3><p class="muted small decisions-status">${esc(fmt(T.chapter.undecided, { n: '–' }))}</p></div>`;
  const chapterSummary = (id) => (narrative && narrative.chapters && narrative.chapters[id] && narrative.chapters[id].summary ? `<p class="lede">${esc(narrative.chapters[id].summary)}</p>` : '');
  const noChange = (id, axis) => { const r = narrative && narrative.chapters && narrative.chapters[id] && narrative.chapters[id].no_change_reason; const fl = findingsFor((f) => f.axis === axis && f.severity !== 'info'); if (fl.length) return ''; const ok = findings && findings.okAxes.find((a) => a.axis === axis); return `<div class="part"><h3>${esc(T.chapter.proposal)}</h3><p class="muted">${esc(fmt(T.chapter.no_change, { reason: r || (ok ? ok.reason : '–') }))}</p></div>`; };

  function specimenBlock(sigId, o = {}) {
    const s = sigById.get(sigId);
    if (!s) return '';
    const sp = specById.get(sigId);
    const tabs = (sp && sp.states || ['default']).filter((st) => o.compact ? st === 'default' : true);
    const stage = sp && sp.html ? `<div class="stage" data-html="${esc(sp.html)}" data-state="default"><iframe title="${esc(tl[s.type])}" loading="lazy"></iframe></div>` : `<div class="stage"><div class="classes" style="padding:12px 14px">${esc(s.resolved ? fmt(T.components.render_failed, { reason: specimens ? specimens.reason || '' : 'no specimens' }) : T.components.dynamic)}<br>${esc(s.spelling)}</div></div>`;
    const tabHtml = !o.compact && tabs.length > 1 ? `<div class="tabs">${tabs.map((st) => `<button type="button" data-state="${st}" class="${st === 'default' ? 'on' : ''}">${esc(T.components.tabs[st] || st)}</button>`).join('')}</div>` : '';
    return `<div class="spec" data-sig="${esc(sigId)}">${stage}${tabHtml}</div>`;
  }

  // 03 color
  {
    const tok = inv.tokens;
    const declaredColors = tok.declared.filter((d) => d.axis === 'color' && d.source === 'project');
    const groups = { brand: [], semantic: [], neutral: [], unclassified: [] };
    for (const d of declaredColors) (groups[d.role] || groups.unclassified).push(d);
    const colorMod = require('./lib/color');
    const colorTargets = (v) => {
      const m = mappingBySource.get(v.id);
      const out = [];
      if (m && m.target) out.push({ id: m.target, label: nameOf(m.target) + (m.metric && m.metric.deltaE != null ? ` · ΔE ${m.metric.deltaE}` : ''), visual: m.visualChange });
      const lab = v.lab;
      const ranked = declaredColors.filter((d) => d.srgb).map((d) => ({ d, de: lab ? colorMod.deltaE2000(lab, colorMod.toLab({ r: d.srgb[0], g: d.srgb[1], b: d.srgb[2] })) : 99 })).sort((a, b) => a.de - b.de);
      for (const { d, de } of ranked) if (!out.some((o) => o.id === d.id)) out.push({ id: d.id, label: `${d.name} · ΔE ${Math.round(de * 10) / 10}`, visual: de < 1 ? 'none' : de < 2 ? 'subtle' : 'visible' });
      return out.slice(0, 24);
    };
    const TC = T.color;
    const hexOf = (id) => { const d = declaredById.get(id); if (d) return d.hex; const v = colorById.get(id); return v ? v.value : null; };
    const pair = (a, b) => `<span class="pair">${a ? `<i style="background:${esc(a)}"></i>` : ''}${b ? `<i style="background:${esc(b)}"></i>` : ''}</span>`;
    const clusterOf = (id) => tok.colors.clusters.find((cl) => cl.members.includes(id));
    const deTo = (v, id) => { const h = hexOf(id); const c = h ? colorMod.parse(h) : null; return v.lab && c ? Math.round(colorMod.deltaE2000(v.lab, colorMod.toLab(c)) * 100) / 100 : null; };
    const visualWord = (vis) => T.cards.visual[vis] || vis;
    // ---- one row per colour: tokens (used or not) + raw values + palette values + library-only raw values
    const rows = [];
    const ORDER = { twin: 0, near: 1, untokenized: 2, dead: 3, dark_missing: 4, mode_varying: 5, palette_overlap: 6, rare: 7, near_raw: 8, ok: 9, palette_ok: 10, dead_library: 11, library: 12 };
    const twinsOf = new Map(); // token id -> raw values equal to it
    for (const v of tok.colors.values) if (v.twinOf && ownHard(v) > 0) { if (!twinsOf.has(v.twinOf)) twinsOf.set(v.twinOf, []); twinsOf.get(v.twinOf).push(v); }
    for (const d of declaredColors) {
      const dead = d.refs.total === 0;
      const twins = twinsOf.get(d.id) || [];
      let status = 'ok', statusText = TC.status.ok, action = TC.action.none, issue = false;
      if (dead && d.librarySet) { status = 'dead_library'; statusText = TC.status.dead_library; action = TC.action.keep_library; }
      else if (dead && twins.length) { status = 'ok'; statusText = fmt(TC.status.twin, { token: twins.map((t) => t.value).join(', ') }); action = TC.action.none; }
      else if (dead) { status = 'dead'; statusText = TC.status.dead; const card = cardBySource.get(d.id); action = fmt(TC.action.delete, { card: card ? card.id : '–' }); issue = true; }
      else if (d.darkMissing) { status = 'dark_missing'; statusText = TC.status.dark_missing; action = TC.action.dark; issue = true; }
      // tokens: only an unused one needs a decision ("keep" takes it out of the delete card); the rest have no row action
      const c = status === 'dead' ? curationControls(d.id, { targets: [], actions: ['keep'], keepLabel: TC.keep_token }) : { attrs: ` data-ref="${esc(d.id)}"`, controls: '<span class="faint">—</span>' };
      rows.push({ id: d.id, order: ORDER[status], uses: d.refs.total, issue, kind: 'token', html: `<tr class="row"${c.attrs} data-kind="token" data-issue="${issue ? 1 : 0}" data-occ="${d.refs.total}" data-screens="0" data-search="${esc(d.name + ' ' + (d.hex || ''))}">
        <td>${d.hex ? swatch(d.hex) : ''}${d.darkHex ? swatch(d.darkHex) : ''}</td>
        <td><div class="val mono">${esc(d.name)}</div><div class="meta"><span class="mono">${esc(d.hex || d.light || '–')}</span>${d.darkHex ? `<span class="mono faint">${esc(d.darkHex)}</span>` : ''}${d.rawVar ? `<span class="faint">← ${esc(d.rawVar)}</span>` : ''}</div></td>
        <td><span class="pill ink">${esc(TC.kind.token)}</span><div class="small faint">${esc(TC.groups[d.role] || d.role)}</div></td>
        <td class="r">${d.refs.total}</td>
        <td><span class="pill ${status === 'ok' ? 'ok' : status === 'dead' ? 'bad' : status === 'dead_library' ? '' : 'warn'}">${esc(statusText)}</span></td>
        <td class="small">${esc(action)}</td>
        <td>${c.controls}</td></tr>` });
    }
    for (const v of tok.colors.values) {
      const own = ownHard(v);
      const isPalette = !v.hardcodedCount && v.where.includes('palette');
      const libraryOnly = v.hardcodedCount > 0 && own === 0;
      if (!(own > 0 || isPalette || libraryOnly)) continue; // values reached only through a token are the token's row
      const m = mappingBySource.get(v.id);
      const cluster = clusterOf(v.id);
      const kind = libraryOnly ? 'library' : isPalette ? 'palette' : 'raw';
      const count = libraryOnly ? v.hardcodedCount : isPalette ? ((v.whereCounts || {}).palette || v.count) : own;
      let status = 'ok', statusText = '', action = TC.action.none, partner = null, issue = false;
      if (libraryOnly) { status = 'library'; statusText = TC.status.library; }
      else if (v.twinOf) { status = 'twin'; partner = v.twinOf; statusText = fmt(TC.status.twin, { token: nameOf(v.twinOf) }); const t = declaredById.get(v.twinOf); issue = true; action = t && t.modeVarying && inv.meta.css.darkStrategy !== 'none' ? fmt(TC.action.decide, { token: nameOf(v.twinOf) }) : fmt(TC.action.promote, { token: nameOf(v.twinOf) }); }
      else if (cluster && cluster.dominant && declaredById.has(cluster.dominant)) { status = isPalette ? 'palette_overlap' : 'near'; partner = cluster.dominant; const de = deTo(v, cluster.dominant); statusText = fmt(isPalette ? TC.status.palette_overlap : TC.status.near, { token: nameOf(cluster.dominant), de: de == null ? '?' : de }); issue = true; const t = declaredById.get(cluster.dominant); action = isPalette ? TC.action.palette : (t && t.modeVarying && inv.meta.css.darkStrategy !== 'none') ? fmt(TC.action.decide, { token: nameOf(cluster.dominant) }) : fmt(TC.action.merge, { token: nameOf(cluster.dominant), visual: visualWord(m && m.visualChange ? m.visualChange : de != null && de < 1 ? 'none' : de != null && de < 2 ? 'subtle' : 'visible') }); }
      else if (cluster && !isPalette) { status = 'near_raw'; partner = cluster.members.find((x) => x !== v.id) || null; statusText = fmt(TC.status.near_raw, { de: cluster.maxDeltaE }); issue = true; action = m && m.action === 'merge' && m.target ? fmt(TC.action.merge, { token: nameOf(m.target), visual: visualWord(m.visualChange) }) : TC.action.keep_rare; }
      else if (isPalette) { status = 'palette_ok'; statusText = TC.status.palette_ok; action = TC.action.palette; }
      else if (m && m.action === 'new-token') { status = 'untokenized'; statusText = fmt(TC.status.untokenized, { n: own }); action = fmt(TC.action.new_token, { name: nameOf(m.target) }); issue = true; }
      else { status = own >= 3 ? 'untokenized' : 'rare'; statusText = fmt(status === 'rare' ? TC.status.rare : TC.status.untokenized, { n: own }); action = TC.action.keep_rare; issue = status === 'untokenized'; }
      const c = curationControls(v.id, { targets: libraryOnly ? [] : colorTargets(v) });
      const paletteNames = isPalette ? [...new Set((v.sites || []).map((st) => (st.cls || '').replace(/^.*?:(?=[^:]+$)/, '').replace(/^(bg|text|border|ring|fill|stroke|from|to|via|outline|accent|caret|decoration|shadow|placeholder|divide)-/, '')).filter(Boolean))].slice(0, 3).join(', ') : '';
      rows.push({ id: v.id, order: ORDER[status], uses: count, issue, kind, html: `<tr class="row"${c.attrs} data-kind="${kind}" data-issue="${issue ? 1 : 0}" data-occ="${count}" data-screens="${v.routes.length}" data-screen-ids="${esc(v.routes.join(' '))}" data-search="${esc(v.value + ' ' + paletteNames + ' ' + v.routes.map(screenName).join(' '))}">
        <td>${swatch(v.value)}</td>
        <td><div class="val mono">${esc(v.value)} <button class="pill" data-copy="${esc(v.value)}">${esc(T.misc.copy)}</button></div><div class="meta">${paletteNames ? `<span class="mono faint">${esc(paletteNames)}</span>` : ''}${v.routes.length ? `<span>${v.routes.length} ${esc(T.misc.screens)}</span>` : ''}<span class="faint">${v.fileCount} ${esc(T.misc.files)}</span>${kind === 'raw' && v.vendoredCount ? `<span class="faint">${esc(fmt(TC.in_library, { n: v.vendoredCount }))}</span>` : ''}</div></td>
        <td><span class="pill${kind === 'raw' ? ' warn' : ''}">${esc(TC.kind[kind])}</span></td>
        <td class="r">${count}</td>
        <td>${partner ? pair(v.value, hexOf(partner)) + ' ' : ''}<span class="pill ${status === 'twin' ? 'ok' : issue ? 'warn' : ''}">${esc(statusText)}</span></td>
        <td class="small">${esc(action)}</td>
        <td>${c.controls}</td></tr>` });
    }
    rows.sort((a, b) => a.order - b.order || b.uses - a.uses || (a.id < b.id ? -1 : 1));
    const counts = { all: rows.length, issues: rows.filter((r) => r.issue).length, token: rows.filter((r) => r.kind === 'token').length, raw: rows.filter((r) => r.kind === 'raw').length, palette: rows.filter((r) => r.kind === 'palette').length, library: rows.filter((r) => r.kind === 'library').length };
    const filterBar = `<div class="filters" data-filter-for="ctable-color">${['all', 'issues', 'token', 'raw', 'palette', 'library'].filter((k) => k === 'all' || counts[k]).map((k) => `<button type="button" class="chip${k === 'all' ? ' active' : ''}" data-show="${k}">${esc(TC.filters[k])} <b>${counts[k]}</b></button>`).join('')}</div>`;
    const colorTable = rows.length ? `<div class="tablewrap"><table class="t ctable" id="ctable-color"><thead><tr>${TC.cols.map((c, i) => `<th${i === 3 ? ' class="r"' : ''}>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => r.html).join('')}</tbody></table></div>` : `<p class="muted">–</p>`;
    parts.push(`<section class="chapter" id="color"><div class="wrap">
      <div class="band"><h2>${esc(T.color.h)}</h2>${chapterStats([[T.summary.tiles.colors, n(tok.colors.values.length, 'tokens.colors.values.length')], [T.chapter.declared, n(declaredColors.length, 'tokens.declared.color')], [T.summary.tiles.hardcoded, n(hardcodedColors, 'tokens.colors.hardcoded')]])}</div>
      ${chapterSummary('color')}
      <div class="part"><h3>${esc(TC.table_h)} <span class="n">${rows.length}</span></h3><p class="help">${esc(TC.table_help)}</p>${filterBar}${colorTable}<p class="small faint">${esc(TC.legend)}</p></div>
      ${findingsBlock(findingsFor((f) => f.axis === 'color' || f.axis === 'tokens'))}
      ${noChange('color', 'color')}
      ${decisionsBlock()}
    </div></section>`);
  }

  // 04 typography
  {
    const ty = inv.tokens.typography;
    const family = (ty.fontFamilies[0] || {}).value || 'inherit';
    parts.push(`<section class="chapter" id="typography"><div class="wrap">
      <div class="band"><h2>${esc(T.typography.h)}</h2>${chapterStats([[T.typography.sizes, n(ty.fontSizes.length, 'tokens.typography.fontSizes.length')], [T.typography.weights, n(ty.fontWeights.length, 'tokens.typography.fontWeights.length')], [T.summary.axes.typography, scores.typography == null ? '–' : n(scores.typography + '%', 'scores.typography')]])}</div>
      ${chapterSummary('typography')}
      <div class="part"><h3>${esc(T.typography.sizes)} <span class="n">${ty.fontSizes.length}</span></h3><div class="typerows">${ty.fontSizes.map((f) => { const sample = (narrative && narrative.samples && narrative.samples[`typo:${f.px}`] && narrative.samples[`typo:${f.px}`].text) || T.typography.sample; const arb = ty.values.find((v) => Number(v.normalized) === f.px && v.where.includes('class-arbitrary')); return `<div class="typerow" data-search="${esc(f.px + 'px')}"><span class="k">${f.px}px${arb ? ` <span class="pill warn">${esc(T.typography.arbitrary)}</span>` : ''}</span><span class="sample" style="font-size:${f.px}px;font-family:${esc(family)}">${esc(sample)}</span><span class="k">${f.count} ${esc(T.misc.uses)}</span></div>`; }).join('')}</div></div>
      <div class="part"><h3>${esc(T.typography.weights)}</h3><div class="tags">${ty.fontWeights.map((w) => `<span class="pill" style="font-weight:${esc(w.value)}">${esc(w.value)} · ${w.count}</span>`).join('')}</div></div>
      ${ty.lineHeights.length ? `<div class="part"><h3>${esc(T.typography.line_heights)}</h3><div class="tags">${ty.lineHeights.map((w) => `<span class="pill mono">${esc(w.value)} · ${w.count}</span>`).join('')}</div></div>` : ''}
      ${ty.fontFamilies.length ? `<div class="part"><h3>${esc(T.typography.families)}</h3><div class="tags">${ty.fontFamilies.map((w) => `<span class="pill mono">${esc(w.value)} · ${w.count}</span>`).join('')}</div></div>` : ''}
      ${findingsBlock(findingsFor((f) => f.axis === 'typography'))}
      ${noChange('typography', 'typography')}
    </div></section>`);
  }

  // 05 spacing
  {
    const sp = inv.tokens.spacing;
    const maxPx = Math.max(...sp.sorted, 1);
    const padRows = [];
    for (const type of TYPES) for (const s of inv.components[type].signatures.filter((x) => x.count > 0 && x.resolved)) if (s.computed.paddingX != null || s.computed.paddingY != null) padRows.push({ type, s });
    parts.push(`<section class="chapter" id="spacing"><div class="wrap">
      <div class="band"><h2>${esc(T.spacing.h)}</h2>${chapterStats([[T.spacing.ruler, n(sp.sorted.length, 'tokens.spacing.sorted.length')], [T.spacing.off, n(sp.offScale.length, 'tokens.spacing.offScale.length')], [T.summary.axes.spacing, scores.spacing == null ? '–' : n(scores.spacing + '%', 'scores.spacing')]])}</div>
      ${chapterSummary('spacing')}
      <div class="part"><h3>${esc(T.spacing.ruler)}</h3><p class="help">${sp.dominantStep ? esc(fmt(T.spacing.base, { px: sp.dominantStep, basis: sp.scaleBasis })) : ''}</p><div class="ruler">${sp.sorted.map((v) => { const val = sp.values.find((x) => Number(x.normalized) === v); const off = sp.offScale.includes(v); return `<div class="r${off ? ' off' : ''}" data-search="${esc(v + 'px')}"><span class="k">${v}px${off ? ` · ${esc(T.spacing.off)}` : ''}</span><span><i class="bar" style="width:${Math.max(1, (v / maxPx) * 100)}%"></i></span><span class="k">${val ? val.count : ''} ${esc(T.misc.uses)}</span></div>`; }).join('')}</div></div>
      ${sp.offScale.length ? `<div class="part"><h3>${esc(T.spacing.off)}</h3><div class="rows">${sp.values.filter((v) => sp.offScale.includes(Number(v.normalized))).map((v) => { const c = curationControls(v.id, { targets: [{ id: `tok+:spacing.${Math.round(Number(v.normalized) / (sp.dominantStep || 4)) * (sp.dominantStep || 4)}`, label: `${Math.round(Number(v.normalized) / (sp.dominantStep || 4)) * (sp.dominantStep || 4)}px`, visual: 'subtle' }] }); return `<div class="row wide"${c.attrs} data-occ="${v.count}" data-screens="${v.routes.length}" data-screen-ids="${esc(v.routes.join(' '))}"><div><div class="val">${esc(v.normalized)}px</div><div class="meta"><span>${v.count} ${esc(T.misc.uses)}</span><span>${v.routes.length} ${esc(T.misc.screens)}</span><span class="faint">${esc(v.where.join(' · '))}</span></div>${c.recoText ? `<div class="reco">${c.recoText}</div>` : ''}<div class="tags small">${screenChips(v.routes, 3)}</div></div>${c.controls}</div>`; }).join('')}</div></div>` : ''}
      ${padRows.length ? `<div class="part"><h3>${esc(T.spacing.padding_h)}</h3><div class="tablewrap"><table class="t"><thead><tr>${T.spacing.padding_cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${padRows.slice(0, 40).map(({ type, s }) => `<tr><td>${esc(tl[type])}</td><td class="small">${esc(s.variantProps && Object.keys(s.variantProps).length ? Object.entries(s.variantProps).map(([k, v]) => `${k}=${v}`).join(' ') : s.adHoc ? T.components.adhoc : T.components.base)} · ${s.count}</td><td class="r">${px(s.computed.heightPx)}</td><td class="r">${px(s.computed.paddingX)}</td><td class="r">${px(s.computed.paddingY)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
      ${findingsBlock(findingsFor((f) => f.axis === 'spacing'))}
      ${noChange('spacing', 'spacing')}
    </div></section>`);
  }

  // 06 radius & borders
  {
    const rd = inv.tokens.radius, bd = inv.tokens.border;
    const declaredR = inv.tokens.declared.filter((d) => d.axis === 'radius' && d.source === 'project');
    parts.push(`<section class="chapter" id="radius"><div class="wrap">
      <div class="band"><h2>${esc(T.radius.h)}</h2>${chapterStats([[T.radius.shapes, n(rd.values.length, 'tokens.radius.values.length')], [T.summary.axes.radius, scores.radius == null ? '–' : n(scores.radius + '%', 'scores.radius')]])}</div>
      ${chapterSummary('radius')}
      ${declaredR.length ? `<div class="part"><h3>${esc(T.chapter.declared)}</h3><div class="tags">${declaredR.map((d) => `<span class="pill mono">${esc(d.name)} = ${esc(d.light)}${d.refs.total === 0 ? ` · ${esc(T.color.dead)}` : ''}</span>`).join('')}</div></div>` : ''}
      <div class="part"><h3>${esc(T.radius.shapes)}</h3><p class="help">${esc(T.radius.krds)}</p><div class="shapes">${rd.values.map((v) => { const arb = v.where.includes('class-arbitrary') || v.where.includes('inline-style') || v.where.includes('css-literal'); return `<div class="shape${arb ? ' off' : ''}" data-search="${esc(v.normalized)}"><i style="border-radius:${v.normalized === 'full' ? '999px' : v.normalized + 'px'}"></i><span class="mono">${v.normalized === 'full' ? esc(T.radius.full) : v.normalized + 'px'}</span> · ${v.count}${arb ? ` <span class="pill warn">raw</span>` : ''}</div>`; }).join('')}</div></div>
      ${rd.values.some((v) => v.hardcodedCount > 0) ? `<div class="rows">${rd.values.filter((v) => v.hardcodedCount > 0).map((v) => { const targets = declaredR.map((d) => ({ id: d.id, label: `${d.name} (${d.light})`, visual: 'subtle' })); const c = curationControls(v.id, { targets }); return `<div class="row wide"${c.attrs} data-occ="${v.hardcodedCount}" data-screens="${v.routes.length}" data-screen-ids="${esc(v.routes.join(' '))}"><div><div class="val">${v.normalized === 'full' ? esc(T.radius.full) : v.normalized + 'px'}</div><div class="meta"><span>${v.hardcodedCount} ${esc(T.misc.uses)}</span><span>${v.routes.length} ${esc(T.misc.screens)}</span></div>${c.recoText ? `<div class="reco">${c.recoText}</div>` : ''}<div class="tags small">${screenChips(v.routes, 3)}</div></div>${c.controls}</div>`; }).join('')}</div>` : ''}
      ${bd.values.length ? `<div class="part"><h3>${esc(T.radius.borders)}</h3><div class="tags">${bd.values.map((v) => `<span class="pill mono">${esc(v.normalized)}px · ${v.count}</span>`).join('')}</div></div>` : ''}
      ${findingsBlock(findingsFor((f) => f.axis === 'radius' || f.axis === 'border'))}
      ${noChange('radius', 'radius')}
    </div></section>`);
  }

  // 07 shadows
  {
    const sh = inv.tokens.shadows;
    parts.push(`<section class="chapter" id="shadow"><div class="wrap">
      <div class="band"><h2>${esc(T.shadow.h)}</h2>${chapterStats([[T.shadow.stack, n(sh.values.length, 'tokens.shadows.values.length')], [T.summary.axes.shadow, scores.shadow == null ? '–' : n(scores.shadow + '%', 'scores.shadow')]])}</div>
      ${chapterSummary('shadow')}
      <div class="part"><h3>${esc(T.shadow.stack)}</h3>${sh.values.length ? `<div class="shadows">${sh.values.map((v) => `<div class="shadowcard" style="box-shadow:${esc(v.value)}" data-search="shadow ${esc(v.value)}"><span>${esc(v.value.slice(0, 28))}${v.value.length > 28 ? '…' : ''}<br>${v.count} ${esc(T.misc.uses)}${v.hardcodedCount ? ' · raw' : ''}</span></div>`).join('')}</div>` : '<p class="muted">–</p>'}</div>
      ${findingsBlock(findingsFor((f) => f.axis === 'shadow'))}
      ${noChange('shadow', 'shadow')}
    </div></section>`);
  }

  // 08 components
  {
    const sections = TYPES.map((type) => {
      const t = inv.components[type];
      const sigs = t.signatures.filter((s) => s.count > 0);
      const catalogOnly = t.signatures.filter((s) => s.count === 0 && s.catalogCount > 0);
      const impls = t.implementations.filter((i) => i.count > 0 && i.kind !== 'wrapper');
      if (!t.total && !catalogOnly.length) return `<div class="typeh" id="c-${type}"><h3>${esc(tl[type])}</h3><span class="stat muted">${esc(T.components.none)}</span></div>`;
      const implText = impls.map((i) => (i.kind === 'native' ? fmt(T.components.impl_native, { tag: i.name }) : i.name) + (i.primitive ? ` (${i.primitive})` : '')).join(' · ');
      const baseSig = sigs.find((s) => !s.adHoc) || sigs[0];
      const diffRows = (s) => { if (!baseSig || s === baseSig) return ''; const keys = ['heightPx', 'radiusPx', 'paddingX', 'paddingY', 'fontSizePx', 'fontWeight', 'borderWidthPx']; const rows = keys.filter((k) => (s.computed[k] ?? null) !== (baseSig.computed[k] ?? null) && (s.computed[k] != null || baseSig.computed[k] != null)); const colors = ['bg', 'fg', 'border'].filter((k) => (s.computed[k].light || null) !== (baseSig.computed[k].light || null)); if (!rows.length && !colors.length) return ''; return `<table class="diff"><tr><th></th><th>${esc(T.components.base)}</th><th>${esc(T.components.adhoc)}</th></tr>${rows.map((k) => `<tr><td>${k.replace('Px', '')}</td><td>${px(baseSig.computed[k])}</td><td class="d">${px(s.computed[k])}</td></tr>`).join('')}${colors.map((k) => `<tr><td>${k}</td><td>${baseSig.computed[k].light ? swatch(baseSig.computed[k].light) + ' ' : ''}${esc(baseSig.computed[k].light || '–')}</td><td class="d">${s.computed[k].light ? swatch(s.computed[k].light) + ' ' : ''}${esc(s.computed[k].light || '–')}</td></tr>`).join('')}</table>`; };
      const sigTargets = sigs.filter((s) => !s.adHoc).map((s) => ({ id: s.id, label: nameOf(s.id), visual: 'visible' }));
      const rowsHtml = sigs.map((s) => {
        const c = curationControls(s.id, { targets: s.adHoc ? sigTargets : [] });
        const stLabel = (k, v) => `<span class="${v === 'yes' ? 'yes' : v === 'no' || v === 'removed' ? 'no' : ''}">${esc(T.components.states[k])}: ${esc(v === 'yes' ? T.components.state_yes : v === 'no' ? T.components.state_no : v === 'removed' ? T.components.state_removed : v === 'ua-default' ? T.components.state_ua : v)}</span>`;
        const states = ['hover', 'focusVisible', 'disabled'].concat(['checkbox', 'radio', 'toggle'].includes(type) ? ['checked'] : []).concat(inv.meta.css.darkStrategy !== 'none' ? ['dark'] : []).map((k) => stLabel(k, s.states[k])).join('');
        const variant = s.variantProps && Object.keys(s.variantProps).length ? Object.entries(s.variantProps).map(([k, v]) => `<span class="pill">${esc(k)}=${esc(v)}</span>`).join('') : '';
        const implNames = s.implIds.map((id) => { const i = t.implementations.find((x) => x.id === id); return i ? (i.kind === 'native' ? fmt(T.components.impl_native, { tag: i.name }) : i.name) : id; }).join(', ');
        return `<div class="sigrow"${s.adHoc ? c.attrs : ` data-sig="${esc(s.id)}"`} data-occ="${s.count}" data-screens="${s.routes.length}" data-screen-ids="${esc(s.routes.join(' '))}" data-search="${esc(tl[type] + ' ' + s.spelling + ' ' + s.routes.map(screenName).join(' ') + ' ' + (s.labels || []).join(' '))}">
          ${specimenBlock(s.id)}
          <div><div class="title">${s.adHoc ? `<span class="pill warn">${esc(T.components.adhoc)}</span>` : `<span class="pill ok">${esc(T.components.base)}</span>`}${variant}<span class="muted small">${esc(implNames)}</span></div>
            <div class="meta" style="display:flex;gap:12px;flex-wrap:wrap;font-size:13px;color:var(--ink-2);margin-top:6px"><span>${s.count} ${esc(T.misc.uses)}</span><span>${s.routes.length} ${esc(T.misc.screens)}</span><span>h ${px(s.computed.heightPx)}</span><span>r ${px(s.computed.radiusPx)}</span>${s.computed.bg.light ? `<span>${swatch(s.computed.bg.light)} ${esc(s.computed.bg.light)}</span>` : ''}</div>
            <div class="states">${states}</div>
            ${s.adHoc ? diffRows(s) : ''}
            ${s.unresolvedClasses.length ? `<div class="small faint">${esc(fmt(T.components.unresolved, { n: s.unresolvedClasses.length }))}: ${esc(s.unresolvedClasses.join(' '))}</div>` : ''}
            <div class="tags small" style="margin-top:6px">${screenChips(s.routes, 4)}</div>
            <div class="classes devonly">${esc(s.spelling)}</div>
            ${c.recoText ? `<div class="reco">${c.recoText}</div>` : ''}
          </div>
          ${s.adHoc ? c.controls : '<div></div>'}
        </div>`;
      }).join('');
      return `<div class="typeh" id="c-${type}"><h3>${esc(tl[type])}</h3><span class="stat">${esc(fmt(T.components.looks, { looks: t.looks, uses: t.total }))}${t.unresolvedLooks ? ` · ${esc(fmt(T.components.unresolved, { n: t.unresolvedLooks }))}` : ''}</span><span class="stat">${esc(fmt(T.components.impl, { n: impls.length }))}: ${esc(implText)}</span>${catalogOnly.length ? `<span class="stat faint">${esc(fmt(T.components.catalog_only, { n: catalogOnly.length }))}</span>` : ''}</div><div class="rows">${rowsHtml}</div>`;
    }).join('');
    parts.push(`<section class="chapter" id="components"><div class="wrap">
      <div class="band"><h2>${esc(T.components.h)}</h2>${chapterStats([[T.summary.tiles.looks, n(totalLooks, 'components.looks')], [T.summary.tiles.adhoc, n(adHocLooks, 'components.adhoc')], [T.summary.axes.component, scores.component == null ? '–' : n(scores.component + '%', 'scores.component')]])}</div>
      ${chapterSummary('components')}
      ${inv.meta.mode === 'css-only' ? `<p class="help">${esc(T.components.css_only)}</p>` : sections}
      ${findingsBlock(findingsFor((f) => f.axis.startsWith('component') || f.axis === 'classes'))}
      ${decisionsBlock()}
    </div></section>`);
  }

  // 09 relations
  {
    const groups = (inv.relationships.siblingGroups || []).filter((g) => (g.mismatch.radius || g.mismatch.height) && !g.catalog);
    parts.push(`<section class="chapter" id="relations"><div class="wrap">
      <div class="band"><h2>${esc(T.relations.h)}</h2>${chapterStats([[T.nav.relations, n(groups.length, 'relationships.mismatches')]])}</div>
      <p class="help">${esc(T.relations.help)}</p>
      ${groups.length ? `<div class="findings">${groups.map((g) => { const sp = groupSpec.get(g.id); const what = [g.mismatch.radius ? fmt(T.relations.mismatch, { what: T.relations.radius, values: g.radiusPx.map((r) => r == null ? '?' : r === 'full' ? '∞' : r + 'px').join(' / ') }) : '', g.mismatch.height ? fmt(T.relations.mismatch, { what: T.relations.height, values: g.heightPx.map((r) => r == null ? '?' : r + 'px').join(' / ') }) : ''].filter(Boolean).join(' · '); return `<div class="relrow" data-search="${esc(g.memberTypes.map((t) => tl[t]).join(' ') + ' ' + g.routes.map(screenName).join(' '))}"><div class="why"><b>${esc(what)}</b> — ${esc(g.memberTypes.map((t) => tl[t]).join(' + '))}</div>${sp ? `<div class="stage" data-html="${esc(sp.html)}" data-state="default"><iframe title="row" loading="lazy"></iframe></div>` : ''}<div class="tags small">${screenChips([...g.routes, ...(g.layoutScope || [])], 5)}</div><details class="dev devonly"><summary>${esc(T.dev.sites)}</summary><ul><li>${esc(g.file)}:${g.line} · ${esc(g.containerClasses)}</li></ul></details></div>`; }).join('')}</div>` : `<p class="muted">${esc(T.relations.none)}</p>`}
    </div></section>`);
  }

  // 10 proposal
  {
    const rows = [];
    if (proposal) {
      for (const d of inv.tokens.declared.filter((x) => x.source === 'project' && x.axis === 'color')) { const absorbs = proposal.mapping.filter((m) => m.target === d.id).map((m) => m.source); rows.push({ sw: d.hex, name: d.name, value: d.hex || d.light, absorbs, uses: d.refs.total, status: T.proposal.existing }); }
      for (const t of proposal.newTokens) rows.push({ sw: t.value, name: t.name, value: t.value, absorbs: t.absorbs, uses: t.occurrences, status: T.proposal.new });
    }
    parts.push(`<section class="chapter" id="proposal"><div class="wrap">
      <div class="band"><h2>${esc(T.proposal.h)}</h2>${proposal ? chapterStats([[T.proposal.new, n(proposal.newTokens.length, 'proposal.newTokens.length')], ['', esc(fmt(T.proposal.layers, { n: proposal.architecture.layers }))]]) : ''}</div>
      <p class="help">${esc(T.proposal.help)}</p>
      ${proposal ? `${chapterSummary('proposal')}<div class="tablewrap"><table class="t"><thead><tr>${T.proposal.cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr data-search="${esc(r.name)}"><td>${r.sw ? swatch(r.sw) : ''}</td><td class="mono">${esc(r.name)}</td><td class="mono small">${esc(r.value)}</td><td>${r.absorbs.length ? `<span class="strip">${r.absorbs.map((id) => { const h = (colorById.get(id) || {}).value; return h ? `<i style="background:${esc(h)}" title="${esc(h)}"></i>` : ''; }).join('')}</span> <span class="small mono">${r.absorbs.map(nameOf).map(esc).join(', ')}</span>` : '–'}</td><td class="r">${r.uses}</td><td><span class="pill${r.status === T.proposal.new ? ' ink' : ''}">${esc(r.status)}</span></td></tr>`).join('')}</tbody></table></div>` : `<p class="muted">${esc(T.proposal.none)}</p>`}
    </div></section>`);
  }

  // 11 cards
  {
    parts.push(`<section class="chapter" id="cards"><div class="wrap">
      <div class="band"><h2>${esc(T.cards.h)}</h2>${cards.length ? chapterStats([[T.summary.tiles.cards, n(cards.length, 'cards.length')]]) : ''}</div>
      <p class="help">${esc(T.cards.help)}</p>
      ${cards.length ? `<div class="cards">${cards.map((c) => { const nc = narrative && narrative.cards && narrative.cards[c.id]; const entries = c.entries.map((e) => ({ source: e.source, target: e.target, action: e.action })); return `<article class="card" id="${c.id}" data-card="${c.id}" data-entries="${esc(JSON.stringify(entries))}" data-search="${esc(c.title + ' ' + c.kind)}">
        <div class="head"><span class="id mono">${c.id}</span><h4>${esc((nc && nc.title) || cardText(c).title)}</h4><span class="pill ${c.visualChange === 'none' ? 'ok' : c.visualChange === 'subtle' ? 'warn' : 'bad'}">${esc(T.cards.visual[c.visualChange])}</span><span class="pill">${esc(T.cards.safety[c.safety])}</span><span class="pill">${c.grade}</span><span class="pill status">${esc(T.cards.status[c.status] || c.status)}</span></div>
        <div class="body"><p>${esc((nc && nc.why) || cardText(c).summary)}</p><div class="small muted">${esc(fmt(T.cards.impact, { occ: c.impact.occurrences, screens: c.impact.screens, files: c.impact.files }))}${c.findings.length ? ' · ' + c.findings.map((f) => { const ff = findings && findings.findings.find((x) => x.id === f); return ff ? `<a href="#${f}">F${ff.num}</a>` : ''; }).filter(Boolean).join(' ') : ''}</div>
        ${c.entries.length ? `<details><summary class="small">${esc(fmt(T.cards.entries, { n: c.entries.length }))}</summary><ul class="entries plain">${c.entries.slice(0, 40).map((e) => `<li>${esc(nameOf(e.source))} → ${esc(nameOf(e.target))} <span class="faint">· ${e.occurrences} · ${esc(T.cards.visual[e.visualChange] || e.visualChange)}</span></li>`).join('')}${c.entries.length > 40 ? `<li>${esc(fmt(T.misc.and_more, { n: c.entries.length - 40 }))}</li>` : ''}</ul></details>` : ''}</div>
        <div class="foot">${c.entries.length ? `<button class="btn add" type="button">${esc(T.cards.add)}</button>` : ''}<span class="faint small">${esc(c.kind)}${c.prereq && c.prereq.length ? ' · after ' + c.prereq.join(', ') : ''}</span></div>
      </article>`; }).join('')}</div>` : `<p class="muted">${esc(T.cards.none)}</p>`}
    </div></section>`);
  }

  // 12 delta
  {
    let body = `<p class="muted">${esc(T.delta.none)}</p>`;
    if (delta) {
      const yes = lang === 'ko' ? '예' : 'yes', no = lang === 'ko' ? '아니오' : 'no';
      const arrow = (v, metric) => v.before === v.after ? `<b class="same">${n(v.after == null ? '–' : v.after, metric + '.after')}</b><span class="muted">${esc(T.delta.unchanged)}</span>` : `<b>${n(v.before == null ? '–' : v.before, metric + '.before')} → ${n(v.after == null ? '–' : v.after, metric + '.after')}</b>`;
      const appliedRows = (delta.applied || []).map((a) => `<li><b>${esc(fmt(T.delta.applied_row, { card: a.cardId, applied: a.applied, files: a.files }))}</b>${a.commit ? ` <span class="muted mono">${esc(fmt(T.delta.commit, { sha: a.commit.slice(0, 7) }))}</span>` : ''}${a.typecheck === true ? ` <span class="pill ok">${esc(T.delta.typecheck_ok)}</span>` : a.typecheck === false ? ` <span class="pill warn">${esc(T.delta.typecheck_fail)}</span>` : ''}</li>`).join('');
      const scoreTiles = Object.entries(delta.scores || {}).map(([k, v]) => `<div class="tile delta">${arrow(v, `delta.scores.${k}`)}<span>${esc(k === 'composite' ? (lang === 'ko' ? '종합' : 'Overall') : al[k] || k)}</span></div>`).join('');
      const lookPills = Object.entries(delta.looks || {}).filter(([, v]) => v.before != null).map(([k, v]) => `<span class="pill${v.before !== v.after ? ' ok' : ''}">${esc(fmt(T.delta.looks, { type: tl[k] || k, before: v.before, after: v.after }))}</span>`).join('');
      const valueRows = Object.entries(delta.values || {}).map(([k, v]) => `<tr><td>${esc((T.delta.values || {})[k] || k)}</td><td class="r">${n(v.before, `delta.values.${k}.before`)}</td><td class="r">${n(v.after, `delta.values.${k}.after`)}</td><td class="r">${v.after === v.before ? `<span class="muted">${esc(T.delta.unchanged)}</span>` : v.after < v.before ? `<span class="ok">−${v.before - v.after}</span>` : `<span class="warn">+${v.after - v.before}</span>`}</td></tr>`).join('');
      const fd = delta.findings || { resolved: [], remaining: [], new: [] };
      const findingPills = `<span class="pill ok">${esc(fmt(T.delta.resolved, { n: fd.resolved.length }))}</span><span class="pill">${esc(fmt(T.delta.remaining, { n: fd.remaining.length }))}</span><span class="pill${fd.new.length ? ' warn' : ''}">${esc(fmt(T.delta.new, { n: fd.new.length }))}</span>`;
      const moved = (delta.occurrences && delta.occurrences.moved) || [];
      const movedList = moved.length ? `<ul class="plain">${moved.slice(0, 40).map((m) => `<li><b>${esc(tl[m.type] || m.type)}</b>${m.label ? ` “${esc(m.label)}”` : ''} · ${esc((m.routes || []).map(screenName).join(', ') || (lang === 'ko' ? '화면 미상' : 'no screen'))} <span class="devonly muted mono">${esc(m.file)}:${m.line} · ${esc(m.from.slice(-8))} → ${esc(m.to.slice(-8))}</span></li>`).join('')}${moved.length > 40 ? `<li class="muted">+${moved.length - 40}</li>` : ''}</ul>` : `<p class="muted">${esc(T.delta.moved_none)}</p>`;
      const tokenRows = (delta.tokens || []).map((t) => `<tr><td class="mono">${esc(t.name)}</td><td>${t.axis === 'color' && t.light ? swatch(t.light) + ' ' : ''}${esc(t.light || '')}</td><td>${t.axis === 'color' && t.dark ? swatch(t.dark) + ' ' : ''}${esc(t.dark || '')}</td><td class="r">${esc(t.refs)}</td><td>${t.isNew ? `<span class="pill ok">${esc(T.delta.token_new)}</span>` : ''}</td></tr>`).join('');
      const removed = (delta.removedTokens || []).length ? `<p class="muted">${esc(fmt(T.delta.removed, { names: delta.removedTokens.join(', ') }))}</p>` : '';
      const skipped = (delta.skipped || []).length ? `<ul class="plain">${delta.skipped.map((k) => `<li><span class="mono">${esc(k.cardId)}</span> ${k.file ? `<span class="devonly mono">${esc(k.file)}${k.line ? ':' + k.line : ''}</span> ` : ''}<span class="muted">${esc(k.reason)}</span></li>`).join('')}</ul>` : `<p class="muted">${esc(T.delta.skipped_none)}</p>`;
      body = `<p class="help">${esc(fmt(T.delta.conditions, { baseline: delta.baseline, same: delta.comparable && delta.comparable.sameScanner ? yes : no, filesBefore: delta.comparable ? delta.comparable.filesBefore : '–', filesAfter: delta.comparable ? delta.comparable.filesAfter : '–' }))}</p>`
        + (appliedRows ? `<div class="part"><h3>${esc(T.delta.applied_h)}</h3><ul class="plain">${appliedRows}</ul></div>` : '')
        + `<div class="part"><h3>${esc(T.delta.scores_h)}</h3><div class="tiles">${scoreTiles}</div></div>`
        + `<div class="part"><h3>${esc(T.delta.looks_h)}</h3><div class="tags">${lookPills}</div></div>`
        + `<div class="part"><h3>${esc(T.delta.values_h)}</h3><div class="tablewrap"><table class="t"><thead><tr><th></th><th class="r">${lang === 'ko' ? '전' : 'before'}</th><th class="r">${lang === 'ko' ? '후' : 'after'}</th><th class="r">Δ</th></tr></thead><tbody>${valueRows}</tbody></table></div></div>`
        + `<div class="part"><h3>${esc(T.delta.findings_h)}</h3><div class="tags">${findingPills}</div></div>`
        + `<div class="part"><h3>${esc(T.delta.moved_h)}</h3>${movedList}</div>`
        + `<div class="part"><h3>${esc(T.delta.tokens_h)}</h3><div class="tablewrap"><table class="t"><thead><tr>${T.delta.tokens_cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${tokenRows}</tbody></table></div>${removed}</div>`
        + `<div class="part"><h3>${esc(T.delta.skipped_h)}</h3>${skipped}</div>`;
    }
    parts.push(`<section class="chapter" id="delta"><div class="wrap"><div class="band"><h2>${esc(T.delta.h)}</h2></div>${body}</div></section>`);
  }

  // 13 method
  {
    const f = inv.meta.files;
    const ver = verification ? verification.checks || verification.expectations || [] : [];
    parts.push(`<section class="chapter" id="method"><div class="wrap">
      <div class="band"><h2>${esc(T.method.h)}</h2></div>
      <dl class="kv"><dt>${esc(T.method.coverage)}</dt><dd>${esc(fmt(T.method.coverage_text, { scanned: f.scanned, listed: f.listed, source: f.listSource, failed: f.parseFailed.length, dynamic: inv.classes.dynamicSites.length, unresolved: inv.classes.unresolved.length }))}</dd>
      <dt>${esc(T.summary.score)}</dt><dd>${esc(T.method.score_formula)}</dd>
      <dt>${esc(T.typography.families)}</dt><dd>${esc(T.method.fonts)}${specimens && specimens.fonts && specimens.fonts.length ? ' ' + specimens.fonts.map((x) => `${x.url} (${x.status})`).join(', ') : ''}</dd>
      ${ver.length ? `<dt>${esc(T.method.verification)}</dt><dd><ul class="plain">${ver.map((c) => `<li>${c.passed === true ? '✓' : c.passed === false ? '✗' : '…'} ${esc(c.id || '')} ${esc(c.text || c.title || '')}${c.evidence ? ` <span class="faint">— ${esc(c.evidence)}</span>` : ''}</li>`).join('')}</ul></dd>` : ''}
      ${inv.classes.unresolved.length ? `<dt>${esc(T.dev.classes)}</dt><dd class="mono small">${inv.classes.unresolved.slice(0, 30).map((u) => `${esc(u.cls)} (${esc(u.reason)}, ${u.count})`).join(', ')}${inv.classes.unresolved.length > 30 ? ' ' + esc(fmt(T.misc.and_more, { n: inv.classes.unresolved.length - 30 })) : ''}</dd>` : ''}
      ${inv.classes.dynamicSites.length ? `<dt>dynamic</dt><dd class="mono small">${inv.classes.dynamicSites.slice(0, 20).map((d) => `${esc(d.file)}:${d.line} ${esc(d.expr)}`).join('<br>')}</dd>` : ''}
      ${narrative && narrative.limits && narrative.limits.length ? `<dt>limits</dt><dd><ul class="plain">${narrative.limits.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></dd>` : ''}
      </dl>
      <ul class="plain" style="margin-top:18px">${T.method.honesty.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>
      <footer>design-polish ${esc(inv.meta.scannerVersion)} · ${esc(inv.meta.generatedAt)} · ${esc(project)}</footer>
    </div></section>`);
  }
  parts.push('</main>');
  // cart + toast
  parts.push(`<aside class="cart" id="cart"><div class="wrap"><span class="sum"></span><button class="btn send" type="button">${esc(T.cart.send)}</button><button class="btn ghost copy" type="button">${esc(T.cart.copy)}</button><button class="btn ghost save" type="button">${esc(T.cart.save)}</button><button class="btn ghost clear" type="button">${esc(T.cart.clear)}</button><span class="warn hidden"></span></div></aside><div class="toast" id="toast"></div>`);

  const fontStack = (inv.tokens.typography.fontFamilies[0] || {}).value || "system-ui, sans-serif";
  const liveCss = specimens ? (specimens.liveCss || '') + '\n' + (specimens.stateCss || '') : '';
  const dataScript = `<script>window.__DP=${JSON.stringify({ runId, inventoryHash, lang, fontStack, i18n: { curation: T.curation, cart: T.cart, cards: { visual: T.cards.visual, status: T.cards.status }, chapter: T.chapter, misc: T.misc, components: T.components } }).replace(/</g, '\\u003c')};</script>`;
  const title = fmt(T.title, { project });
  const html = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="generator" content="design-polish ${esc(inv.meta.scannerVersion)}">
<style>${css}</style>
</head>
<body>
${parts.join('\n')}
<script id="live-css" type="text/plain">${liveCss.replace(/<\/script/gi, '<\\/script')}</script>
${dataScript}
<script>${js}</script>
</body>
</html>`;

  // chat summary (≤5 lines; numbers from the same data)
  const lowest = ['color', 'typography', 'spacing', 'radius', 'shadow', 'component'].filter((a) => scores[a] != null).sort((a, b) => scores[a] - scores[b])[0];
  const noEngine = inv.meta.css.engine === 'none' || inv.meta.css.error;
  const cssOnly = inv.meta.mode === 'css-only';
  const chat = [
    ...(cssOnly ? [lang === 'ko' ? `CSS만 조사했습니다: React/JSX 코드가 없어 스타일시트 ${inv.meta.files.css}개${inv.meta.templates ? `(템플릿 <style> ${inv.meta.templates}개 포함)` : ''}의 색·여백·모서리·그림자만 셌고, 컴포넌트와 화면은 조사하지 않았습니다` : `CSS-only inventory: no React/JSX code, so colours, spacing, corners and shadows come from ${inv.meta.files.css} stylesheet(s)${inv.meta.templates ? ` (including <style> blocks in ${inv.meta.templates} templates)` : ''}; components and screens were not inventoried`] : []),
    ...(noEngine ? [lang === 'ko' ? `주의: Tailwind 엔진을 찾지 못해 클래스 값을 계산하지 못했습니다${inv.meta.css.error ? ` (${inv.meta.css.error})` : ''}. 색·여백·모서리 점수는 비워 두고, 모양은 클래스 이름으로만 구분합니다` : `Note: no Tailwind engine was found, so class values were not compiled${inv.meta.css.error ? ` (${inv.meta.css.error})` : ''} — colour/spacing/corner scores are empty and looks are keyed by class names`] : []),
    lang === 'ko' ? `일관성 점수 ${scores.composite ?? '–'} · 가장 낮은 축: ${al[lowest] || '–'} ${scores[lowest] ?? ''}` : `Consistency ${scores.composite ?? '–'} · lowest axis: ${al[lowest] || '–'} ${scores[lowest] ?? ''}`,
    lang === 'ko' ? `컴포넌트 모양 ${totalLooks}가지(${typesPresent}종) · 일회성 ${adHocLooks} · 직접 쓴 색 ${hardcodedColors}종` : `${totalLooks} component looks across ${typesPresent} types · ${adHocLooks} one-off · ${hardcodedColors} raw colors`,
    ...topFindings.slice(0, 2).map((f) => `F${f.num} ${(narrative && narrative.findings && narrative.findings[f.id] && narrative.findings[f.id].title) || ruleTitle(f)}`),
  ];
  return { html, chat: chat.join('\n'), lang };
}

function main() {
  const args = process.argv.slice(2);
  const runDir = args.find((a) => !a.startsWith('-'));
  if (!runDir) { console.error('usage: render.js <run-dir> [--lang en|ko] [--out report.html] [--project name]'); process.exit(2); }
  const get = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
  const { html, chat } = build(runDir, { lang: get('--lang'), project: get('--project') });
  const out = get('--out') || path.join(runDir, 'report.html');
  fs.writeFileSync(out, html);
  fs.writeFileSync(path.join(runDir, 'chat-summary.md'), chat + `\n→ ${out}\n`);
  process.stdout.write(`report: ${out} (${Math.round(html.length / 1024)}KB)\n${chat}\n`);
}

if (require.main === module) main();
module.exports = { build };
