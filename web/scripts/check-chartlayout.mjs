// Asserts what a chart draws (src/chartLayout.ts) and which rows sit behind a
// group (src/chartGroups.ts), spec 004 research R4, R9 and R15.
//
//   node scripts/check-chartlayout.mjs
//
// Same shape as check-peek.mjs: esbuild bundles the modules once and they are
// imported. No framework.
//
// The rules that would hurt most if they drifted: a hidden group must vanish
// from the drawing and from the total, "No value" must never be folded into
// "Other" (its rows are not one filter away from the others'), and the rows
// behind a date bar must be exactly that period's.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const tmp = mkdtempSync(join(tmpdir(), 'nigari-chart-'));
const entry = join(tmp, 'entry.ts');
const bundle = join(tmp, 'chart.mjs');
writeFileSync(entry, `export * from ${JSON.stringify(join(web, 'src/chartLayout.ts'))};\nexport * from ${JSON.stringify(join(web, 'src/chartGroups.ts'))};\n`);

try {
  try {
    execFileSync(
      join(web, 'node_modules/esbuild/bin/esbuild'),
      [entry, '--bundle', '--format=esm', '--outfile=' + bundle],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
  } catch (e) {
    console.error(String(e.stderr ?? e));
    process.exit(1);
  }

  const { layoutChart, groupFilter, periodRange, OTHER, MAX_DRAWN, MAX_EACH_ROW } = await import(bundle);
  const out = [];
  const check = (name, got, want) => out.push({ name, got: JSON.stringify(got), want: JSON.stringify(want) });
  const g = (key, value, label = key || '∅') => ({ key, label, value, rows: value ?? 1 });
  const keys = (l) => l.drawn.map((d) => d.key).join(' ');
  const res = (groups) => ({ groups, leftOut: 0, total: groups.reduce((n, x) => n + x.rows, 0) });
  const base = res([g('a', 3, 'Ann'), g('b', 9, 'bob'), g('c', 1, 'Cy'), g('', 2)]);

  // ---- order ----
  check('auto keeps the server order, No value last', keys(layoutChart({ result: base, kind: 'bar', agg: 'count' })), 'a b c ');
  check('label A→Z, No value still last', keys(layoutChart({ result: base, kind: 'bar', agg: 'count', sort: 'label_asc' })), 'a b c ');
  check('label Z→A', keys(layoutChart({ result: base, kind: 'bar', agg: 'count', sort: 'label_desc' })), 'c b a ');
  check('value high→low places No value by its value', keys(layoutChart({ result: base, kind: 'bar', agg: 'count', sort: 'value_desc' })), 'b a  c');
  check('value low→high', keys(layoutChart({ result: base, kind: 'bar', agg: 'count', sort: 'value_asc' })), 'c  a b');
  const dates = res([g('2026-02', 1), g('2026-01', 2), g('2026-03', 3)]);
  check('dates by label are time order', keys(layoutChart({ result: dates, kind: 'line', agg: 'count', sort: 'label_asc', isDate: true })), '2026-01 2026-02 2026-03');

  // ---- Each row (FR-030) ----
  const rowsOf = (n) => res(Array.from({ length: n }, (_, i) => ({ key: 'r' + i, label: 'Row ' + i, value: n - i, rows: 1 })));
  const sixty = layoutChart({ result: rowsOf(60), kind: 'bar', agg: 'sum', eachRow: true });
  check('each row draws up to 50 bars, the rest in Other', [sixty.drawn.length, sixty.drawn[MAX_EACH_ROW - 1].key], [MAX_EACH_ROW, OTHER]);
  check('each row keeps the server order, highest first', keys(layoutChart({ result: rowsOf(3), kind: 'bar', agg: 'sum', eachRow: true })), 'r0 r1 r2');
  check('each row on a donut keeps twelve slices', layoutChart({ result: rowsOf(30), kind: 'donut', agg: 'sum', eachRow: true }).drawn.length, MAX_DRAWN);
  check('other groupings still fold at twelve', layoutChart({ result: rowsOf(30), kind: 'bar', agg: 'sum' }).drawn.length, MAX_DRAWN);
  const someEmpty = res([g('r1', 5), { key: 'r2', label: 'r2', value: null, rows: 1 }, g('r3', 2)]);
  check('a row without a number has no bar', keys(layoutChart({ result: someEmpty, kind: 'bar', agg: 'sum', eachRow: true })), 'r1 r3');
  check('no row with a number: nothing to chart', layoutChart({ result: res([{ key: 'r', label: 'r', value: null, rows: 1 }]), kind: 'bar', agg: 'sum', eachRow: true }).state, 'empty');

  // ---- hidden groups ----
  const hid = layoutChart({ result: base, kind: 'donut', agg: 'count', hidden: ['b', ''] });
  check('hidden groups are not drawn', keys(hid), 'a c');
  check('hidden groups leave the total', hid.total, 4);
  check('hidden groups stay listed for the table', hid.all.filter((x) => x.hidden).map((x) => x.key), ['b', '']);
  check('showEmpty false hides No value', keys(layoutChart({ result: base, kind: 'bar', agg: 'count', showEmpty: false })), 'a b c');
  check('everything hidden is its own state', layoutChart({ result: base, kind: 'bar', agg: 'count', hidden: ['a', 'b', 'c', ''] }).state, 'all-hidden');
  check('no rows is empty, not a frame', layoutChart({ result: res([]), kind: 'bar', agg: 'count' }).state, 'empty');
  check('groups of zero rows only is empty', layoutChart({ result: res([{ key: 'a', label: 'a', value: 0, rows: 0 }]), kind: 'bar', agg: 'count' }).state, 'empty');

  // ---- empty options ----
  const opts = [{ key: 'x', label: 'X' }, { key: 'a', label: 'Ann' }, { key: 'b', label: 'bob' }, { key: 'c', label: 'Cy' }];
  check('empty options at zero, in option order', layoutChart({ result: base, kind: 'bar', agg: 'count', zeroOptions: opts }).drawn.map((d) => `${d.key}:${d.value}`), ['x:0', 'a:3', 'b:9', 'c:1', ':2']);
  check('a donut takes no empty options', keys(layoutChart({ result: base, kind: 'donut', agg: 'count', zeroOptions: opts })), 'a b c ');
  check('an empty option of an average has no value', layoutChart({ result: base, kind: 'bar', agg: 'avg', zeroOptions: opts }).drawn[0].value, null);

  // ---- folding ----
  const many = res([...Array.from({ length: 15 }, (_, i) => g('k' + i, 15 - i)), g('', 5)]);
  const folded = layoutChart({ result: many, kind: 'donut', agg: 'count' });
  check('at most MAX_DRAWN drawn', folded.drawn.length, MAX_DRAWN);
  check('Other sits before No value', folded.drawn.slice(-2).map((d) => d.key), [OTHER, '']);
  check('Other holds the tail', folded.drawn.find((d) => d.key === OTHER).keys, ['k10', 'k11', 'k12', 'k13', 'k14']);
  check('Other adds the counts', folded.drawn.find((d) => d.key === OTHER).value, 5 + 4 + 3 + 2 + 1);
  check('the total is unchanged by folding', folded.total, many.groups.reduce((n, x) => n + x.value, 0));
  const maxFold = layoutChart({ result: many, kind: 'bar', agg: 'max' });
  check('Other of a maximum is the largest', maxFold.drawn.find((d) => d.key === OTHER).value, 5);
  check('a maximum has no total', maxFold.total, null);
  const manyDates = res(Array.from({ length: 20 }, (_, i) => g(`2026-${String(i + 1).padStart(2, '0')}`, 1)));
  check('dates are never folded', layoutChart({ result: manyDates, kind: 'line', agg: 'count', isDate: true }).drawn.length, 20);
  check('the largest group, for the summary', layoutChart({ result: base, kind: 'bar', agg: 'count' }).largest.key, 'b');

  // ---- the rows behind a group ----
  check('an option', groupFilter('st', 'select', undefined, ['a']), [{ property: 'st', op: 'is', value: 'a' }]);
  check('No value', groupFilter('st', 'select', undefined, ['']), [{ property: 'st', op: 'is_empty', value: '' }]);
  check('a ticked box', groupFilter('done', 'checkbox', undefined, ['true']), [{ property: 'done', op: 'is', value: 'true' }]);
  check('an unticked box', groupFilter('done', 'checkbox', undefined, ['false']), [{ property: 'done', op: 'is', value: 'false' }]);
  check('a person', groupFilter('who', 'person', undefined, ['u1']), [{ property: 'who', op: 'is', value: 'u1' }]);
  check('Other is any of its keys', groupFilter('st', 'select', undefined, ['a', 'b']), [{ property: 'st', op: 'is', value: '', values: ['a', 'b'] }]);
  check('the number chart has no group filter', groupFilter('', 'select', undefined, ['*']), null);
  check('a month', periodRange('2026-02', 'month'), ['2026-02-01', '2026-02-28']);
  check('a leap month', periodRange('2028-02', 'month'), ['2028-02-01', '2028-02-29']);
  check('a year', periodRange('2026', 'year'), ['2026-01-01', '2026-12-31']);
  check('a day', periodRange('2026-03-14', 'day'), ['2026-03-14', '2026-03-14']);
  check('ISO week 1 of 2026 starts in 2025', periodRange('2026-W01', 'week'), ['2025-12-29', '2026-01-04']);
  check('ISO week 53 of 2026', periodRange('2026-W53', 'week'), ['2026-12-28', '2027-01-03']);
  check('a date group is between its days', groupFilter('due', 'date', 'week', ['2026-W11']), [{ property: 'due', op: 'between', value: '2026-03-09', value2: '2026-03-15' }]);

  const bad = out.filter((c) => c.got !== c.want);
  for (const c of bad) console.error(`  ✗ ${c.name}: got ${c.got}, want ${c.want}`);
  if (bad.length) process.exit(1);
  console.log(`  chartlayout: ${out.length} layout and drill-down rules checked`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
