// Asserts every copy of nigari's mark is the one in brand/mark.svg (#322).
//
//   node scripts/check-brand.mjs
//
// The mark is inlined in several places, each with its own reason not to load
// a file: the React logo (drawn with the page, no request), logo.svg and
// favicon.svg (served as they are), and three pages that load nothing from the
// app: the shared-page header (server/public.go), the desktop sign-in pages
// (server/desktop_auth.go) and the desktop app's connect screen. Copies drift:
// the mark from before the rename lived on in three of them after the app had
// changed its own, because nothing compared them. So this finds them itself
// and compares them:
//
//   - every file that draws the mark's front page draws all of it, in the
//     artwork's colours, with the overlap clipped to the back page (an
//     unclipped overlap paints the whole front page dark);
//   - no file still draws the old mark;
//   - no copy uses mix-blend-mode. The artwork as drawn coloured the overlap
//     with blend modes, which mix with the page behind the SVG and turned the
//     front shape black in dark mode.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const read = (f) => readFileSync(join(repo, f), 'utf8');

const mark = read('brand/mark.svg');
const shapes = [...mark.matchAll(/<path d="([^"]+)" fill="(#[0-9A-Fa-f]{6})"/g)].map((m) => ({
  d: m[1],
  fill: m[2].toUpperCase(),
}));
if (shapes.length !== 3) {
  console.error(`check-brand: brand/mark.svg should draw 3 filled shapes, found ${shapes.length}`);
  process.exit(1);
}
const FRONT = shapes[1].d;

// Fingerprints of the mark from before the rename: its viewBox and the first
// command of its outline.
const OLD_MARK = [/96 100 204 204/, /M201\.1 113\.4/];

// Comments may explain the blend; only code and markup that use one count.
const withoutComments = (src) =>
  src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

function problems(file, src) {
  const out = [];
  for (const { d, fill } of shapes) {
    if (!src.includes(d)) out.push(`${file}: a shape of brand/mark.svg is missing or changed`);
    if (!new RegExp(`["']${fill}["']`, 'i').test(src)) out.push(`${file}: the colour ${fill} is missing`);
  }
  if (!/<clipPath\b/.test(src) || !/clip-path="url\(#|clipPath=\{/.test(src)) {
    out.push(`${file}: the overlap is not clipped to the back page`);
  }
  if (/mix-blend-mode/.test(withoutComments(src))) {
    out.push(`${file}: uses mix-blend-mode, which turns the mark black on a dark page`);
  }
  return out;
}

// Self-test: each refusal has to be able to fail, or a broken pattern above
// would pass every copy.
const selfTests = {
  'a different mark': '<svg><path d="M0 0h1" fill="#37352f"/></svg>',
  'a blended copy': mark.replace('<path d=', '<g style="mix-blend-mode:darken"></g><path d='),
  'an unclipped copy': mark.replace(/ clip-path="url\(#[^"]+\)"/, ''),
};
for (const [name, src] of Object.entries(selfTests)) {
  if (!problems('self-test', src).length) {
    console.error(`check-brand: self-test failed, ${name} passed`);
    process.exit(1);
  }
}
if (problems('self-test', mark).length) {
  console.error('check-brand: self-test failed, brand/mark.svg itself does not pass');
  process.exit(1);
}

// Where a copy can live. Built output and installed packages are not copies.
const ROOTS = ['server', 'web/src', 'web/public', 'web/index.html', 'desktop/src'];
const SKIP = new Set(['node_modules', 'dist']);
function* files(path) {
  if (statSync(join(repo, path)).isFile()) {
    yield path;
    return;
  }
  for (const name of readdirSync(join(repo, path))) {
    if (!SKIP.has(name)) yield* files(join(path, name));
  }
}

// The copies known when this was written. Finding fewer means one was dropped
// or changed beyond recognition, which the scan alone would not notice.
const EXPECTED = [
  'web/src/Logo.tsx',
  'web/public/logo.svg',
  'web/public/favicon.svg',
  'server/public.go',
  'server/desktop_auth.go',
  'desktop/src/connect.html',
];

const failures = [];
const copies = [];
for (const root of ROOTS) {
  for (const file of files(root)) {
    if (!/\.(go|tsx?|jsx?|mjs|html|svg|css)$/.test(file)) continue;
    const src = read(file);
    if (OLD_MARK.some((re) => re.test(src))) failures.push(`${file}: still draws the old mark`);
    if (src.includes(FRONT)) {
      copies.push(file);
      failures.push(...problems(file, src));
    }
  }
}
for (const file of EXPECTED) {
  if (!copies.includes(file)) failures.push(`${file}: should draw the mark and does not`);
}

if (failures.length) {
  for (const f of [...new Set(failures)]) console.error(`check-brand: ${f}`);
  console.error('Copy the mark from brand/mark.svg (see brand/README.md).');
  process.exit(1);
}
console.log(`check-brand: ${copies.length} copies of the mark match brand/mark.svg, no old mark left`);
