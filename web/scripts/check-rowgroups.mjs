// Asserts how a table or list splits its rows into groups and what a drop
// into another group writes (src/rowGroups.ts, spec 024 research R3, R4).
//
//   node scripts/check-rowgroups.mjs
//
// Same shape as check-boardlanes.mjs: the module is bundled with esbuild and
// imported, no test framework.
//
// Why this exists: a group's count must be the rows drawn under it (SC-003),
// No value must stay last also reversed, a hidden or folded group is found
// again by the same key a chart uses, and a drop must never lose a row's
// other values or write a group that is many values (a month, a status group).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const tmp = mkdtempSync(join(tmpdir(), 'nigari-rowgroups-'));
const bundle = join(tmp, 'rowGroups.mjs');
try {
  try {
    execFileSync(
      join(web, 'node_modules/esbuild/bin/esbuild'),
      [join(web, 'src/rowGroups.ts'), '--bundle', '--format=esm', '--outfile=' + bundle],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
  } catch (e) {
    console.error(String(e.stderr ?? e));
    process.exit(1);
  }
  const rg = await import(bundle);
  const out = [];
  const check = (name, got, want) => out.push({ name, got: JSON.stringify(got), want: JSON.stringify(want) });
  const shape = (groups) => groups.map((g) => `${g.key}:${g.rows.map((r) => r.t).join('')}`);
  const val = (r) => r.v;

  const select = { type: 'select', options: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }] };
  const rows = [{ t: '1', v: 'b' }, { t: '2', v: '' }, { t: '3', v: 'a' }, { t: '4', v: 'b' }, { t: '5', v: 'gone' }];
  check('select: option order, empty options left out, No value last (an unknown option is No value)',
    shape(rg.groupRows(rows, val, select)), ['a:3', 'b:14', ':25']);
  check('select: show empty groups', shape(rg.groupRows(rows, val, select, { showEmpty: true })), ['a:3', 'b:14', 'c:', ':25']);
  check('select: reversed, No value stays last', shape(rg.groupRows(rows, val, select, { reverse: true })), ['b:14', 'a:3', ':25']);
  check('select: hidden groups, No value hidden by ""', shape(rg.groupRows(rows, val, select, { hidden: ['b', ''] })), ['a:3']);
  check('select: no No value group when every row has one', shape(rg.groupRows([{ t: '1', v: 'a' }], val, select)), ['a:1']);

  const multi = { type: 'multiselect', options: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] };
  check('multi-select: a row in each of its groups', shape(rg.groupRows([{ t: '1', v: ['a', 'b'] }, { t: '2', v: [] }], val, multi)), ['a:1', 'b:1', ':2']);

  const status = { type: 'status', options: [{ id: 'n', name: 'Not started', group: 'todo' }, { id: 'w', name: 'Working', group: 'in_progress' }, { id: 'd', name: 'Done', group: 'complete' }] };
  const srows = [{ t: '1', v: 'd' }, { t: '2', v: 'n' }, { t: '3', v: 'w' }];
  check('status: by its options', shape(rg.groupRows(srows, val, status)), ['n:2', 'w:3', 'd:1']);
  check('status: by its groups', shape(rg.groupRows(srows, val, status, { statusGroups: true })), ['todo:2', 'in_progress:3', 'complete:1']);

  const box = { type: 'checkbox' };
  check('checkbox: Checked then Unchecked, untouched is unchecked, never No value',
    shape(rg.groupRows([{ t: '1' }, { t: '2', v: true }, { t: '3', v: false }], val, box, { showEmpty: true })), ['true:2', 'false:13']);

  const person = { type: 'person' };
  check('person: order first met, several people in each group',
    shape(rg.groupRows([{ t: '1', v: 'u2' }, { t: '2', v: ['u1', 'u2'] }, { t: '3' }], val, person)), ['u2:12', 'u1:2', ':3']);

  const date = { type: 'date' };
  const drows = [{ t: '1', v: '2026-03-14' }, { t: '2', v: '2026-01-02T10:00' }, { t: '3', v: { start: '2026-03-01' } }, { t: '4' }];
  check('date: by month (default), earliest first, No value last', shape(rg.groupRows(drows, val, date)), ['2026-01:2', '2026-03:13', ':4']);
  check('date: by year', shape(rg.groupRows(drows, val, date, { period: 'year' })), ['2026:123', ':4']);
  check('date: by day, reversed', shape(rg.groupRows(drows, val, date, { period: 'day', reverse: true })), ['2026-03-14:1', '2026-03-01:3', '2026-01-02:2', ':4']);
  // ISO weeks, as the server's chart writes them (aggregate.go).
  check('week: 2026-03-14 is a Saturday of ISO week 11', rg.periodKey('2026-03-14', 'week'), '2026-W11');
  check('week: 1 January 2027 is a Friday of 2026-W53', rg.periodKey('2027-01-01', 'week'), '2026-W53');
  check('week: 29 December 2025 is a Monday of 2026-W01', rg.periodKey('2025-12-29', 'week'), '2026-W01');

  const counts = rg.groupRows(rows, val, select).reduce((n, g) => n + g.rows.length, 0);
  check('counts: every row of a single-value grouping is in exactly one group', counts, rows.length);

  // Drops (research R4).
  check('drop: select into another option', rg.groupDropPatch('s', select, 'a', 'b', 'a'), { s: 'b' });
  check('drop: select into No value clears it', rg.groupDropPatch('s', select, 'a', '', 'a'), { s: '' });
  check('drop: same group writes nothing', rg.groupDropPatch('s', select, 'a', 'a', 'a'), null);
  check('drop: multi-select keeps the other values', rg.groupDropPatch('m', multi, 'a', 'b', ['a', 'c']), { m: ['c', 'b'] });
  check('drop: multi-select into No value empties it', rg.groupDropPatch('m', multi, 'a', '', ['a', 'c']), { m: [] });
  check('drop: checkbox', rg.groupDropPatch('x', box, 'false', 'true', false), { x: true });
  check('drop: person', rg.groupDropPatch('p', person, 'u1', 'u2', 'u1'), { p: 'u2' });
  check('drop: a date group is many days, refused', rg.groupDropPatch('d', date, '2026-01', '2026-03', '2026-01-02'), null);
  check('drop: a status group is many options, refused', rg.groupDropPatch('s', status, 'todo', 'complete', 'n', { statusGroups: true }), null);
  check('drop: a formula cannot be written', rg.groupDropPatch('f', { type: 'formula' }, '1', '2', 1), null);
  check('drop targets: formula, rollup, date, status groups take none',
    [{ type: 'formula' }, { type: 'rollup' }, date, select].map((p) => rg.groupAcceptsDrops(p)), [false, false, false, true]);

  const failed = out.filter((c) => c.got !== c.want);
  for (const c of failed) console.error(`FAIL ${c.name}\n  got  ${c.got}\n  want ${c.want}`);
  console.log(`  row groups: ${out.length - failed.length} passed, ${failed.length} failed`);
  if (failed.length) process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
