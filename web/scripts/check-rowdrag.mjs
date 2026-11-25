// Asserts where a dragged table row lands (src/rowDrag.ts, spec 022 research
// R1, R5 and R7).
//
//   node scripts/check-rowdrag.mjs
//
// Same shape as check-columndrag.mjs: the module is bundled with esbuild and
// imported, no test framework.
//
// Why this exists: the table sends a move as "after this row" or "before
// that one", never as a position. The gap the pointer is in has to name the
// right visible row, give one spot per gap, stay among the dragged row's
// siblings in a tree, and send nothing when the row would not move.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const tmp = mkdtempSync(join(tmpdir(), 'nigari-rowdrag-'));
const bundle = join(tmp, 'rowDrag.mjs');
try {
  try {
    execFileSync(
      join(web, 'node_modules/esbuild/bin/esbuild'),
      [join(web, 'src/rowDrag.ts'), '--bundle', '--format=esm', '--outfile=' + bundle],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
  } catch (e) {
    console.error(String(e.stderr ?? e));
    process.exit(1);
  }

  const rd = await import(bundle);
  const out = [];
  const check = (name, got, want) => out.push({ name, got: JSON.stringify(got), want: JSON.stringify(want) });

  // ---- Gaps from the pointer ----
  const rects = [
    { top: 0, bottom: 40 },
    { top: 40, bottom: 80 },
    { top: 80, bottom: 120 },
  ];
  check('above the first row\'s middle: gap 0', rd.rowGap(rects, 10), 0);
  check('below the first row\'s middle: gap 1', rd.rowGap(rects, 25), 1);
  check('exactly on a middle goes below it', rd.rowGap(rects, 60), 2);
  check('below the last row: gap n', rd.rowGap(rects, 500), 3);
  check('line for gap 0 is the first row\'s top', rd.gapLineY(rects, 0), 0);
  check('line for gap 2 is the second row\'s bottom', rd.gapLineY(rects, 2), 80);
  check('line for the last gap is the last row\'s bottom', rd.gapLineY(rects, 3), 120);
  check('no rows, no line', rd.gapLineY([], 0), null);

  // ---- A flat table: A B C D ----
  const flat = ['A', 'B', 'C', 'D'].map((id) => ({ id, parentId: 'db' }));
  check('B into gap 0: before A (the first place)', rd.rowSpot(flat, 'B', 0), { anchor: 'A', side: 'before' });
  check('B into gap 3: before D', rd.rowSpot(flat, 'B', 3), { anchor: 'D', side: 'before' });
  check('B into gap 4: after D (the last place)', rd.rowSpot(flat, 'B', 4), { anchor: 'D', side: 'after' });
  check('B into gap 1, just above itself: nothing', rd.rowSpot(flat, 'B', 1), null);
  check('B into gap 2, just below itself: nothing', rd.rowSpot(flat, 'B', 2), null);
  check('D into the last gap, where it is: nothing', rd.rowSpot(flat, 'D', 4), null);
  check('A into gap 0, where it is: nothing', rd.rowSpot(flat, 'A', 0), null);
  check('an unknown row: nothing', rd.rowSpot(flat, 'Z', 0), null);

  // A filtered view shows only some rows; the spot names a shown row and the
  // server puts it there among the hidden ones too.
  const filtered = [{ id: 'A', parentId: 'db' }, { id: 'D', parentId: 'db' }, { id: 'F', parentId: 'db' }];
  check('a filtered view names a visible row', rd.rowSpot(filtered, 'F', 1), { anchor: 'D', side: 'before' });

  // ---- A tree: P1 (c1, c2 (g1)), P2 (c3) ----
  const tree = [
    { id: 'P1', parentId: 'db', depth: 0 },
    { id: 'c1', parentId: 'P1', depth: 1 },
    { id: 'c2', parentId: 'P1', depth: 1 },
    { id: 'g1', parentId: 'c2', depth: 2 },
    { id: 'P2', parentId: 'db', depth: 0 },
    { id: 'c3', parentId: 'P2', depth: 1 },
  ];
  check('c2 above c1: before c1', rd.rowSpot(tree, 'c2', 1), { anchor: 'c1', side: 'before' });
  check('c1 after c2\'s own sub-items: after c2', rd.rowSpot(tree, 'c1', 4), { anchor: 'c2', side: 'after' });
  check('c1 between c2 and its sub-item: nothing (a deeper level)', rd.rowSpot(tree, 'c1', 3), null);
  check('c1 among another parent\'s rows: nothing', rd.rowSpot(tree, 'c1', 5), null);
  check('c1 above its parent: nothing', rd.rowSpot(tree, 'c1', 0), null);
  check('P2 above P1: before P1', rd.rowSpot(tree, 'P2', 0), { anchor: 'P1', side: 'before' });
  check('P1 after the last row: after P2', rd.rowSpot(tree, 'P1', 6), { anchor: 'P2', side: 'after' });
  check('P1 inside its own sub-items: nothing', rd.rowSpot(tree, 'P1', 2), null);
  check('P1 just above P2, where it is: nothing', rd.rowSpot(tree, 'P1', 4), null);
  check('P1 inside P2\'s sub-items: nothing', rd.rowSpot(tree, 'P1', 5), null);

  // ---- One place up or down, for the keyboard ----
  check('C up: before B', rd.rowStep(flat, 'C', -1), { anchor: 'B', side: 'before' });
  check('C down: after D', rd.rowStep(flat, 'C', 1), { anchor: 'D', side: 'after' });
  check('A up: nothing (the top)', rd.rowStep(flat, 'A', -1), null);
  check('D down: nothing (the bottom)', rd.rowStep(flat, 'D', 1), null);
  check('in a tree, c1 down skips c2\'s sub-items: after c2', rd.rowStep(tree, 'c1', 1), { anchor: 'c2', side: 'after' });
  check('in a tree, P2 up: before P1', rd.rowStep(tree, 'P2', -1), { anchor: 'P1', side: 'before' });

  // ---- A grouped table (spec 024): which group, and where in it ----
  const boxes = [
    { top: 0, bottom: 100 },
    { top: 100, bottom: 160 },
    { top: 160, bottom: 300 },
  ];
  check('above every group: the first', rd.groupAt(boxes, -20), 0);
  check('on the seam: the group below', rd.groupAt(boxes, 100), 1);
  check('past every group: the last', rd.groupAt(boxes, 900), 2);
  check('no groups: none', rd.groupAt([], 10), -1);

  const row = (id, parentId = null) => ({ id, parentId });
  const todo = [row('A'), row('B')];
  // T is in both groups (two tags); D has a sub-item d1.
  const doing = [row('C'), row('T'), row('t1', 'T'), row('D'), row('d1', 'D')];
  check('into another group, top gap: before its first row', rd.spotAmong(doing, 'A', 0), { anchor: 'C', side: 'before' });
  check('into another group, last gap: after its last row', rd.spotAmong(doing, 'A', 5), { anchor: 'D', side: 'after' });
  check('inside a row\'s tree: no place (the line would lie)', rd.spotAmong(doing, 'A', 4), null);
  check('a copy of the dragged row there is passed over, with its sub-items', rd.spotAmong(doing, 'T', 1), { anchor: 'D', side: 'before' });
  check('the copy at the end: after the row above it', rd.spotAmong([row('C'), row('T')], 'T', 2), { anchor: 'C', side: 'after' });
  check('an empty group: no place, the value alone', rd.spotAmong([], 'A', 0), null);
  check('a group holding only the dragged row: no place', rd.spotAmong([row('T')], 'T', 0), null);

  const groups = [
    { key: 'todo', rows: todo },
    { key: 'doing', rows: doing },
    { key: 'done', rows: [] },
  ];
  check('within its group: a move as in a flat table', rd.groupDrop(groups, 'A', 'todo', 0, 2), { spot: { anchor: 'B', side: 'after' }, group: 'todo' });
  check('within its group, where it is: nothing', rd.groupDrop(groups, 'A', 'todo', 0, 0), null);
  check('into another group: its key and the spot', rd.groupDrop(groups, 'A', 'todo', 1, 0), { spot: { anchor: 'C', side: 'before' }, group: 'doing' });
  check('into an empty group: its key, no spot', rd.groupDrop(groups, 'A', 'todo', 2, 0), { spot: null, group: 'done' });
  check('an unknown group: nothing', rd.groupDrop(groups, 'A', 'todo', 7, 0), null);
  check('inside another row\'s tree in another group: nothing', rd.groupDrop(groups, 'A', 'todo', 1, 4), null);
  check('a group holding only the dragged row\'s copy: its key, no spot', rd.groupDrop([{ key: 'x', rows: [row('T')] }], 'T', 'y', 0, 0), { spot: null, group: 'x' });

  // ---- What the table shows at once, before the server answers ----
  const ids = (l) => l.map((r) => r.id).join('');
  check('B after D', ids(rd.applySpot(flat, 'B', { anchor: 'D', side: 'after' })), 'ACDB');
  check('D before A', ids(rd.applySpot(flat, 'D', { anchor: 'A', side: 'before' })), 'DABC');
  check('C before B', ids(rd.applySpot(flat, 'C', { anchor: 'B', side: 'before' })), 'ACBD');
  check('an unknown anchor changes nothing', ids(rd.applySpot(flat, 'C', { anchor: 'Z', side: 'before' })), 'ABCD');
  check('next to itself changes nothing', ids(rd.applySpot(flat, 'C', { anchor: 'C', side: 'after' })), 'ABCD');

  const failed = out.filter((c) => c.got !== c.want);
  for (const c of failed) console.error(`  FAIL ${c.name}: got ${c.got}, want ${c.want}`);
  console.log(`  rowdrag: ${out.length - failed.length} passed, ${failed.length} failed`);
  if (failed.length) process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
