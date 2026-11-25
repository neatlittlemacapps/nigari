// Asserts when the block handle is held still (src/sideMenuHold.ts, #808).
//
//   node scripts/check-sidemenuhold.mjs
//
// Same shape as check-columnenter.mjs: esbuild bundles the module once and it
// is imported. No framework. The ones that would hurt most if they drifted: a
// hold that is never released (the handle stuck on one block), a hold that
// fights BlockNote's own freeze while the block menu is open (the menu
// vanishes), a hold that keeps believing it holds after that menu closed
// (#808 back), and a finger, which sends no move to release anything.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const tmp = mkdtempSync(join(tmpdir(), 'nigari-sidemenuhold-'));
const bundle = join(tmp, 'sideMenuHold.mjs');

try {
  try {
    execFileSync(
      join(web, 'node_modules/esbuild/bin/esbuild'),
      [join(web, 'src/sideMenuHold.ts'), '--bundle', '--format=esm', '--outfile=' + bundle],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
  } catch (e) {
    console.error(String(e.stderr ?? e));
    process.exit(1);
  }
  const { holdDecision } = await import(bundle);

  let failed = 0;
  let passed = 0;
  const check = (name, got, want) => {
    if (got === want) passed++;
    else {
      failed++;
      console.error(`  FAIL  ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    }
  };
  const at = (over) => holdDecision({ held: false, onOwnMenu: false, blockMenuOpen: false, pointerType: 'mouse', ...over });

  // ---- the ordinary path: onto the handle holds, off it releases ----
  check('onto the handle holds it', at({ onOwnMenu: true }), 'hold');
  check('staying on the handle changes nothing', at({ held: true, onOwnMenu: true }), null);
  check('off the handle releases it', at({ held: true }), 'release');
  check('elsewhere with nothing held changes nothing', at({}), null);
  check('a pen holds like a mouse', at({ onOwnMenu: true, pointerType: 'pen' }), 'hold');

  // ---- the block menu is BlockNote's freeze; the hold stays out of it ----
  check('menu open while held: let go without unfreezing', at({ held: true, blockMenuOpen: true }), 'yield');
  check('menu open while held, pointer on it: still let go', at({ held: true, onOwnMenu: true, blockMenuOpen: true }), 'yield');
  check('menu open, nothing held: nothing', at({ onOwnMenu: true, blockMenuOpen: true }), null);
  check('menu closed again, pointer on the handle: hold it again', at({ onOwnMenu: true }), 'hold');

  // ---- #984: a press on the handle holds until the drag starts ----
  check('a quick move off the handle with the button down keeps the hold', at({ held: true, pressed: true }), null);
  check('the button up again, off the handle: release', at({ held: true, pressed: false }), 'release');
  check('a press does not hold a handle that was never held', at({ pressed: true }), null);

  // ---- a finger is left alone ----
  check('a touch on the handle does not hold it', at({ onOwnMenu: true, pointerType: 'touch' }), null);
  check('a touch elsewhere does not release', at({ held: true, pointerType: 'touch' }), null);

  console.log(`  side menu hold: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
