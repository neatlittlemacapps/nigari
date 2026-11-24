// Asserts that every colour a select option can store draws its chip text at
// 4.5:1 or more on the chip's own background, in light and in dark (#736).
//
//   node scripts/check-optionchips.mjs
//
// A chip carries its option's stored hex inline (`color`, and a tint as its
// background). theme.css then draws it from that hex with the relative colour
// syntax: a fill at one lightness, the text at another, both on the option's
// own hue (`oklch(from currentColor L calc(c * k) h)`). The stored hex never
// changes (it is in every database's schema, spec 019 R5); what keeps the text
// readable is those lightness and chroma numbers. An earlier audit read the
// inline `color` and reported 2.3 to 4.1:1, which is not what is drawn.
//
// So this reads the numbers from theme.css, the nine stored colours from
// selectOptions.ts and the page surfaces from tokens.css, and computes each
// chip as the browser does: OKLCH to sRGB (clipped, as Chromium does), a
// translucent fill laid over the surface, WCAG 2.x contrast. A tenth colour in
// the palette, or a lighter fill, that falls below 4.5:1 fails the build.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(web, p), 'utf8');
const MIN = 4.5;

// ---- inputs -----------------------------------------------------------------

const hexes = [...read('src/selectOptions.ts').matchAll(/^\s*'(#[0-9a-f]{6})',/gim)].map((m) => m[1]);
if (hexes.length < 9) throw new Error(`selectOptions.ts: found ${hexes.length} OPTION_HEXES, expected 9 or more`);

const theme = read('src/theme.css');
function chipRule(selector) {
  const start = theme.indexOf(selector);
  if (start < 0) throw new Error(`theme.css has no "${selector}" rule`);
  const block = theme.slice(start, theme.indexOf('}', start));
  const rel = (prop) => {
    const m = block.match(
      new RegExp(`${prop}:\\s*oklch\\(from currentColor ([\\d.]+) calc\\(c \\* ([\\d.]+)\\) h(?: / ([\\d.]+))?\\)`),
    );
    if (!m) throw new Error(`theme.css "${selector}": ${prop} is not oklch(from currentColor L calc(c * k) h [/ a])`);
    return { L: +m[1], k: +m[2], a: m[3] === undefined ? 1 : +m[3] };
  };
  return { bg: rel('background'), fg: rel('-webkit-text-fill-color') };
}
const rules = {
  light: chipRule(':root .prop-chip,\n:root .board-chip {'),
  dark: chipRule("[data-theme='dark'] .prop-chip,\n[data-theme='dark'] .board-chip {"),
};

const tokens = read('src/tokens.css');
function surfaces(selector) {
  const start = tokens.indexOf(selector + ' {');
  if (start < 0) throw new Error(`tokens.css has no "${selector} {" rule`);
  const block = tokens.slice(start, tokens.indexOf('}', start));
  const out = {};
  for (const name of ['default', 'raised', 'sidebar']) {
    const m = block.match(new RegExp(`--color-surface-${name}:\\s*(#[0-9a-f]{6});`, 'i'));
    if (!m) throw new Error(`tokens.css "${selector}": no literal --color-surface-${name}`);
    out[name] = hexToRgb(m[1]);
  }
  return out;
}
const pages = { light: surfaces(':root'), dark: surfaces("[data-theme='dark']") };

// ---- colour maths -----------------------------------------------------------

function hexToRgb(h) {
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}
const toLin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const fromLin = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

function srgbToOklch(rgb) {
  const [r, g, b] = rgb.map(toLin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), (Math.atan2(B, A) * 180) / Math.PI];
}

function oklchToRgb([L, C, H]) {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => Math.min(1, Math.max(0, fromLin(v))));
}

const luminance = (rgb) => {
  const [r, g, b] = rgb.map(toLin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (x, y) => {
  const [a, b] = [luminance(x), luminance(y)].sort((p, q) => q - p);
  return (a + 0.05) / (b + 0.05);
};
const over = (top, a, under) => top.map((v, i) => v * a + under[i] * (1 - a));

// ---- the check --------------------------------------------------------------

let failed = 0;
let worst = Infinity;
for (const mode of ['light', 'dark']) {
  const { bg, fg } = rules[mode];
  for (const hex of hexes) {
    const [, C, H] = srgbToOklch(hexToRgb(hex));
    const fill = oklchToRgb([bg.L, C * bg.k, H]);
    const text = oklchToRgb([fg.L, C * fg.k, H]);
    for (const [where, surface] of Object.entries(pages[mode])) {
      const back = over(fill, bg.a, surface);
      const r = ratio(over(text, fg.a, back), back);
      worst = Math.min(worst, r);
      if (r < MIN) {
        failed++;
        console.error(`  FAIL  ${mode}: option ${hex} on surface.${where} draws its text at ${r.toFixed(2)}:1, below ${MIN}:1`);
      }
    }
  }
}

if (failed) {
  console.error(`\n  FAILED — ${failed} option chip(s) below ${MIN}:1. Change the lightness in theme.css's chip rules, not the stored colours.\n`);
  process.exit(1);
}
console.log(`  option chips: ${hexes.length} colours × light and dark × 3 surfaces, all ${MIN}:1 or more (lowest ${worst.toFixed(2)}:1)`);
