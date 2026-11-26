// Asserts what a click on a table row's name does (src/titleCell.ts, spec 026).
//
//   node scripts/check-titlecell.mjs
//
// Same shape as check-sidemenuhold.mjs: esbuild bundles the module once and it
// is imported. No framework. The ones that would hurt most if they drifted: a
// reader's click turning into an edit (a field the server then refuses), an
// editor's ⌘-click renaming instead of opening a tab, and a plain click
// opening the row again, which is the bug #981 asked to fix.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const tmp = mkdtempSync(join(tmpdir(), 'nigari-titlecell-'));
const bundle = join(tmp, 'titleCell.mjs');

try {
  try {
    execFileSync(
      join(web, 'node_modules/esbuild/bin/esbuild'),
      [join(web, 'src/titleCell.ts'), '--bundle', '--format=esm', '--outfile=' + bundle],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
  } catch (e) {
    console.error(String(e.stderr ?? e));
    process.exit(1);
  }
  const { titleClick } = await import(bundle);

  let failed = 0;
  let passed = 0;
  const check = (name, got, want) => {
    if (got === want) passed++;
    else {
      failed++;
      console.error(`  FAIL  ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    }
  };

  // Every combination of who clicks and how.
  const clicks = [
    ['a plain click', { button: 0 }],
    ['a ⌘-click', { button: 0, metaKey: true }],
    ['a Ctrl-click', { button: 0, ctrlKey: true }],
    ['a middle click', { button: 1 }],
  ];
  for (const [how, e] of clicks) {
    const plain = !e.metaKey && !e.ctrlKey && e.button !== 1;
    check(`an editor's ${how}`, titleClick({ canEdit: true, ...e }), plain ? 'edit' : 'new_tab');
    check(`a reader's ${how}`, titleClick({ canEdit: false, ...e }), plain ? 'open' : 'new_tab');
  }

  // Enter on the focused name is a click with no button and no modifier.
  check('Enter for an editor edits', titleClick({ canEdit: true }), 'edit');
  check('Enter for a reader opens', titleClick({ canEdit: false }), 'open');

  console.log(`  title cell: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
