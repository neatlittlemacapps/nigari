// Asserts where a card dropped on a board lands (src/boardDrag.ts, dropIndex;
// spec 012 research R7).
//
//   node scripts/check-boarddrag.mjs
//
// Same shape as check-columndrag.mjs: the module is bundled with esbuild and
// imported, no test framework.
//
// Why this exists: the marker a drag draws must stand where the card will
// really be after the drop, which is the place the view's sort gives it. The
// check sorts each case the way the view does (Array.sort with the same
// comparator, stable) and asserts the marker's index is the card's index there.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const tmp = mkdtempSync(join(tmpdir(), 'nigari-boarddrag-'));
const bundle = join(tmp, 'boardDrag.mjs');
try {
  try {
    execFileSync(
      join(web, 'node_modules/esbuild/bin/esbuild'),
      [join(web, 'src/boardDrag.ts'), '--bundle', '--format=esm', '--outfile=' + bundle],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
  } catch (e) {
    console.error(String(e.stderr ?? e));
    process.exit(1);
  }

  const bd = await import(bundle);
  const out = [];
  const check = (name, got, want) => out.push({ name, got: JSON.stringify(got), want: JSON.stringify(want) });

  // Rows in their own (unsorted) order; the board's column is "status".
  const row = (id, status, effort, title = id) => ({ id, props: { status, effort, title } });
  const rows = [
    row('a', 'todo', 3, 'Alpha'),
    row('b', 'doing', 1, 'Bravo'),
    row('c', 'todo', 5, 'Charlie'),
    row('d', 'doing', 4, 'Delta'),
    row('e', 'todo', 2, 'Echo'),
    row('f', 'doing', 3, 'Foxtrot'),
  ];
  const order = new Map(rows.map((r, i) => [r.id, i]));
  const idx = (id) => order.get(id);
  // What the view draws in a column, and where the card really ends up there:
  // the same filter and sort applyView runs, after the card's value is set.
  const column = (all, col, sort) => {
    const inCol = all.filter((r) => r.props.status === col);
    return sort ? [...inCol].sort(bd.sortComparator(sort)) : inCol;
  };
  const landsAt = (id, col, sort) => {
    const after = rows.map((r) => (r.id === id ? { ...r, props: { ...r.props, status: col } } : r));
    return column(after, col, sort).findIndex((r) => r.id === id);
  };
  const marker = (id, col, sort) => {
    const card = rows.find((r) => r.id === id);
    return bd.dropIndex(column(rows, col, sort), { ...card, props: { ...card.props, status: col } }, sort, idx);
  };
  const same = (name, id, col, sort) => check(name, marker(id, col, sort), landsAt(id, col, sort));

  // ---- Sorted ----
  const byEffort = { property: 'effort', dir: 'asc' };
  const byEffortDesc = { property: 'effort', dir: 'desc' };
  const byTitle = { property: 'title', dir: 'asc' };
  same('sorted by number: into the middle', 'a', 'doing', byEffort);
  check('sorted by number: index', marker('a', 'doing', byEffort), 1); // b(1) a(3) f(3) d(4): a ties f, and a comes first in row order
  same('sorted by number, descending', 'e', 'doing', byEffortDesc);
  same('sorted by text', 'c', 'doing', byTitle);
  check('sorted by text: index', marker('c', 'doing', byTitle), 1); // Bravo Charlie Delta Foxtrot
  same('sorted: to the end', 'c', 'doing', byEffort);
  check('sorted: to the end, index', marker('c', 'doing', byEffort), 3);
  same('sorted: to the front', 'b', 'todo', byEffort);
  check('sorted: to the front, index', marker('b', 'todo', byEffort), 0);

  // ---- Ties: the rows' own order, as the stable sort keeps it ----
  same('a tie with a row before it', 'a', 'doing', byEffort);
  same('a tie with a row after it', 'f', 'todo', byEffort);
  check('tie: f lands after a', marker('f', 'todo', byEffort), 2); // e(2) a(3) f(3) c(5)

  // ---- Unsorted: the rows' own order ----
  same('unsorted: by row order', 'c', 'doing', null);
  check('unsorted: index', marker('c', 'doing', null), 1); // b c d f
  same('unsorted: last row goes last', 'f', 'todo', null);
  check('unsorted: first row goes first', marker('a', 'doing', null), 0);

  // ---- Its own column: its own place ----
  for (const id of ['a', 'c', 'e']) {
    const own = column(rows, 'todo', byEffort);
    check(`own column, sorted (${id})`, marker(id, 'todo', byEffort), own.findIndex((r) => r.id === id));
    const plain = column(rows, 'todo', null);
    check(`own column, unsorted (${id})`, marker(id, 'todo', null), plain.findIndex((r) => r.id === id));
  }

  // ---- An empty column ----
  check('an empty column: the first place', marker('a', 'done', byEffort), 0);

  // ---- 500 cards: a pointer move must stay cheap ----
  const big = Array.from({ length: 500 }, (_, i) => row('r' + i, 'todo', (i * 7919) % 97, 'Row ' + i));
  const bigOrder = new Map(big.map((r, i) => [r.id, i]));
  const bigCol = [...big].sort(bd.sortComparator(byTitle));
  const card = { id: 'x', props: { status: 'todo', effort: 50, title: 'Row 250' } };
  bigOrder.set('x', 600);
  const t0 = performance.now();
  for (let i = 0; i < 100; i++) bd.dropIndex(bigCol, card, byTitle, (id) => bigOrder.get(id));
  const perMove = (performance.now() - t0) / 100;
  console.log(`  500-card column: ${perMove.toFixed(2)} ms per pointer move`);
  check('500 cards: under 4 ms per pointer move', perMove < 4, true);

  let fail = 0;
  for (const c of out) {
    if (c.got !== c.want) {
      fail++;
      console.log(`  FAIL ${c.name}: got ${c.got}, want ${c.want}`);
    }
  }
  console.log(`\n  board drop place: ${out.length - fail} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
