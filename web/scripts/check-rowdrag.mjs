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
