// Asserts which editor a pointer belongs to (src/editorOwner.ts, #826).
//
//   node scripts/check-editorowner.mjs
//
// Same shape as check-sidemenuhold.mjs: esbuild bundles the module once and it
// is imported. No framework. The ones that would hurt most if they drifted: a
// peek over the page losing to the page behind it (#826 back), and the page
// losing its handles in its own margin, where nothing is on top.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const tmp = mkdtempSync(join(tmpdir(), 'nigari-editorowner-'));
const bundle = join(tmp, 'editorOwner.mjs');

try {
  try {
    execFileSync(
      join(web, 'node_modules/esbuild/bin/esbuild'),
      [join(web, 'src/editorOwner.ts'), '--bundle', '--format=esm', '--outfile=' + bundle],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
  } catch (e) {
    console.error(String(e.stderr ?? e));
    process.exit(1);
  }
  const { closestEditor } = await import(bundle);

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
  // The page's editor spans the page; a peek lies over its right half.
  const page = { left: 300, right: 1000, top: 100, bottom: 900 };
  const peek = { left: 700, right: 1180, top: 120, bottom: 600 };
  const owner = (onPage, onPeek, x, y) => closestEditor([{ ...page, onTop: onPage }, { ...peek, onTop: onPeek }], x, y);

  // ---- #826: what is on top wins, even where both are at distance 0 ----
  check('pointer on the peek text: the peek', owner(false, true, 800, 300), { index: 1, distance: 0 });
  check('pointer in the peek margin, left of its text: the peek', owner(false, true, 690, 300), { index: 1, distance: 10 });
  check('pointer on the page beside the peek: the page', owner(true, false, 400, 300), { index: 0, distance: 0 });

  // ---- nothing on top (a margin of the window): distance, first on a tie ----
  check('both at distance 0, none on top: the first, as BlockNote did', owner(false, false, 800, 300), { index: 0, distance: 0 });
  check('beside the page only: the page', owner(false, false, 280, 300), { index: 0, distance: 20 });
  check('both on top (the body): distance decides', owner(true, true, 1190, 300), { index: 1, distance: 10 });

  // ---- no editors ----
  check('no editor on the page', closestEditor([], 1, 1), null);

  console.log(`  editor owner: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
