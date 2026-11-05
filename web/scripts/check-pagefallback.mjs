// Asserts which page the app lands on when it has none to keep
// (src/pageFallback.ts, #571).
//
//   node scripts/check-pagefallback.mjs
//
// Same shape as check-peek.mjs: esbuild bundles the module once and it is
// imported. No framework. The case that matters most: the last page of a
// workspace is gone while another workspace has pages; the answer is null
// (the empty state), never the other workspace's page.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const tmp = mkdtempSync(join(tmpdir(), 'nigari-pagefallback-'));
const bundle = join(tmp, 'pageFallback.mjs');

try {
  try {
    execFileSync(
      join(web, 'node_modules/esbuild/bin/esbuild'),
      [join(web, 'src/pageFallback.ts'), '--bundle', '--format=esm', '--outfile=' + bundle],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
  } catch (e) {
    console.error(String(e.stderr ?? e));
    process.exit(1);
  }

  const { fallbackPage } = await import(bundle);
  const out = [];
  const check = (name, got, want) => out.push({ name, got: String(got), want: String(want) });

  const page = (id, workspaceId, extra = {}) => ({ id, workspaceId, trashed: false, parentId: null, ...extra });
  const kernel = page('k1', 'kernel');
  const kernelChild = page('k2', 'kernel', { parentId: 'k1' });
  const pmTrashed = page('p1', 'pm', { trashed: true });

  // ---- #571: the last page of a workspace is gone ----
  check('last page of pm trashed, kernel has pages: empty state', fallbackPage([kernel, kernelChild, pmTrashed], 'pm', [], 'p1'), 'null');
  check('a kernel tab is still open: still the empty state in pm', fallbackPage([kernel, pmTrashed], 'pm', ['k1', 'p1'], 'p1'), 'null');
  check('a workspace with no pages at all: empty state', fallbackPage([kernel], 'pm'), 'null');

  // ---- within the workspace ----
  const pm2 = page('p2', 'pm');
  const pm3 = page('p3', 'pm', { parentId: 'p2' });
  check('first top-level page of the workspace', fallbackPage([kernel, pm3, pm2], 'pm'), 'p2');
  check('only sub-pages left: one of them', fallbackPage([kernel, pm3], 'pm'), 'p3');
  check('an open tab of the workspace wins over its first page', fallbackPage([pm2, pm3], 'pm', ['p3']), 'p3');
  check('the page being left is not picked as a tab', fallbackPage([pm2, pm3], 'pm', ['p3'], 'p3'), 'p2');
  check('a trashed tab is not picked', fallbackPage([pm2, page('p4', 'pm', { trashed: true })], 'pm', ['p4']), 'p2');
  check('a tab not in the page list (a row) is not picked', fallbackPage([pm2], 'pm', ['row1']), 'p2');

  // ---- before the workspaces load ----
  check('no workspace yet: any live page', fallbackPage([pmTrashed, kernel], ''), 'k1');

  const bad = out.filter((c) => c.got !== c.want);
  for (const c of bad) console.error(`  ✗ ${c.name}: got ${c.got}, want ${c.want}`);
  if (bad.length) process.exit(1);
  console.log(`  page fallback: ${out.length} landing decisions checked`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
