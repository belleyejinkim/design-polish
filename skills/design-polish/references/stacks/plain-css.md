# Plain CSS / CSS Modules / CSS-in-JS

- Plain CSS: selectors are parsed (`css-parse.js`), declarations are flattened (nesting, `&`, media chains), custom
  properties resolved (`css-eval.js`), raw values counted per file:line, and a `className` string that matches a class
  selector of the project's own CSS contributes those declarations to the element's look.
- CSS Modules (`styles.button`): the module files are read as plain CSS for the token inventory, but the member access
  is not followed to the element yet, so those controls are keyed by tag + class tokens (planned for v1.1).
- Server-rendered templates (`.ftl`, `.html`, `.erb`, `.hbs`, `.ejs`, `.twig`, `.njk`, `.jsp`, `.php`, `.liquid`, `.mustache`): the CSS inside `<style>` blocks is read as a stylesheet with correct line numbers; the markup is not scanned, so no components or screens. With no React/JSX code at all the whole run is CSS-only (`meta.mode: css-only`).
- CSS-in-JS (styled-components, emotion, stitches, vanilla-extract): **not supported** in v1.0. The scan still runs
  (tokens from `:root` if any, raw values in template literals are counted as CSS literals), but element attribution
  is off and the report says so on the cover. Gate 0 asks whether to proceed with low confidence.
- Vue / Svelte / Angular: out of scope; `scan.js` reports `0 code files` for the supported extensions and the
  orchestrator stops with a clear sentence.
