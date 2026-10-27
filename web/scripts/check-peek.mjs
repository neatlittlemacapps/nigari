// Asserts what a click on a database row does (src/peek.ts, spec 007).
//
//   node scripts/check-peek.mjs
//
// Same shape as check-treemode.mjs: esbuild bundles the module once and it is
// imported. No framework.
//
// Every row of the table in specs/007-open-pages-in-peek/research.md R3 is a
// line here. The two that would hurt most if they drifted: a view on full page
// must behave exactly as before the feature (the account's "Open rows in new
// tab" included), and a modifier key must always mean a new tab.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const tmp = mkdtempSync(join(tmpdir(), 'salt-peek-'));
const bundle = join(tmp, 'peek.mjs');

try {
  try {
    execFileSync(
      join(web, 'node_modules/esbuild/bin/esbuild'),
      [join(web, 'src/peek.ts'), '--bundle', '--format=esm', '--outfile=' + bundle],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
  } catch (e) {
    console.error(String(e.stderr ?? e));
    process.exit(1);
  }

  const { rowOpenAction } = await import(bundle);
  const out = [];
  const check = (name, got, want) => out.push({ name, got: String(got), want: String(want) });

  const plain = {};
  const cmd = { metaKey: true };
  const ctrl = { ctrlKey: true };
  const middle = { middle: true };

  // ---- a modifier always means a new tab ----
  for (const [name, click] of [['⌘', cmd], ['Ctrl', ctrl], ['middle button', middle]]) {
    for (const openIn of [undefined, 'side_peek', 'center_peek']) {
      check(`${name} on ${openIn ?? 'full page'}: new tab`, rowOpenAction(click, openIn, false, true), 'new_tab');
    }
  }

  // ---- full page: exactly today's behaviour ----
  check('full page: navigate', rowOpenAction(plain, undefined, false, true), 'navigate');
  check('full page, account prefers new tabs: new tab', rowOpenAction(plain, undefined, true, true), 'new_tab');
  check('full page on a phone: navigate', rowOpenAction(plain, undefined, false, false), 'navigate');
  check('an unknown value is full page', rowOpenAction(plain, 'sideways', false, true), 'navigate');

  // ---- side peek beats the account preference ----
  check('side peek: side', rowOpenAction(plain, 'side_peek', false, true), 'side');
  check('side peek, account prefers new tabs: still side', rowOpenAction(plain, 'side_peek', true, true), 'side');

  // ---- narrow screens ----
  check('side peek on a phone, centre not shipped: navigate', rowOpenAction(plain, 'side_peek', false, false, false), 'navigate');
  check('side peek on a phone, centre shipped: center', rowOpenAction(plain, 'side_peek', false, false, true), 'center');

  // ---- centre peek ----
  check('centre peek before it ships: full page', rowOpenAction(plain, 'center_peek', false, true, false), 'navigate');
  check('centre peek before it ships, account new tab: new tab', rowOpenAction(plain, 'center_peek', true, true, false), 'new_tab');
  check('centre peek once shipped: center', rowOpenAction(plain, 'center_peek', true, true, true), 'center');
  check('centre peek on a phone once shipped: center', rowOpenAction(plain, 'center_peek', false, false, true), 'center');

  const bad = out.filter((c) => c.got !== c.want);
  for (const c of bad) console.error(`  ✗ ${c.name}: got ${c.got}, want ${c.want}`);
  if (bad.length) process.exit(1);
  console.log(`  peek: ${out.length} click decisions checked`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
