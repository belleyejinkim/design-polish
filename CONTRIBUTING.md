# Contributing

Thanks for helping. The rules that keep this project trustworthy:

1. **Numbers come from scripts, never from the model.** If you add a metric, add it to `scan.js`/`diagnose.js`, to the JSON schema, and to the renderer's `data-metric` binding.
2. **No runtime dependencies.** Scripts run on Node 18+ with nothing installed. Dev dependencies (for tests and fixtures) are fine.
3. **Every change to scanning must keep the fixtures exact.** `node --test tests/` compares against `evals/fixtures/*/ground-truth.json` with zero tolerance. If a change is intended, update the ground truth in the same PR and explain why.
4. **Determinism.** Two runs on the same input must produce byte-identical JSON (except timestamps). The tests check this.
5. **Honesty over coverage.** Unsupported stacks, unresolved values and skipped files are reported as such. Never approximate a color or invent a value.

## Adding a stack adapter
Add `skills/design-polish/scripts/lib/adapters/<stack>.js`, `skills/design-polish/references/stacks/<stack>.md`, a fixture under `evals/fixtures/`, its `ground-truth.json`, and tests. See `docs/contributing-stack-adapter.md`.

## Running
```
npm install          # dev dependencies for fixtures only
npm test
npm run validate     # claude plugin validate --strict
```
