'use strict';
// Color parsing and difference. Rule: unparsable → null, never a guess.
// Conversions: sRGB ↔ linear (IEC 61966-2-1), linear ↔ XYZ D65, XYZ ↔ CIELAB (D65
// white, because we compare colors as displayed on sRGB screens), OKLab/OKLCH
// (Björn Ottosson). Difference: CIEDE2000 (Sharma, Wu & Dalal 2005, kL=kC=kH=1).

const NAMED = { aliceblue: '#f0f8ff', antiquewhite: '#faebd7', aqua: '#00ffff', aquamarine: '#7fffd4', azure: '#f0ffff', beige: '#f5f5dc', bisque: '#ffe4c4', black: '#000000', blanchedalmond: '#ffebcd', blue: '#0000ff', blueviolet: '#8a2be2', brown: '#a52a2a', burlywood: '#deb887', cadetblue: '#5f9ea0', chartreuse: '#7fff00', chocolate: '#d2691e', coral: '#ff7f50', cornflowerblue: '#6495ed', cornsilk: '#fff8dc', crimson: '#dc143c', cyan: '#00ffff', darkblue: '#00008b', darkcyan: '#008b8b', darkgoldenrod: '#b8860b', darkgray: '#a9a9a9', darkgreen: '#006400', darkgrey: '#a9a9a9', darkkhaki: '#bdb76b', darkmagenta: '#8b008b', darkolivegreen: '#556b2f', darkorange: '#ff8c00', darkorchid: '#9932cc', darkred: '#8b0000', darksalmon: '#e9967a', darkseagreen: '#8fbc8f', darkslateblue: '#483d8b', darkslategray: '#2f4f4f', darkslategrey: '#2f4f4f', darkturquoise: '#00ced1', darkviolet: '#9400d3', deeppink: '#ff1493', deepskyblue: '#00bfff', dimgray: '#696969', dimgrey: '#696969', dodgerblue: '#1e90ff', firebrick: '#b22222', floralwhite: '#fffaf0', forestgreen: '#228b22', fuchsia: '#ff00ff', gainsboro: '#dcdcdc', ghostwhite: '#f8f8ff', gold: '#ffd700', goldenrod: '#daa520', gray: '#808080', green: '#008000', greenyellow: '#adff2f', grey: '#808080', honeydew: '#f0fff0', hotpink: '#ff69b4', indianred: '#cd5c5c', indigo: '#4b0082', ivory: '#fffff0', khaki: '#f0e68c', lavender: '#e6e6fa', lavenderblush: '#fff0f5', lawngreen: '#7cfc00', lemonchiffon: '#fffacd', lightblue: '#add8e6', lightcoral: '#f08080', lightcyan: '#e0ffff', lightgoldenrodyellow: '#fafad2', lightgray: '#d3d3d3', lightgreen: '#90ee90', lightgrey: '#d3d3d3', lightpink: '#ffb6c1', lightsalmon: '#ffa07a', lightseagreen: '#20b2aa', lightskyblue: '#87cefa', lightslategray: '#778899', lightslategrey: '#778899', lightsteelblue: '#b0c4de', lightyellow: '#ffffe0', lime: '#00ff00', limegreen: '#32cd32', linen: '#faf0e6', magenta: '#ff00ff', maroon: '#800000', mediumaquamarine: '#66cdaa', mediumblue: '#0000cd', mediumorchid: '#ba55d3', mediumpurple: '#9370db', mediumseagreen: '#3cb371', mediumslateblue: '#7b68ee', mediumspringgreen: '#00fa9a', mediumturquoise: '#48d1cc', mediumvioletred: '#c71585', midnightblue: '#191970', mintcream: '#f5fffa', mistyrose: '#ffe4e1', moccasin: '#ffe4b5', navajowhite: '#ffdead', navy: '#000080', oldlace: '#fdf5e6', olive: '#808000', olivedrab: '#6b8e23', orange: '#ffa500', orangered: '#ff4500', orchid: '#da70d6', palegoldenrod: '#eee8aa', palegreen: '#98fb98', paleturquoise: '#afeeee', palevioletred: '#db7093', papayawhip: '#ffefd5', peachpuff: '#ffdab9', peru: '#cd853f', pink: '#ffc0cb', plum: '#dda0dd', powderblue: '#b0e0e6', purple: '#800080', rebeccapurple: '#663399', red: '#ff0000', rosybrown: '#bc8f8f', royalblue: '#4169e1', saddlebrown: '#8b4513', salmon: '#fa8072', sandybrown: '#f4a460', seagreen: '#2e8b57', seashell: '#fff5ee', sienna: '#a0522d', silver: '#c0c0c0', skyblue: '#87ceeb', slateblue: '#6a5acd', slategray: '#708090', slategrey: '#708090', snow: '#fffafa', springgreen: '#00ff7f', steelblue: '#4682b4', tan: '#d2b48c', teal: '#008080', thistle: '#d8bfd8', tomato: '#ff6347', turquoise: '#40e0d0', violet: '#ee82ee', wheat: '#f5deb3', white: '#ffffff', whitesmoke: '#f5f5f5', yellow: '#ffff00', yellowgreen: '#9acd32' };

