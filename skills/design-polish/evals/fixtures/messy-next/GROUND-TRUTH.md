# messy-next — ground truth

Synthetic fixture for the `design-polish` scanner: a small Next.js 16 App Router + React 19 + TypeScript + Tailwind v4 + shadcn-style (cva + Radix) app that is deliberately messy the way vibe-coded apps are. Every number in `ground-truth.json` is derived **by construction** from the source files and listed below with `file:line` evidence so it can be re-checked by hand.

Tests assert against `ground-truth.json`; this document explains each number. Line numbers refer to the files as committed — if a fixture file is edited, regenerate both documents.

## 1. Stack

| | |
|---|---|
| Framework | next@16 app-router, React 19, TypeScript |
| Styling | v4 (@import "tailwindcss", @theme inline); CSS entry `src/app/globals.css` |
| Components | shadcn new-york style (marker `components.json`), cva, `@radix-ui/react-checkbox`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-switch`, `@radix-ui/react-slot` |
| Helper | `src/lib/utils.ts#cn = twMerge(clsx(...))` |
| Alias | `@/* -> ./src/*` |
| Dark mode | `@custom-variant dark (&:is(.dark *))` |
| Radius base | `--radius: 0.625rem (10px)` → rounded-sm 6px, rounded-md 8px, rounded-lg 10px, rounded-xl 14px (verified by compiling globals.css with Tailwind 4) |

Do **not** run `npm install` inside the fixture. Tests resolve `typescript` and `tailwindcss` from the repo root.

## 2. Definitions

- **Scanned files** — Extensions .tsx/.jsx/.ts/.js/.css under the fixture, excluding node_modules, __tests__/ and *.test.*. The catalog page src/app/design-system/page.tsx IS scanned but its counts go to the `catalog` bucket and are excluded from `counts.total`.
- **Occurrence** — A JSX element that is a raw HTML control (button, input[type=checkbox|radio|text...], select, textarea) or a usage of a component whose resolved root is one. Render roots inside component definitions are implementations, not occurrences. Elements inside .map() count once. Layout elements count once. Chip's × button counts as a button occurrence per Chip usage. A DropdownMenu (Trigger+Content) is one dropdown-menu occurrence; its asChild trigger Button is additionally a button occurrence (decision D1).
- **Signature** — Identity = resolved CSS declaration set after expanding cva base+variant+size (+ defaultVariants) and merging className with tailwind-merge semantics, ignoring placement-only classes: m-*, mt-*, mb-*, ml-*, mr-*, mx-*, my-*, w-*, max-w-*, min-w-*, flex-1, shrink-0, absolute, relative, self-*, order-*, col-span-*, z-*.
- **Types** — `button`, `checkbox`, `dropdown-menu`, `radio`, `select`, `textarea`, `text-field`, `toggle`, `badge`, `tag`, `chip`.

### Decisions taken where the brief was ambiguous

- **D1 · Dropdown trigger Button.** The asChild `<Button>` inside `<DropdownMenuTrigger>` counts as a button occurrence (toolbar.tsx:18, signature B-outline-sm) AND the DropdownMenu counts as one dropdown-menu occurrence (toolbar.tsx:16). counts.buttonOccurrencesExcludingDropdownTrigger (19) is provided if the scanner chooses not to double-list it.
- **D2 · DynamicButton usage.** DynamicButton is used once (dashboard/page.tsx:52) so that it is not also an unreached component. Its occurrence is counted in button.occurrences (20) but has no signature (button.signatures = 11 counts resolved looks only).
- **D3 · hoverWithoutFocusVisible scope.** Applied the rule mechanically: RAW-A ×3 plus the Chip × button (chip.tsx:7), which also has hover: without focus-visible:. RAW-B was given focus-visible:focus-ring (using the project @utility) so it is deliberately NOT flagged.
- **D4 · Extra tokens beyond the brief.** Added --secondary-foreground, --accent-foreground, --popover, --popover-foreground so the vendored shadcn classes (text-secondary-foreground, hover:text-accent-foreground, bg-popover ...) resolve. All four are used; dead tokens remain exactly sidebar-accent + chart-1..3.
- **D5 · Radio / LegacyCheckbox shapes.** LegacyCheckbox root IS the `<input type=checkbox>` (label lives at the usage site). Radio root is a `<label>` wrapping exactly one `<input type=radio>`; each `<Radio />` usage is one radio occurrence (single-control wrapper resolution).
- **D6 · Sibling mismatch count.** Two groups mismatch, not one: the brief's toolbar (RAW-A rounded-[6px] beside rounded-md buttons) necessarily mismatches too. The settings-form Input/Button row is marked headline:true (same 36px height).
- **D7 · Switch markup.** Used the classic shadcn switch (h-5 w-9, thumb size-4, translate-x-4) instead of the newer h-[1.15rem] version so the only off-scale spacing value in the fixture is p-[18px].
- **D8 · Catalog written out literally.** The 24 Button and 4 Badge elements are literal JSX (no .map over variant arrays) so each is a distinct, resolvable occurrence; a .map would count once and be unresolvable.

## 3. Files

29 scanned files (1 of them the catalog page, reported in its own bucket):

- `next.config.ts`
- `src/lib/utils.ts`
- `src/app/globals.css`
- `src/app/layout.tsx`
- `src/app/page.tsx`
- `src/app/(dashboard)/layout.tsx`
- `src/app/(dashboard)/dashboard/page.tsx`
- `src/app/(dashboard)/settings/page.tsx`
- `src/app/(dashboard)/orders/[id]/page.tsx`
- `src/app/design-system/page.tsx` — **catalog bucket**
- `src/components/ui/badge.tsx`
- `src/components/ui/button.tsx`
- `src/components/ui/checkbox.tsx`
- `src/components/ui/dropdown-menu.tsx`
- `src/components/ui/input.tsx`
- `src/components/ui/radio.tsx`
- `src/components/ui/select-native.tsx`
- `src/components/ui/switch.tsx`
- `src/components/ui/textarea.tsx`
- `src/components/shared/button-presets.tsx`
- `src/components/shared/card.tsx`
- `src/components/shared/chart-legend.tsx`
- `src/components/shared/chip.tsx`
- `src/components/shared/dynamic-button.tsx`
- `src/components/shared/legacy-checkbox.tsx`
- `src/components/shared/toolbar.tsx`
- `src/components/shared/unused/old-button.tsx`
- `src/components/forms/settings-form.tsx`

Excluded from scanning:

- `src/components/shared/__tests__/button.test.tsx` — matches __tests__/ and *.test.*

Not source files (never scanned): `postcss.config.mjs` (.mjs is not in the scanned extension list), `package.json` (not a source/css file), `tsconfig.json` (not a source/css file), `components.json` (not a source/css file (shadcn marker)), `ground-truth.json` (fixture metadata), `GROUND-TRUTH.md` (fixture metadata).

## 4. Counts

### Main bucket (`counts.total`, catalog excluded)

