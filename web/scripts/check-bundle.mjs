// Caps the main chunk, gzipped, at bundleGzip in web/tokens/budgets.json.
//
//   npx vite build && node scripts/check-bundle.mjs
//
// The design system adds a headless component library (Base UI) to a bundle
// that already carries Mantine for the editor. Imported per component it
// should cost little, but "should" is how bundles grow: the main chunk was
// 528,706 B gzip on main at 2a28bc4, and spec 001 allows the whole feature
// 60 KB on top (research P8, FR-019). The plan's first baseline, 790,888 B,
// was a measuring mistake that this script, run for the first time, exposed. Run after a build, so not part of npm run check,
// which does not build; CI and the gate run it when web/dist exists.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const assets = join(web, 'dist/assets');
const { bundleGzip } = JSON.parse(readFileSync(join(web, 'tokens/budgets.json'), 'utf8'));

let files;
try {
  files = readdirSync(assets).filter((f) => /^index-.*\.js$/.test(f));
} catch {
  console.error('bundle: no web/dist/assets. Build first: npx vite build');
  process.exit(1);
}
if (!files.length) {
  console.error('bundle: no index-*.js in web/dist/assets');
  process.exit(1);
}

// The main chunk is the largest index-*.js; Mermaid and the icon sets are
// split into chunks of their own already.
const main = files.map((f) => join(assets, f)).sort((a, b) => statSync(b).size - statSync(a).size)[0];
const raw = readFileSync(main);
const gz = gzipSync(raw, { level: 9 }).length;
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

if (gz > bundleGzip) {
  console.error(`bundle: main chunk is ${gz.toLocaleString('en')} B gzip (${kb(gz)}), over its cap of ${bundleGzip.toLocaleString('en')} B. Import components per module (@base-ui/react/dialog), not from the package root.`); // i18n-ok: build output
  process.exit(1);
}
console.log(`  bundle: main chunk ${raw.length.toLocaleString('en')} B, ${gz.toLocaleString('en')} B gzip, ${kb(bundleGzip - gz)} under the cap`); // i18n-ok: build output
