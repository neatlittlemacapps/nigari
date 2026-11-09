// Renders every raster icon nigari ships from the owner's artwork in brand/
// (#322): the home-screen icons, favicon.ico and the desktop app's icons.
//
//   node scripts/build-app-icons.mjs
//
// Deliberately NOT part of the build, for the same reason the wiki screenshots
// are not: it needs a browser to rasterise, and `npm ci` in the Docker image
// must not drag one in. Install it when you need it:
//
//   npm i --no-save playwright && npx playwright install chromium
//
// The output is committed, so a normal build and a normal checkout have the
// icons already. Run this again only when a file in brand/ changes.
//
// ---------------------------------------------------------------------------
// What the icons have to satisfy
//
//   1. Home screen (iOS, Android): the tile is a plain square with no rounding
//      of our own. iOS and Android put their own mask on it, and an icon that
//      is already rounded gets rounded twice, which shows as a pale halo.
//      Since iOS 26 the home screen also re-renders icons for Dark, Clear and
//      Tinted; the treatment is driven by the `apple-touch-icon` link in the
//      HTML head, so that link stays.
//   2. Every file is opaque. iOS composites an alpha icon onto black on some
//      versions and white on others.
//   3. Maskable (Android): a circular crop keeps only the middle 80 %. The
//      owner's mark already sits inside that circle (its farthest point is
//      38 % of the width from the centre, measured from brand/icon-light.svg),
//      so the maskable icon is the same picture, not a shrunk copy.
//   4. Desktop (macOS): the one place that is NOT a plain square. macOS does
//      not round an app icon or shrink it; Apple's grid puts an 824 px tile
//      with rounded corners inside a 1024 px field. Drawn edge to edge it looks
//      bigger than every other icon in the dock.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const pub = join(repo, 'web', 'public');
const desktop = join(repo, 'desktop', 'build');
const brand = (f) => readFileSync(join(repo, 'brand', f), 'utf8');

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error(
    '\n  playwright is not installed — it is deliberately not a dependency.\n' +
      '  npm i --no-save playwright && npx playwright install chromium\n',
  );
  process.exit(1);
}

const LIGHT = brand('icon-light.svg');
const DARK = brand('icon-dark.svg');
const MARK = brand('mark.svg');

const sized = (svg) => svg.replace(/<svg([^>]*?)( width="\d+" height="\d+")?>/, '<svg$1 style="width:100%;height:100%;display:block">');

// A square icon: the brand file, scaled to `size`, opaque.
function square(size, svg) {
  return `<!doctype html><html><body style="margin:0;background:#fff">
    <div style="width:${size}px;height:${size}px">${sized(svg)}</div></body></html>`;
}

// The macOS icon: the square on Apple's grid. 824 px tile, 100 px margin,
// corners rounded at 185 px (what the previous icon used, close to Apple's
// own template), and the soft drop shadow macOS icons carry. Transparent
// around the tile, which is the one place an icon may be.
function mac(size, svg) {
  const k = size / 1024;
  return `<!doctype html><html><body style="margin:0;background:transparent">
    <div style="width:${size}px;height:${size}px;position:relative">
      <div style="position:absolute;left:${100 * k}px;top:${100 * k}px;width:${824 * k}px;height:${824 * k}px;
                  border-radius:${185 * k}px;overflow:hidden;
                  box-shadow:0 ${10 * k}px ${32 * k}px rgba(0,0,0,.28)">${sized(svg)}</div>
    </div></body></html>`;
}

const browser = await chromium.launch();

async function render(size, html, transparent = false) {
  const p = await browser.newPage({ viewport: { width: size, height: size } });
  await p.setContent(html);
  const buf = await p.screenshot({ type: 'png', omitBackground: transparent });
  await p.close();
  return buf;
}

// An .ico that holds PNGs: valid since Windows Vista and read by every
// browser. One file, three sizes, so the tab icon is drawn at its own size
// instead of scaled down from a big one.
function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(({ size, buf }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, e);
    head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt16LE(1, e + 4); // colour planes
    head.writeUInt16LE(32, e + 6); // bits per pixel
    head.writeUInt32LE(buf.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += buf.length;
  });
  return Buffer.concat([head, ...pngs.map((p) => p.buf)]);
}

mkdirSync(pub, { recursive: true });
const out = [];
for (const [file, size] of [
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['icon-maskable-512.png', 512],
]) {
  writeFileSync(join(pub, file), await render(size, square(size, LIGHT)));
  out.push(`web/public/${file} (${size}×${size})`);
}

// The favicon.ico fallback is the bare mark: a tab draws it on its own
// background, and at 16 px a tile would leave the mark a few pixels wide.
const icoPngs = [];
for (const size of [16, 32, 48]) {
  const html = `<!doctype html><html><body style="margin:0;background:transparent">
    <div style="width:${size}px;height:${size}px">${sized(MARK)}</div></body></html>`;
  icoPngs.push({ size, buf: await render(size, html, true) });
}
writeFileSync(join(pub, 'favicon.ico'), ico(icoPngs));
out.push('web/public/favicon.ico (16, 32, 48)');

for (const [file, svg] of [
  ['icon.png', LIGHT],
  ['icon-dark.png', DARK],
]) {
  writeFileSync(join(desktop, file), await render(1024, mac(1024, svg), true));
  out.push(`desktop/build/${file} (1024×1024, Apple grid)`);
}

await browser.close();
for (const line of out) console.log(`  ok    ${line}`);
