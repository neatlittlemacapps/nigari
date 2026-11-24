// Asserts which handles step past the columns' resize grip
// (src/sideMenuPlace.ts, #820).
//
//   node scripts/check-sidemenuplace.mjs
//
// Same shape as check-editorowner.mjs: esbuild bundles the module once and it
// is imported. No framework. The one that would hurt most if it drifted: a
// block nested deep in a later column keeping its handle under the grip,
// where it cannot be reached (review of the first version, which gave up
// after three levels).

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const tmp = mkdtempSync(join(tmpdir(), 'nigari-sidemenuplace-'));
const bundle = join(tmp, 'sideMenuPlace.mjs');

try {
  try {
    execFileSync(
      join(web, 'node_modules/esbuild/bin/esbuild'),
      [join(web, 'src/sideMenuPlace.ts'), '--bundle', '--format=esm', '--outfile=' + bundle],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
  } catch (e) {
    console.error(String(e.stderr ?? e));
    process.exit(1);
  }
  const { inLaterColumn } = await import(bundle);

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

  // A page: a paragraph, then three columns a, b, c; b holds a list nested
  // five deep (b > b1 > b2 > b3 > b4 > b5).
  const block = (id, type, children = []) => ({ id, type, children });
  const doc = [
    block('top', 'paragraph'),
    block('cols', 'columns', [
      block('a', 'paragraph', [block('a1', 'paragraph')]),
      block('b', 'paragraph', [block('b1', 'bulletListItem', [block('b2', 'bulletListItem', [block('b3', 'bulletListItem', [block('b4', 'bulletListItem', [block('b5', 'bulletListItem')])])])])]),
      block('c', 'paragraph'),
    ]),
  ];
  const parents = new Map();
  const walk = (list, parent) => {
    for (const b of list) {
      if (parent) parents.set(b.id, parent);
      walk(b.children, b);
    }
  };
  walk(doc, undefined);
  const later = (id) => inLaterColumn(id, (x) => parents.get(x));

  check('a paragraph on the page', later('top'), false);
  check('the columns block itself', later('cols'), false);
  check("the first column's first line", later('a'), false);
  check('a line under it', later('a1'), false);
  check("the second column's first line", later('b'), true);
  check('one level down in the second column', later('b1'), true);
  check('five levels down in the second column', later('b5'), true);
  check('the third column', later('c'), true);
  check('an id nobody knows', later('nope'), false);

  // A cycle (a broken document) ends instead of hanging.
  check('a cycle ends', inLaterColumn('x', (id) => ({ id: id === 'x' ? 'y' : 'x', type: 'paragraph', children: [] })), false);

  console.log(`  side menu place: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
