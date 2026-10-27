// Builds web/src/tokens.css from the design tokens in web/tokens/, and checks
// them on the way.
//
//   node scripts/build-tokens.mjs            # write web/src/tokens.css
//   node scripts/build-tokens.mjs --check    # fail if the committed file differs
//   node scripts/build-tokens.mjs --dir <tokens> --out <file>   # for the checks
//
// The look used to be stated twice: once in styles.css and again in theme.css,
// light and dark kept apart by hand, with 133 hex colours and 148 rgba()
// literals spread over 10,000 lines. The tokens state it once, in the W3C
// Design Tokens Format (DTCG 2025.10), so a design tool can read the same file
// (spec 001, FR-001). No dependency: the format is JSON and the build is small,
// like every other script here (research P5).
//
// Three tiers. primitives: raw scales. semantic: roles, each with a light
// value in $value and a dark one in $extensions["md.salt.dark"] (FR-002).
// component: values only one component needs.
//
// What it checks, failing with the token's name:
//   - every token has a $value and a $type (its own or its group's) from the
//     DTCG type list, and only md.salt.* extensions are ours;
//   - every alias resolves, and none goes round in a circle;
//   - every text colour that declares md.salt.contrast reaches its WCAG 2.x
//     ratio on each surface it names, in both themes (FR-004). Light muted text
//     at 3.95:1 on the document was the first thing it found.
//
// What it writes: each token as --<path> (color.surface.default →
// --color-surface-default), plus the name styles.css already reads
// (md.salt.css: --bg, --fg, …) as a var() of it, so the old stylesheet follows
// the tokens without a line of it changing.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const dir = arg('--dir', join(web, 'tokens'));
const out = arg('--out', join(web, 'src/tokens.css'));
const check = args.includes('--check');

const TYPES = new Set([
  'color', 'dimension', 'fontFamily', 'fontWeight', 'duration', 'cubicBezier', 'number',
  'strokeStyle', 'border', 'transition', 'shadow', 'gradient', 'typography',
]);
const TIERS = ['primitives', 'semantic', 'component'];

const errors = [];
const fail = (msg) => errors.push(msg);

// ---- read and flatten -------------------------------------------------------

const tokens = new Map(); // "color.surface.default" → { type, value, dark, ext, tier }
for (const tier of TIERS) {
  const file = join(dir, `${tier}.tokens.json`);
  let json;
  try {
    json = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    fail(`${tier}.tokens.json: ${e.message}`);
    continue;
  }
  walk(json, [], undefined, tier);
}
for (const f of readdirSync(dir)) {
  if (f.endsWith('.tokens.json') && !TIERS.includes(f.replace('.tokens.json', ''))) {
    fail(`${f}: not a tier this build reads (${TIERS.join(', ')})`);
  }
}

function walk(node, path, inherited, tier) {
  const type = node.$type ?? inherited;
  if ('$value' in node) {
    const name = path.join('.');
    if (tokens.has(name)) fail(`${name}: defined twice`);
    if (!type) fail(`${name}: no $type, on the token or a group above it`);
    else if (!TYPES.has(type)) fail(`${name}: $type "${type}" is not a DTCG 2025.10 type`);
    const ext = node.$extensions ?? {};
    for (const k of Object.keys(ext)) {
      if (!k.startsWith('md.salt.')) fail(`${name}: extension "${k}" is not ours (md.salt.*)`);
    }
    tokens.set(name, { name, type, value: node.$value, dark: ext['md.salt.dark'], ext, tier });
    return;
  }
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith('$')) continue;
    if (k.includes('.') || k.includes('{') || k.includes('}')) fail(`${[...path, k].join('.')}: a name may not contain ".", "{" or "}"`);
    if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, [...path, k], type, tier);
  }
}

// ---- aliases ----------------------------------------------------------------

const ALIAS = /^\{([^{}]+)\}$/;
const isAlias = (v) => typeof v === 'string' && ALIAS.test(v);
const target = (v) => v.match(ALIAS)[1];
const themed = (t) => t.dark !== undefined;

