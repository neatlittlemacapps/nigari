// Asserts how fast the page scrolls under a dragged block (src/dragScroll.ts,
// #810).
//
//   node scripts/check-dragscroll.mjs
//
// Same shape as check-editorowner.mjs: esbuild bundles the module once and it
// is imported. No framework. The ones that would hurt most if they drifted:
// the middle of the page scrolling (no block could be dropped there), and the
// edge never reaching full speed (a long page takes forever).

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const tmp = mkdtempSync(join(tmpdir(), 'nigari-dragscroll-'));
const bundle = join(tmp, 'dragScroll.mjs');

try {
  try {
    execFileSync(
      join(web, 'node_modules/esbuild/bin/esbuild'),
      [join(web, 'src/dragScroll.ts'), '--bundle', '--format=esm', '--outfile=' + bundle],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
  } catch (e) {
    console.error(String(e.stderr ?? e));
    process.exit(1);
  }
  const { scrollSpeed, SCROLL_EDGE, SCROLL_MAX } = await import(bundle);

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

  // A page scroller from 80 (under the header) to 700.
  const at = (y) => scrollSpeed(y, 80, 700);
  check('the edge zone is 72px', SCROLL_EDGE, 72);
  check('the middle holds still', at(400), 0);
  check('just outside the top zone holds still', at(80 + 72), 0);
  check('just inside the top zone creeps up', at(80 + 71), -1);
  check('12px into the top zone: at most 2px a frame (SC-002)', Math.abs(at(80 + 60)) <= 2, true);
  check('halfway into the top zone: a quarter speed up', at(80 + 36), -6);
  check('at the top edge: full speed up', at(80), -SCROLL_MAX);
  check('over the header above: full speed up', at(20), -SCROLL_MAX);
  check('far above the window: still full speed', at(-500), -SCROLL_MAX);
  check('just inside the bottom zone creeps down', at(700 - 71), 1);
  check('at the bottom edge: full speed down', at(700), SCROLL_MAX);
  check('below the window: full speed down', at(900), SCROLL_MAX);

  // A short scroller (a peek panel shrunk, a small window) keeps a still middle.
  check('a 100px scroller: zones of 25px', scrollSpeed(50, 0, 100), 0);
  check('a 100px scroller: its top edge runs', scrollSpeed(0, 0, 100), -SCROLL_MAX);
  check('no height: nothing', scrollSpeed(10, 50, 50), 0);
  check('upside down: nothing', scrollSpeed(10, 60, 50), 0);

  // Monotonic: deeper into the zone is never slower.
  let last = 0;
  let steady = true;
  for (let y = 80 + 72; y >= 0; y--) {
    const s = -at(y);
    if (s < last) steady = false;
    last = s;
  }
  check('deeper into the top zone is never slower', steady, true);

  console.log(`  drag scroll: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