| Type | Occurrences | Signatures | Signature labels |
|---|---:|---:|---|
| button | 20 (19 resolved + 1 dynamic) | 11 | `RAW-B`, `B1`, `B-primary`, `B-ghost`, `B-outline-sm`, `RAW-A`, `B-sm`, `RAW-C`, `CHIP-X`, `B-destructive`, `B-dangerlink`, + DYN (unresolved, not a signature) |
| checkbox | 3 | 2 | `CB-legacy`, `CB-radix` |
| dropdown-menu | 1 | 1 | `DDM` |
| radio | 3 | 1 | `RADIO` |
| select | 1 | 1 | `SELECT-native` |
| textarea | 1 | 1 | `TEXTAREA` |
| text-field | 1 | 1 | `INPUT` |
| toggle | 1 | 1 | `SWITCH` |
| badge | 3 | 3 | `BADGE-default`, `BADGE-secondary`, `BADGE-destructive` |
| tag | 3 | 1 | `TAG` |
| chip | 1 | 1 | `CHIP` |
| **total** | **38** | **24** | |

If the scanner chooses not to list the dropdown trigger's asChild Button as a button occurrence (decision D1), button occurrences are 19 and the total is 37; signatures are unchanged.

### Catalog bucket (`counts.catalog`, `src/app/design-system/page.tsx`)

| Type | Occurrences | Signatures | Also present in main |
|---|---:|---:|---|
| button | 24 | 24 | `B1`, `B-sm`, `B-destructive`, `B-outline-sm`, `B-ghost` |
| badge | 4 | 4 | `BADGE-default`, `BADGE-secondary`, `BADGE-destructive` |
| **total** | **28** | **28** | 8 shared, 20 catalog-only |

Distinct signatures across main + catalog: **44** (24 main + 19 catalog-only button + 1 catalog-only badge).

## 5. Occurrence ledger (main bucket)

Every occurrence as `file:line → type → signature`. "Owner" is the component whose render tree contains the element; "reached via" is the usage chain for elements living inside a shared component.

### button — 20 occurrences, 11 signatures

| id | file:line | signature | source | owner | notes |
|---|---|---|---|---|---|
| occ-01 | `src/app/layout.tsx:13` | `RAW-B` | raw `<button>` | RootLayout | label "Sign out"; layout: root |
| occ-02 | `src/app/page.tsx:22` | `B1` | Button | HomePage | label "Get started"; className mt-4 is placement-only -> same signature as plain `<Button>` |
| occ-03 | `src/app/page.tsx:26` | `B-primary` | PrimaryButton -> Button | HomePage | label "Upgrade now" |
| occ-04 | `src/app/page.tsx:31` | `B1` | Button | HomePage | label "Continue"; className w-full is placement-only -> same signature as plain `<Button>` |
| occ-05 | `src/app/(dashboard)/layout.tsx:9` | `B-ghost` | Button | DashboardLayout | label "Overview"; layout: (dashboard) |
| occ-06 | `src/app/(dashboard)/layout.tsx:10` | `B-ghost` | Button | DashboardLayout | label "Orders"; layout: (dashboard) |
| occ-07 | `src/app/(dashboard)/layout.tsx:11` | `B-ghost` | Button | DashboardLayout | label "Settings"; layout: (dashboard) |
| occ-08 | `src/components/shared/toolbar.tsx:13` | `B-outline-sm` | Button | Toolbar | label "Filter"; reached via src/app/(dashboard)/layout.tsx:13 `<Toolbar />`; layout: (dashboard) |
| occ-09 | `src/components/shared/toolbar.tsx:18` | `B-outline-sm` | DropdownMenuTrigger asChild -> Button | Toolbar | label "Export"; reached via src/app/(dashboard)/layout.tsx:13 `<Toolbar />`; layout: (dashboard); Also the trigger of the dropdown-menu occurrence at toolbar.tsx:16 (see decisions[0]) |
| occ-10 | `src/components/shared/toolbar.tsx:30` | `RAW-A` | raw `<button>` | Toolbar | label "Refresh"; reached via src/app/(dashboard)/layout.tsx:13 `<Toolbar />`; layout: (dashboard) |
| occ-11 | `src/app/(dashboard)/dashboard/page.tsx:40` | `B-sm` | Button | DashboardPage | label "View"; inside orders.map() -> counts once |
| occ-12 | `src/app/(dashboard)/dashboard/page.tsx:46` | `RAW-C` | raw `<button>` | DashboardPage | label "Create order" |
| occ-13 | `src/app/(dashboard)/dashboard/page.tsx:52` | `DYN` (unresolved) | DynamicButton -> raw `<button>` with template-literal className | DashboardPage | label "Sync" |
| occ-14 | `src/components/shared/chip.tsx:7` | `CHIP-X` | raw `<button>` inside Chip root tree | Chip | label "×"; reached via src/app/(dashboard)/dashboard/page.tsx:30 `<Chip>`; counted once per Chip usage (1 usage) |
| occ-15 | `src/components/forms/settings-form.tsx:21` | `RAW-A` | raw `<button>` | SettingsForm | label "Reset"; reached via src/app/(dashboard)/settings/page.tsx:11 `<SettingsForm />` |
| occ-16 | `src/components/forms/settings-form.tsx:32` | `B1` | Button | SettingsForm | label "Save"; reached via src/app/(dashboard)/settings/page.tsx:11 `<SettingsForm />` |
| occ-17 | `src/components/forms/settings-form.tsx:80` | `B-destructive` | Button | SettingsForm | label "Delete account"; reached via src/app/(dashboard)/settings/page.tsx:11 `<SettingsForm />` |
| occ-18 | `src/app/(dashboard)/orders/[id]/page.tsx:20` | `B-destructive` | Button | OrderPage | label "Cancel order" |
| occ-19 | `src/app/(dashboard)/orders/[id]/page.tsx:21` | `B-dangerlink` | DangerLink -> Button | OrderPage | label "Report a problem" |
| occ-20 | `src/app/(dashboard)/orders/[id]/page.tsx:23` | `RAW-A` | raw `<button>` | OrderPage | label "Refresh" |

### checkbox — 3 occurrences, 2 signatures

| id | file:line | signature | source | owner | notes |
|---|---|---|---|---|---|
| occ-29 | `src/components/forms/settings-form.tsx:39` | `CB-legacy` | LegacyCheckbox -> `<input type="checkbox">` | SettingsForm | reached via src/app/(dashboard)/settings/page.tsx:11 `<SettingsForm />` |
| occ-30 | `src/components/forms/settings-form.tsx:43` | `CB-legacy` | LegacyCheckbox -> `<input type="checkbox">` | SettingsForm | reached via src/app/(dashboard)/settings/page.tsx:11 `<SettingsForm />` |
| occ-31 | `src/components/forms/settings-form.tsx:47` | `CB-radix` | Checkbox -> @radix-ui/react-checkbox Root | SettingsForm | reached via src/app/(dashboard)/settings/page.tsx:11 `<SettingsForm />` |

### dropdown-menu — 1 occurrence, 1 signature

| id | file:line | signature | source | owner | notes |
|---|---|---|---|---|---|
| occ-38 | `src/components/shared/toolbar.tsx:16` | `DDM` | DropdownMenu (Root toolbar.tsx:16, Trigger :17, Content :22, 3 Items :23,:24,:26, Separator :25) | Toolbar | label "Export"; reached via src/app/(dashboard)/layout.tsx:13 `<Toolbar />`; layout: (dashboard); Trigger + Content = one occurrence; its asChild trigger Button is ALSO the button occurrence at toolbar.tsx:18 |

### radio — 3 occurrences, 1 signature