function srgbToLinear(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function linearToSrgb(c) { const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; return v * 255; }
function linearToXyz(r, g, b) {
  return [0.4124564 * r + 0.3575761 * g + 0.1804375 * b, 0.2126729 * r + 0.7151522 * g + 0.0721750 * b, 0.0193339 * r + 0.1191920 * g + 0.9503041 * b];
}
function xyzToLinear(x, y, z) {
  return [3.2404542 * x - 1.5371385 * y - 0.4985314 * z, -0.9692660 * x + 1.8760108 * y + 0.0415560 * z, 0.0556434 * x - 0.2040259 * y + 1.0572252 * z];
}
const WHITE = [0.95047, 1.0, 1.08883]; // D65
function xyzToLab(x, y, z) {
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const fx = f(x / WHITE[0]), fy = f(y / WHITE[1]), fz = f(z / WHITE[2]);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}
function labToXyz(L, a, b) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const finv = (t) => (t > 6 / 29 ? t * t * t : (108 / 841) * (t - 4 / 29));
  return [WHITE[0] * finv(fx), WHITE[1] * finv(fy), WHITE[2] * finv(fz)];
}
function linearToOklab(r, g, b) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return { L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s };
}
function oklabToLinear(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b, m_ = L - 0.1055613458 * a - 0.0638541728 * b, s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
}

function clamp255(v) { return Math.max(0, Math.min(255, v)); }
function finish(r, g, b, a) {
  const clipped = r < -0.5 || r > 255.5 || g < -0.5 || g > 255.5 || b < -0.5 || b > 255.5;
  const out = { r: clamp255(r), g: clamp255(g), b: clamp255(b), a: a == null ? 1 : Math.max(0, Math.min(1, a)) };
  if (clipped) out.gamutClipped = true;
  return out;
}

function num(s, ctx) {
  s = String(s).trim();
  if (s === 'none') return 0;
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(%|deg|rad|grad|turn)?$/i.exec(s);
  if (!m) return null;
  const v = parseFloat(m[1]);
  const unit = (m[2] || '').toLowerCase();
  if (ctx === 'pct255') return unit === '%' ? (v / 100) * 255 : v;
  if (ctx === 'alpha' || ctx === 'pct1') return unit === '%' ? v / 100 : v;
  if (ctx === 'deg') { if (unit === 'rad') return (v * 180) / Math.PI; if (unit === 'grad') return v * 0.9; if (unit === 'turn') return v * 360; return v; }
  if (ctx === 'lab-L') return v;
  if (ctx === 'lab-ab') return unit === '%' ? (v / 100) * 125 : v;
  if (ctx === 'lch-C') return unit === '%' ? (v / 100) * 150 : v;
  if (ctx === 'ok-L') return unit === '%' ? v / 100 : v;
  if (ctx === 'ok-ab') return unit === '%' ? (v / 100) * 0.4 : v;
  if (ctx === 'ok-C') return unit === '%' ? (v / 100) * 0.4 : v;
  return v;
}

