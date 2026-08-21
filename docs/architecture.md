# Architecture

design-polish is three layers. The boundaries are the product.

| Layer | What | Who runs it |
|---|---|---|
| **Deciding** (scripts) | Counting, parsing, resolving values, rendering, verifying, applying. Deterministic, dependency-free Node ≥ 18. | CLI (`npx design-polish`) and the skill, same files |
| **Judging** (model) | Naming screens, classifying ambiguous colors/components, writing the narrative, judging *role* match before a replacement. Never produces a number. | The skill's main context + three subagents (scanner, verifier, planner) |
| **Choosing** (human) | Keep / merge / leave, per value or per component look, in the HTML report. Approving each card. | The user, in the browser and at four chat gates |

## Pipeline

```
scan.js ──► inventory.json ──► diagnose.js ──► findings.json ──► propose.js ──► proposal.json + cards.json
   │                                                                                        │
   └─► render-specimens.js ──► live.css + specimens.json ──► render.js ──► report.html ◄── narrative.json (model)
                                                                   │
                                          verify.js ◄──────────────┘        serve.js ◄── decisions.json (human)
                                                                                │
                        planner (model) ──► plan.json ──► apply.js ──► commits ──► scan.js again ──► diff-runs.js
```

Every arrow is a JSON file validated by `check.js` against `schemas/*.schema.json`. A producer may not declare success until `check.js` passes; a consumer never reads an unchecked file.

## Module contracts (scripts/lib)

| Module | Exports | Notes |
|---|---|---|
| `files.js` | `collect(root, opts) → { listSource, files[], skipped[] }` | `git ls-files -z --cached --others --exclude-standard` first, directory walk fallback. Classifies `tsx/jsx/ts/js/css/module.css/scss`. |
| `ts-loader.js` | `load(root) → { ts, version, from } \| null` | Target `node_modules/typescript` → ancestors → `require.resolve` from root → `DESIGN_POLISH_TS` env → our own devDependency (tests). |
| `index-file.js` | `parseFile(ts, file, text) → FileIndex` | Imports (resolved), top-level declarations, exports, components with render roots, every JSX element with attributes, parent pointer, `jsxPath`, text labels, positions. |
| `class-eval.js` | `evaluate(node, ctx) → ClassSet` | Strings, templates, `cn/clsx/twMerge/twJoin/classNames`, `cva(...)()`, const-maps, conditionals, identifiers. `ClassSet = { tokens, conditional, unknown }`. |
| `cva.js` | `parseCva(node, ctx) → CvaModel`, `applyCva(model, env) → tokens` | base + variants + defaultVariants + compoundVariants + className slot. |
| `resolve-usage.js` | `expandUsage(jsxInfo, ctx) → EffectiveElement` | Follows component imports and wrappers (depth ≤ 4), `asChild`/Slot, `data-[x=y]:` variants, multiple returns. |
| `tw-bridge.js` | `create(root, cssEntry) → Bridge` with `resolve(candidates) → Map<class, DeclSet>`, `compile(candidates) → css`, `theme` | Uses the project's own Tailwind v4 (`@tailwindcss/node` / `tailwindcss`), v3 via postcss (1.1), plain CSS by concatenation. |
| `css-parse.js` | `parse(css) → Stylesheet`, `stripComments(css)` | Minimal nested-CSS parser; string/paren aware. |
| `css-eval.js` | `resolveVars`, `toPx`, `evalCalc`, `extractThemeVars`, `parseShadow`, `lengthsOf` | Value resolution; light/dark tables. |
| `color.js` | `parse`, `toHex`, `toLab`, `deltaE2000`, `isAchromatic`, `toOklch` | CIEDE2000, no approximations: unparsable → `null`. |
| `classify.js` | `detect(effective) → { type, basis, confidence } \| null` | 11 component types. |
| `signature.js` | `build(type, declSet, spellings) → Signature` | Identity = hash of resolved declarations minus placement tokens. |
| `routes.js` | `discover(root, indexes) → { router, routes, fileRoutes }` | Next app/pages router, React Router best effort, reverse import BFS. |
| `siblings.js` | `groups(indexes, occurrences) → SiblingGroup[]` | Row/grid containers with ≥ 2 controls. |
| `tokens.js` | `inventory(ctx) → { colors, typography, spacing, radius, border, shadows, axes }` | Declared vs hardcoded, clusters, scales, twins. |
| `ids.js` | `hash(str, len)`, `sigId`, `occId`, `tokId` | sha1, stable across runs. |
| `schema.js` | `validate(schema, value) → { ok, errors[] }` | Small JSON-Schema subset: type, required, enum, pattern, properties, items, additionalProperties, minimum/maximum. |
| `regex-scan.js` | `scan(root, files) → partial inventory` | Fallback when no TypeScript is available; also used by the verifier as an independent method. |

## Stable IDs

- `sig:<type>:<hash12>` — hash of the canonical, resolved declaration set (spelling-independent).
- `occ:<hash12>` — hash of `(file, owning component, jsxPath)`; survives line-number changes.
- `tok:<axis>:<normalized value>` for hardcoded values; `tok:<axis>:var:<name>` for declared tokens; `tok+:<axis>.<name>` for proposed tokens.
- `F:<rule>:<hash6>` findings; `C<n>` cards with a content `key`.

## Output directory (target repo)

```
.design-polish/
├── .gitignore         runs/ serve.json *.draft.json   (self-contained; we never touch the repo's .gitignore)
├── config.json        detected stack, css entry, excludes — reused by recheck
├── baseline.json      counts guarded by `design-polish check` — commit this
├── latest.json        { "run": "<id>" }
└── runs/<id>/         manifest, inventory, findings, proposal, cards, narrative, verification .json,
                       live.css, specimens.json, report.html, chat-summary.md, decisions(.draft).json, delta.json, apply/
```