| id | file:line | signature | source | owner | notes |
|---|---|---|---|---|---|
| occ-35 | `src/components/forms/settings-form.tsx:75` | `RADIO` | Radio -> `<label>` wrapping `<input type="radio">` | SettingsForm | reached via src/app/(dashboard)/settings/page.tsx:11 `<SettingsForm />` |
| occ-36 | `src/components/forms/settings-form.tsx:76` | `RADIO` | Radio -> `<label>` wrapping `<input type="radio">` | SettingsForm | reached via src/app/(dashboard)/settings/page.tsx:11 `<SettingsForm />` |
| occ-37 | `src/components/forms/settings-form.tsx:77` | `RADIO` | Radio -> `<label>` wrapping `<input type="radio">` | SettingsForm | reached via src/app/(dashboard)/settings/page.tsx:11 `<SettingsForm />` |

### select — 1 occurrence, 1 signature

| id | file:line | signature | source | owner | notes |
|---|---|---|---|---|---|
| occ-34 | `src/components/forms/settings-form.tsx:68` | `SELECT-native` | SelectNative -> `<select>` | SettingsForm | reached via src/app/(dashboard)/settings/page.tsx:11 `<SettingsForm />` |

### textarea — 1 occurrence, 1 signature

| id | file:line | signature | source | owner | notes |
|---|---|---|---|---|---|
| occ-33 | `src/components/forms/settings-form.tsx:61` | `TEXTAREA` | Textarea -> `<textarea>` | SettingsForm | reached via src/app/(dashboard)/settings/page.tsx:11 `<SettingsForm />` |

### text-field — 1 occurrence, 1 signature

| id | file:line | signature | source | owner | notes |
|---|---|---|---|---|---|
| occ-28 | `src/components/forms/settings-form.tsx:31` | `INPUT` | Input -> `<input>` (no type attr = text) | SettingsForm | reached via src/app/(dashboard)/settings/page.tsx:11 `<SettingsForm />` |

### toggle — 1 occurrence, 1 signature

| id | file:line | signature | source | owner | notes |
|---|---|---|---|---|---|
| occ-32 | `src/components/forms/settings-form.tsx:54` | `SWITCH` | Switch -> @radix-ui/react-switch Root | SettingsForm | reached via src/app/(dashboard)/settings/page.tsx:11 `<SettingsForm />` |

### badge — 3 occurrences, 3 signatures

| id | file:line | signature | source | owner | notes |
|---|---|---|---|---|---|
| occ-21 | `src/app/page.tsx:15` | `BADGE-default` | Badge | HomePage | label "New" |
| occ-22 | `src/app/page.tsx:16` | `BADGE-secondary` | Badge | HomePage | label "v0.1" |
| occ-23 | `src/app/(dashboard)/orders/[id]/page.tsx:16` | `BADGE-destructive` | Badge | OrderPage | label "Overdue" |

### tag — 3 occurrences, 1 signature

| id | file:line | signature | source | owner | notes |
|---|---|---|---|---|---|
| occ-24 | `src/app/page.tsx:17` | `TAG` | Tag | HomePage | label "Beta" |
| occ-25 | `src/app/(dashboard)/dashboard/page.tsx:22` | `TAG` | Tag | DashboardPage | label "Beta" |
| occ-26 | `src/app/(dashboard)/dashboard/page.tsx:38` | `TAG` | Tag | DashboardPage | label "{order.status}"; inside orders.map() -> counts once |

### chip — 1 occurrence, 1 signature

| id | file:line | signature | source | owner | notes |
|---|---|---|---|---|---|
| occ-27 | `src/app/(dashboard)/dashboard/page.tsx:30` | `CHIP` | Chip | DashboardPage | label "Status: paid"; its × remove button is the CHIP-X button occurrence |

### Per-signature tally (button)

| signature | count | sites |
|---|---:|---|
| `RAW-B` | 1 | src/app/layout.tsx:13 |
| `B1` | 3 | src/app/page.tsx:22, src/app/page.tsx:31, src/components/forms/settings-form.tsx:32 |
| `B-primary` | 1 | src/app/page.tsx:26 |
| `B-ghost` | 3 | src/app/(dashboard)/layout.tsx:9, src/app/(dashboard)/layout.tsx:10, src/app/(dashboard)/layout.tsx:11 |
| `B-outline-sm` | 2 | src/components/shared/toolbar.tsx:13, src/components/shared/toolbar.tsx:18 |
| `RAW-A` | 3 | src/components/shared/toolbar.tsx:30, src/components/forms/settings-form.tsx:21, src/app/(dashboard)/orders/[id]/page.tsx:23 |
| `B-sm` | 1 | src/app/(dashboard)/dashboard/page.tsx:40 |
| `RAW-C` | 1 | src/app/(dashboard)/dashboard/page.tsx:46 |
| `DYN` | 1 | src/app/(dashboard)/dashboard/page.tsx:52 |
| `CHIP-X` | 1 | src/components/shared/chip.tsx:7 |
| `B-destructive` | 2 | src/components/forms/settings-form.tsx:80, src/app/(dashboard)/orders/[id]/page.tsx:20 |
| `B-dangerlink` | 1 | src/app/(dashboard)/orders/[id]/page.tsx:21 |
| **sum** | **20** | |

## 6. Signature ledger

Resolved values are what the signature hash must be built from (after cva expansion + tailwind-merge + placement-class removal). `var(--x)` means the token is referenced, not inlined.

### `B1` — button

- Source: Button variant=default size=default
- Merged classes: `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 h-9 px-4 py-2 has-[>svg]:px-3`
- Resolved: heightPx=36; paddingXPx=16; paddingYPx=8; radiusPx=8; background=var(--primary); color=var(--primary-foreground); fontSizePx=14; fontWeight=500; hoverBackground=var(--primary) @ 90%; focusVisible=ring 3px var(--ring)/50 + border-ring; shadow=shadow-xs
- Main occurrences: 3

### `B-primary` — button

- Source: PrimaryButton = Button + className "bg-[#222222] text-white hover:bg-[#333333]"
- Merge: twMerge drops bg-primary, text-primary-foreground, hover:bg-primary/90
- Resolved: heightPx=36; paddingXPx=16; paddingYPx=8; radiusPx=8; background=#222222; color=#ffffff; fontSizePx=14; fontWeight=500; hoverBackground=#333333; focusVisible=ring 3px var(--ring)/50 + border-ring; shadow=shadow-xs
- Main occurrences: 1

### `B-ghost` — button

- Source: Button variant=ghost size=default
- Resolved: heightPx=36; paddingXPx=16; paddingYPx=8; radiusPx=8; background=transparent; color=inherit; fontSizePx=14; fontWeight=500; hoverBackground=var(--accent); hoverColor=var(--accent-foreground); focusVisible=ring 3px var(--ring)/50 + border-ring
- Main occurrences: 3

### `B-outline-sm` — button

- Source: Button variant=outline size=sm
- Merge: size sm gap-1.5 overrides base gap-2; rounded-md repeated
- Resolved: heightPx=32; paddingXPx=12; gapPx=6; radiusPx=8; border=1px solid var(--border); background=var(--background); color=inherit; fontSizePx=14; fontWeight=500; hoverBackground=var(--accent); focusVisible=ring 3px var(--ring)/50 + border-ring; shadow=shadow-xs
- Main occurrences: 2