// The raw value of a token in a theme, with every alias replaced, however deep
// it sits (a gradient stop's colour is an alias too).
function resolve(value, theme, seen) {
  if (isAlias(value)) {
    const name = target(value);
    const t = tokens.get(name);
    if (!t) throw new Error(`alias {${name}} names no token`);
    if (seen.includes(name)) throw new Error(`alias cycle: ${[...seen, name].join(' → ')}`);
    const v = theme === 'dark' && themed(t) ? t.dark : t.value;
    return resolve(v, theme, [...seen, name]);
  }
  if (Array.isArray(value)) return value.map((v) => resolve(v, theme, seen));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v, theme, seen)]));
  }
  return value;
}

function valueOf(t, theme) {
  const raw = theme === 'dark' && themed(t) ? t.dark : t.value;
  return resolve(raw, theme, [t.name]);
}

// ---- colour -----------------------------------------------------------------

// Every colour as sRGB 0–255 plus alpha. DTCG 2025.10 writes colours as
// { colorSpace, components, alpha?, hex? }; srgb and oklch are the two spaces
// these files use or might (CSS Color 4).
function rgba(c, name) {
  if (!c || typeof c !== 'object' || !Array.isArray(c.components)) {
    throw new Error(`${name}: a colour must be { colorSpace, components }`);
  }
  const alpha = c.alpha ?? 1;
  if (c.colorSpace === 'srgb') return [...c.components.map((v) => Math.round(v * 255)), alpha];
  if (c.colorSpace === 'oklch') return [...oklchToSrgb(c.components), alpha];
  throw new Error(`${name}: colour space "${c.colorSpace}" is not supported (srgb, oklch)`);
}

function oklchToSrgb([L, C, H]) {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return lin.map((v) => {
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, c)) * 255);
  });
}

