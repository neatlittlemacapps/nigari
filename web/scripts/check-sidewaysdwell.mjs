// Asserts the rest before a drop that makes columns (src/sidewaysDwell.ts,
// #820).
//
//   node scripts/check-sidewaysdwell.mjs
//
// Same shape as check-editorowner.mjs: esbuild bundles the module once and it
// is imported. No framework. The ones that would hurt most if they drifted: a
// pointer passing through an edge being offered a column (#820 back), and a
// pointer that rests never being offered one.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const tmp = mkdtempSync(join(tmpdir(), 'nigari-sidewaysdwell-'));
const bundle = join(tmp, 'sidewaysDwell.mjs');

try {
  try {
    execFileSync(
      join(web, 'node_modules/esbuild/bin/esbuild'),
      [join(web, 'src/sidewaysDwell.ts'), '--bundle', '--format=esm', '--outfile=' + bundle],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
  } catch (e) {
    console.error(String(e.stderr ?? e));
    process.exit(1);
  }
  const { sidewaysDwell, DWELL_MS } = await import(bundle);

  let failed = 0;
  let passed = 0;
  const check = (name, got, want) => {
    const g = JSON.stringify(got);
    const w = JSON.stringify(want);
    if (g === w) passed++;
    else {
      failed++;
      console.error(`  FAIL  ${name}: got ${g}, want ${w}`);
    }
  };

  check('the rest is 0.4 s (owner, 2026-11-24)', DWELL_MS, 400);

  // ---- passing through: no offer ----
  {
    const d = sidewaysDwell(400);
    check('arriving at an edge: not yet', d.ready('column:c:1', 1000), false);
    check('still there after 150 ms: not yet', d.ready('column:c:1', 1150), false);
    check('gone after 200 ms: nothing', d.ready(null, 1200), false);
    check('back at the same edge: the wait starts again', d.ready('column:c:1', 1300), false);
    check('… and 399 ms later: not yet', d.ready('column:c:1', 1699), false);
    check('… 1 ms left to wait', d.left(1699), 1);
    check('… and 400 ms later: offered', d.ready('column:c:1', 1700), true);
    check('resting on: still offered', d.ready('column:c:1', 2500), true);
    check('nothing left to wait once offered', d.left(2500), 0);
  }

  // ---- another edge starts its own wait ----
  {
    const d = sidewaysDwell(400);
    d.ready('column:c:1', 0);
    check('rested at one edge', d.ready('column:c:1', 500), true);
    check('the next edge along: not yet', d.ready('column:c:2', 510), false);
    check('a beside edge: not yet', d.ready('beside:p:left', 520), false);
    check('rested at the beside edge', d.ready('beside:p:left', 920), true);
  }

  // ---- a new drag forgets the last one ----
  {
    const d = sidewaysDwell(400);
    d.ready('column:c:1', 0);
    d.ready('column:c:1', 500);
    d.reset();
    check('after a reset the same edge waits again', d.ready('column:c:1', 600), false);
    check('null is never offered', d.ready(null, 99999), false);
    check('nothing to wait for at no spot', d.left(99999), 0);
  }

  console.log(`  sideways dwell: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
