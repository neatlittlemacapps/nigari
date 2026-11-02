// Asserts the automatic chart colours (src/chartTheme.ts): no two groups of
// one chart in the same colour while colours are left, and never a group in
// an option's colour (#278).
//
//   node scripts/check-chartcolours.mjs
//
// groupColourTokens compares token names, which is only right if every
// colour of the colourful palette has one name. So this also reads
// src/tokens.css (light, dark, and the system-dark copy) and fails if two of
// those names draw the same colour, or if an option's token no longer draws
// what the single-hue palette of that name draws (the colour options were
// drawn in before #278 moved them onto the colourful palette's names).

import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const tmp = mkdtempSync(join(tmpdir(), 'nigari-chartcolours-'));
const bundle = join(tmp, 'chartcolours.mjs');

// The chart token values of one rule of tokens.css, by its exact selector.
// The file is generated (build-tokens.mjs): one declaration per line, literal
// values, no comments inside a rule. A var() here would mean the browser and
// this check could disagree, so it fails instead.
function tokenValues(css, selector) {
  const start = css.indexOf(selector + ' {');
  if (start < 0) throw new Error(`tokens.css has no "${selector} {" rule`);
  const block = css.slice(start, css.indexOf('}', start));
  const values = new Map();
  for (const m of block.matchAll(/(--color-chart-[\w-]+):\s*([^;]+);/g)) {
    if (m[2].includes('var(')) throw new Error(`${selector} ${m[1]} is a var(), not a colour`);
    values.set(m[1], m[2].trim().toLowerCase());
  }
  if (!values.size) throw new Error(`"${selector}" holds no chart colours`);
  return values;
}

try {
  // chartTheme reads the option palette, whose names go through i18n.ts,
  // which only Vite can load (import.meta.glob); the names play no part here.
  await build({
    stdin: {
      contents: "export * from './src/chartTheme'; export { OPTION_HEXES } from './src/selectOptions';",
      resolveDir: web,
      loader: 'ts',
    },
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

  const { groupColourTokens, OPTION_TOKEN, OPTION_HEXES } = await import(pathToFileURL(bundle).href);
  const out = [];
  const check = (name, got, want) => out.push({ name, got: JSON.stringify(got), want: JSON.stringify(want) });
  const [gray, brown, orange, yellow, green, blue, purple, pink, red] = OPTION_HEXES;
  const prop = (colours) => ({ id: 's', name: 's', type: 'select', options: colours.map((c, i) => ({ id: 'o' + i, name: 'o' + i, color: c })) });
  const groups = (n) => Array.from({ length: n }, (_, i) => ({ key: 'o' + i, label: 'o' + i, value: 1 }));
  const distinct = (list) => new Set(list).size === list.length;
  const imported = (n) => Array.from({ length: n }, (_, i) => '#0000' + (16 + i).toString(16));

  // The tokens: one name per colour, and options drawn as they were.
  const css = readFileSync(join(web, 'src/tokens.css'), 'utf8');
  const hueOf = { [orange]: 'orange', [yellow]: 'yellow', [green]: 'green', [blue]: 'blue', [purple]: 'purple', [pink]: 'pink', [red]: 'red' };
  for (const [theme, selector] of [['light', ':root'], ['dark', "[data-theme='dark']"], ['system dark', ":root:not([data-theme='light'])"]]) {
    const v = tokenValues(css, selector);
    const names = [...Array(12)].map((_, i) => `--color-chart-${i + 1}`).concat('--color-chart-gray-2', '--color-chart-gray-3');
    check(`${theme}: every colourful and grey name draws its own colour`, distinct(names.map((n) => v.get(n))), true);
    for (const [hex, hue] of Object.entries(hueOf)) {
      check(`${theme}: a ${hue} option draws as before`, v.get(OPTION_TOKEN[hex]), v.get(`--color-chart-${hue}-3`));
    }
  }

  // The issue's own case: To do (blue), Done (green), Third (an imported hex).
  const issue = groupColourTokens(groups(3), 'auto', prop([blue, green, '#123456']));
  check('#278: To do, Done, Third differ', distinct(issue), true);
  check('option colours stay the option\'s', issue.slice(0, 2), [OPTION_TOKEN[blue], OPTION_TOKEN[green]]);

  // Every option colour at once, then imported ones: all differ.
  const mixed = groupColourTokens(groups(12), 'auto', prop([...OPTION_HEXES, ...imported(3)]));
  check('nine option colours and three imported ones all differ', distinct(mixed), true);

  // Imported first, an option after: the option keeps its colour, the
  // imported ones move off it.
  const first = groupColourTokens(groups(4), 'auto', prop([...imported(3), blue]));
  check('imported before an option still differ', distinct(first), true);
  check('the blue option is still blue', first[3], OPTION_TOKEN[blue]);

  // More imported groups than free colours: they repeat among themselves,
  // never on an option's colour (the review of this fix found that the last
  // ones fell back onto Done's green).
  const wide = groupColourTokens(groups(16), 'auto', prop([blue, green, ...imported(14)]));
  check('past the free colours, no imported group takes an option colour', wide.slice(2).filter((t) => t === OPTION_TOKEN[blue] || t === OPTION_TOKEN[green]), []);

  // Unchanged where there is no clash: no options, Colourful, cycling.
  check('without options the palette goes in order', groupColourTokens(groups(3), 'auto'), ['--color-chart-1', '--color-chart-2', '--color-chart-3']);
  const many = groupColourTokens(groups(14), 'colorful');
  check('fourteen groups cycle', [many[0], many[12], many[13]], ['--color-chart-1', '--color-chart-1', '--color-chart-2']);
  check('Colourful ignores option colours', groupColourTokens(groups(2), 'colorful', prop([red, red])), ['--color-chart-1', '--color-chart-2']);
  check('a gray option is the grey scale', groupColourTokens(groups(1), 'auto', prop([gray])), ['--color-chart-gray-3']);
  check('a brown option is brown', groupColourTokens(groups(1), 'auto', prop([brown])), ['--color-chart-11']);

  // Each row stays one colour; Colourful gives each its own (#318).
  check('each row is one colour', distinct(groupColourTokens(groups(3), 'auto', undefined, true)), false);
  check('each row in Colourful is many', distinct(groupColourTokens(groups(3), 'colorful', undefined, true)), true);

  const bad = out.filter((c) => c.got !== c.want);
  for (const c of bad) console.error(`  ✗ ${c.name}: got ${c.got}, want ${c.want}`);
  if (bad.length) process.exit(1);
  console.log(`  chartcolours: ${out.length} automatic-colour rules checked`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
