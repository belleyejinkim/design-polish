# Report spec

`render.js` builds `report.html` from the run's JSON files and `templates/`. The model never edits it.

## Chapters (fixed order, fixed ids)

`00 cover` · `01 summary` · `02 screens` · `03 color` · `04 typography` · `05 spacing` · `06 radius` (corners and
borders) · `07 shadow` · `08 components` · `09 relations` (side by side) · `10 proposal` · `11 cards` · `12 delta`
(before / after) · `13 method`.

Chapter 03 (colour) is one table: a row per colour the app shows — project tokens (used or not), values typed by hand,
Tailwind palette values, library-only values — sorted problems first, with columns *comes from · uses · status · action ·
your decision* and filter chips (all / needs attention / tokens / typed by hand / palette / library). Look-alike pairs are
shown as two touching swatches in the status column. Findings (F#, evidence) and decisions follow the table.
Chapters 04–07 have five parts: A declared · B in use (inventory rows with keep / merge / leave controls) · C findings
(F#, screens, visual evidence, developer details) · D proposal or "no change proposed: <reason>" · E your decisions.

## Numbers

Every number in the page is wrapped `<span class="num" data-metric="<json path>">`; `verify.js` V4 re-reads the JSON
and fails when any differs. Template strings contain no numeric literals of their own.

## Typography and surface (the "paper" rules)

Warm paper `#FBFAF7`, ink in three steps, graphite hairlines; saturation belongs only to the project's own colours and
to severity marks. One measure (`--measure: 1120px`). Local font stack (Pretendard Variable → Inter → Noto Sans KR →
system); no web fonts, no CDN, no fetch. `keep-all`, `text-wrap: pretty`, tabular numerals. Cards use a header band
plus a full border and tinted background — never a left accent bar. **One alignment line per card**: a card's title
(caps), body and footnote are direct children of the card, all starting on the card's left padding line; never place a
card's title or help text inside an inner column (a flex/grid child), where it would stand on a different line than
the body. The build fails on a second `max-width`, on
`border-left` accents and on remote URLs.

## Interaction (v1.0)

Sticky nav with scroll-spy · search across values, tokens and screens · row curation (keep / merge → target / leave)
with impact preview, persisted in `localStorage` under `dp:<runId>` · cart with size warnings (S ≤ 30, M ≤ 100
places; two M cards or mixed safe/visible changes warn) · Send (local server) / Copy (clipboard, prefixed
`design-polish:decisions v1 `) / Save (file) · lazy specimen iframes with the compiled `live.css` and simulated states
(`:hover` → `[data-sim~="hover"]`, `disabled`, `data-state`, dark per the project's strategy) · code locations (file:line, class strings) always visible, long lists inside `<details>` · severity filter · before/after side by side · print CSS · served mode: `/api/version`
polling reloads the tab after a recheck.

## Specimens

`render-specimens.js` compiles every candidate class once into `live.css` (embedded once), builds a skeleton per look
from the real tag, classes, child classes and JSX labels, and writes `specimens.json`. Failures are shown as "real
rendering unavailable (reason) — classes shown instead". Fonts not available locally are substituted and named.

## Languages

`--lang en|ko` picks `templates/i18n/<lang>.json` for UI strings; the narrative carries its own `lang`. Korean copy
uses 합니다체, keeps class names in English, and avoids loanword jargon.

## Zero-AI mode

When no `narrative.json` exists, the renderer uses template sentences for headline, finding titles and card text and
shows the banner "Inventory only — diagnosis and proposals need an agent: run /design-polish".
