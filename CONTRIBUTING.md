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

## Working on the report template

You do not need to re-scan anything to change the report. The renderer is a pure function of a run directory:

```
npm run report:dev                                   # messy-next fixture, Korean UI
node tools/report-dev.js clean-shadcn --lang en      # another fixture / language
node tools/report-dev.js --target ~/Codes/my-app     # a real project (scanned once into .dev/report/<name>)
```

It scans once into `.dev/report/<name>/` (git-ignored), serves the report on `127.0.0.1`, opens it, and then
re-renders (~100 ms) whenever `skills/design-polish/templates/**` (`report.css`, `report.js`, `i18n/*.json`),
`scripts/render.js`, `scripts/render-specimens.js` or `scripts/lib/**` change. The open tab reloads itself within
three seconds and keeps its scroll position. `verify.js --quick` runs after each render and prints any `FAIL` line,
so a template change that breaks a `data-metric` binding shows up immediately.

A fixture can ship `narrative.sample.<lang>.json` next to it (messy-next does); the dev loop copies it into the run so
the template shows the "with model" state — headline, lede, finding titles, card text. Pass `--no-narrative` for the
zero-AI look, `--fresh` to re-scan.

Template rules are in `skills/design-polish/references/report-spec.md`: one measure, paper/ink palette, no left accent
bars, no remote assets, every number wrapped in `data-metric`.

