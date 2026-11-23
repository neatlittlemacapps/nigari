// Asserts how many rows a database in a document draws (src/embedRows.ts,
// spec 023).
//
//   node scripts/check-embedrows.mjs
//
// Same shape as check-tablelead.mjs: esbuild bundles the module once and it
// is imported. What would hurt if it drifted: a database page losing rows to
// the limit, a row just added vanishing past it, or Show more that never
// reaches the last row.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const tmp = mkdtempSync(join(tmpdir(), 'nigari-embedrows-'));
const bundle = join(tmp, 'embedRows.mjs');

try {
  try {
    execFileSync(
      join(web, 'node_modules/esbuild/bin/esbuild'),
      [join(web, 'src/embedRows.ts'), '--bundle', '--format=esm', '--outfile=' + bundle],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
  } catch (e) {
    console.error(String(e.stderr ?? e));
    process.exit(1);
  }
  const { EMBED_ROW_STEP, limitRows, nextLimit } = await import(bundle);

  let failed = 0;
  let passed = 0;
  const check = (name, got, want) => {
    if (JSON.stringify(got) === JSON.stringify(want)) passed++;
    else {
      failed++;
      console.error(`  FAIL  ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    }
  };
  check('the step is 25 (owner, 2026-11-23)', EMBED_ROW_STEP, 25);
  const rows = (n) => Array.from({ length: n }, (_, i) => i + 1);
  const count = (n, limit, reveal) => limitRows(rows(n), limit, reveal).length;
  check('no limit (a database page) draws every row', count(500, undefined), 500);
  check('fewer rows than the limit: all of them', count(3, 25), 3);
  check('exactly the limit: all of them', count(25, 25), 25);
  check('more rows: the limit', count(120, 25), 25);
  check('the first rows, in their order', limitRows(rows(30), 25).slice(-2), [24, 25]);
  check('a row to reveal past the limit is drawn after them, alone', limitRows(rows(120), 25, (r) => r === 120).slice(-2), [25, 120]);
  check('a row to reveal inside the limit changes nothing', count(120, 25, (r) => r === 3), 25);
  check('none at all', count(0, 25), 0);
  // Trees: rows as [id, depth]; a top-level row starts a group.
  const tree = [['a', 0], ['a1', 1], ['a2', 1], ['b', 0], ['b1', 1], ['c', 0], ['c1', 1]];
  const ids = (out) => out.map(([id]) => id);
  const top = ([, d]) => d === 0;
  check('the cut does not split a tree', ids(limitRows(tree, 2, undefined, top)), ['a', 'a1', 'a2']);
  check('a cut on a tree boundary stays', ids(limitRows(tree, 3, undefined, top)), ['a', 'a1', 'a2']);
  check('a revealed sub-item brings its whole tree', ids(limitRows(tree, 3, ([id]) => id === 'c1', top)), ['a', 'a1', 'a2', 'c', 'c1']);
  check('two revealed rows are both drawn', limitRows(rows(120), 25, (r) => r === 60 || r === 120).slice(-2), [60, 120]);

  // SC-003: 120 rows reach 100 after three presses, all after a fourth.
  let limit = EMBED_ROW_STEP;
  for (let i = 0; i < 3; i++) limit = nextLimit(limit);
  check('three presses draw 100', count(120, limit), 100);
  check('a fourth draws all 120', count(120, nextLimit(limit)), 120);

  console.log(`  embed rows: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
