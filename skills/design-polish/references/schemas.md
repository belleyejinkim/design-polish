# Files and ids

## Run directory (`TARGET/.design-polish/runs/<timestamp>/`)

| File | Written by | Schema | Read by |
|---|---|---|---|
| `inventory.json` | `scan.js` | `design-polish.inventory/1` | everything |
| `findings.json` | `diagnose.js` | `design-polish.findings/1` | propose, render, verify, brief |
| `proposal.json`, `cards.json` | `propose.js` | `design-polish.proposal/1`, `design-polish.cards/1` | render, apply, verify |
| `specimens.json`, `live.css` | `render-specimens.js` | — | render |
| `narrative.json` | the model | `design-polish.narrative/1` | render, verify |
| `report.html`, `chat-summary.md` | `render.js` | — | the person, the orchestrator |
| `verification.json` | `verify.js` | `design-polish.verification/1` | render (ch. 13), brief |
| `decisions.json` / `decisions.draft.json` | the report via `serve.js`, or the orchestrator | `design-polish.decisions/1` | apply, planner |
| `apply/<C>.plan.json`, `apply/<C>.result.json` | `apply.js` / the planner | `design-polish.plan/1` | apply, diff-runs |
| `delta.json` | `diff-runs.js` | `design-polish.delta/1` | render (ch. 12), brief |
| `manifest.json` | `inventory.js` | — | orchestrator |

Outside runs: `.design-polish/latest.json` (newest run), `.design-polish/baseline.json` (`design-polish.baseline/1`,
committed, read by `baseline.js`), `.design-polish/config.json` (optional flags), `.design-polish/serve.json`
(running server), `.design-polish/.gitignore` (ignores runs, latest, serve, drafts).

`check.js <kind> <file>` validates any of these; producers run it before finishing, consumers do not read unchecked files.

## Ids

| Prefix | Example | Meaning |
|---|---|---|
| `route:` | `route:/orders/[id]/(dashboard)`, `route:/(dashboard)#layout` | a screen (route group kept for uniqueness) or layout |
| `impl:` | `impl:button:src/components/ui/button.tsx#Button`, `impl:button:native#button` | an implementation of a control type |
| `sig:` | `sig:button:8a40315af74b` | a look — hash of the resolved declaration set minus placement utilities |
| `occ:` | `occ:3e66977f769d` | an occurrence — hash of file, owner component, JSX path; the before/after matching key |
| `tok:` | `tok:color:#1aa44d`, `tok:radius:6`, `tok:color:var:--color-brand` | a value in use / a declared token |
| `tok+:` | `tok+:color.brand-soft` | a proposed token |
| `cl:` | `cl:color:1f2e3d4c` | a colour cluster |
| `grp:` | `grp:7a1b2c3d` | a sibling group (controls sharing a container) |
| `F:` | `F:SIB-RADIUS:2171e7` | a finding — rule + stable key (axis/type/anchor) so rechecks report *remaining* |
| `C` | `C3` | a card |
| `V` | `V4` | a verification check |
