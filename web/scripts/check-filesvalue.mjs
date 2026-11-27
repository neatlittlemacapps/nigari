// Asserts how the browser reads and edits a Files & media value
// (src/filesValue.ts, spec 028).
//
//   node scripts/check-filesvalue.mjs
//
// Same shape as check-titlecell.mjs. The ones that would hurt most: a value
// of another shape crashing the cell (a property changed to Files & media
// keeps its old values, plan D10), an outside or path-escaping address drawn
// as a file, and a move or remove that loses a file.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const tmp = mkdtempSync(join(tmpdir(), 'nigari-filesvalue-'));
const bundle = join(tmp, 'filesValue.mjs');

try {
  try {
    execFileSync(
      join(web, 'node_modules/esbuild/bin/esbuild'),
      [join(web, 'src/filesValue.ts'), '--bundle', '--format=esm', '--outfile=' + bundle],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
  } catch (e) {
    console.error(String(e.stderr ?? e));
    process.exit(1);
  }
  const { readFiles, isImageUrl, isStoredFileUrl, fileLabel, fileListItems, addFiles, removeFile, moveFile } = await import(bundle);

  let failed = 0;
  let passed = 0;
  const check = (name, got, want) => {
    const g = JSON.stringify(got);
    const w = JSON.stringify(want);
    if (g === w) passed++;
    else {
      failed++;
      console.error(`  ✗ ${name}: got ${g}, want ${w}`);
    }
  };

  const a = { url: '/files/a1.png', name: 'site.png' };
  const b = { url: '/files/b2.pdf', name: 'quote.pdf' };
  const c = { url: '/files/c3.jpg', name: '' };

  // Reading: only the stored shape.
  check('a stored value', readFiles([a, b]), [a, b]);
  check('null', readFiles(null), []);
  check('a text left from a type change', readFiles('plan.pdf'), []);
  check('a list of strings', readFiles(['/files/a1.png']), []);
  check('a select id list', readFiles(['opt1', 'opt2']), []);
  check('a missing name reads as empty', readFiles([{ url: '/files/a1.png' }]), [{ url: '/files/a1.png', name: '' }]);
  check('an outside link is dropped', readFiles([{ url: 'https://example.com/x.png', name: 'x' }, a]), [a]);
  check('a path out of files/ is dropped', readFiles([{ url: '/files/../nigari.db', name: 'x' }]), []);
  check('a nested path is dropped', readFiles([{ url: '/files/a/b.png', name: 'x' }]), []);
  check('an encoded slash is dropped', readFiles([{ url: '/files/a%2fb.png', name: 'x' }]), []);
  check('a query is dropped', readFiles([{ url: '/files/a.png?x=1', name: 'x' }]), []);
  check('an empty name after files/', isStoredFileUrl('/files/'), false);

  // Images: by extension, SVG never.
  check('png is an image', isImageUrl('/files/a1.png'), true);
  check('JPEG in capitals', isImageUrl('/files/A1.JPEG'), true);
  check('webp', isImageUrl('/files/x.webp'), true);
  check('pdf is a file', isImageUrl('/files/b2.pdf'), false);
  check('svg is drawn as an image', isImageUrl('/files/logo.svg'), true);
  check('no extension', isImageUrl('/files/abc'), false);
  check('a dot in a folder is not an extension', isImageUrl('/fi.png/abc'), false);

  // Labels and list items.
  check('the uploaded name', fileLabel(a), 'site.png');
  check('the stored name when none', fileLabel(c), 'c3.jpg');
  check('list items', fileListItems([a, b, c]), [
    { url: a.url, name: 'site.png', image: true },
    { url: b.url, name: 'quote.pdf', image: false },
    { url: c.url, name: 'c3.jpg', image: true },
  ]);

  // Edits.
  check('added after the others', addFiles([a], [b, c]), [a, b, c]);
  check('an added outside link is not kept', addFiles([a], [{ url: 'https://x.test/y.png', name: 'y' }]), [a]);
  check('remove the middle', removeFile([a, b, c], 1), [a, c]);
  check('remove out of range keeps all', removeFile([a, b], 5), [a, b]);
  check('move down', moveFile([a, b, c], 0, 2), [b, c, a]);
  check('move up', moveFile([a, b, c], 2, 0), [c, a, b]);
  check('move to the same place', moveFile([a, b], 1, 1), [a, b]);
  check('move out of range keeps all', moveFile([a, b], 0, 9), [a, b]);
  check('a move keeps every file', moveFile([a, b, c], 1, 2).length, 3);

  console.log(`  files value: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
