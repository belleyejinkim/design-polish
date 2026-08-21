# Judgment rules

Where the scripts stop and the model begins — and where the model must stop too.

## Who decides what

| Question | Decided by | Never by |
|---|---|---|
| How many, how far apart, where | scripts (`scan`, `diagnose`, `propose`, `diff-runs`) | the model |
| What a screen is called, what a finding means, why it happened | the model (narrative) | scripts |
| Whether two look-alike colours are "the same colour" | the person (gate 1 / report rows) | the model, the scripts |
| Which cards run | the person (report or chat) | the model |
| Per site: does this one-off look carry intent? | the planner, by reading the code around it | `apply.js` (mechanical) |
| Whether the numbers are right | `verify.js` + the verifier, independently | the agent that produced them |

## Role over value

A value is replaced only when its **role** matches the target, not just its number. Examples the planner must get right:

- `#ffffff` as a page background matches `--background`; `#ffffff` as text on a red button does not (in dark mode the
  token turns near-black). Mode-varying tokens are never automatic targets (`propose.js` enforces this).
- `rounded-[6px]` on a button whose neighbours are `rounded-md` (8 px) is drift; `rounded-[6px]` on a checkbox box
  next to a 4 px radio dot is a deliberate size relation — align with neighbours of the same kind.
- A `hover:bg-gray-50` on an outlined button is the project's outline hover only if the base outline variant also uses
  that colour; otherwise it is a one-off and belongs in `align-signature`.
- A hero call-to-action, a destructive confirm, an icon-only button, a pill filter: different by design. The planner
  marks them `skipped: intentional variant` instead of forcing them into the base look.

## Severity is about people, not code

`diagnose.js` raises severity to `high` only when a finding reaches three or more screens. A dozen one-off buttons on
one admin page are `medium`; one raw colour on the home, pricing and checkout pages is `high`. The narrative follows the
same order: lead with what the most people will see.

## What counts, what does not

- **Instances, not definitions.** A control written once inside a component counts once per rendered instance of that
  component. A component nobody renders is `unreached` and reported as such, not as an extra look.
- **Catalog pages** (`/design-system`, `/styleguide`, `/components` with a catalog-like body) are inventoried under
  their own count; they are never evidence of drift and never in `impact`.
- **Vendored libraries** (shadcn copies in `components/ui`) are part of the inventory (they are the base looks) but
  not edited by default. If the base is the problem, that is a design decision for the person.
- **Tests, stories, `.d.ts`, generated files, `node_modules`, build output** are excluded before counting.
- **Palette vs raw.** Tailwind palette classes (`text-gray-500`) are "the scale", not raw values; they appear in
  `PALETTE-GRAYS` when they compete with project neutral tokens. `bg-[#222]`, `style={{ color: '#222' }}` and
  hex literals in CSS are raw.

## Honesty rules for the model

- Never state a count, a px value, a percentage or a ΔE in prose. Point at the report.
- When the scan could not resolve something (`classes.unresolved`, `dynamicSites`, `parseFailed`, specimens `failed`),
  say so in `limits` and in chat, in one plain sentence each.
- Say what is already consistent, with the same prominence as the problems.
- If the verifier refutes a finding, the finding stays in the report with the verifier's note visible; do not delete it,
  do not rerun until it disappears.
- A "safe" card means identical pixels in both light and dark mode. If you cannot say that, it is not safe.

## Confirmation questions (gate 1)

Batch them into one `AskUserQuestion` with at most four items, each phrased from the screen, not from the code:
"On the dashboard and the order page, two greens that look the same are used for the primary button — treat them as
one colour?" Options: yes / no / decide in the report. Record `yes` as `decisions.entries[{id, action: "merge", target}]`.
