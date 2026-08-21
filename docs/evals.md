# Evals

Measured on a MacBook (Apple Silicon), Node 25, 2026-08-21. Re-run with `npm test` (fixtures) and the commands below.

## Zero-AI inventory (`npx design-polish`)

| Project | Files | Screens | Looks | Findings | Cards | Scan | Total to report |
|---|---|---|---|---|---|---|---|
| `messy-next` fixture | 28 | 7 | 24 (11 types) | 16 | 9 | 0.19 s | 0.23 s |
| `clean-shadcn` fixture | 12 | 5 | 5 (3 types) | 1 (info) | 1 (guardrails) | 0.13 s | 0.16 s |
| `vite-router` fixture (React Router, const-map button) | 8 | 3 (+1 layout) | 6 (3 types) | 4 | 2 | 0.12 s | 0.15 s |
| Livebetter (private CRM, Next.js + shadcn) | 226 | 20 | 60 (8 types) | 42 | 14 | 0.41 s | 0.48 s |

"Scan" includes loading the project's TypeScript and Tailwind engine; "total" adds diagnosis, proposal, specimen rendering and the HTML (280 KB / 107 KB / 800 KB).

`verify.js` passes on all four (V6 determinism: two scans produce identical JSON).

## Accuracy

- `messy-next` ships with a hand-written ground truth (`evals/fixtures/messy-next/ground-truth.json`); `tests/fixture-messy-next.test.js` asserts the inventory matches it exactly (button looks and uses, checkbox implementations, dead tokens, the missing dark value, the off-scale padding, the invalid class, both sibling mismatches, screen titles).
- `clean-shadcn` is the false-positive control: every axis 100, no finding above `info`, the only card is guardrails.
- `vite-router` checks React Router route discovery (`createBrowserRouter` objects, nested layouts) and const-map variant resolution (`VARIANTS[variant]` without cva/clsx): 3 Button looks + 1 hand-written button, no dynamic sites, no dead tokens.
- Livebetter was audited by hand in July 2026 before this tool existed; the tool finds the same button/input corner mismatch (8 px vs 6 px in one row) that audit found, plus 7 more rows.

## Apply loop (`tests/e2e-apply.test.js`)

On a git copy of `messy-next`: inventory → plan and apply the safe cards (register-tokens, delete-dead-tokens, guardrails) with one commit each → recheck.
Result: raw colours 6 → 5, raw radius uses 4 → 1, unused tokens 4 → 2 (the two shadcn base-set tokens are kept on purpose), 3 findings resolved, 0 new, `design-polish check` passes, `git revert HEAD` is clean. ~1.2 s end to end.

## Agent flow (`/design-polish`)

Token and wall-clock figures for the full agent flow (scanner subagent → narrative → verifier → picks → apply → recheck) are **not measured yet**; they will be added before 1.0 from at least three runs on the fixtures and one on a real project, with and without the skill.

## Trigger evals

`evals/trigger-evals.json`: 10 prompts that should trigger the skill, 10 near-misses that should not. Pass rate is recorded here once run in a fresh session.
