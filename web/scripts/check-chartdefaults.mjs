// Asserts the first chart of a database (src/chartDefaults.ts, spec 004
// FR-019): drawable from the moment it exists, whatever the database holds.
//
//   node scripts/check-chartdefaults.mjs
//
// Same shape as check-peek.mjs. The rule that would hurt most if it drifted: a
// grouped chart must never be made without a grouping, because the server
// refuses it (checkChartView) and the chart inserted from the / menu would
// then never appear.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const tmp = mkdtempSync(join(tmpdir(), 'salt-chartdefaults-'));
const bundle = join(tmp, 'chartdefaults.mjs');

try {
  try {
    execFileSync(
      join(web, 'node_modules/esbuild/bin/esbuild'),
      [join(web, 'src/chartDefaults.ts'), '--bundle', '--format=esm', '--outfile=' + bundle],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
  } catch (e) {
    console.error(String(e.stderr ?? e));
    process.exit(1);
  }

  const { defaultChartView, chartSettingsFor } = await import(bundle);
  const out = [];
  const check = (name, got, want) => out.push({ name, got: JSON.stringify(got), want: JSON.stringify(want) });
  const p = (id, type) => ({ id, name: id, type });
  const settings = (v) => ({ kind: v.chartKind, groupBy: v.groupBy, period: v.groupPeriod });

  const full = [p('title2', 'text'), p('due', 'date'), p('tags', 'multiselect'), p('stage', 'select'), p('n', 'number')];
  check('a select comes first', settings(defaultChartView('donut', full, 'v', 'Chart')), { kind: 'donut', groupBy: 'stage' });
  check('else the first property that groups', settings(defaultChartView('bar', [p('due', 'date'), p('tags', 'multiselect')], 'v', 'C')), { kind: 'bar', groupBy: 'due', period: 'month' });
  check('a checkbox groups', settings(defaultChartView('hbar', [p('t', 'text'), p('done', 'checkbox')], 'v', 'C')), { kind: 'hbar', groupBy: 'done' });
  check('nothing groups: a number chart', settings(defaultChartView('line', [p('t', 'text'), p('n', 'number')], 'v', 'C')), { kind: 'number' });
  check('an empty schema: a number chart', settings(defaultChartView('donut', [], 'v', 'C')), { kind: 'number' });
  check('a number chart asked for stays one', settings(defaultChartView('number', full, 'v', 'C')), { kind: 'number' });
  check('the view is a chart with its id and name', (({ id, name, type }) => ({ id, name, type }))(defaultChartView('bar', full, 'v1', 'Sales')), { id: 'v1', name: 'Sales', type: 'chart' });
  check('number → bar fills the grouping', chartSettingsFor('bar', full, { chartKind: 'number' }), { chartKind: 'bar', groupBy: 'stage' });
  check('a kind switch keeps a grouping that still groups', chartSettingsFor('line', full, { groupBy: 'tags' }), { chartKind: 'line', groupBy: 'tags' });
  check('a deleted grouping is replaced', chartSettingsFor('line', full, { groupBy: 'gone' }), { chartKind: 'line', groupBy: 'stage' });
  check('a date keeps its period', chartSettingsFor('bar', full, { groupBy: 'due', groupPeriod: 'week' }), { chartKind: 'bar', groupBy: 'due', groupPeriod: 'week' });

  const bad = out.filter((c) => c.got !== c.want);
  for (const c of bad) console.error(`  ✗ ${c.name}: got ${c.got}, want ${c.want}`);
  if (bad.length) process.exit(1);
  console.log(`  chartdefaults: ${out.length} first-chart rules checked`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