function splitArgs(inner) {
  let alpha = null;
  const slash = inner.indexOf('/');
  if (slash >= 0) { alpha = inner.slice(slash + 1).trim(); inner = inner.slice(0, slash); }
  const legacy = inner.includes(',');
  const parts = inner.split(/[\s,]+/).map((p) => p.trim()).filter(Boolean);
  // Legacy syntax carries alpha as a 4th comma-separated value; modern space syntax only via "/".
  if (alpha == null && parts.length === 4) { if (legacy) alpha = parts.pop(); else return { parts: [], alpha: null }; }
  if (alpha != null && legacy && slash >= 0) return { parts: [], alpha: null }; // mixing commas and slash is invalid
  return { parts, alpha };
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
function hwbToRgb(h, w, b) {
  w /= 100; b /= 100;
  if (w + b >= 1) { const g = (w / (w + b)) * 255; return [g, g, g]; }
  const [r, g, bb] = hslToRgb(h, 100, 50).map((c) => c / 255);
  const f = (c) => (c * (1 - w - b) + w) * 255;
  return [f(r), f(g), f(bb)];
}

function parseHex(s) {
  const h = s.slice(1);
  if (!/^[0-9a-f]+$/i.test(h)) return null;
  let r, g, b, a = 1;
  if (h.length === 3 || h.length === 4) { r = parseInt(h[0] + h[0], 16); g = parseInt(h[1] + h[1], 16); b = parseInt(h[2] + h[2], 16); if (h.length === 4) a = parseInt(h[3] + h[3], 16) / 255; }
  else if (h.length === 6 || h.length === 8) { r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16); if (h.length === 8) a = parseInt(h.slice(6, 8), 16) / 255; }
  else return null;
  return finish(r, g, b, a);
}

function parse(input) {
  if (input == null) return null;
  const s = String(input).trim().toLowerCase();
  if (!s) return null;
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (s === 'currentcolor' || s === 'inherit' || s === 'initial' || s === 'unset' || s.startsWith('var(')) return null;
  if (NAMED[s]) return parseHex(NAMED[s]);
  if (s[0] === '#') return parseHex(s);
  const fn = /^([a-z-]+)\((.*)\)$/.exec(s);
  if (!fn) return null;
  const name = fn[1], inner = fn[2].trim();
  if (name === 'color-mix') return parseColorMix(inner);
  if (name === 'color') {
    const { parts, alpha } = splitArgs(inner);
    if (parts[0] === 'srgb' && parts.length >= 4) { const [r, g, b] = parts.slice(1, 4).map((p) => num(p, 'pct1')); if ([r, g, b].some((v) => v == null)) return null; return finish(r * 255, g * 255, b * 255, alpha == null ? 1 : num(alpha, 'alpha')); }
    if (parts[0] === 'srgb-linear' && parts.length >= 4) { const [r, g, b] = parts.slice(1, 4).map((p) => num(p, 'pct1')); if ([r, g, b].some((v) => v == null)) return null; return finish(linearToSrgb(r), linearToSrgb(g), linearToSrgb(b), alpha == null ? 1 : num(alpha, 'alpha')); }
    return null;
  }
  const { parts, alpha } = splitArgs(inner);
  if (parts.length < 3) return null;
  const a = alpha == null ? 1 : num(alpha, 'alpha');
  if (a == null) return null;
  if (name === 'rgb' || name === 'rgba') { const [r, g, b] = parts.map((p) => num(p, 'pct255')); if ([r, g, b].some((v) => v == null)) return null; return finish(r, g, b, a); }
  if (name === 'hsl' || name === 'hsla') { const h = num(parts[0], 'deg'), sat = num(parts[1], 'raw'), l = num(parts[2], 'raw'); if ([h, sat, l].some((v) => v == null)) return null; const [r, g, b] = hslToRgb(h, sat, l); return finish(r, g, b, a); }
  if (name === 'hwb') { const h = num(parts[0], 'deg'), w = num(parts[1], 'raw'), bl = num(parts[2], 'raw'); if ([h, w, bl].some((v) => v == null)) return null; const [r, g, b] = hwbToRgb(h, w, bl); return finish(r, g, b, a); }
  if (name === 'oklch' || name === 'oklab') {
    const L = num(parts[0], 'ok-L'); if (L == null) return null;
    let A, B;
    if (name === 'oklch') { const C = num(parts[1], 'ok-C'), H = num(parts[2], 'deg'); if (C == null || H == null) return null; A = C * Math.cos((H * Math.PI) / 180); B = C * Math.sin((H * Math.PI) / 180); }
    else { A = num(parts[1], 'ok-ab'); B = num(parts[2], 'ok-ab'); if (A == null || B == null) return null; }
    const [r, g, b] = oklabToLinear(L, A, B);
    return finish(linearToSrgb(r), linearToSrgb(g), linearToSrgb(b), a);
  }
  if (name === 'lab' || name === 'lch') {
    const L = num(parts[0], 'lab-L'); if (L == null) return null;
    let A, B;
    if (name === 'lch') { const C = num(parts[1], 'lch-C'), H = num(parts[2], 'deg'); if (C == null || H == null) return null; A = C * Math.cos((H * Math.PI) / 180); B = C * Math.sin((H * Math.PI) / 180); }
    else { A = num(parts[1], 'lab-ab'); B = num(parts[2], 'lab-ab'); if (A == null || B == null) return null; }
    const [x, y, z] = labToXyz(L, A, B);
    const [r, g, b] = xyzToLinear(x, y, z);
    return finish(linearToSrgb(r), linearToSrgb(g), linearToSrgb(b), a);
  }
  return null;
}

