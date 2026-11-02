// Asserts the automatic chart colours (src/chartTheme.ts): no two groups of
// one chart in the same colour while colours are left (#278).
//
//   node scripts/check-chartcolours.mjs
//
// Same shape as check-chartdefaults.mjs. What a token draws as is read from
// src/tokens.css itself, light and dark, so the check follows the tokens:
// the colourful palette's group 3 IS the green a green option takes, and a
// check comparing token names would have passed with the bug in place.

import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const tmp = mkdtempSync(join(tmpdir(), 'nigari-chartcolours-'));
const bundle = join(tmp, 'chartcolours.mjs');

// The token values of one block of tokens.css: :root (light) or
// [data-theme='dark'].
function tokenValues(selector) {
  const css = readFileSync(join(web, 'src/tokens.css'), 'utf8');
  const start = css.indexOf(selector + ' {');
  if (start < 0) throw new Error(`tokens.css has no ${selector} block`);
  const block = css.slice(start, css.indexOf('}', start));
  const values = new Map();
  for (const m of block.matchAll(/(--color-chart-[\w-]+):\s*([^;]+);/g)) values.set(m[1], m[2].trim().toLowerCase());
  return values;
}

try {
  // chartTheme reads the option palette, whose names go through i18n.ts,
  // which only Vite can load (import.meta.glob); the names play no part here.
  await build({
    entryPoints: [join(web, 'src/chartTheme.ts')],
    bundle: true,
    format: 'esm',
    outfile: bundle,
    external: ['chart.js'],
    logLevel: 'error',
    plugins: [{
      name: 'no-i18n',
      setup(b) {
        b.onResolve({ filter: /\/i18n$/ }, () => ({ path: 'i18n', namespace: 'stub' }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const t = (s) => s; export const plural = (s) => s;', loader: 'js' }));
      },
    }],
  });

  const { groupColourTokens } = await import(bundle);
  const out = [];
  const check = (name, got, want) => out.push({ name, got: JSON.stringify(got), want: JSON.stringify(want) });
  const hex = { gray: '#787774', brown: '#9f6b53', orange: '#d9730d', yellow: '#cb912f', green: '#448361', blue: '#337ea9', purple: '#9065b0', pink: '#c14c8a', red: '#d44c47' };
  const prop = (colours) => ({ id: 's', name: 's', type: 'select', options: colours.map((c, i) => ({ id: 'o' + i, name: 'o' + i, color: c })) });
  const groups = (n) => Array.from({ length: n }, (_, i) => ({ key: 'o' + i, label: 'o' + i, value: 1 }));
  const distinct = (list) => new Set(list).size === list.length;

  for (const [theme, selector] of [['light', ':root'], ['dark', "[data-theme='dark']"]]) {
    const values = tokenValues(selector);
    const colourOf = (t) => values.get(t) ?? t;
    const drawnColours = (tokens) => tokens.map(colourOf);

    // The issue's own case: To do (blue), Done (green), Third (an imported hex).
    const issue = groupColourTokens(groups(3), 'auto', prop([hex.blue, hex.green, '#123456']), false, colourOf);
    check(`${theme}: #278 To do, Done, Third differ`, distinct(drawnColours(issue)), true);
    check(`${theme}: option colours stay the option's`, issue.slice(0, 2), ['--color-chart-blue-3', '--color-chart-green-3']);

    // Every option colour at once, then imported hexes after them: none of
    // those may repeat a colour already drawn.
    const all = Object.values(hex);
    const mixed = groupColourTokens(groups(all.length + 3), 'auto', prop([...all, '#123456', '#abcdef', '#010203']), false, colourOf);
    check(`${theme}: nine option colours and three imported ones all differ`, distinct(drawnColours(mixed)), true);

    // Imported hexes first, options after: an option keeps its colour, so the
    // imported ones move off it instead.
    const first = groupColourTokens(groups(4), 'auto', prop(['#123456', '#654321', '#111111', hex.blue]), false, colourOf);
    check(`${theme}: imported before an option still differ`, distinct(drawnColours(first)), true);
    check(`${theme}: the blue option is still blue`, first[3], '--color-chart-blue-3');

    // No options at all: the colourful palette in order, as before.
    const plain = groupColourTokens(groups(3), 'auto', undefined, false, colourOf);
    check(`${theme}: without options the palette goes in order`, plain, ['--color-chart-1', '--color-chart-2', '--color-chart-3']);

    // More groups than colours: it cycles instead of failing.
    const many = groupColourTokens(groups(14), 'colorful', undefined, false, colourOf);
    check(`${theme}: fourteen groups cycle`, [many[0], many[12], many[13]], ['--color-chart-1', '--color-chart-1', '--color-chart-2']);

    // Each row stays one colour; Colourful gives each its own (#318).
    check(`${theme}: each row is one colour`, distinct(groupColourTokens(groups(3), 'auto', undefined, true, colourOf)), false);
    check(`${theme}: each row in Colourful is many`, distinct(groupColourTokens(groups(3), 'colorful', undefined, true, colourOf)), true);
  }

  const bad = out.filter((c) => c.got !== c.want);
  for (const c of bad) console.error(`  ✗ ${c.name}: got ${c.got}, want ${c.want}`);
  if (bad.length) process.exit(1);
  console.log(`  chartcolours: ${out.length} automatic-colour rules checked`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
