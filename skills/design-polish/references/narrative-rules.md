# narrative.json — what the model writes, and how

The renderer owns every number. The model owns the words. `narrative.json` is the only file where the model's
language reaches the report, and `check.js narrative` rejects it if it contains a digit.

## Shape (`schema: design-polish.narrative/1`)

```json
{
  "schema": "design-polish.narrative/1",
  "run_id": "2026-08-21T11-51-24",
  "lang": "en",
  "headline": "Consistent at the core, frayed at the edges",
  "lede": "Almost everything goes through the project's tokens. What stands out is a handful of buttons styled by hand on the dashboard and a toolbar whose corners disagree.",
  "screens": { "route:/orders/[id]/(dashboard)": "Order detail" },
  "samples": { "typo:14": { "text": "Pending orders for this week" } },
  "chapters": {
    "color": { "summary": "Five raw colours remain, all of them one-offs; the brand green also appears typed by hand in the legacy checkbox." },
    "shadow": { "summary": "Shadows are consistent.", "no_change_reason": "every shadow comes from the scale" }
  },
  "findings": {
    "F:SIB-RADIUS:2171e7": { "title": "The toolbar mixes corner radii", "explanation": "Two buttons and a select sit in one row; the outlined button is squarer than its neighbours.", "cause": "the outlined button was written by hand instead of using the base button" }
  },
  "cards": {
    "C1": { "title": "Use the radius token where the same value was typed by hand", "why": "Nothing changes on screen; the value just gets a name, so the next generation reuses it." }
  },
  "recommendations": { "tok:color:#1aa44d": "This is the brand green; switch it to the token." },
  "limits": ["Specimens use the fonts installed on this machine, not the project's web font."]
}
```

(The example above contains digits only inside ids; "Five raw colours" would fail the check — write "a few raw colours".)
Every key except `schema`, `run_id`, `lang`, `headline`, `lede` is optional. Unknown keys are rejected.

## Rules

1. **No digits.** Not in any string. Write "several", "most screens", "one row", "a hair lighter". The renderer prints
   the counts next to your words. `check.js narrative` fails on `\d`.
2. **Ids only from the run.** `findings`, `cards`, `screens`, `recommendations` keys must exist in `findings.json`,
   `cards.json`, `inventory.routes`, or the inventory's value/look ids. `samples` keys are `typo:<px>` for sizes that
   exist in the typography values. `verify.js` V7 checks this.
3. **Screens are named for people.** If a route's display is a path or a group like `(dashboard) layout`, give it a
   name from the page's `metadata.title`, its first heading, or what the page is for ("Order detail"). Never rename a
   screen to something it is not.
4. **Samples are real copy.** `samples.typo:14.text` is text that actually appears at that size in the app (read it
   from the JSX labels in the brief or the page). Not lorem ipsum, not a sentence you invented.
5. **Headline = state, lede = what matters.** One sentence each. The headline says how consistent the app is as a
   whole; the lede says the one or two things that stand out and the one thing that is already good.
6. **Finding titles name the place and the thing** ("The toolbar mixes corner radii"), not the rule ("SIB-RADIUS").
   `explanation` says what a person sees. `cause` says why it happened, when the code makes it obvious (hand-written
   classes, a copy of the base component, a value typed instead of a token). If the cause is not obvious, omit it.
7. **Card `why` answers "what do I gain, what could go wrong".** Use the three visual-change words exactly as the UI
   does: *no visible change*, *almost invisible*, *visible*. Never promise "no change" for a card whose
   `visualChange` is not `none`.
8. **Say what is already consistent** in the chapter summary of every axis whose score is high, and put a
   `no_change_reason` on axes without cards.
9. **Vocabulary for people who do not read code**: colours, text sizes, spacing, corners, shadows, buttons, checkboxes,
   inputs, "the same style written twice". "Token" only with a gloss the first time: "a named value defined once".
   Never: signature, ad-hoc, ΔE, CIEDE2000, cva, primitive, AST, regex.
10. **Catalog pages are not evidence.** A look that exists only on `/design-system` is not drift; do not cite it.
11. **Vendored code is named as such**: "the shadcn button" / "복사해 온 라이브러리 버튼", and never blamed for drift that
    happened outside it.
12. **Banned phrases** (`verify.js` V8): "as an AI", "I think", "it seems", "in this session", "let me", "we noticed",
    "you should", "best practice", "industry standard", "world-class", "beautiful", "ugly", "bad design".
13. `lang` matches the report language. Korean narrative uses plain Korean (합니다체 in the report), keeps English
    class names as they are, and avoids loanword jargon.

## Korean example

```json
{ "headline": "기본은 잘 맞춰져 있고, 가장자리 몇 곳이 흐트러져 있습니다",
  "lede": "거의 모든 값이 프로젝트의 토큰(한 번 정의해 두고 이름으로 쓰는 값)을 거칩니다. 눈에 띄는 것은 대시보드에서 손으로 스타일을 적은 버튼 몇 개와, 한 줄에 놓였는데 모서리가 서로 다른 툴바입니다.",
  "findings": { "F:SIB-RADIUS:2171e7": { "title": "툴바의 모서리가 서로 다릅니다", "explanation": "버튼 두 개와 셀렉트가 한 줄에 있는데, 테두리 버튼만 더 각져 있습니다.", "cause": "기본 버튼 대신 클래스를 직접 적어 만들었습니다" } } }
```
