# Tailwind v3 (partial, v1.1)

- Detection: `tailwind.config.{js,ts,cjs,mjs}` and `tailwindcss@3` in `node_modules`.
- v1.0 behaviour: classes are counted and attributed to elements (the TypeScript scan does not depend on Tailwind),
  but values are **not compiled**: `meta.css.engine` is `none`, looks are keyed by class tokens (`idBasis: tokens`),
  colour/radius/spacing values come from the default scale only, and arbitrary values are parsed literally.
  The cover shows the "values not compiled" badge; cards that need resolved values are not proposed.
- v1.1 plan: run the project's `postcss` + `tailwindcss@3` on a generated candidate file to obtain the same declaration
  maps as v4; read `theme.extend` for declared tokens.
- What to tell the user: "Your project uses Tailwind v3. I can show every button look and where it is used, and count
  raw values, but I cannot yet resolve class values to pixels, so corner/colour comparisons are approximate."
