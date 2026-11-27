// Asserts which picture a gallery card shows (src/cardImage.ts, spec 028 D6).
//
//   node scripts/check-cardimage.mjs
//
// Same shape as check-filesvalue.mjs. The ones that would hurt most: the
// Automatic order (FR-002), a fixed choice falling through to another source
// (FR-003), a stale choice drawn as empty instead of Automatic (FR-009), and
// a typed URL value that is not an image address reaching an <img>.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const tmp = mkdtempSync(join(tmpdir(), 'nigari-cardimage-'));
const bundle = join(tmp, 'cardImage.mjs');

try {
  try {
    execFileSync(
      join(web, 'node_modules/esbuild/bin/esbuild'),
      [join(web, 'src/cardImage.ts'), '--bundle', '--format=esm', '--outfile=' + bundle],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
  } catch (e) {
    console.error(String(e.stderr ?? e));
    process.exit(1);
  }
  const { cardImageFor, cardImageChoice, cardImageProps } = await import(bundle);

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

  const schema = [
    { id: 'notes', name: 'Notes', type: 'text' },
    { id: 'docs', name: 'Docs', type: 'files' },
    { id: 'photos', name: 'Photos', type: 'files' },
    { id: 'link', name: 'Link', type: 'url' },
    { id: 'kind', name: 'Kind', type: 'select' },
  ];
  const img = (url) => ({ kind: 'image', url });
  const placeholder = { kind: 'placeholder' };
  const pdf = { url: '/files/q1.pdf', name: 'quote.pdf' };
  const photo = { url: '/files/p1.jpg', name: 'front.jpg' };
  const row = (o) => ({ icon: '', cover: '', props: {}, firstImage: '', ...o });
  const full = row({ icon: '🍋', cover: '/files/cover.png', firstImage: '/files/body.png', props: { photos: [photo], link: 'https://example.com/a.webp' } });

  // Automatic (FR-002): property image, cover, icon, content image, placeholder.
  check('auto: a property image first', cardImageFor(full, undefined, schema), img('/files/p1.jpg'));
  check('auto: past a files property with no image', cardImageFor(row({ props: { docs: [pdf], photos: [pdf, photo] } }), undefined, schema), img('/files/p1.jpg'));
  check('auto: a URL property is not part of it', cardImageFor(row({ props: { link: 'https://example.com/a.png' } }), undefined, schema), placeholder);
  check('auto: the cover', cardImageFor(row({ cover: '/files/cover.png', icon: '🍋', firstImage: '/files/body.png' }), undefined, schema), img('/files/cover.png'));
  check('auto: a gradient cover', cardImageFor(row({ cover: 'gradient:linear-gradient(red, blue)' }), undefined, schema), { kind: 'gradient', css: 'linear-gradient(red, blue)' });
  check('auto: the icon before the content', cardImageFor(row({ icon: '🍋', firstImage: '/files/body.png' }), undefined, schema), { kind: 'icon', icon: '🍋' });
  check('auto: the content image', cardImageFor(row({ firstImage: '/files/body.png' }), undefined, schema), img('/files/body.png'));
  check('auto: an outside content image', cardImageFor(row({ firstImage: 'https://example.com/x.jpg' }), undefined, schema), img('https://example.com/x.jpg'));
  check('auto: nothing', cardImageFor(row({}), undefined, schema), placeholder);
  check('auto: a row without firstImage', cardImageFor({ icon: '', cover: '', props: {} }, undefined, schema), placeholder);

  // A fixed choice uses that source only (FR-003).
  check('cover', cardImageFor(full, 'cover', schema), img('/files/cover.png'));
  check('cover, none there', cardImageFor(row({ icon: '🍋', firstImage: '/files/body.png' }), 'cover', schema), placeholder);
  check('content', cardImageFor(full, 'content', schema), img('/files/body.png'));
  check('content, none there', cardImageFor(row({ cover: '/files/c.png' }), 'content', schema), placeholder);
  check('a files property', cardImageFor(full, 'photos', schema), img('/files/p1.jpg'));
  check('a files property with no image', cardImageFor(row({ cover: '/files/c.png', props: { docs: [pdf] } }), 'docs', schema), placeholder);
  check('a URL property', cardImageFor(full, 'link', schema), img('https://example.com/a.webp'));
  check('a URL property, an upload', cardImageFor(row({ props: { link: '/files/x.png' } }), 'link', schema), img('/files/x.png'));
  check('a URL that is no image', cardImageFor(row({ props: { link: 'https://example.com/page' } }), 'link', schema), placeholder);
  check('a javascript: address', cardImageFor(row({ props: { link: 'javascript:alert(1)//.png' } }), 'link', schema), placeholder);
  check('a URL breaking out of url()', cardImageFor(row({ props: { link: 'https://x.test/a.png") , url("https://y.test/b.png' } }), 'link', schema), placeholder);
  check('a path escaping /files/', cardImageFor(row({ props: { link: '/files/../secret.png' } }), 'link', schema), placeholder);
  check('a content image not an image address', cardImageFor(row({ firstImage: 'data:image/png;base64,xx' }), 'content', schema), placeholder);
  check('none', cardImageFor(full, 'none', schema), { kind: 'none' });

  // Stale or unknown is Automatic (FR-009).
  check('a deleted property', cardImageFor(full, 'gone', schema), img('/files/p1.jpg'));
  check('a property now a select', cardImageFor(full, 'kind', schema), img('/files/p1.jpg'));
  check('choice: a deleted property', cardImageChoice('gone', schema), 'auto');
  check('choice: absent', cardImageChoice(undefined, schema), 'auto');
  check('choice: a number', cardImageChoice(3, schema), 'auto');
  check('choice: kept', cardImageChoice('link', schema), 'link');
  check('choice: none', cardImageChoice('none', schema), 'none');

  // The picker lists Files & media and URL properties, in schema order (FR-006).
  check('the picker', cardImageProps(schema).map((p) => p.id), ['docs', 'photos', 'link']);

  console.log(`  card image: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