function parseColorMix(inner) {
  const m = /^in\s+([a-z-]+)\s*(?:\s+[a-z]+\s+hue)?\s*,\s*(.+)$/.exec(inner);
  if (!m) return null;
  const space = m[1];
  const args = splitTop(m[2]);
  if (args.length !== 2) return null;
  const sides = args.map((arg) => { const mm = /^(.*?)(?:\s+([\d.]+)%)?$/.exec(arg.trim()); return { color: parse(mm[1].trim()), pct: mm[2] != null ? parseFloat(mm[2]) : null }; });
  if (sides.some((s) => !s.color)) return null;
  let [p1, p2] = [sides[0].pct, sides[1].pct];
  if (p1 == null && p2 == null) { p1 = 50; p2 = 50; } else if (p1 == null) p1 = 100 - p2; else if (p2 == null) p2 = 100 - p1;
  const sum = p1 + p2; if (sum <= 0) return null;
  const w1 = p1 / sum, w2 = p2 / sum;
  const alphaMult = sum < 100 ? sum / 100 : 1;
  const c1 = sides[0].color, c2 = sides[1].color;
  const mixAlpha = (c1.a * w1 + c2.a * w2) * alphaMult;
  if (space === 'oklab' || space === 'oklch') {
    const o1 = linearToOklab(srgbToLinear(c1.r), srgbToLinear(c1.g), srgbToLinear(c1.b));
    const o2 = linearToOklab(srgbToLinear(c2.r), srgbToLinear(c2.g), srgbToLinear(c2.b));
    let L, A, B;
    if (space === 'oklch') {
      const toLch = (o) => ({ L: o.L, C: Math.hypot(o.a, o.b), h: (Math.atan2(o.b, o.a) * 180) / Math.PI });
      const a1 = toLch(o1), a2 = toLch(o2);
      let h1 = a1.h, h2 = a2.h; if (a1.C < 1e-6) h1 = h2; if (a2.C < 1e-6) h2 = h1;
      let d = h2 - h1; if (d > 180) d -= 360; if (d < -180) d += 360;
      const h = h1 + d * w2, C = a1.C * w1 + a2.C * w2;
      L = a1.L * w1 + a2.L * w2; A = C * Math.cos((h * Math.PI) / 180); B = C * Math.sin((h * Math.PI) / 180);
    } else { L = o1.L * w1 + o2.L * w2; A = o1.a * w1 + o2.a * w2; B = o1.b * w1 + o2.b * w2; }
    const [r, g, b] = oklabToLinear(L, A, B);
    return finish(linearToSrgb(r), linearToSrgb(g), linearToSrgb(b), mixAlpha);
  }
  if (space === 'srgb') return finish(c1.r * w1 + c2.r * w2, c1.g * w1 + c2.g * w2, c1.b * w1 + c2.b * w2, mixAlpha);
  if (space === 'srgb-linear') { const l = (c) => [srgbToLinear(c.r), srgbToLinear(c.g), srgbToLinear(c.b)]; const [a1, a2] = [l(c1), l(c2)]; return finish(linearToSrgb(a1[0] * w1 + a2[0] * w2), linearToSrgb(a1[1] * w1 + a2[1] * w2), linearToSrgb(a1[2] * w1 + a2[2] * w2), mixAlpha); }
  return null;
}

function splitTop(s) {
  const out = []; let depth = 0, cur = '';
  for (const ch of s) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; } cur += ch; }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim());
}

