// Checks what Escape and Tab do inside a hand-built modal (src/modalKeys.ts).
//
//   node scripts/check-modal.mjs
//
// Why it exists (#134): 11 of the 17 modals built on useExclusiveModal did not
// close on Escape, let Tab walk out into the page behind, and left focus on
// nothing when they closed. modal.ts now handles all three in one place, and
// these assertions hold the two decisions it makes: which modal Escape closes,
// and where Tab goes at the edges.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');

const out = [];
const check = (name, got, want) => out.push({ name, got: String(got), want: String(want), ok: String(got) === String(want) });

const tmp = mkdtempSync(join(tmpdir(), 'nigari-modal-'));
const bundle = join(tmp, 'modalKeys.mjs');
try {
  try {
    execFileSync(
      join(web, 'node_modules/esbuild/bin/esbuild'),
      [join(web, 'src/modalKeys.ts'), '--bundle', '--format=esm', '--outfile=' + bundle],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
  } catch (e) {
    console.error(String(e.stderr ?? e));
    process.exit(1);
  }
  const { trapStep, escapeTarget } = await import(bundle);

  // ---- Tab at the edges wraps; in between it is the browser's ----
  check('Tab on the last control wraps to the first', trapStep(2, 3, false), 0);
  check('Shift+Tab on the first wraps to the last', trapStep(0, 3, true), 2);
  check('Tab in the middle is left to the browser', trapStep(1, 3, false), 'null');
  check('Shift+Tab in the middle is left to the browser', trapStep(1, 3, true), 'null');
  check('Tab on the first is left to the browser', trapStep(0, 3, false), 'null');
  // Focus behind the modal (the page, or nothing) is pulled back in: this is
  // the walk-out the trap exists to stop.
  check('focus outside comes back to the first', trapStep(-1, 3, false), 0);
  check('Shift+Tab from outside comes back to the last', trapStep(-1, 3, true), 2);
  check('a single control keeps focus', trapStep(0, 1, false), 0);
  check('a modal with nothing to focus does not take Tab', trapStep(-1, 0, false), 'null');

  // ---- Escape closes the topmost modal, never the one below ----
  const below = { name: 'below', escape: true };
  const own = { name: 'own', escape: false };
  const top = { name: 'top', escape: true };
  check('Escape closes the topmost', escapeTarget([below, top], false)?.name, 'top');
  // A modal that handles Escape itself (the search palette) must not let the
  // press fall through to the one below; one press would close two dialogs.
  check('a top modal with its own Escape shields the one below', escapeTarget([below, own], false), 'null');
  check('a confirmation on top takes Escape for itself', escapeTarget([below, top], true), 'null');
  check('no modal, nothing to close', escapeTarget([], false), 'null');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const bad = out.filter((c) => !c.ok);
for (const c of out) if (!c.ok) console.log(`    FAIL ${c.name}: expected ${c.want}, got ${c.got}`);
console.log(`  ${bad.length === 0 ? 'ok  ' : 'FAIL'} modal keys ${out.length - bad.length}/${out.length}`);
if (bad.length) process.exit(1);