### `B-sm` — button

- Source: Button variant=default size=sm
- Resolved: heightPx=32; paddingXPx=12; gapPx=6; radiusPx=8; background=var(--primary); color=var(--primary-foreground); fontSizePx=14; fontWeight=500; hoverBackground=var(--primary) @ 90%; focusVisible=ring 3px var(--ring)/50 + border-ring; shadow=shadow-xs
- Main occurrences: 1

### `B-destructive` — button

- Source: Button variant=destructive size=default
- Merge: focus-visible:ring-destructive/20 replaces focus-visible:ring-ring/50
- Resolved: heightPx=36; paddingXPx=16; paddingYPx=8; radiusPx=8; background=var(--destructive); color=#ffffff (text-white); fontSizePx=14; fontWeight=500; hoverBackground=var(--destructive) @ 90%; focusVisible=ring 3px var(--destructive)/20 + border-ring; shadow=shadow-xs
- Main occurrences: 2

### `B-dangerlink` — button

- Source: DangerLink = Button variant=link + className "text-[#d93025]"
- Merge: twMerge drops text-primary
- Resolved: heightPx=36; paddingXPx=16; paddingYPx=8; radiusPx=8; background=transparent; color=#d93025; fontSizePx=14; fontWeight=500; textDecoration=hover:underline, underline-offset 4px; focusVisible=ring 3px var(--ring)/50 + border-ring
- Main occurrences: 1

### `RAW-A` — button

- Source: raw `<button className="rounded-[6px] border px-3 py-1.5 text-sm hover:bg-gray-50">`
- Resolved: heightPx=auto (≈34: 20 line-height + 12 padding + 2 border); paddingXPx=12; paddingYPx=6; radiusPx=6; border=1px solid var(--border); background=transparent; color=inherit; fontSizePx=14; fontWeight=400; hoverBackground=gray-50 (oklch(0.985 0.002 247.839)); focusVisible=NONE
- Main occurrences: 3; repeated inline ×3

### `RAW-B` — button

- Source: raw `<button className="text-sm text-gray-500 hover:text-gray-900 focus-visible:focus-ring">`
- Resolved: heightPx=auto; paddingXPx=0; paddingYPx=0; radiusPx=0; background=transparent; color=gray-500; fontSizePx=14; fontWeight=400; hoverColor=gray-900; focusVisible=outline-none + ring 2px var(--ring)/50 (via @utility focus-ring)
- Main occurrences: 1

### `RAW-C` — button

- Source: raw `<button className="rounded-lg bg-brand p-[18px] text-white">`
- Resolved: heightPx=auto (≈56: 20 line-height + 36 padding); paddingPx=18; radiusPx=10; background=var(--brand) = #1AA44D; color=#ffffff (text-white); fontSizePx=16; fontWeight=400; hover=NONE; focusVisible=NONE
- Main occurrences: 1; off-scale: `p-[18px]`

### `CHIP-X` — button

- Source: raw `<button aria-label="remove" className="rounded-full hover:bg-gray-200">` inside Chip
- Resolved: heightPx=auto; paddingPx=0; radiusPx=9999; background=transparent; color=inherit (gray-700 from Chip); fontSizePx=12; hoverBackground=gray-200; focusVisible=NONE
- Main occurrences: 1

### `DYN` — button (unresolved)

- Source: DynamicButton root `<button>` whose className is the template literal "btn btn-${kind}" (dynamic-button.tsx:9)
- Main occurrences: 1
- Note: Not a signature. Reported under dynamicClassSites; must not be invented (e.g. as btn-primary).

### `OLD` — button (implementation only, unreached)

- Source: OldButton root `<button className="rounded-none bg-black px-4 py-2 text-white">`
- Resolved: radiusPx=0; background=#000000 (bg-black); color=#ffffff; paddingXPx=16; paddingYPx=8
- Main occurrences: 0
- Note: Implementation only; never used -> not a signature in counts.

### `BADGE-default` — badge

- Source: Badge variant=default
- Resolved: radiusPx=8; paddingXPx=8; paddingYPx=2; fontSizePx=12; fontWeight=500; border=1px solid transparent; background=var(--primary); color=var(--primary-foreground)
- Main occurrences: 1

### `BADGE-secondary` — badge

- Source: Badge variant=secondary
- Resolved: radiusPx=8; paddingXPx=8; paddingYPx=2; fontSizePx=12; fontWeight=500; border=1px solid transparent; background=var(--secondary); color=var(--secondary-foreground)
- Main occurrences: 1

### `BADGE-destructive` — badge

- Source: Badge variant=destructive
- Resolved: radiusPx=8; paddingXPx=8; paddingYPx=2; fontSizePx=12; fontWeight=500; border=1px solid transparent; background=var(--destructive); color=#ffffff (text-white)
- Main occurrences: 1

### `BADGE-outline` — badge (catalog only)

- Source: Badge variant=outline
- Resolved: radiusPx=8; paddingXPx=8; paddingYPx=2; fontSizePx=12; fontWeight=500; border=1px solid var(--border); background=transparent; color=var(--foreground)
- Main occurrences: 0

### `TAG` — tag

- Source: Tag `<span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">`
- Resolved: radiusPx=8; paddingXPx=8; paddingYPx=2; fontSizePx=11; fontWeight=500; background=blue-50; color=blue-700
- Main occurrences: 3; off-scale: `text-[11px]`

### `CHIP` — chip

- Source: Chip `<span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-700">`
- Resolved: radiusPx=9999; paddingXPx=10; paddingYPx=2; gapPx=4; fontSizePx=12; fontWeight=400; background=gray-100; color=gray-700
- Main occurrences: 1

### `INPUT` — text-field

- Source: Input -> `<input>` h-9 rounded-sm border px-3 py-1 text-sm ...
- Resolved: heightPx=36; paddingXPx=12; paddingYPx=4; radiusPx=6; border=1px solid var(--input); background=transparent; fontSizePx=14; placeholderColor=var(--muted-foreground); focusVisible=ring 3px var(--ring)/50 + border-ring; shadow=shadow-xs
- Main occurrences: 1

### `CB-radix` — checkbox

- Source: Checkbox -> CheckboxPrimitive.Root size-4 rounded-[4px] border border-input ...
- Resolved: sizePx=16; radiusPx=4; border=1px solid var(--input); checkedBackground=var(--primary); checkedBorder=var(--primary); checkedColor=var(--primary-foreground); focusVisible=ring 3px var(--ring)/50 + border-ring; shadow=shadow-xs
- Main occurrences: 1

### `CB-legacy` — checkbox

- Source: LegacyCheckbox -> `<input type="checkbox" className="h-5 w-5 rounded border-gray-300" style={{ accentColor: "#1AA44D" }}>`
- Resolved: sizePx=20; radiusPx=4; borderColor=gray-300; accentColor=#1AA44D (inline style; twin of --brand); focusVisible=browser default only
- Main occurrences: 2

### `SWITCH` — toggle

- Source: Switch -> SwitchPrimitive.Root h-5 w-9 rounded-full border-2 ... data-[state=checked]:bg-primary data-[state=unchecked]:bg-input
- Resolved: heightPx=20; widthPx=36; radiusPx=9999; border=2px solid transparent; checkedBackground=var(--primary); uncheckedBackground=var(--input); thumbSizePx=16; focusVisible=ring 2px var(--ring) + offset 2px
- Main occurrences: 1