function toHex(c, opts = {}) {
  const h = (v) => Math.round(clamp255(v)).toString(16).padStart(2, '0');
  let s = `#${h(c.r)}${h(c.g)}${h(c.b)}`;
  if ((c.a != null && c.a < 1) || opts.alpha) s += h((c.a == null ? 1 : c.a) * 255);
  return s;
}
function normalize(str) { const c = parse(str); return c ? toHex(c) : null; }
function toLab(c) { const [x, y, z] = linearToXyz(srgbToLinear(c.r), srgbToLinear(c.g), srgbToLinear(c.b)); return xyzToLab(x, y, z); }
function toOklch(c) { const o = linearToOklab(srgbToLinear(c.r), srgbToLinear(c.g), srgbToLinear(c.b)); const C = Math.hypot(o.a, o.b); let h = (Math.atan2(o.b, o.a) * 180) / Math.PI; if (h < 0) h += 360; return { L: o.L, C, h: C < 1e-6 ? 0 : h }; }
// A color is "gray" when its OKLCH chroma is below 0.03: Tailwind's gray/zinc/stone/neutral
// ramps pass (C ≤ 0.025), slate (C ≈ 0.045) does not — slate reads as blue-gray on screen.
const ACHROMATIC_CHROMA = 0.03;
function isAchromatic(c, chromaLimit = ACHROMATIC_CHROMA) { return toOklch(c).C < chromaLimit; }

function deltaE76(l1, l2) { return Math.hypot(l1.L - l2.L, l1.a - l2.a, l1.b - l2.b); }
function deltaE2000(l1, l2) {
  const kL = 1, kC = 1, kH = 1;
  const deg = (r) => (r * 180) / Math.PI, rad = (d) => (d * Math.PI) / 180;
  const C1 = Math.hypot(l1.a, l1.b), C2 = Math.hypot(l2.a, l2.b);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cbar, 7) / (Math.pow(Cbar, 7) + Math.pow(25, 7))));
  const a1p = (1 + G) * l1.a, a2p = (1 + G) * l2.a;
  const C1p = Math.hypot(a1p, l1.b), C2p = Math.hypot(a2p, l2.b);
  const h = (a, b) => { if (a === 0 && b === 0) return 0; const v = deg(Math.atan2(b, a)); return v < 0 ? v + 360 : v; };
  const h1p = h(a1p, l1.b), h2p = h(a2p, l2.b);
  const dLp = l2.L - l1.L, dCp = C2p - C1p;
  let dhp;
  if (C1p * C2p === 0) dhp = 0; else if (Math.abs(h2p - h1p) <= 180) dhp = h2p - h1p; else dhp = h2p - h1p > 180 ? h2p - h1p - 360 : h2p - h1p + 360;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2));
  const Lbp = (l1.L + l2.L) / 2, Cbp = (C1p + C2p) / 2;
  let hbp;
  if (C1p * C2p === 0) hbp = h1p + h2p; else if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2; else hbp = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  const T = 1 - 0.17 * Math.cos(rad(hbp - 30)) + 0.24 * Math.cos(rad(2 * hbp)) + 0.32 * Math.cos(rad(3 * hbp + 6)) - 0.20 * Math.cos(rad(4 * hbp - 63));
  const dTheta = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2));
  const RC = 2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7)));
  const SL = 1 + (0.015 * Math.pow(Lbp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbp - 50, 2));
  const SC = 1 + 0.045 * Cbp, SH = 1 + 0.015 * Cbp * T;
  const RT = -Math.sin(rad(2 * dTheta)) * RC;
  return Math.sqrt(Math.pow(dLp / (kL * SL), 2) + Math.pow(dCp / (kC * SC), 2) + Math.pow(dHp / (kH * SH), 2) + RT * (dCp / (kC * SC)) * (dHp / (kH * SH)));
}
function luminance(c) { return 0.2126 * srgbToLinear(c.r) + 0.7152 * srgbToLinear(c.g) + 0.0722 * srgbToLinear(c.b); }
function contrastRatio(c1, c2) { const a = luminance(c1), b = luminance(c2); const [hi, lo] = a > b ? [a, b] : [b, a]; return (hi + 0.05) / (lo + 0.05); }

module.exports = { parse, toHex, normalize, toLab, toOklch, isAchromatic, deltaE76, deltaE2000, contrastRatio, NAMED, splitTop, ACHROMATIC_CHROMA };
