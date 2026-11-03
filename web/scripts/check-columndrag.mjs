// Asserts how a table view orders its columns and where a dragged header
// lands (src/columnDrag.ts, spec 012 research R2 and R5).
//
//   node scripts/check-columndrag.mjs
//
// Same shape as check-anchoredmenu.mjs: the module is bundled with esbuild and
// imported, no test framework.
//
// Why this exists: the order is stored per view as a list of ids that the
// schema can outgrow (a property added later, one deleted, one hidden), and
// what is drawn has to follow all three without anyone rewriting the list.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const tmp = mkdtempSync(join(tmpdir(), 'nigari-columndrag-'));
const bundle = join(tmp, 'columnDrag.mjs');
try {
  try {
    execFileSync(
      join(web, 'node_modules/esbuild/bin/esbuild'),
      [join(web, 'src/columnDrag.ts'), '--bundle', '--format=esm', '--outfile=' + bundle],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
  } catch (e) {
    console.error(String(e.stderr ?? e));
    process.exit(1);
  }

  const cd = await import(bundle);
  const out = [];
  const check = (name, got, want) => out.push({ name, got: JSON.stringify(got), want: JSON.stringify(want) });
  const schema = ['status', 'effort', 'due', 'owner'];

  // ---- What is drawn ----
  check('no order: the schema order', cd.orderedColumns(schema, undefined), schema);
  check('an empty order: the schema order', cd.orderedColumns(schema, []), schema);
  check('the stored order first, the rest in schema order', cd.orderedColumns(schema, ['due', 'status']), ['due', 'status', 'effort', 'owner']);
  check('a deleted id is skipped', cd.orderedColumns(schema, ['gone', 'owner']), ['owner', 'status', 'effort', 'due']);
  check('a repeated id counts once', cd.orderedColumns(schema, ['due', 'due', 'status']), ['due', 'status', 'effort', 'owner']);
  check('a property added later comes last', cd.orderedColumns([...schema, 'new'], ['owner', 'due', 'effort', 'status']), ['owner', 'due', 'effort', 'status', 'new']);
  check('a hidden property is not drawn', cd.orderedColumns(schema, ['due', 'status'], ['status']), ['due', 'effort', 'owner']);
  check('hidden as a Set', cd.orderedColumns(schema, undefined, new Set(['effort'])), ['status', 'due', 'owner']);
  check('the title is never a column of the order', cd.orderedColumns(schema, ['__title', 'due']), ['due', 'status', 'effort', 'owner']);

  // ---- What is stored ----
  // A hidden property keeps its slot, so showing it again puts it back.
  const order = ['due', 'status', 'effort', 'owner'];
  const visible = cd.orderedColumns(schema, order, ['status']); // due effort owner
  const moved = cd.moveColumn(visible, 'owner', -2); // owner due effort
  const stored = cd.storedOrder(schema, order, moved);
  check('a hidden one keeps its place when others move', stored, ['owner', 'status', 'due', 'effort']);
  check('shown again, it is back in its place', cd.orderedColumns(schema, stored), ['owner', 'status', 'due', 'effort']);
  check('stored order holds every property', cd.storedOrder(schema, undefined, cd.moveColumn(schema, 'status', 1)), ['effort', 'status', 'due', 'owner']);

  // ---- Move left / Move right ----
  check('move right', cd.moveColumn(schema, 'status', 1), ['effort', 'status', 'due', 'owner']);
  check('move left', cd.moveColumn(schema, 'due', -1), ['status', 'due', 'effort', 'owner']);
  check('move left at the left end changes nothing', cd.moveColumn(schema, 'status', -1), schema);
  check('move right at the right end changes nothing', cd.moveColumn(schema, 'owner', 1), schema);
  check('the title cannot be moved', cd.moveColumn(schema, '__title', 1), schema);

  // ---- Which gap ----
  const rects = [
    { left: 200, right: 300 },
    { left: 300, right: 400 },
    { left: 400, right: 500 },
    { left: 500, right: 600 },
  ];
  check('left of the first header: gap 0', cd.gapIndex(rects, 150), 0);
  check('first half of the first header: gap 0', cd.gapIndex(rects, 240), 0);
  check('second half of the first header: gap 1', cd.gapIndex(rects, 260), 1);
  check('middle of the table', cd.gapIndex(rects, 420), 2);
  check('past the last header: the end', cd.gapIndex(rects, 900), 4);

  // ---- Into a gap ----
  check('to the front', cd.moveToGap(schema, 'due', 0), ['due', 'status', 'effort', 'owner']);
  check('to the end', cd.moveToGap(schema, 'status', 4), ['effort', 'due', 'owner', 'status']);
  check('the gap before itself changes nothing', cd.moveToGap(schema, 'effort', 1), schema);
  check('the gap after itself changes nothing', cd.moveToGap(schema, 'effort', 2), schema);
  check('one place right through a gap', cd.moveToGap(schema, 'effort', 3), ['status', 'due', 'effort', 'owner']);
  check('the title is not in the order, so a gap cannot move it', cd.moveToGap(schema, '__title', 2), schema);

  let fail = 0;
  for (const c of out) {
    if (c.got !== c.want) {
      fail++;
      console.log(`  FAIL ${c.name}: got ${c.got}, want ${c.want}`);
    }
  }
  console.log(`\n  column order: ${out.length - fail} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
