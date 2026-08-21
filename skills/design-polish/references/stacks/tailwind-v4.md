# Tailwind v4 (full support)

- Engine: the project's own `@tailwindcss/node` (found via `tailwindcss`, `@tailwindcss/postcss`, `@tailwindcss/vite`
  or `@tailwindcss/cli`, pnpm realpaths included). When the target has no `node_modules`, the skill's bundled engine is
  borrowed and `@import "tailwindcss"` is resolved to it.
- Entry: the CSS file containing `@import "tailwindcss"` (`app/globals.css`, `src/app/globals.css`, `styles/globals.css`
  …); override with `--css <file>` or `config.json { "css": "…" }`.
- Values: every candidate class we count is compiled with `candidatesToCss`; wrapper-selector utilities
  (`space-y-*`, `divide-*`, `[a&]:hover:*`) go through a batch compile. `@theme`, `@theme inline`, `:root`, `.dark`,
  `@media (prefers-color-scheme: dark)` and `@custom-variant dark` are read for light/dark tables and alias chains.
- Scale: `--spacing` base, `--radius` derivations, the default palette (`gray-500` = scale, not raw).
- Components: shadcn/ui (`cva`, `cn`, `Slot`/`asChild`, Radix primitives incl. the unified `radix-ui` package), Headless UI,
  `next/link`, React Router `Link`, `data-[state=…]:` / `data-[size=…]:` variants, wrapper components up to depth 4.
- Known gaps: classes built by string concatenation are listed as dynamic sites; `@apply` inside component CSS is read
  as plain CSS; CSS modules are counted as plain CSS (no per-element attribution).
