---
name: design-polish
description: >-
  Design-consistency audit and cleanup for web apps built with coding agents (React/Next.js, Tailwind v4, shadcn).
  Inventories every colour, text size, spacing, corner radius, shadow and 11 form controls (button, checkbox, radio,
  select, dropdown menu, text field, textarea, toggle, badge, tag, chip), shows them at real size in one HTML report,
  finds drift (raw values, look-alike colours, duplicate components, neighbours with different corners, unused tokens),
  proposes cards, applies only the cards the user picks (one commit each), re-counts, and leaves DESIGN-TOKENS.md plus
  a CI check. Use for "polish my design", "design audit", "why do my buttons look different", "clean up colours/tokens",
  "make the UI consistent", "디자인 정리", "디자인 감사", "버튼 통일", "토큰 정리", "apply C1", "recheck", "open the report".
  Not for redesigns, aesthetic scores, UX copy, accessibility audits or Figma.
argument-hint: "[apply <card-ids> | recheck | report | check] [path]"
allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/scripts/*) Bash(${CLAUDE_SKILL_DIR}/scripts/*) Read Glob Grep Agent AskUserQuestion
license: MIT
compatibility: Node.js 18+ and git in the target. Full support for Tailwind v4 (+ shadcn/ui, Radix, Next.js app router); other stacks run with reduced confidence and say so.
metadata:
  author: Yejin Kim
  version: 0.1.0
  homepage: https://github.com/belleyejinkim/design-polish
---

# design-polish

Counting is done by scripts, choosing is done by the person, writing touches only what was approved.
You orchestrate; you never produce numbers, never hand-edit the report, never edit project files yourself.

## Paths

- `SKILL_DIR` = `${CLAUDE_SKILL_DIR}` (if that placeholder appears literally, it is the directory containing this file).
- `S` = `$SKILL_DIR/scripts`. Every step is `node "$S/<script>.js" …`. Scripts print usage with no arguments.
- `TARGET` = the path argument, else the current project root (the directory with `package.json` / `.git`).
- Runs live in `TARGET/.design-polish/runs/<timestamp>/`; `TARGET/.design-polish/latest.json` points to the newest.
  `RUN_DIR` below means that directory. `.design-polish/.gitignore` is created by the scripts; do not edit the root `.gitignore`.

## Routing (`$ARGUMENTS`)

| Arguments | Flow |
|---|---|
| none, or a path | **polish** (P0–P5) |
| `apply C1,C3` / `apply all` / `apply safe` | **apply** (A0–A4); needs a run with decisions or explicit card ids |
| `recheck` | **recheck** (A4 only) |
| `report` | `node "$S/serve.js" start "$RUN_DIR" --open` and print the URL; nothing else |
| `check` | `node "$S/baseline.js" "$TARGET"`; report the result verbatim |

Never guess card ids: if the user says "apply the safe ones" read `RUN_DIR/cards.json` and list ids with `safety: none`.

## Four user questions at most

| Gate | When | Question |
|---|---|---|
| 0 | monorepo with several apps, or an unsupported stack | which package / proceed with low confidence or stop |
| 1 | after diagnosis, only if a finding or card has `needsUserConfirmation` | one batched question ("these colours look alike — same colour or not?") |
| 2 | after the report is served | the blocking wait for the person's picks (see P5) |
| 3 | before applying | the summary of what will change, with `all / safe only / cancel` |

Ask nothing before the report exists in the ordinary case. Per card, show the plan summary and ask `apply / skip / show diff` (this is the per-card confirmation, not a new gate).

## polish

### P0 · preflight (main context, no questions)
1. `node --version` ≥ 18; `git -C "$TARGET" rev-parse` succeeds (if not: inventory still runs, but say that apply needs git).
2. `git -C "$TARGET" ls-files | wc -l` is > 0 (0 → stop: "nothing tracked to scan").
3. Look for several `package.json` under `apps/*` or `packages/*` → gate 0. CSS-in-JS only (styled-components, emotion, no Tailwind, no plain CSS) → gate 0 with "low confidence".
   No React/JSX code at all (server-rendered templates, plain HTML, Spring/Rails/Laravel): **no gate** — the inventory
   runs in CSS-only mode (colours, spacing, corners, shadows from stylesheets and `<style>` blocks in templates);
   say in one sentence that components and screens are not inventoried for this stack, then continue.
4. Note `TARGET/.design-polish/config.json` if present (css entry, excludes); pass through as flags.

### P1 · scan and render specimens  `[agent: scanner]`
Spawn a subagent (`Agent`, `subagent_type: general-purpose`, model `sonnet`) with the full text of
`$SKILL_DIR/agents/scanner.md` plus these absolute paths: `SKILL_DIR`, `TARGET`, and `LANG` (`ko` if the user wrote Korean, else `en`).
It runs `inventory.js` (scan → diagnose → propose → specimens → render), retries with flags when the CSS entry or
TypeScript is not found, and returns ≤ 15 lines: `RUN_DIR`, counts, errors, `needs_input` items.
If it returns `needs_input` with a real choice, answer it once (or ask gate 0) and re-spawn; otherwise continue.
Solo mode (no `Agent` tool, e.g. Codex): read `agents/scanner.md` and perform it yourself.

### P2 · diagnose and narrate (main context)
1. `node "$S/brief.js" "$RUN_DIR"` — the only digest you read (≤ 40 KB). Do not open `inventory.json`.
2. Gate 1 only if the brief marks `NEEDS USER CONFIRMATION`; fold the answers into `RUN_DIR/decisions.json` as
   `{schema:"design-polish.decisions/1", run_id, via:"agent", entries:[{id, action:"keep"|"merge"|"leave", target?}]}` only when the user decided something.
3. Write `RUN_DIR/narrative.json` following `references/narrative-rules.md`: headline, lede, better screen names, type
   samples, chapter summaries, finding titles/explanations/causes, card titles/why, limits. **No digits anywhere** —
   numbers are rendered from JSON; if you need a quantity say "several", "most", "one row".
   Then run the clarity pass from that file (Korean: no em dashes, active verbs, 호응 확인; English: characters as
   subjects, old-before-new). If `~/.claude/skills/korean-clarity` / `english-clarity` exist, follow the matching one.
4. `node "$S/check.js" narrative "$RUN_DIR/narrative.json"` must print OK; fix and repeat until it does.
5. `node "$S/render.js" "$RUN_DIR" --lang $LANG` re-renders the report with your narrative.

### P3 · verify  `[agent: verifier]`
Spawn a subagent with `agents/verifier.md` + `SKILL_DIR`, `RUN_DIR`, `TARGET`. Do not pass your own conclusions.
It runs `verify.js`, re-derives a sample by another method, checks that evidence matches each finding, and returns ≤ 12 lines.
If it reports failures: fix what you own (narrative), re-render, re-verify — at most twice. Remaining failures stay
visible in chapter 13 of the report and in your summary; never hide them.

### P4 · present
1. `node "$S/serve.js" start "$RUN_DIR" --open` → prints a local URL (`127.0.0.1`, random port, token). If the browser
   cannot be opened, give the URL and the file path `RUN_DIR/report.html`.
2. Chat summary ≤ 5 lines, from `RUN_DIR/chat-summary.md` plus the narrative headline: score, the three findings that
   matter, how many cards and how many are "no visible change", what is already consistent, the URL.
3. Use the words people use: colours, text sizes, spacing, corners, shadows, buttons, checkboxes, inputs. Say "token"
   only with a gloss ("a named value defined once").

### P5 · wait for decisions (gate 2)
Ask with `AskUserQuestion`: "Pick what to keep, merge or leave in the report and press **Send decisions**, then choose
*Done* here. Or tell me which cards to apply (e.g. `C1, C3`)." Options: `Done — I sent my decisions` / `Apply the
"no visible change" cards` / `Stop here`.
- Done → `RUN_DIR/decisions.json` exists (the server wrote it). If only `decisions.draft.json` exists, ask once more.
  If the user pasted `design-polish:decisions v1 {…}` into chat, write that JSON to `RUN_DIR/decisions.json` verbatim.
- "no visible change" → cards with `safety: none`.
- Stop → print the URL, the revert-free state ("nothing was changed"), and `npx design-polish check` as the follow-up.
Then continue with **apply**.

## apply

### A0 · gate
1. `RUN_DIR` from `latest.json`; `cards.json` present; requested ids exist; `prereq` cards come first.
2. `git -C "$TARGET" status --porcelain --untracked-files=no` is empty, else stop: "commit or stash first; I apply one
   commit per card so you can revert any of them".
3. `git -C "$TARGET" tag design-polish/<run>/before` (skip if it exists).
4. Gate 3: list the cards with places/screens and the visual-change label (`none` = identical pixels, `subtle` = under
   ΔE 2 or 2 px, `visible` = a design decision), then `all / none-only / cancel`.

### A1–A3 · per card
1. Plan: for `register-tokens`, `merge-values`, `delete-dead-tokens`, `guardrails` run
   `node "$S/apply.js" plan "$RUN_DIR" <id> --lang $LANG` (mechanical, deterministic).
   For `align-neighbors`, `align-signature`, `add-state`, `fix-class` spawn `[agent: planner]` with `agents/planner.md`
   + paths + the card id; it writes `RUN_DIR/apply/<id>.plan.json` and never edits files. Solo mode: do the planner's
   work yourself, still only by writing the plan file.
2. Show the plan summary (`node "$S/apply.js" summary "$RUN_DIR" <id> --lang $LANG`, ≤ 5 lines) and ask
   `apply / skip / show diff`. `show diff` → `node "$S/apply.js" apply "$RUN_DIR" <id> --dry-run` and print it.
3. `node "$S/apply.js" apply "$RUN_DIR" <id> --commit --typecheck` — verifies every `before` text, writes all edits at
   once, runs `tsc --noEmit` when the project has TypeScript, reverts the files on failure, commits
   `design-polish: <id> <kind> (<n> edits in <m> files)`. Vendored library files (`components/ui/*`) are skipped unless
   the user asked for them (`--include-vendored`). Report skipped sites with their reason.
4. Tell the user the commit sha and `git revert <sha>` after each card.

### A4 · recheck (automatic once after the last card; also `/design-polish recheck`)
1. `node "$S/inventory.js" "$TARGET" --recheck --lang $LANG --no-open` → a new run with `delta.json` and chapter 12.
2. `node "$S/brief.js" "$NEW_RUN_DIR"` → read the delta line; copy `narrative.json` forward only if the screens are unchanged.
3. `node "$S/verify.js" "$NEW_RUN_DIR"`; `node "$S/serve.js" start "$NEW_RUN_DIR"` (the open tab reloads by itself).
4. If `guardrails` was not applied, offer it now: it writes `DESIGN-TOKENS.md`, a one-line pointer in `CLAUDE.md` /
   `AGENTS.md`, and `.design-polish/baseline.json` for `npx design-polish check`.
5. Chat ≤ 5 lines: scores before → after, looks before → after for the types that changed, findings resolved / remaining /
   new, sites left alone, and `git reset --hard design-polish/<run>/before` as the whole-run undo.

## Hard rules

- Numbers come from JSON via the renderer. Your prose (narrative, chat) contains no counts, px, ΔE or percentages.
- The report is `render.js` output. Never edit `report.html`; change `narrative.json` and re-render.
- No edit to the project outside `apply.js`. No `sed`, no Edit tool on project files, no commits of your own.
- Cards marked `visible` or `needsUserConfirmation` are never applied under "safe only".
- Catalog pages (`/design-system`, storybook-like routes) are counted separately; never cite them as evidence of drift.
- Say what is already consistent. Say what could not be resolved (unresolved classes, dynamic class sites, parse
  failures are listed in the brief). Never round a failure into a success.
- The run directory is the only place you write: `narrative.json`, `decisions.json`, plan files. Never `_workspace/`.

## Errors

| Situation | Do |
|---|---|
| `no-typescript` from the scanner (React code present, no TypeScript anywhere) | tell the user `npm i -D typescript` enables element attribution; stop (regex mode is not shipped yet). Projects with no React code do not hit this: they run CSS-only |
| the scan lists the skill's own files (`.claude/skills/…`, `.agents/skills/…`) | it must not — tooling folders and dot-directories are skipped by `files.js`; if you see them, report the bug instead of scanning the fixture |
| `css.error` (Tailwind failed to compile) | scanner retries with `--css <entry>`; if still failing the report says "values unresolved"; proceed, do not apply |
| Specimens `failed` | the report shows classes instead of live controls; say so in one line |
| `verify` failures after two fixes | present with the failures visible; do not apply cards that depend on the failed check |
| `apply` typecheck failure | files were reverted automatically; show the first error lines; offer skip |
| `apply` before-text mismatch | that site is skipped and listed; the rest applied; suggest `recheck` |
| decisions refer to another run (`inventory_hash` differs) | `apply.js` remaps by id and lists what it could not find; tell the user |
| Port busy / browser blocked | print the URL and the file path; the report also works from `file://` (copy-to-clipboard handoff) |

## Test scenarios (keep these true when editing this file)

1. Fresh project, Tailwind v4 + shadcn: polish produces a report with no question before gate 2.
2. `apply` on a dirty tree is refused with the stash advice.
3. Unsupported stack: gate 0 once, then an honest "low confidence" report.
4. Second `recheck` in a new session finds the applied run through `latest.json` and `apply/*.result.json`.
5. CLI only (`npx design-polish`, `npx design-polish check`) works without any of the above.
