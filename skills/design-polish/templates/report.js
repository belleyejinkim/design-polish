/* design-polish report — client behaviour. No dependencies, works from file:// and from the local server. */
(function () {
  'use strict';
  var DP = window.__DP || {};
  var T = DP.i18n || {};
  var runId = DP.runId || 'run';
  var served = location.protocol === 'http:' || location.protocol === 'https:';
  var storeKey = 'dp:' + runId;
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  var fmt = function (s, vars) { return String(s || '').replace(/\{(\w+)\}/g, function (_, k) { return vars && vars[k] != null ? vars[k] : ''; }); };

  /* ---------- scrollspy ---------- */
  var chips = $$('.topnav .chip');
  var chapters = $$('.chapter[id]');
  if ('IntersectionObserver' in window && chapters.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) chips.forEach(function (c) { c.classList.toggle('active', c.getAttribute('href') === '#' + e.target.id); }); });
    }, { rootMargin: '-15% 0px -75% 0px' });
    chapters.forEach(function (c) { io.observe(c); });
  }

  /* ---------- developer info toggle ---------- */
  var devToggle = $('#devToggle');
  try { if (localStorage.getItem('dp:dev') === '1') document.body.classList.add('dev'); } catch (e) {}
  if (devToggle) { devToggle.checked = document.body.classList.contains('dev'); devToggle.addEventListener('change', function () { document.body.classList.toggle('dev', devToggle.checked); try { localStorage.setItem('dp:dev', devToggle.checked ? '1' : '0'); } catch (e) {} }); }

  /* ---------- search ---------- */
  var search = $('#search');
  if (search) {
    var items = $$('[data-search]');
    search.addEventListener('input', function () {
      var q = search.value.trim().toLowerCase();
      items.forEach(function (el) { el.classList.toggle('hidden', !!q && el.getAttribute('data-search').toLowerCase().indexOf(q) < 0); });
    });
  }

  /* ---------- specimens ---------- */
  var liveCssEl = $('#live-css');
  var liveCss = liveCssEl ? liveCssEl.textContent : '';
  var baseCss = 'html,body{margin:0;background:transparent}body{padding:14px 16px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;min-height:28px;font-family:' + (DP.fontStack || 'system-ui,sans-serif') + '}body.dp-dark{color-scheme:dark}';
  function mountSpecimen(stage) {
    if (stage.getAttribute('data-mounted')) return;
    stage.setAttribute('data-mounted', '1');
    var iframe = stage.querySelector('iframe');
    var html = stage.getAttribute('data-html') || '';
    var doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write('<!doctype html><html><head><meta charset="utf-8"><style>' + liveCss + '</style><style>' + baseCss + '</style></head><body class="dp-specimen">' + html + '</body></html>');
    doc.close();
    var fit = function () { try { var h = doc.body ? doc.body.scrollHeight : 56; iframe.style.height = Math.max(44, Math.min(h + 2, 600)) + 'px'; } catch (e) {} };
    fit(); setTimeout(fit, 60); setTimeout(fit, 400);
    applyState(stage, stage.getAttribute('data-state') || 'default');
  }
  function applyState(stage, state) {
    var iframe = stage.querySelector('iframe');
    var doc = iframe && iframe.contentDocument;
    if (!doc || !doc.body) return;
    var roots = $$('[data-dp-root]', doc);
    var dark = stage.getAttribute('data-dark') === '1';
    doc.body.classList.toggle('dark', dark);
    doc.body.classList.toggle('dp-dark', dark);
    doc.documentElement.classList.toggle('dark', dark);
    roots.forEach(function (root) {
      root.removeAttribute('data-sim');
      if (root.hasAttribute('data-dp-disabled')) { root.removeAttribute('disabled'); root.removeAttribute('data-disabled'); root.removeAttribute('aria-disabled'); }
      if (root.hasAttribute('data-dp-checked')) { root.setAttribute('data-state', 'unchecked'); root.removeAttribute('checked'); root.setAttribute('aria-checked', 'false'); $$('[data-state]', root).forEach(function (p) { p.setAttribute('data-state', 'unchecked'); }); if (root.type === 'checkbox' || root.type === 'radio') root.checked = false; }
      if (state === 'hover' || state === 'focus-visible' || state === 'active') root.setAttribute('data-sim', state);
      if (state === 'disabled') { root.setAttribute('disabled', ''); root.setAttribute('data-disabled', ''); root.setAttribute('aria-disabled', 'true'); root.setAttribute('data-dp-disabled', '1'); }
      if (state === 'checked') { root.setAttribute('data-state', 'checked'); root.setAttribute('aria-checked', 'true'); root.setAttribute('data-dp-checked', '1'); $$('[data-state]', root).forEach(function (p) { p.setAttribute('data-state', 'checked'); }); if (root.type === 'checkbox' || root.type === 'radio') root.checked = true; }
    });
    stage.setAttribute('data-state', state);
    stage.classList.toggle('dark-on', dark);
  }
  var stages = $$('.stage[data-html]');
  if ('IntersectionObserver' in window) {
    var sio = new IntersectionObserver(function (entries) { entries.forEach(function (e) { if (e.isIntersecting) { mountSpecimen(e.target); sio.unobserve(e.target); } }); }, { rootMargin: '300px 0px' });
    stages.forEach(function (s) { sio.observe(s); });
  } else stages.forEach(mountSpecimen);
  $$('.spec .tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      var spec = b.closest('.spec'); var stage = $('.stage', spec); var state = b.getAttribute('data-state');
      if (state === 'dark') { stage.setAttribute('data-dark', stage.getAttribute('data-dark') === '1' ? '0' : '1'); b.classList.toggle('on', stage.getAttribute('data-dark') === '1'); mountSpecimen(stage); applyState(stage, stage.getAttribute('data-state') || 'default'); return; }
      $$('.tabs button', spec).forEach(function (x) { if (x.getAttribute('data-state') !== 'dark') x.classList.toggle('on', x === b); });
      mountSpecimen(stage); applyState(stage, state);
    });
  });

  /* ---------- curation ---------- */
  var rows = $$('.row[data-id], .sigrow[data-id]');
  var state = {};
  try { state = JSON.parse(localStorage.getItem(storeKey) || '{}'); } catch (e) { state = {}; }
  var draftTimer = null;
  function save() {
    try { localStorage.setItem(storeKey, JSON.stringify(state)); } catch (e) {}
    if (served) { clearTimeout(draftTimer); draftTimer = setTimeout(function () { post(buildDecisions(true)).catch(function () {}); }, 800); }
  }
  function rowOf(id) { return rows.find(function (r) { return r.getAttribute('data-id') === id; }); }
  function entryOf(row) {
    var id = row.getAttribute('data-id');
    var e = state[id];
    return e && e.action ? e : null;
  }
  function render(row) {
    var id = row.getAttribute('data-id');
    var e = state[id] || {};
    $$('.seg label', row).forEach(function (l) { l.classList.toggle('on', l.getAttribute('data-action') === e.action); });
    var sel = $('select', row);
    if (sel) { sel.classList.toggle('hidden', e.action !== 'merge'); if (e.target) sel.value = e.target; }
    var note = $('input.note', row); if (note) note.classList.toggle('hidden', !e.action);
    row.classList.toggle('decided', !!e.action);
    var imp = $('.impact', row);
    if (imp) {
      if (e.action === 'merge' && e.target) {
        var opt = sel && sel.options[sel.selectedIndex];
        var visual = opt ? opt.getAttribute('data-visual') : row.getAttribute('data-visual');
        imp.textContent = fmt(T.curation && T.curation.impact, { occ: row.getAttribute('data-occ'), screens: row.getAttribute('data-screens') }) + ' · ' + fmt(T.curation && T.curation.impact_visual, { v: (T.cards && T.cards.visual && T.cards.visual[visual]) || visual });
        imp.classList.toggle('visible', visual === 'visible');
      } else imp.textContent = '';
    }
  }
  rows.forEach(function (row) {
    var id = row.getAttribute('data-id');
    $$('.seg label', row).forEach(function (l) {
      l.addEventListener('click', function () {
        var action = l.getAttribute('data-action');
        var cur = state[id] || {};
        if (cur.action === action) { delete state[id]; } else {
          cur.action = action;
          if (action === 'merge' && !cur.target) cur.target = row.getAttribute('data-target') || ($('select', row) && $('select', row).value) || null;
          if (action !== 'merge') delete cur.target;
          cur.card = row.getAttribute('data-card') || undefined;
          state[id] = cur;
        }
        render(row); refreshCart(); save();
      });
    });
    var sel = $('select', row);
    if (sel) sel.addEventListener('change', function () { state[id] = state[id] || { action: 'merge' }; state[id].target = sel.value; render(row); refreshCart(); save(); });
    var note = $('input.note', row);
    if (note) note.addEventListener('input', function () { if (state[id]) { state[id].note = note.value; save(); } });
    render(row);
  });
  // cards: add recommendation
  $$('.card[data-card]').forEach(function (card) {
    var btn = $('.add', card);
    if (!btn) return;
    btn.addEventListener('click', function () {
      var entries = JSON.parse(card.getAttribute('data-entries') || '[]');
      entries.forEach(function (en) {
        var row = rowOf(en.source);
        if (!row) return;
        state[en.source] = { action: en.action === 'delete' ? 'delete' : (en.action === 'keep' ? 'keep' : 'merge'), target: en.target || undefined, card: card.getAttribute('data-card') };
        render(row);
      });
      refreshCart(); save();
    });
  });
  function cardStatus(card) {
    var entries = JSON.parse(card.getAttribute('data-entries') || '[]');
    if (!entries.length) return 'untouched';
    var decided = 0, match = 0, leave = 0;
    entries.forEach(function (en) { var e = state[en.source]; if (!e) return; decided++; if (e.action === 'leave') leave++; else if ((e.action === 'merge' && e.target === en.target) || e.action === en.action || (en.action === 'promote' && e.action === 'merge' && e.target === en.target)) match++; });
    if (!decided) return 'untouched';
    if (leave === entries.length) return 'rejected';
    if (decided < entries.length) return 'partial';
    return match === entries.length ? 'accepted' : 'edited';
  }
  function buildDecisions(draft) {
    var entries = Object.keys(state).filter(function (id) { return state[id] && state[id].action; }).map(function (id) { var e = state[id]; var o = { id: id, action: e.action }; if (e.target) o.target = e.target; if (e.note) o.note = e.note; if (e.card) o.card = e.card; return o; });
    var cards = $$('.card[data-card]').map(function (c) { return { id: c.getAttribute('data-card'), status: cardStatus(c) }; });
    return { schema: 'design-polish.decisions/1', run_id: runId, inventory_hash: DP.inventoryHash || null, decided_at: new Date().toISOString(), via: served ? 'serve' : 'clipboard', draft: !!draft, entries: entries, cards: cards };
  }
  // table filters (chapter tables with data-filter-for)
  $$('.filters[data-filter-for]').forEach(function (bar) {
    var table = document.getElementById(bar.getAttribute('data-filter-for'));
    if (!table) return;
    $$('.chip', bar).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var show = btn.getAttribute('data-show');
        $$('.chip', bar).forEach(function (b) { b.classList.toggle('active', b === btn); });
        $$('tr.row', table).forEach(function (tr) {
          var ok = show === 'all' || (show === 'issues' ? tr.getAttribute('data-issue') === '1' : tr.getAttribute('data-kind') === show);
          tr.classList.toggle('hidden', !ok);
        });
      });
    });
  });
  var cart = $('#cart');
  var GRADE_S = 30, GRADE_M = 100; // same thresholds as the proposal: one review stays careful up to ~30 places
  function refreshCart() {
    if (!cart) return;
    var n = 0, occ = 0, screens = {}, cardsSet = {}, visible = 0, safe = 0;
    rows.forEach(function (row) {
      var e = entryOf(row); if (!e) return;
      n++;
      if (e.action === 'merge' || e.action === 'delete') {
        occ += Number(row.getAttribute('data-occ') || 0);
        (row.getAttribute('data-screen-ids') || '').split(' ').filter(Boolean).forEach(function (s) { screens[s] = 1; });
        var sel = $('select', row); var opt = sel && sel.options[sel.selectedIndex]; var v = opt ? opt.getAttribute('data-visual') : row.getAttribute('data-visual');
        if (v === 'visible') visible++; else safe++;
      }
      if (e.card) cardsSet[e.card] = 1;
    });
    $$('.card[data-card]').forEach(function (c) { var st = cardStatus(c); var el = $('.status', c); if (el) { el.textContent = (T.cards && T.cards.status && T.cards.status[st]) || st; el.className = 'pill status ' + (st === 'accepted' ? 'ok' : st === 'untouched' ? '' : 'warn'); } if (st !== 'untouched') cardsSet[c.getAttribute('data-card')] = 1; });
    cart.classList.toggle('show', n > 0);
    $('.sum', cart).textContent = fmt(T.cart && T.cart.summary, { n: n, cards: Object.keys(cardsSet).length, occ: occ, screens: Object.keys(screens).length });
    var warn = $('.warn', cart); var msg = '';
    if (occ > GRADE_M) msg = T.cart.warn_l; else if (occ > GRADE_S) msg = T.cart.warn_m;
    if (visible && safe) msg += (msg ? ' ' : '') + T.cart.warn_mixed;
    warn.textContent = msg; warn.classList.toggle('hidden', !msg);
    $$('.chapter').forEach(function (ch) { var st = $('.decisions-status', ch); if (!st) return; var ids = $$('.row[data-id], .sigrow[data-id]', ch); var k = 0, m = 0, l = 0; ids.forEach(function (r) { var e = entryOf(r); if (!e) return; if (e.action === 'keep') k++; else if (e.action === 'leave') l++; else m++; }); st.textContent = fmt(T.chapter.decided, { keep: k, merge: m, leave: l }) + ' · ' + fmt(T.chapter.undecided, { n: ids.length - k - m - l }); });
  }
  function toast(msg) { var t = $('#toast'); if (!t) return; t.textContent = msg; t.classList.add('show'); setTimeout(function () { t.classList.remove('show'); }, 2400); }
  function post(decisions) {
    var base = location.pathname.replace(/[^/]*$/, '');
    return fetch(base + 'api/decisions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(decisions) }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (res, rej) { var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); res(); } catch (e) { rej(e); } document.body.removeChild(ta); });
  }
  if (cart) {
    $('.send', cart).addEventListener('click', function () { var d = buildDecisions(false); if (served) post(d).then(function () { toast(T.curation.sent); }).catch(function () { copyText('design-polish:decisions v1 ' + JSON.stringify(d)).then(function () { toast(T.curation.copied); }); }); else copyText('design-polish:decisions v1 ' + JSON.stringify(d)).then(function () { toast(T.curation.copied); }); });
    $('.copy', cart).addEventListener('click', function () { copyText('design-polish:decisions v1 ' + JSON.stringify(buildDecisions(false))).then(function () { toast(T.curation.copied); }); });
    $('.save', cart).addEventListener('click', function () { var blob = new Blob([JSON.stringify(buildDecisions(false), null, 2)], { type: 'application/json' }); var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'decisions.json'; a.click(); toast(T.curation.saved); });
    $('.clear', cart).addEventListener('click', function () { state = {}; rows.forEach(render); refreshCart(); save(); });
    if (!served) { $('.send', cart).classList.add('hidden'); }
  }
  refreshCart();

  /* ---------- value copy buttons ---------- */
  $$('[data-copy]').forEach(function (b) { b.addEventListener('click', function () { copyText(b.getAttribute('data-copy')).then(function () { toast(T.misc.copy + ' ✓'); }); }); });

  /* ---------- served: rehydrate draft, poll for reload ---------- */
  if (served) {
    var base = location.pathname.replace(/[^/]*$/, '');
    fetch(base + 'api/state').then(function (r) { return r.ok ? r.json() : null; }).then(function (st) {
      if (st && st.decisions && st.decisions.entries && !Object.keys(state).length) { st.decisions.entries.forEach(function (en) { state[en.id] = { action: en.action, target: en.target, note: en.note, card: en.card }; }); rows.forEach(render); refreshCart(); }
      if (st && st.version != null) { var v = st.version; setInterval(function () { fetch(base + 'api/version').then(function (r) { return r.json(); }).then(function (j) { if (j.version !== v) { try { sessionStorage.setItem('dp:scroll', String(window.scrollY)); } catch (e) {} location.reload(); } }).catch(function () {}); }, 3000); }
    }).catch(function () {});
    try { var y = sessionStorage.getItem('dp:scroll'); if (y) { sessionStorage.removeItem('dp:scroll'); window.scrollTo(0, Number(y)); } } catch (e) {}
  }
})();
