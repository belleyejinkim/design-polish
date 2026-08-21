# Cards

A card is one approvable unit of change. `propose.js` writes `cards.json`; the person picks cards (or rows) in the
report; `apply.js` (or the planner + `apply.js`) performs them one commit at a time.

## Fields

| Field | Meaning |
|---|---|
| `id` | `C1`, `C2`… in priority order (safe and small first). Stable within a run; do not reuse across runs. |
| `key` | hash of kind + axis + sources; lets a later run recognise "the same card". |
| `kind` | see below |
| `axis` | `color` · `typography` · `spacing` · `radius` · `shadow` · `tokens` · `classes` · `component:<type>` |
| `entries[]` | what moves where: `{ source, target, action, occurrences, vendored, screens, files, visualChange, metric, modeVarying }` |
| `impact` | `{ occurrences, vendored, screens, files, weight }` — occurrences excludes vendored sites |
| `grade` | `S` ≤ 30 places · `M` ≤ 100 · `L` more. The report warns when a cart mixes two M cards or exceeds 100 places. |
| `visualChange` | worst entry: `none` (identical pixels) · `subtle` (ΔE < 2 or < 2 px) · `visible` |
| `safety` | `none` (apply without looking) · `approve` (look at the diff) · `design` (a design decision; never auto) |
| `type` | `migrate` (code moves to the system) · `design` (the system itself changes) · `refactor` · `docs` |
| `prereq` | card ids that must be applied first (a new token before the values that use it) |
| `needsUserConfirmation` | at least one entry is a guess the person must confirm (a look-alike pair, a mode-varying token) |
| `status` | `proposed` → `accepted` / `edited` / `partial` / `rejected` / `untouched` (from decisions) → `applied` / `skipped` / `failed` |

## Kinds and who plans them

| kind | What it does | Planned by | Typical safety |
|---|---|---|---|
| `register-tokens` | a raw value identical to an existing token → the token (`#1AA44D` → `var(--brand)`, `rounded-[6px]` → `rounded-sm`); raw colours used 3+ times → new tokens with the same value | `apply.js` | none |
| `merge-values` | look-alike values → one value (ΔE < 2 colours, radii within 2 px, spacing rounded to the grid) | `apply.js` | approve (subtle) / design (visible) |
| `delete-dead-tokens` | declared tokens with zero references → removed from the CSS entry | `apply.js` | none |
| `guardrails` | `DESIGN-TOKENS.md`, a pointer line in `CLAUDE.md` / `AGENTS.md`, `.design-polish/baseline.json` | `apply.js` | none |
| `align-neighbors` | controls in one row get one corner radius | planner | approve |
| `align-signature` | one-off looks adopt the base component's variant | planner | design |
| `add-state` | looks with hover but no focus-visible get the project's focus style | planner | approve |
| `fix-class` | classes that compile to nothing are replaced or removed | planner | approve |
| `extract-component` (v1.1, `advanced: true`) | repeated raw controls become a component | planner | design |

## Rules the proposal follows

- A value maps to **one** target. Twins (ΔE < 1 or identical px) beat near-duplicates; declared tokens beat raw values;
  the most-used member of a cluster is the target only when it dominates (≥ 3× the rest), otherwise the cluster needs
  the person's choice and is not a card.
- **Mode-varying tokens** (light ≠ dark) are never the target of a `none`/`approve` card: a raw colour is the same in
  both modes, the token is not, so the dark screen would change. Such matches go to one `merge-values` card titled
  "Decide: …" with `safety: design` and `needsUserConfirmation`.
- **Vendored files** (`meta.vendored.dirs`, usually `components/ui/*`) are counted in `impact.vendored` and skipped by
  `apply.js` unless `--include-vendored` / `decisions.includeVendored`.
- Catalog pages (`/design-system`, `/styleguide`) do not count toward `impact`.
- Typography, shadows and borders get no automatic cards in v1.0; they are inventoried and curated by hand.
