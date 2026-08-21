# design-polish

**Your AI-built app has five button styles and eight grays. See them all on one page, keep what you want, and let your coding agent fix the rest — safely.**

Works in Claude Code · Codex · Cursor · the inventory needs no AI · MIT

[Open an example report →](https://yejin-newmean.github.io/design-polish/examples/messy-next/report.html) · [한국어](README_KO.md)

Made by [Yejin Kim](https://github.com/yejin-newmean).

---

Coding agents start every generation from scratch. They don't remember that yesterday's button was 8 px round, so they pick a plausible value again. A few weeks in you have five button looks, eight grays and two checkboxes — and no way to *see* it, because you don't read the code.

design-polish reads the code for you: every colour, text size, spacing, corner, shadow and form control at real size on one HTML page, with how often each is used and on which screens. Your agent explains what's off and proposes cards. You pick. It applies only what you picked, one commit per card, then counts again.

## Three verbs

| | Command | What happens | AI |
|---|---|---|---|
| **inventory** | `npx design-polish` | scan → real-size specimens → one HTML report with a pick-what-stays UI | none |
| **polish** | `/design-polish` in your agent | inventory + diagnosis + proposal cards + your picks + apply + re-count + guardrails | yes |
| **check** | `npx design-polish check` | fails (exit 1) when new raw values or one-off looks appear since the baseline — for CI or a pre-commit hook | none |

## What you get

1. **One page, everything at real size** — 13 chapters from colour to the 11 form controls (button, checkbox, radio, select, dropdown menu, text field, textarea, toggle, badge, tag, chip), with hover / focus / disabled / dark simulated from your compiled CSS.
2. **Cards you can trust** — each labelled *no visible change* (identical pixels, light and dark), *almost invisible* (under ΔE 2 or 2 px) or *visible* (a design decision). Vendored `components/ui` is counted, not edited.
3. **One commit per card** — `git revert <sha>` undoes one, a tag undoes the run.
4. **A re-count** — "raw colours 6 → 1 · 3 findings resolved, 13 remaining", computed, not claimed.
5. **Guardrails** — `DESIGN-TOKENS.md`, one line in `CLAUDE.md` / `AGENTS.md`, and `design-polish check` for CI.

## Two live reports

| [Messy app](https://yejin-newmean.github.io/design-polish/examples/messy-next/report.html) | [Clean app](https://yejin-newmean.github.io/design-polish/examples/clean-shadcn/report.html) |
|---|---|
| 28 files, 11 button looks, a legacy checkbox, a toolbar whose corners disagree, dead tokens, a missing dark value | 12 files, tidy shadcn/ui. Nothing to fix — and the report says so instead of inventing work |

Both are synthetic fixtures from `skills/design-polish/evals/fixtures`; no real product code is published.

## Install

```bash
npx skills add yejin-newmean/design-polish        # Claude Code, Codex, Cursor, … (re-run to update)
```

Claude Code plugin (adds the three subagent types):

```
/plugin marketplace add yejin-newmean/design-polish
/plugin install design-polish@design-polish
```

CLI only: `npm i -g design-polish` or just `npx design-polish` inside the project.

## Say this to your agent

- "Polish my design" · "Why do my buttons all look different?" · "Clean up the colours and corners"
- "디자인 정리해줘" · "버튼 좀 통일해줘" · "토큰 정리해줘"
- Later: "apply C1 and C3" · "recheck" · "open the report"

At most four questions, all of them yours to answer (a look-alike pair, which cards, confirm before writing). Nothing is asked before the report exists.

## Works with

| Stack | Support |
|---|---|
| Tailwind v4 + shadcn/ui, Radix, cva, Next.js app router | full: values compiled by the project's own Tailwind, element-level attribution, screens, siblings |
| Next.js pages router, Vite + React Router | full, with weaker screen attribution |
| Tailwind v3, CSS Modules | partial: looks and counts, no compiled values (1.1) |
| styled-components / emotion | not yet — the report says so on the cover |
| Vue, Svelte, Angular | out of scope |

Needs Node 18+ and git. Uses the project's own `typescript` for parsing (add it as a dev dependency if missing).

## Honest by design

- Every number comes from a script; the model writes words, never counts. A check fails the build if the two disagree.
- Specimens are rendered with your project's compiled CSS, not re-drawn.
- What could not be resolved (dynamic class strings, unknown classes, parse failures) is listed, never estimated.
- No network requests, no telemetry. The report opens from `file://`.
- Library code is counted separately; raw values inside shadcn's own files are never blamed on you.

## Why a skill and not a prompt

Ask an agent to "clean up the tokens" and you get a partial `grep`, numbers that change between runs, a `sed` you didn't approve, and no picture of what you have. Here scripts count and write, the model names and explains, you choose. Timings and token costs: [docs/evals.md](docs/evals.md).

## FAQ

**Will my design change?** Not unless you pick a card labelled *visible*.
**I use shadcn.** Its files are the base looks and are left alone; your deviations from them get fixed.
**I already have tokens.** Then the safest card comes first: places that typed a token's value by hand.
**Designer picks, developer applies?** Yes — the report runs from `file://`, *Save* writes `decisions.json`, the developer's agent applies it.
**Undo?** `git revert <sha>` per card; `git reset --hard design-polish/<run>/before` for the run.

## Limits

Tailwind v4 is where it shines. Concatenated class strings are listed as "dynamic", not guessed. Typography, shadows and borders are inventoried but not auto-fixed in 1.0; component extraction is an opt-in card in 1.1.

[Roadmap](ROADMAP.md) · [Changelog](CHANGELOG.md) · [Architecture](docs/architecture.md) · [Contributing](CONTRIBUTING.md)

MIT. Use it, fork it, ship it.
