// Asserts what Enter does inside a column (src/columnEnter.ts, #317).
//
//   node scripts/check-columnenter.mjs
//
// Same shape as check-peek.mjs: esbuild bundles the module once and it is
// imported. No framework. The two that would hurt most if they drifted: Enter
// in a column's first block must never fall through to BlockNote (its split
// makes the next column), and an open slash menu must always keep Enter.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const tmp = mkdtempSync(join(tmpdir(), 'nigari-columnenter-'));
const bundle = join(tmp, 'columnEnter.mjs');

try {
  try {
    execFileSync(
      join(web, 'node_modules/esbuild/bin/esbuild'),
      [join(web, 'src/columnEnter.ts'), '--bundle', '--format=esm', '--outfile=' + bundle],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
  } catch (e) {
    console.error(String(e.stderr ?? e));
    process.exit(1);
  }

  const { columnEnterAction, keepsType } = await import(bundle);
  const out = [];
  const check = (name, got, want) => out.push({ name, got: String(got), want: String(want) });
  const at = (over) => columnEnterAction({ head: false, body: false, inline: true, type: 'paragraph', empty: false, menuOpen: false, ...over });

  // ---- outside a column: BlockNote's Enter, untouched ----
  check('a paragraph outside columns', at({}), 'default');
  check('an empty paragraph outside columns', at({ empty: true }), 'default');

  // ---- a column's first block ----
  check('first block with text: split into the column', at({ head: true }), 'split-head');
  check('empty first block: a new line in the column', at({ head: true, empty: true }), 'split-head');
  check('first block as a heading', at({ head: true, type: 'heading' }), 'split-head');
  check('first block as a list item', at({ head: true, type: 'bulletListItem' }), 'split-head');
  check('empty list item first: BlockNote turns it into a paragraph, in place', at({ head: true, type: 'checkListItem', empty: true }), 'default');

  // ---- a later line in a column ----
  check('a line with text: BlockNote splits it into a sibling, same column', at({ body: true }), 'default');
  check('an empty line: a new line, not a lift out of the column', at({ body: true, empty: true }), 'new-line');
  check('an empty list item: BlockNote turns it into a paragraph', at({ body: true, type: 'numberedListItem', empty: true }), 'default');

  // ---- never ours ----
  check('the slash menu has Enter', at({ head: true, menuOpen: true }), 'default');
  check('the slash menu has Enter on an empty line', at({ body: true, empty: true, menuOpen: true }), 'default');
  check('a code block keeps its newline', at({ head: true, type: 'codeBlock', inline: true }), 'default');
  check('a table, an image: no text to split', at({ head: true, type: 'table', inline: false }), 'default');

  // ---- what the next line is ----
  check('a list item continues the list', keepsType('bulletListItem'), true);
  check('a checklist item continues the checklist', keepsType('checkListItem'), true);
  check('a heading is followed by a paragraph', keepsType('heading'), false);

  const bad = out.filter((c) => c.got !== c.want);
  for (const c of bad) console.error(`  ✗ ${c.name}: got ${c.got}, want ${c.want}`);
  if (bad.length) process.exit(1);
  console.log(`  column enter: ${out.length} Enter decisions checked`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
