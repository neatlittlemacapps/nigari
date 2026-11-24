// Asserts what a key press says about how a block was chosen
// (src/inputModality.ts, #943).
//
//   node scripts/check-inputmodality.mjs
//
// Same shape as check-editorowner.mjs: esbuild bundles the module once and it
// is imported. No framework. The ones that would hurt most if they drifted: a
// key pressed after a mouse choice (⌘C, ↓ in its menu) ringing that block.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const tmp = mkdtempSync(join(tmpdir(), 'nigari-inputmodality-'));
const bundle = join(tmp, 'inputModality.mjs');

try {
  try {
    execFileSync(
      join(web, 'node_modules/esbuild/bin/esbuild'),
      [join(web, 'src/inputModality.ts'), '--bundle', '--format=esm', '--outfile=' + bundle],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
  } catch (e) {
    console.error(String(e.stderr ?? e));
    process.exit(1);
  }
  const { inputOfKey } = await import(bundle);

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

  for (const key of ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Tab', 'Home', 'End', 'PageUp', 'PageDown']) check(`${key} is the keyboard`, inputOfKey(key), 'keys');
  // Keys that choose no block say nothing (review): typing, a chord, a
  // modifier or lock key held for a click, a synthetic event with no key.
  for (const key of ['a', 'Enter', 'Escape', '/', 'Meta', 'Control', 'Shift', 'Alt', 'AltGraph', 'CapsLock', 'Dead', 'Unidentified', undefined]) check(`${key} says nothing`, inputOfKey(key), null);
  check('⌘C after a click says nothing', inputOfKey('c', { chord: true }), null);
  check('⌘↓ is a chord, says nothing', inputOfKey('ArrowDown', { chord: true }), null);
  check('↓ inside a block menu the mouse opened says nothing', inputOfKey('ArrowDown', { inMenu: true }), null);
  check('Shift+↓ is the keyboard', inputOfKey('ArrowDown', { chord: false }), 'keys');

  console.log(`  input modality: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
