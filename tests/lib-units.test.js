'use strict';
// Unit checks for the three value libraries. The rule under test everywhere: unparsable → null.
const test = require('node:test');
const assert = require('node:assert/strict');
const color = require('../skills/design-polish/scripts/lib/color');
const cssParse = require('../skills/design-polish/scripts/lib/css-parse');
const cssEval = require('../skills/design-polish/scripts/lib/css-eval');

test('color.parse: forms, equivalences, null on unparsable', () => {
  assert.equal(color.toHex(color.parse('#1AA44D')), '#1aa44d');
  assert.equal(color.toHex(color.parse('rgb(26 164 77 / 0.5)')), '#1aa44d80');
  assert.equal(color.toHex(color.parse('rgba(26, 164, 77, .5)')), '#1aa44d80');
  assert.equal(color.toHex(color.parse('hsl(120 50% 50%)')), '#40bf40');
  assert.equal(color.toHex(color.parse('oklch(0.7 0.1 150)')), color.toHex(color.parse('oklch(70% 0.1 150)')));
  assert.equal(color.toHex(color.parse('rebeccapurple')), '#663399');
  assert.equal(color.toHex(color.parse('RED')), '#ff0000');
  assert.deepEqual(color.parse('transparent'), { r: 0, g: 0, b: 0, a: 0 });
  for (const bad of ['var(--x)', 'currentColor', '#ggg', 'rgb(1,2)', 'rgb(1 2 3 4)', 'color(display-p3 1 0 0)', 'inherit', '']) assert.equal(color.parse(bad), null, bad);
  assert.equal(color.parse('rgb(300 0 -5)').gamutClipped, true);
});

test('color-mix in oklab: black/white 50-50 is mid-lightness gray', () => {
  const mix = color.parse('color-mix(in oklab, #000, #fff)');
  assert.ok(Math.abs(color.toOklch(mix).L - 0.5) < 0.01);
  assert.equal(color.isAchromatic(mix), true);
  const tinted = color.parse('color-mix(in oklab, var(--primary) 90%, transparent)');
  assert.equal(tinted, null, 'an unresolved var inside color-mix stays null');
  const faded = color.parse('color-mix(in oklab, #1aa44d 50%, transparent)');
  assert.ok(Math.abs(faded.a - 0.5) < 1e-6);
});

test('CIEDE2000 reproduces the Sharma 2005 dataset', () => {
  const pairs = [
    [{ L: 50, a: 2.6772, b: -79.7751 }, { L: 50, a: 0, b: -82.7485 }, 2.0425],
    [{ L: 50, a: 3.1571, b: -77.2803 }, { L: 50, a: 0, b: -82.7485 }, 2.8615],
    [{ L: 50, a: 2.8361, b: -74.0200 }, { L: 50, a: 0, b: -82.7485 }, 3.4412],
    [{ L: 50, a: -1.3802, b: -84.2814 }, { L: 50, a: 0, b: -82.7485 }, 1.0000],
    [{ L: 50, a: 2.5, b: 0 }, { L: 73, a: 25, b: -18 }, 27.1492],
  ];
  for (const [a, b, expected] of pairs) assert.ok(Math.abs(color.deltaE2000(a, b) - expected) < 1e-4, `${expected}`);
});

test('achromatic: Tailwind gray/zinc/stone/neutral are gray, slate and brand green are not', () => {
  for (const hex of ['#6b7280', '#71717a', '#78716c', '#737373', '#e5e7eb', '#222222']) assert.equal(color.isAchromatic(color.parse(hex)), true, hex);
  for (const hex of ['#64748b', '#1AA44D', '#0f172a']) assert.equal(color.isAchromatic(color.parse(hex)), false, hex);
});

test('css-parse flattens nesting, media chains, theme blocks and keeps escapes', () => {
  const css = `/* c */ @import "tailwindcss";
:root, :host { --radius: 0.625rem; }
.dark { --brand: #22c55e; }
@theme inline { --color-brand: var(--brand); }
.hover\\:bg-red-500 { &:hover { @media (hover: hover) { background-color: red; } } }
.a { color: blue; &:focus-visible { outline: 2px solid; } .b & { color: green } .c { content: "}" ; background: url(data:image/png;base64,abc) } }
@media (width >= 48rem) { .md\\:p-4 { padding: 1rem } }
.\\[\\&_svg\\]\\:size-4 svg { width: 1rem }`;
  const sheet = cssParse.parse(cssParse.stripComments(css));
  const sel = (s) => sheet.rules.find((r) => r.selector === s);
  assert.ok(sel(':root, :host'));
  assert.equal(sel('@theme').declarations[0].prop, '--color-brand');
  const hover = sel('.hover\\:bg-red-500:hover');
  assert.deepEqual(hover.atRules, [{ name: 'media', params: '(hover: hover)' }]);
  assert.equal(sel('.b .a').declarations[0].value, 'green');
  assert.equal(sel('.a .c').declarations[0].value, '"}"');
  assert.equal(sel('.md\\:p-4').atRules[0].params, '(width >= 48rem)');
  assert.deepEqual(cssParse.splitClassSelector('.hover\\:bg-red-500:hover'), { className: 'hover:bg-red-500', rest: ':hover', raw: 'hover\\:bg-red-500', descendant: false });
  assert.equal(cssParse.splitClassSelector('.\\[\\&_svg\\]\\:size-4 svg').descendant, true);
  assert.equal(cssParse.splitClassSelector(':where(.space-y-2 > :not(:last-child))').className, 'space-y-2');
  assert.equal(cssParse.splitClassSelector('.group:hover .group-hover\\:underline').className, 'group-hover:underline');
  assert.doesNotThrow(() => cssParse.parse('.a { color: red; .b { '));
});

test('css-eval resolves var/calc chains to px and extracts light/dark tables', () => {
  const vars = new Map([['--spacing', '0.25rem'], ['--radius', '0.625rem'], ['--radius-md', 'calc(var(--radius) - 2px)']]);
  assert.equal(cssEval.toPx(cssEval.resolveVars('calc(var(--spacing) * 9)', vars)), 36);
  assert.equal(cssEval.toPx(cssEval.resolveVars('var(--radius-md)', vars)), 8);
  assert.equal(cssEval.resolveVars('var(--nope, #fff)', vars), '#fff');
  assert.equal(cssEval.hasUnresolved(cssEval.resolveVars('var(--nope)', vars)), true);
  assert.equal(cssEval.toPx('calc(infinity * 1px)'), Infinity);
  assert.equal(cssEval.toPx('50%'), null);
  assert.equal(cssEval.toPx('calc(100% - 2px)'), null);
  assert.deepEqual(cssEval.lengthsOf('8px 16px'), { top: 8, right: 16, bottom: 8, left: 16 });
  assert.equal(cssEval.lineHeightToNumber('150%', 16), 1.5);
  assert.deepEqual(cssEval.parseShadow('0 1px 2px 0 rgb(0 0 0 / 0.05)')[0], { inset: false, x: 0, y: 1, blur: 2, spread: 0, color: 'rgb(0 0 0 / 0.05)' });
  const t = cssEval.extractThemeVars(cssParse.parse(':root{--a:#fff;--b:1px} .dark{--a:#000} @theme inline{--color-a:var(--a)} @media (prefers-color-scheme: dark){:root{--b:2px}}'));
  assert.equal(t.light.get('--a'), '#fff');
  assert.equal(t.dark.get('--a'), '#000');
  assert.equal(t.dark.get('--b'), '2px');
  assert.equal(t.darkStrategy, 'class');
});
