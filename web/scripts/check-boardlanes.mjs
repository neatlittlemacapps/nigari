// Asserts how a board splits into lanes and what a drop between cells
// writes (src/boardLanes.ts, spec 013 research R9).
//
//   node scripts/check-boardlanes.mjs
//
// Same shape as check-columndrag.mjs: the module is bundled with esbuild and
// imported, no test framework.
//
// Why this exists: a card in a laned board belongs to two groupings at once,
// and a drop has to change exactly the ones that differ. Writing the column
// on a lane-only move would undo a multi-select's other columns; writing a
// formula lane would be refused by the server and leave the card half-moved.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const tmp = mkdtempSync(join(tmpdir(), 'nigari-boardlanes-'));
const bundle = join(tmp, 'boardLanes.mjs');
try {
  try {
    execFileSync(
      join(web, 'node_modules/esbuild/bin/esbuild'),
      [join(web, 'src/boardLanes.ts'), '--bundle', '--format=esm', '--outfile=' + bundle],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
  } catch (e) {
    console.error(String(e.stderr ?? e));
    process.exit(1);
  }
  const bl = await import(bundle);
  const out = [];
  const check = (name, got, want) => out.push({ name, got: JSON.stringify(got), want: JSON.stringify(want) });
  const N = bl.NO_VALUE;
  const select = { type: 'select', options: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] };
  const multi = { type: 'multiselect', options: [{ id: 'a', name: 'A' }] };
  const person = { type: 'person' };
  const people = { type: 'person', personMultiple: true };
  const formula = { type: 'formula' };

  // ---- Cell keys ----
  check('a key and back', bl.parseCellKey(bl.cellKey('ada', 'todo')), { lane: 'ada', col: 'todo' });
  check('ids with colons survive', bl.parseCellKey(bl.cellKey('embed:x:y', 'c:1')), { lane: 'embed:x:y', col: 'c:1' });
  check('a plain column id is not a cell', bl.parseCellKey('todo'), null);

  // ---- Lanes ----
  check('options in their order, No value last', bl.lanesFor(select, []).map((l) => l.id), ['a', 'b', N]);
  check('people in the order met, No value last', bl.lanesFor(person, ['u2', 'u1', 'u2', '', null]).map((l) => l.id), ['u2', 'u1', N]);
  check('lists are opened', bl.lanesFor(people, [['u1', 'u3'], ['u3']]).map((l) => l.id), ['u1', 'u3', N]);
  check('a formula\'s numbers are lanes', bl.lanesFor(formula, [3, 3, 5]).map((l) => l.id), ['3', '5', N]);

  // ---- Which lanes a row is in ----
  const lanes = bl.lanesFor(select, []);
  check('a value', bl.laneIdsOf('a', lanes), ['a']);
  check('nothing', bl.laneIdsOf(undefined, lanes), [N]);
  check('a removed option is No value', bl.laneIdsOf('gone', lanes), [N]);
  check('a list is in each lane', bl.laneIdsOf(['a', 'b', 'a'], lanes), ['a', 'b']);
  check('an empty list', bl.laneIdsOf([], lanes), [N]);

  // ---- The value a lane writes ----
  check('select', bl.laneValue(select, 'a'), 'a');
  check('select, No value', bl.laneValue(select, N), '');
  check('multi-select', bl.laneValue(multi, 'a'), ['a']);
  check('one person', bl.laneValue(person, 'u1'), 'u1');
  check('several people', bl.laneValue(people, 'u1'), ['u1']);
  check('several people, No value', bl.laneValue(people, N), []);
  check('a formula cannot be written', bl.laneValue(formula, '3'), null);

  // ---- What a drop writes ----
  const col = (c) => (c === N ? '' : c);
  const key = bl.cellKey;
  check('both changed: both written', bl.dropPatch(key('a', 'todo'), key('b', 'done'), 'status', 'owner', select, col), { owner: 'b', status: 'done' });
  check('lane only: the column is left alone', bl.dropPatch(key('a', 'todo'), key('b', 'todo'), 'status', 'owner', select, col), { owner: 'b' });
  check('column only: the lane is left alone', bl.dropPatch(key('a', 'todo'), key('a', 'done'), 'status', 'owner', select, col), { status: 'done' });
  check('the same cell: nothing', bl.dropPatch(key('a', 'todo'), key('a', 'todo'), 'status', 'owner', select, col), null);
  check('to No value', bl.dropPatch(key('a', 'todo'), key(N, N), 'status', 'owner', select, col), { owner: '', status: '' });
  check('a formula lane change is refused', bl.dropPatch(key('3', 'todo'), key('5', 'done'), 'status', 'score', formula, col), null);
  check('a column change in a formula lane still moves', bl.dropPatch(key('3', 'todo'), key('3', 'done'), 'status', 'score', formula, col), { status: 'done' });

  let fail = 0;
  for (const c of out) {
    if (c.got !== c.want) {
      fail++;
      console.log(`  FAIL ${c.name}: got ${c.got}, want ${c.want}`);
    }
  }
  console.log(`\n  board lanes: ${out.length - fail} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
