// Asserts the table's leading checkbox rules (src/tableLead.ts).
//
//   node scripts/check-tablelead.mjs
//
// Same shape as check-sidemenuhold.mjs: esbuild bundles the module once and
// it is imported. No framework. What would hurt if it drifted: a drag of the
// other columns that loses the checkbox from the view, or moves it in the
// stored order so another view or a database without the rule sees it jump.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const tmp = mkdtempSync(join(tmpdir(), 'nigari-tablelead-'));
const bundle = join(tmp, 'tableLead.mjs');

try {
  try {
    execFileSync(
      join(web, 'node_modules/esbuild/bin/esbuild'),
      [join(web, 'src/tableLead.ts'), '--bundle', '--format=esm', '--outfile=' + bundle],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
  } catch (e) {
    console.error(String(e.stderr ?? e));
    process.exit(1);
  }
  const { leadCheckbox, movableColumns, withLead } = await import(bundle);

  let failed = 0;
  let passed = 0;
  const check = (name, got, want) => {
    if (JSON.stringify(got) === JSON.stringify(want)) passed++;
    else {
      failed++;
      console.error(`  FAIL  ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    }
  };
  const col = (id, type) => ({ id, type });

  check('no checkbox, no lead', leadCheckbox([col('a', 'text'), col('b', 'select')]), undefined);
  check('the first checkbox leads', leadCheckbox([col('a', 'text'), col('ok', 'checkbox'), col('ok2', 'checkbox')])?.id, 'ok');

  check('no lead: every column moves', movableColumns(['a', 'b'], undefined), ['a', 'b']);
  check('the lead stays out of the moves', movableColumns(['a', 'ok', 'b'], 'ok'), ['a', 'b']);

  check('no lead: the order is the new one', withLead(['b', 'a'], undefined, ['a', 'b']), ['b', 'a']);
  check('the lead goes back to its index', withLead(['c', 'a'], 'ok', ['a', 'ok', 'c']), ['c', 'ok', 'a']);
  check('a lead stored first stays first', withLead(['b', 'a'], 'ok', ['ok', 'a', 'b']), ['ok', 'b', 'a']);
  check('a lead stored last stays last', withLead(['b', 'a'], 'ok', ['a', 'b', 'ok']), ['b', 'a', 'ok']);
  check('after a hide the lead keeps its place or the end', withLead(['a'], 'ok', ['a', 'b', 'ok']), ['a', 'ok']);
  check('a lead not in the old order is left out', withLead(['a'], 'ok', ['a']), ['a']);
  check('a lead already in the new order is not doubled', withLead(['ok', 'a'], 'ok', ['a', 'ok']), ['a', 'ok']);

  console.log(`  table lead: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