### `TEXTAREA` — textarea

- Source: Textarea -> `<textarea>` min-h-16 rounded-md border px-3 py-2 text-base md:text-sm ...
- Resolved: minHeightPx=64; paddingXPx=12; paddingYPx=8; radiusPx=8; border=1px solid var(--input); background=transparent; fontSizePx=16 (14 at md+); focusVisible=ring 3px var(--ring)/50 + border-ring; shadow=shadow-xs
- Main occurrences: 1

### `SELECT-native` — select

- Source: SelectNative -> `<select className="h-9 rounded-md border px-3 text-sm">`
- Resolved: heightPx=36; paddingXPx=12; radiusPx=8; border=1px solid var(--border); fontSizePx=14; focusVisible=NONE (browser default)
- Main occurrences: 1

### `RADIO` — radio

- Source: Radio -> `<label class="flex items-center gap-2 text-sm">` wrapping `<input type="radio" className="size-4 accent-brand">`
- Resolved: sizePx=16; accentColor=var(--brand); focusVisible=browser default only
- Main occurrences: 3
- Resolution: root is a `<label>` that wraps exactly one control; classify by the nested control

### `DDM` — dropdown-menu

- Source: DropdownMenu (Radix) — Content: bg-popover text-popover-foreground z-50 min-w-[8rem] overflow-hidden rounded-md border p-1 shadow-md; Item: rounded-sm px-2 py-1.5 text-sm focus:bg-accent ...
- Resolved: content={"radiusPx":8,"paddingPx":4,"border":"1px solid var(--border)","background":"var(--popover)","minWidthPx":128,"shadow":"shadow-md"}; item={"radiusPx":6,"paddingXPx":8,"paddingYPx":6,"fontSizePx":14,"focusBackground":"var(--accent)"}; trigger=asChild -> B-outline-sm
- Main occurrences: 1

## 7. Catalog ledger (`src/app/design-system/page.tsx`)

Route `/design-system`, title "Design System". report separately; exclude from counts.total; do not let it inflate per-signature usage counts.

| id | line | element | signature | also in main as |
|---|---:|---|---|---|
| cat-01 | 17 | `<Button variant="default" size="default">` | `B:default/default` | `B1` |
| cat-02 | 18 | `<Button variant="default" size="sm">` | `B:default/sm` | `B-sm` |
| cat-03 | 19 | `<Button variant="default" size="lg">` | `B:default/lg` | — |
| cat-04 | 20 | `<Button variant="default" size="icon">` | `B:default/icon` | — |
| cat-05 | 27 | `<Button variant="destructive" size="default">` | `B:destructive/default` | `B-destructive` |
| cat-06 | 28 | `<Button variant="destructive" size="sm">` | `B:destructive/sm` | — |
| cat-07 | 29 | `<Button variant="destructive" size="lg">` | `B:destructive/lg` | — |
| cat-08 | 30 | `<Button variant="destructive" size="icon">` | `B:destructive/icon` | — |
| cat-09 | 37 | `<Button variant="outline" size="default">` | `B:outline/default` | — |
| cat-10 | 38 | `<Button variant="outline" size="sm">` | `B:outline/sm` | `B-outline-sm` |
| cat-11 | 39 | `<Button variant="outline" size="lg">` | `B:outline/lg` | — |
| cat-12 | 40 | `<Button variant="outline" size="icon">` | `B:outline/icon` | — |
| cat-13 | 47 | `<Button variant="secondary" size="default">` | `B:secondary/default` | — |
| cat-14 | 48 | `<Button variant="secondary" size="sm">` | `B:secondary/sm` | — |
| cat-15 | 49 | `<Button variant="secondary" size="lg">` | `B:secondary/lg` | — |
| cat-16 | 50 | `<Button variant="secondary" size="icon">` | `B:secondary/icon` | — |
| cat-17 | 57 | `<Button variant="ghost" size="default">` | `B:ghost/default` | `B-ghost` |
| cat-18 | 58 | `<Button variant="ghost" size="sm">` | `B:ghost/sm` | — |
| cat-19 | 59 | `<Button variant="ghost" size="lg">` | `B:ghost/lg` | — |
| cat-20 | 60 | `<Button variant="ghost" size="icon">` | `B:ghost/icon` | — |
| cat-21 | 67 | `<Button variant="link" size="default">` | `B:link/default` | — |
| cat-22 | 68 | `<Button variant="link" size="sm">` | `B:link/sm` | — |
| cat-23 | 69 | `<Button variant="link" size="lg">` | `B:link/lg` | — |
| cat-24 | 70 | `<Button variant="link" size="icon">` | `B:link/icon` | — |
| cat-25 | 77 | `<Badge variant="default">` | `BADGE-default` | `BADGE-default` |
| cat-26 | 78 | `<Badge variant="secondary">` | `BADGE-secondary` | `BADGE-secondary` |
| cat-27 | 79 | `<Badge variant="destructive">` | `BADGE-destructive` | `BADGE-destructive` |
| cat-28 | 80 | `<Badge variant="outline">` | `BADGE-outline` | — |

Detection hints: route segment name design-system; occurrences == signatures (28/28, every look used exactly once); renders 100% of Button variant×size combos and 100% of Badge variants; one page holds more button signatures (24) than the rest of the app combined (11).

## 8. Implementations per type

- **button** (4): `Button` `src/components/ui/button.tsx:51` root `<Comp = Slot | "button">` — cva buttonVariants (6 variants × 4 sizes) + cn() (13 main occurrences); `DynamicButton` `src/components/shared/dynamic-button.tsx:9` root `<button>` — template-literal className (dynamic) (1 main occurrence); `OldButton` `src/components/shared/unused/old-button.tsx:6` root `<button>` — **unreached** — static classes (0 main occurrences); native `<button>` at `src/app/layout.tsx:13`, `src/components/shared/toolbar.tsx:30`, `src/components/forms/settings-form.tsx:21`, `src/app/(dashboard)/orders/[id]/page.tsx:23`, `src/app/(dashboard)/dashboard/page.tsx:46`, `src/components/shared/chip.tsx:7`
  - wrappers (not implementations): `PrimaryButton` `src/components/shared/button-presets.tsx:7` = Button + `bg-[#222222] text-white hover:bg-[#333333]`; `DangerLink` `src/components/shared/button-presets.tsx:11` = Button + `variant=link + text-[#d93025]`