function cssColor(c, name) {
  const [r, g, b, a] = rgba(c, name);
  if (a === 1) return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// WCAG 2.x relative luminance and contrast ratio. A translucent text colour is
// composited over the surface first, which is what the eye sees.
function luminance([r, g, b]) {
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function over([r, g, b, a], [R, G, B]) {
  return [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a)];
}
function ratio(fg, bg) {
  const x = luminance(over(fg, bg));
  const y = luminance(bg);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// ---- CSS values -------------------------------------------------------------

const dim = (d) => (d.value === 0 ? '0' : `${d.value}${d.unit}`);

function css(t, theme) {
  const raw = theme === 'dark' && themed(t) ? t.dark : t.value;
  // An alias of another themed token stays a var(), so it follows that token
  // in both themes and when someone overrides it at runtime.
  if (isAlias(raw) && tokens.get(target(raw)) && themed(tokens.get(target(raw)))) {
    return `var(${prop(target(raw))})`;
  }
  if (t.ext['md.salt.cssValue']) return t.ext['md.salt.cssValue'];
  const v = valueOf(t, theme);
  switch (t.type) {
    case 'color':
      return cssColor(v, t.name);
    case 'dimension':
    case 'duration':
      return dim(v);
    case 'number':
    case 'fontWeight':
      return String(v);
    case 'fontFamily':
      return (Array.isArray(v) ? v : [v]).map((f) => (/\s/.test(f) ? `'${f}'` : f)).join(', ');
    case 'cubicBezier':
      return `cubic-bezier(${v.join(', ')})`;
    case 'shadow':
      return (Array.isArray(v) ? v : [v])
        .map((s) => `${s.inset ? 'inset ' : ''}${dim(s.offsetX)} ${dim(s.offsetY)} ${dim(s.blur)} ${dim(s.spread)} ${cssColor(s.color, t.name)}`)
        .join(', ');
    case 'gradient': {
      const angle = t.ext['md.salt.angle'] ?? 90;
      const stops = v.map((s) => `${cssColor(s.color, t.name)} ${Math.round(s.position * 1000) / 10}%`);
      return `linear-gradient(${angle}deg, ${stops.join(', ')})`;
    }
    default:
      throw new Error(`${t.name}: no CSS output for $type "${t.type}"`);
  }
}

const prop = (name) => '--' + name.replaceAll('.', '-');

// ---- build ------------------------------------------------------------------

function block(selector, lines, indent = '') {
  return `${indent}${selector} {\n${lines.map((l) => `${indent}  ${l}`).join('\n')}\n${indent}}\n`;
}

function declarations(theme) {
  const lines = [];
  // Two tokens writing one custom property: the later one silently wins. The
  // radius scale's --radius-sm (4px) once overwrote the legacy --radius-sm
  // (7px) that theme.css and the public pages read.
  const owner = new Map();
  const claim = (property, name) => {
    if (owner.has(property)) fail(`${name}: writes ${property}, which ${owner.get(property)} writes too`);
    owner.set(property, name);
  };
  for (const t of tokens.values()) {
    if (theme === 'dark' && !themed(t)) continue;
    try {
      claim(prop(t.name), t.name);
      lines.push(`${prop(t.name)}: ${css(t, theme)};`);
      const legacy = t.ext['md.salt.css'];
      if (theme === 'light' && legacy) {
        claim(legacy, t.name);
        lines.push(`${legacy}: var(${prop(t.name)});`);
      }
      // styles.css builds translucent accents with rgba(var(--accent-rgb), a),
      // which needs the colour as a bare triplet. Derived, so it cannot drift.
      const rgb = t.ext['md.salt.rgb'];
      if (rgb) claim(rgb, t.name);
      if (rgb) lines.push(`${rgb}: ${rgba(valueOf(t, theme), t.name).slice(0, 3).join(', ')};`);
    } catch (e) {
      fail(e.message.startsWith(t.name) ? e.message : `${t.name}: ${e.message}`);
    }
  }
  return lines;
}

function contrast() {
  for (const t of tokens.values()) {
    const pairs = t.ext['md.salt.contrast'];
    if (!pairs) continue;
    for (const { on, min } of Array.isArray(pairs) ? pairs : [pairs]) {
      if (!isAlias(on) || !tokens.has(target(on))) {
        fail(`${t.name}: md.salt.contrast names "${on}", which is not a token alias`);
        continue;
      }
      for (const theme of ['light', 'dark']) {
        try {
          const fg = rgba(valueOf(t, theme), t.name);
          const surface = tokens.get(target(on));
          const bg = rgba(valueOf(surface, theme), surface.name);
          if (bg[3] !== 1) throw new Error(`${surface.name} is translucent; contrast needs an opaque surface`);
          const r = ratio(fg, bg);
          if (r < min) {
            fail(`contrast: ${t.name} on ${surface.name} (${theme}) is ${r.toFixed(2)}:1, below ${min}:1`);
          }
        } catch (e) {
          fail(`${t.name}: ${e.message}`);
        }
      }
    }
  }
}

const light = declarations('light');
const dark = declarations('dark');
contrast();

if (errors.length) {
  console.error(`tokens: ${errors.length} problem(s)\n` + errors.map((e) => '  ' + e).join('\n'));
  process.exit(1);
}

const header = `/* Generated by web/scripts/build-tokens.mjs from web/tokens/*.tokens.json.
   Do not edit: change the token files and run \`node scripts/build-tokens.mjs\`.
   npm run check fails when this file and the tokens disagree. */\n\n`;
const text =
  header +
  block(':root', light) +
  '\n' +
  block("[data-theme='dark']", dark) +
  '\n' +
  // Before the app sets data-theme (and on a page that never does), follow the
  // system. Both the app and public pages set it, so this is the fallback.
  `@media (prefers-color-scheme: dark) {\n${block(":root:not([data-theme='light'])", dark, '  ')}}\n`;

const shown = relative(process.cwd(), out) || out;
if (check) {
  let committed = '';
  try {
    committed = readFileSync(out, 'utf8');
  } catch {
    // reported below
  }
  if (committed !== text) {
    console.error(`tokens: ${shown} does not match the token files. Run: node scripts/build-tokens.mjs`);
    process.exit(1);
  }
  console.log(`  tokens: ${tokens.size} tokens, ${shown} up to date`);
} else {
  writeFileSync(out, text);
  console.log(`  tokens: ${tokens.size} tokens → ${shown}`);
}
