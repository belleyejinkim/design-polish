# Apply contract

`apply.js` is the only thing that writes to the project. A plan file is the full description of what it will do;
the person approves the plan summary, `apply.js` executes exactly that plan, then commits.

## Plan (`RUN_DIR/apply/<CARD_ID>.plan.json`, schema `design-polish.plan/1`)

```json
{
  "schema": "design-polish.plan/1", "runId": "…", "cardId": "C5", "kind": "align-neighbors", "createdAt": "…",
  "edits": [
    { "file": "src/components/shared/toolbar.tsx", "line": 30, "before": "rounded-[6px]", "after": "rounded-md",
      "kind": "class", "role": "border-radius", "confidence": "exact", "visualChange": "subtle", "valueId": "tok:radius:6", "target": "tok:radius:var:--radius-md" },
    { "file": "src/app/page.tsx", "line": 26, "before": "<Button className=\"rounded-full\"", "after": "<Button variant=\"pill\"", "kind": "jsx", "confidence": "exact", "visualChange": "none" }
  ],
  "skipped": [ { "id": "occ:…", "file": "src/app/page.tsx", "line": 40, "reason": "intentional variant: hero call to action" } ],
  "newTokens": [ { "id": "tok+:color.brand-soft", "name": "--color-brand-soft", "value": "#e8f6ec" } ],
  "summary": { "edits": 2, "files": 2, "skipped": 1, "vendoredSkipped": 0, "visualChange": "subtle", "safety": "approve" },
  "notes": []
}
```

### Edit kinds

| kind | `before` / `after` | How it is applied |
|---|---|---|
| `class` | one class token → one class token | token-boundary replacement on that line (`text-white` never matches `text-white/50`) |
| `inline-style`, `css-literal` | the raw value as written → `var(--x)` | substring replacement on that line |
| `jsx` | an exact snippet → its replacement | first occurrence on that line, verbatim |
| `css-line` | the full trimmed line → (removed) | the line is deleted (dead token declarations) |
| `css-insert` | `block` (`@theme`, `:root`, `.dark`) + `after` text | inserted at the end of that block in the CSS entry |
| `write` | — / full file text | file created or replaced (`DESIGN-TOKENS.md`) |
| `append` | — / text | appended (`CLAUDE.md` pointer) |
| `baseline` | — | `baseline.js --update` |

`line` is where the scan saw it; `apply.js` tolerates ±3 lines of drift when the `before` text is found exactly once
in that window, otherwise the edit is skipped with `before text not found near its line`.

`confidence`: `exact` (seen at the line) · `likely` (found nearby) · `review` (a person should look; skipped unless
`--include-review`).

## Apply (`apply.js apply <run> <card> [--commit] [--typecheck] [--dry-run] [--include-vendored] [--include-review]`)

1. Phase 1 resolves every edit against the current file text; nothing is written if the file is missing.
2. Phase 2 writes all files at once. `--dry-run` prints a line-level preview instead.
3. `--typecheck` runs the project's own `tsc --noEmit` when `tsconfig.json` and `node_modules/typescript` exist; on
   failure every written file is restored to its previous content (new files removed) and nothing is committed.
4. `--commit` stages only the written files and commits `design-polish: <card> <kind> (<n> edits in <m> files)` on the
   current branch. Undo one card: `git revert <sha>`. Undo the run: `git reset --hard design-polish/<run>/before`.
5. The result goes to `RUN_DIR/apply/<CARD_ID>.result.json` (applied count, skipped with reasons, files, typecheck,
   commit). `diff-runs.js` reads these for chapter 12.

## Decisions (`RUN_DIR/decisions.json`, schema `design-polish.decisions/1`)

Written by the report (Send → local server, or Copy → pasted into chat, or Save → file). Rows: `{ id, action: keep |
merge | leave, target?, note?, card? }`. `apply.js plan` honours them: `leave`/`keep` rows are skipped, a changed
`target` is used, `includeVendored: true` lifts the vendored skip. The planner reads them the same way.

## Preconditions checked by the orchestrator (not by apply.js)

git repository · clean tree (`--untracked-files=no`) · tag `design-polish/<run>/before` · prereq cards first ·
one card per commit · typecheck on · recheck after the last card.
