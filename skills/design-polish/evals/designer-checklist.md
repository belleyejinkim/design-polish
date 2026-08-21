# Inventory checklist

What one run measures. Every item below has a place in the report; if it could not be measured the report says so.

## Tokens (chapters 03–07)

| Axis | Declared | In use | Findings |
|---|---|---|---|
| Colour | `@theme` / `:root` / `.dark` variables, alias chains resolved (`--color-primary: var(--primary)` is one token), role guess (brand / semantic / neutral), dark value present? | every colour-bearing class, inline style, CSS literal, JS literal; per value: count, screens, where (token · palette · raw), twin token, cluster | NEAR-DUP, TOKEN-TWIN, PALETTE-GRAYS, TOKEN-SPRAWL, HARDCODE, DEAD-TOKEN, DARK-GAP |
| Typography | font-size / weight / line-height / family tokens | sizes (px, with real copy samples), weights, line-heights, families, arbitrary sizes | HARDCODE |
| Spacing | `--spacing` base or inferred step | paddings and gaps per value; component padding table (control, look, height, px, py) | OFF-SCALE, NO-SCALE, PAD-INCONS |
| Corners & borders | `--radius*`, border widths | radii per value (incl. `full`), border widths, KRDS ratio reference | HARDCODE, RATIO, SIB-RADIUS, SIB-RADIUS-PATTERN, INVALID-CLASS |
| Shadows | shadow tokens | shadows per value, stacked real-size | HARDCODE |

## Components (chapter 08) — 11 types

button · checkbox · radio · select · dropdown menu · text field · textarea · toggle · badge · tag · chip

Per type: implementations (component files, raw tags, wrappers, vendored, unreached) · looks (distinct resolved style
sets; one-off = a usage overriding the base) · per look: real-size specimen with default / hover / focus / disabled /
checked / dark tabs, uses, screens, state matrix, differences between looks · findings: SIG-SPRAWL, DUP-IMPL,
STATE-GAP, REPEAT-INLINE, RATIO, PAD-INCONS, UNREACHED.

## Relations (chapter 09)

Controls sharing one flex/grid container: radius mismatch ≥ 2 px, height mismatch ≥ 2 px, with the row rendered.

## Screens (chapter 02)

Next.js app router (route groups removed from paths, `[id]` kept, layouts scoped), pages router, React Router
best-effort; display name from `metadata.title` → first `<h1>` → path → narrative; catalog pages flagged; unreached files listed.

## Method (chapter 13)

Files listed vs scanned, parse failures, unresolved classes, dynamic class sites, engine and version, dark strategy,
fonts substituted, verification results verbatim, score formula.

## Designer checklist (sign-off, ≥ 10 / 12)

1. Every distinct button look is visible at real size without opening code.
2. Each look says how many times and on which screens it appears.
3. Look-alike colours are shown edge to edge with a plain-language distance.
4. Hover / focus / disabled / dark states can be seen for every control look.
5. Neighbour mismatches show the actual row, not a description of it.
6. The "what is already consistent" section exists and is true.
7. Each card states what changes, where, and whether it is visible.
8. The cart warns before a review gets too big.
9. Decisions reach the agent without retyping.
10. After applying, the before/after chapter shows numbers that match the git diff.
11. Nothing in the report requires knowing Tailwind or CSS vocabulary to act on.
12. Developer information exists but is hidden until asked for.
