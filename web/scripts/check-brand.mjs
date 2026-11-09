// Asserts every copy of nigari's mark is the one in brand/mark.svg (#322).
//
//   node scripts/check-brand.mjs
//
// The mark is inlined in four places, because each has its own reason not to
// load a file: the React logo (drawn with the page, no request), logo.svg and
// favicon.svg (served as they are) and the shared-page header in
// server/public.go (a page that loads nothing from the app). Four copies drift:
// the salt.md mark lived on in the shared-page header after the app had
// changed its own, because nothing compared them. So this does.
//
// It also fails on mix-blend-mode in any copy. The owner's artwork drew the
// overlap with blend modes, which mix with the page behind the SVG and turned
// the front shape black in dark mode; the copies draw it as a clipped shape.

import { readFileSync } from 'node:fs';
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

function problems(file, src) {
  const out = [];
  for (const { d, fill } of shapes) {
    if (!src.includes(d)) out.push(`${file}: a shape of brand/mark.svg is missing or changed`);
    if (!new RegExp(`["']${fill}["']`, 'i').test(src)) out.push(`${file}: the colour ${fill} is missing`);
  }
  // Comments may explain the blend; only markup that uses one counts.
  if (/mix-blend-mode/.test(src.replace(/<!--[\s\S]*?-->/g, ""))) out.push(`${file}: uses mix-blend-mode, which turns the mark black on a dark page`);
  return out;
}

// Self-test: the comparison has to be able to fail, or a broken pattern above
// would pass every copy. The old salt.md mark and a blended copy must both fail.
const blended = mark.replace('<path d=', '<g style="mix-blend-mode:darken"></g><path d=');
if (!problems('self-test', '<svg><path d="M0 0h1" fill="#37352f"/></svg>').length ||
    !problems('self-test', blended).length) {
  console.error('check-brand: self-test failed, the check cannot tell a wrong mark from the right one');
  process.exit(1);
}

const copies = ['web/src/Logo.tsx', 'web/public/logo.svg', 'web/public/favicon.svg', 'server/public.go'];
const failures = copies.flatMap((file) => problems(file, read(file)));

if (failures.length) {
  for (const f of [...new Set(failures)]) console.error(`check-brand: ${f}`);
  console.error('Copy the shapes from brand/mark.svg (see brand/README.md).');
  process.exit(1);
}
console.log(`check-brand: ${copies.length} copies of the mark match brand/mark.svg`);