- **checkbox** (2): `Checkbox` `src/components/ui/checkbox.tsx:14` root `<CheckboxPrimitive.Root (@radix-ui/react-checkbox)>` (1 main occurrence); `LegacyCheckbox` `src/components/shared/legacy-checkbox.tsx:6` root `<input[type=checkbox]>` (2 main occurrences)
- **dropdown-menu** (1): `DropdownMenu` `src/components/ui/dropdown-menu.tsx:11` root `<DropdownMenuPrimitive.Root (@radix-ui/react-dropdown-menu)>` (1 main occurrence)
- **radio** (1): `Radio` `src/components/ui/radio.tsx:9` root `<label>`, control `<input[type=radio]>` at line 10 (3 main occurrences)
- **select** (1): `SelectNative` `src/components/ui/select-native.tsx:11` root `<select>` (1 main occurrence)
- **textarea** (1): `Textarea` `src/components/ui/textarea.tsx:7` root `<textarea>` (1 main occurrence)
- **text-field** (1): `Input` `src/components/ui/input.tsx:7` root `<input>` (1 main occurrence)
- **toggle** (1): `Switch` `src/components/ui/switch.tsx:13` root `<SwitchPrimitive.Root (@radix-ui/react-switch)>` (1 main occurrence)
- **badge** (1): `Badge` `src/components/ui/badge.tsx:38` root `<Comp = Slot | "span">` — cva badgeVariants (4 variants) (3 main occurrences)
- **tag** (1): `Tag` `src/components/shared/chip.tsx:16` root `<span>` (3 main occurrences)
- **chip** (1): `Chip` `src/components/shared/chip.tsx:5` root `<span>` (1 main occurrence)
Variants defined but used only in the catalog: `Button.variant.secondary`, `Button.size.lg`, `Button.size.icon`, `Badge.variant.outline`.


## 9. Tokens

### Declared color tokens (`@theme inline`, globals.css lines 55–82)

| token | var | light | dark | used |
|---|---|---|---|---|
| `--color-background` | `--background` | `oklch(1 0 0)` | `oklch(0.145 0 0)` | yes |
| `--color-foreground` | `--foreground` | `oklch(0.145 0 0)` | `oklch(0.985 0 0)` | yes |
| `--color-popover` | `--popover` | `oklch(1 0 0)` | `oklch(0.205 0 0)` | yes |
| `--color-popover-foreground` | `--popover-foreground` | `oklch(0.145 0 0)` | `oklch(0.985 0 0)` | yes |
| `--color-primary` | `--primary` | `oklch(0.205 0 0)` | `oklch(0.922 0 0)` | yes |
| `--color-primary-foreground` | `--primary-foreground` | `oklch(0.985 0 0)` | `oklch(0.205 0 0)` | yes |
| `--color-secondary` | `--secondary` | `oklch(0.97 0 0)` | `oklch(0.269 0 0)` | yes |
| `--color-secondary-foreground` | `--secondary-foreground` | `oklch(0.205 0 0)` | `oklch(0.985 0 0)` | yes |
| `--color-muted` | `--muted` | `oklch(0.97 0 0)` | `oklch(0.269 0 0)` | yes |
| `--color-muted-foreground` | `--muted-foreground` | `oklch(0.556 0 0)` | `oklch(0.708 0 0)` | yes |
| `--color-accent` | `--accent` | `oklch(0.97 0 0)` | `oklch(0.269 0 0)` | yes |
| `--color-accent-foreground` | `--accent-foreground` | `oklch(0.205 0 0)` | `oklch(0.985 0 0)` | yes |
| `--color-destructive` | `--destructive` | `oklch(0.577 0.245 27.325)` | `oklch(0.704 0.191 22.216)` | yes |
| `--color-border` | `--border` | `oklch(0.922 0 0)` | `oklch(1 0 0 / 10%)` | yes |
| `--color-input` | `--input` | `oklch(0.922 0 0)` | `oklch(1 0 0 / 15%)` | yes |
| `--color-ring` | `--ring` | `oklch(0.708 0 0)` | `oklch(0.556 0 0)` | yes |
| `--color-brand` | `--brand` | `#1AA44D` | `#1AA44D` | yes — bg-brand (dashboard/page.tsx:46), accent-brand (ui/radio.tsx:10) |
| `--color-brand-soft` | `--brand-soft` | `#E8F6EC` | **missing** | yes — bg-brand-soft (dashboard/page.tsx:25) |
| `--color-chart-1` | `--chart-1` | `oklch(0.646 0.222 41.116)` | `oklch(0.488 0.243 264.376)` | **no (dead)** |
| `--color-chart-2` | `--chart-2` | `oklch(0.6 0.118 184.704)` | `oklch(0.696 0.17 162.48)` | **no (dead)** |
| `--color-chart-3` | `--chart-3` | `oklch(0.398 0.07 227.392)` | `oklch(0.769 0.188 70.08)` | **no (dead)** |
| `--color-sidebar-accent` | `--sidebar-accent` | `oklch(0.97 0 0)` | `oklch(0.269 0 0)` | **no (dead)** |

22 color tokens, 18 used, 4 dead.

Radius tokens: `--radius` = 0.625rem (10px, line 6); `--radius-sm` = calc(var(--radius) - 4px) (6px, line 78); `--radius-md` = calc(var(--radius) - 2px) (8px, line 79); `--radius-lg` = var(--radius) (10px, line 80); `--radius-xl` = calc(var(--radius) + 4px) (14px, line 81). All four scale steps are used (rounded-sm/md/lg/xl all appear).

Project utility: `@utility focus-ring` (line 93) = `@apply outline-none ring-2 ring-ring/50`, used as `focus-visible:focus-ring` at `src/app/layout.tsx:13`.

### Dead tokens (`deadTokens`, count 4)

- `--color-sidebar-accent` (`--sidebar-accent`; theme line 77, :root 28, .dark 52) — declared, referenced by no utility anywhere
- `--color-chart-1` (`--chart-1`; theme line 74, :root 25, .dark 49) — declared but unused; chart colors are hardcoded in chart-legend.tsx instead
- `--color-chart-2` (`--chart-2`; theme line 75, :root 26, .dark 50) — declared but unused; chart colors are hardcoded in chart-legend.tsx instead
- `--color-chart-3` (`--chart-3`; theme line 76, :root 27, .dark 51) — declared but unused; chart colors are hardcoded in chart-legend.tsx instead

Verified with `grep -rn "sidebar-accent\|chart-[123]" src --include=*.tsx` → no matches.

### Dark-missing (`darkMissing`, count 1)

- `--brand-soft` — declared in :root (line 24) and mapped at line 73, used at `src/app/(dashboard)/dashboard/page.tsx:25 (bg-brand-soft)`, but .dark block (lines 31-53) has no --brand-soft.

### Twins (`twins`, count 1)

- `#1AA44D` at `src/components/shared/legacy-checkbox.tsx:9` == `--brand` (`#1AA44D`, :root line 23, .dark line 48) — exact, case-identical.

Near-duplicates that are **not** exact twins (informational for clustering): `#222222` vs --primary (light) oklch(0.205 0 0) ≈ #171717; `#d93025` vs --destructive (light) oklch(0.577 0.245 27.325).

## 10. Hardcoded colors

### In scanned non-CSS files (`hardcodedColors.code`): 7 literals (6 hex, 1 rgba)

| value | file:line | via | property | component | note |
|---|---|---|---|---|---|
| `#222222` | `src/components/shared/button-presets.tsx:7` | `class bg-[#222222]` | background-color | PrimaryButton |  |
| `#333333` | `src/components/shared/button-presets.tsx:7` | `class hover:bg-[#333333]` | background-color (hover) | PrimaryButton |  |
| `#d93025` | `src/components/shared/button-presets.tsx:11` | `class text-[#d93025]` | color | DangerLink |  |
| `#1AA44D` | `src/components/shared/legacy-checkbox.tsx:9` | `style={{ accentColor }}` | accent-color | LegacyCheckbox | twin of `--brand` |
| `#4F46E5` | `src/components/shared/chart-legend.tsx:5` | `style={{ background }}` | background | ChartLegend | chart tokens --chart-1..3 exist but are not used |
| `#22C55E` | `src/components/shared/chart-legend.tsx:9` | `style={{ background }}` | background | ChartLegend | chart tokens --chart-1..3 exist but are not used |
| `rgba(0,0,0,0.06)` | `src/components/shared/card.tsx:5` | `class shadow-[0_1px_2px_rgba(0,0,0,0.06)]` | box-shadow color | Card |  |

Literals that must **not** be counted: `#ff0000` in `src/components/shared/__tests__/button.test.tsx` (lines 8, 9; test file excluded); `#00ff00` in `src/components/shared/toolbar.tsx` (line 29; inside a JSX comment {/* ... */}).

### In CSS (`hardcodedColors.css`, `src/app/globals.css`): 43 literals (3 hex, 40 oklch), 21 distinct values

- `#1AA44D` line 23 (`--brand`, :root)
- `#E8F6EC` line 24 (`--brand-soft`, :root)
- `#1AA44D` line 48 (`--brand`, .dark)
- oklch(): :root lines 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 25, 26, 27, 28; .dark lines 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 49, 50, 51, 52

### Tailwind palette classes (`paletteClassSites`, 17 sites, 11 colors)

Tailwind default-palette color utilities that bypass the project tokens. Not literals, listed for the token inventory. `white` (#ffffff) happens to equal --background in light mode; not counted as a twin because it is not a literal.

| class | file:line | note |
|---|---|---|
| `text-gray-500` | `src/app/layout.tsx:13` |  |
| `hover:text-gray-900` | `src/app/layout.tsx:13` |  |
| `text-white` | `src/app/(dashboard)/dashboard/page.tsx:46` |  |
| `hover:bg-gray-50` | `src/app/(dashboard)/orders/[id]/page.tsx:23` |  |
| `text-white` | `src/components/ui/button.tsx:15` | destructive variant |
| `text-white` | `src/components/ui/badge.tsx:17` | destructive variant |
| `hover:bg-gray-50` | `src/components/forms/settings-form.tsx:21` |  |
| `hover:bg-gray-50` | `src/components/shared/toolbar.tsx:30` |  |
| `border-gray-300` | `src/components/shared/legacy-checkbox.tsx:8` |  |
| `bg-gray-100` | `src/components/shared/chip.tsx:5` |  |
| `text-gray-700` | `src/components/shared/chip.tsx:5` |  |
| `hover:bg-gray-200` | `src/components/shared/chip.tsx:7` |  |
| `bg-blue-50` | `src/components/shared/chip.tsx:16` |  |
| `text-blue-700` | `src/components/shared/chip.tsx:16` |  |
| `text-white` | `src/components/shared/button-presets.tsx:7` |  |
| `bg-black` | `src/components/shared/unused/old-button.tsx:6` | unreached component |
| `text-white` | `src/components/shared/unused/old-button.tsx:6` | unreached component |

## 11. Off-scale and arbitrary values

### Off-scale spacing (`offScaleSpacing`, count 1)

- `p-[18px]` (18px) at `src/app/(dashboard)/dashboard/page.tsx:46` — signature `RAW-C`; nearest scale steps p-4 (16px) / p-5 (20px).

Every other spacing utility (gap-1.5, px-2.5, py-0.5, py-1.5, p-1, -mx-1, my-1 ...) is a multiple of 0.25rem and therefore on scale.

### Other arbitrary values (`offScaleOther`, informational — none of these are spacing)

- Typography: `text-[11px]` (11px) at `src/components/shared/chip.tsx:16`, signature `TAG`, nearest text-xs (12px)
- Radius: `rounded-[6px]` (6px) at `src/components/shared/toolbar.tsx:30`, `src/components/forms/settings-form.tsx:21`, `src/app/(dashboard)/orders/[id]/page.tsx:23` — equals --radius-sm (6px); arbitrary value that twins a token; `rounded-[4px]` (4px) at `src/components/ui/checkbox.tsx:17` — no equal token; equals Tailwind default `rounded` (0.25rem) but no project radius token is 4px
- Sizing: `min-w-[8rem]` (128px) at `src/components/ui/dropdown-menu.tsx:36` — on-scale equivalent `min-w-32`, placement-only
- Ring width: `focus-visible:ring-[3px]` at `src/components/ui/button.tsx:8`, `src/components/ui/badge.tsx:8`, `src/components/ui/checkbox.tsx:17`, `src/components/ui/input.tsx:12`, `src/components/ui/textarea.tsx:10` — standard shadcn new-york; not spacing
- Shadow: `shadow-[0_1px_2px_rgba(0,0,0,0.06)]` at `src/components/shared/card.tsx:5` — arbitrary shadow with an rgba literal (also listed in hardcodedColors.code)
- Colors: `bg-[#222222]` at `src/components/shared/button-presets.tsx:7`; `hover:bg-[#333333]` at `src/components/shared/button-presets.tsx:7`; `text-[#d93025]` at `src/components/shared/button-presets.tsx:11`

## 12. Invalid, dynamic, unreached

### Invalid classes (`invalidClasses`, count 1)

- `rounded-card` at `src/components/shared/card.tsx:5` (Card) — no utility, no @utility, no token --radius-card.

Must **not** be reported as invalid: `peer` at `src/components/ui/checkbox.tsx:17`, `src/components/ui/switch.tsx:16` (marker class (like `group`): emits no CSS but is valid); `focus-visible:focus-ring` at `src/app/layout.tsx:13` (project @utility focus-ring (globals.css:93) used with a variant; compiles); `btn / btn-${kind}` at `src/components/shared/dynamic-button.tsx:9` (inside a dynamic template literal; reported under dynamicClassSites, not as invalid classes).

Verification: tailwindcss 4.x compile of every static class candidate (206 candidates): only rounded-card and the marker `peer` produced no CSS.

### Dynamic class sites (`dynamicClassSites`, count 1)

- `src/components/shared/dynamic-button.tsx:9` (DynamicButton): `` className={`btn btn-${kind}`} `` — static part `btn`, dynamic part `btn-${kind}`; used at `src/app/(dashboard)/dashboard/page.tsx:52 <DynamicButton kind="primary">`. Expected: occurrence reported with signature=unresolved; do NOT synthesize btn-primary from the call-site prop.

### Unreached components (`unreachedComponents`, count 1)

- `OldButton` in `src/components/shared/unused/old-button.tsx` (definition line 4, root line 6, type button) — exported but imported by no scanned file (reverse-import BFS from the routes never reaches it).

Every other component is reachable from a route: see routes.occurrencesVisiblePerRoute.

## 13. Hover without focus-visible (`hoverWithoutFocusVisible`, count 4)

Rule: interactive element whose resolved classes contain a hover: variant and no focus-visible: variant.

| file:line | signature | hover class | note |
|---|---|---|---|
| `src/components/shared/toolbar.tsx:30` | `RAW-A` | `hover:bg-gray-50` |  |
| `src/components/forms/settings-form.tsx:21` | `RAW-A` | `hover:bg-gray-50` |  |
| `src/app/(dashboard)/orders/[id]/page.tsx:23` | `RAW-A` | `hover:bg-gray-50` |  |
| `src/components/shared/chip.tsx:7` | `CHIP-X` | `hover:bg-gray-200` | Chip remove button, reached via dashboard/page.tsx:30 |

By signature: `RAW-A` ×3, `CHIP-X` ×1.

Not flagged: `src/app/layout.tsx:13` `RAW-B` (has focus-visible:focus-ring); `src/app/(dashboard)/dashboard/page.tsx:46` `RAW-C` (no hover: at all (see noFocusVisibleAtAll)); `src/components/shared/unused/old-button.tsx:6` `OLD` (no hover:, and unreached).

Informational superset — no focus-visible at all: RAW-A ×3, RAW-C, CHIP-X, CB-legacy ×2 (native), RADIO ×3 (native), SELECT-native ×1 (native).

## 14. Sibling groups and radius mismatch (`siblingRadiusMismatch`, count 2)

Rule: row/grid container with ≥ 2 direct control children whose resolved border-radius differ.

- **Headline.** Container `src/components/forms/settings-form.tsx:30` (`flex gap-2`): occ-28 Input 6px / h 36 · occ-16 Button Save (B1) 8px / h 36 → radii 6 vs 8. same height (h-9), different radius: rounded-sm vs rounded-md
- Container `src/components/shared/toolbar.tsx:12` (`flex items-center gap-2`): occ-08 Button outline sm 8px / h 32 · occ-09 Button outline sm (dropdown trigger) 8px / h 32 · occ-10 RAW-A 6px / h ≈34 → radii 8 vs 8 vs 6. RAW-A rounded-[6px] next to rounded-md buttons; the DropdownMenu root renders no box of its own

All sibling groups (so that non-mismatching groups are not flagged):

| container | members | mismatch | note |
|---|---|---|---|
| `src/components/forms/settings-form.tsx:30 flex gap-2` | occ-28 Input 6px, occ-16 Button 8px | **yes** |  |
| `src/components/shared/toolbar.tsx:12 flex items-center gap-2` | occ-08 8px, occ-09 8px, occ-10 RAW-A 6px | **yes** |  |
| `src/app/(dashboard)/layout.tsx:8 nav flex gap-1` | occ-05, occ-06, occ-07 | no |  |
| `src/app/(dashboard)/orders/[id]/page.tsx:19 flex items-center gap-3` | occ-18 B-destructive 8px, occ-19 B-dangerlink 8px | no |  |
| `src/components/forms/settings-form.tsx:74 fieldset flex gap-4` | occ-35, occ-36, occ-37 | no | three identical Radio |
| `src/app/page.tsx:13 flex items-center gap-2` | occ-21 Badge 8px, occ-22 Badge 8px, occ-24 Tag 8px | no | badge-like members only |
| `src/components/forms/settings-form.tsx:36 fieldset space-y-2 (column, each control wrapped in a <label>)` | occ-29 CB-legacy 20px/4px, occ-30 CB-legacy 20px/4px, occ-31 CB-radix 16px/4px | no | not a row; radii equal (4px) but SIZE differs 20 vs 16 — informational |
| `src/app/(dashboard)/dashboard/page.tsx:35 li flex (inside .map)` | occ-11 Button sm | no | Tag is nested inside a `<span>`, so only one direct control |
| `src/app/design-system/page.tsx rows (catalog bucket)` | 4 Buttons per row, all rounded-md | no |  |

## 15. Routes and layout scoping

| path | page | title | layouts | flags |
|---|---|---|---|---|
| `/` | `src/app/page.tsx` | Home | `src/app/layout.tsx` |  |
| `/dashboard` | `src/app/(dashboard)/dashboard/page.tsx` | Dashboard | `src/app/layout.tsx`, `src/app/(dashboard)/layout.tsx` | group (dashboard) |
| `/settings` | `src/app/(dashboard)/settings/page.tsx` | Settings | `src/app/layout.tsx`, `src/app/(dashboard)/layout.tsx` | group (dashboard) |
| `/orders/[id]` | `src/app/(dashboard)/orders/[id]/page.tsx` | Order | `src/app/layout.tsx`, `src/app/(dashboard)/layout.tsx` | group (dashboard), dynamic (id) |
| `/design-system` | `src/app/design-system/page.tsx` | Design System | `src/app/layout.tsx` | catalog |

Root metadata title: "Messy". The (dashboard) group segment is not part of the URL. Titles come from each page's `export const metadata = { title }`.

Occurrences visible per route (layout occurrences are counted once globally but appear on every route under that layout):

- `/`: occ-01, occ-02, occ-03, occ-04, occ-21, occ-22, occ-24
- `/dashboard`: occ-01, occ-05, occ-06, occ-07, occ-08, occ-09, occ-10, occ-38, occ-11, occ-12, occ-13, occ-14, occ-25, occ-26, occ-27
- `/settings`: occ-01, occ-05, occ-06, occ-07, occ-08, occ-09, occ-10, occ-38, occ-15, occ-16, occ-17, occ-28, occ-29, occ-30, occ-31, occ-32, occ-33, occ-34, occ-35, occ-36, occ-37
- `/orders/[id]`: occ-01, occ-05, occ-06, occ-07, occ-08, occ-09, occ-10, occ-38, occ-18, occ-19, occ-20, occ-23
- `/design-system`: occ-01, cat-01..cat-28

Layout-scoped occurrences (`layoutScoped`):

- `src/app/layout.tsx` (root) → occ-01 on `/`, `/dashboard`, `/settings`, `/orders/[id]`, `/design-system`. RAW-B Sign out appears on every screen; counted once
- `src/app/(dashboard)/layout.tsx` (route group (dashboard)) → occ-05, occ-06, occ-07, occ-08, occ-09, occ-10, occ-38 on `/dashboard`, `/settings`, `/orders/[id]`. 3 ghost nav buttons + everything inside `<Toolbar />` (toolbar.tsx:13); counted once

## 16. Repeated inline (`repeatedInline`, count 1)

- `rounded-[6px] border px-3 py-1.5 text-sm hover:bg-gray-50` — signature `RAW-A`, 3 occurrences in 3 files: `src/components/shared/toolbar.tsx:30`, `src/components/forms/settings-form.tsx:21`, `src/app/(dashboard)/orders/[id]/page.tsx:23`. byte-identical className string copy-pasted across three files

## 17. Excluded content

- File `src/components/shared/__tests__/button.test.tsx` (__tests__ + *.test.*) contains bg-[#ff0000] (lines 8, 9); `<Button>` usage (line 8) — must not be an occurrence.
- Comment at `src/components/shared/toolbar.tsx:29`: `{/* <button className="bg-[#00ff00]">old</button> */}` — JSX comment — not an element, not a color literal.

## 18. How the numbers were verified

1. Every `.ts/.tsx/.mjs` file was parsed with the repo-root TypeScript (`createSourceFile`, zero parse diagnostics).
2. Every static class candidate in `className`, `cva(...)` and `cn(...)` strings (206 candidates) was compiled with the repo-root Tailwind 4 (`@tailwindcss/node` `compile` + `build`) against `src/app/globals.css`; only `rounded-card` and the marker `peer` emitted no CSS. Radius/spacing pixel values above come from that compile (`--radius: 0.625rem`, `--spacing: 0.25rem`).
3. Every `file:line` in `ground-truth.json` was re-read programmatically and checked to contain the expected JSX tag; every `occ-NN` cross-reference in the routes/siblings/layout sections was checked to exist.
4. Dead tokens and token usage were confirmed with `grep` over `src/`.

