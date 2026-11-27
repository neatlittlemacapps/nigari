import assert from 'node:assert/strict';
import { eventually, withFixture } from './fixture.mjs';

// A gallery's card image (spec 028, US1 and US2). What must hold:
// - Automatic: a Files & media image, then the cover, the icon, the first
//   image in the content, then the plain panel (FR-002);
// - Settings › Card image › Page content, a property, No image: each card
//   takes only that source, and the choice is stored on the view (FR-003,
//   FR-004) and kept over a reload;
// - a picture that fails to load shows the panel, not a broken image;
// - a picture fills the card's top, cropped (FR-008);
// - at phone width the same menu is a sheet and the choice still applies.

// A 1×1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

await withFixture(async ({ page, context, api, base, workspace }) => {
  page.setDefaultTimeout(15000);
  const upload = async (name) => {
    const res = await context.request.post(`${base}/api/upload`, { multipart: { file: { name, mimeType: 'image/png', buffer: PNG } } });
    assert(res.ok(), `upload ${name}: HTTP ${res.status()}`);
    return (await res.json()).url;
  };
  const [cover, body, photo] = [await upload('cover.png'), await upload('body.png'), await upload('photo.png')];

  const db = await api('POST', '/api/pages', { title: 'Products', type: 'collection', workspaceId: workspace.id });
  const path = `/api/collections/${db.id}`;
  await api('PUT', path, {
    schema: [
      { id: 'photos', name: 'Photos', type: 'files' },
      { id: 'link', name: 'Link', type: 'url' },
    ],
    views: [{ id: 'g', name: 'Cards', type: 'gallery' }],
  });
  const image = (url) => ({ type: 'image', props: { url }, content: [], children: [] });
  const make = async (title, patch) => {
    const r = await api('POST', '/api/pages', { parentId: db.id, title, props: {} });
    if (patch) await api('PATCH', `/api/pages/${r.id}`, patch);
    return r.id;
  };
  await make('Covered', { cover, content: [image(body)] });
  await make('Iconed', { icon: '🍋', content: [image(body)] });
  await make('Content only', { content: [image(body)] });
  await make('Photographed', { cover: 'gradient:linear-gradient(red, blue)', propsPatch: { photos: [{ url: photo, name: 'photo.png' }] } });
  await make('Plain');
  await make('Broken', { cover: '/files/no-such-file.png' });

  const card = (title) => page.locator('.gallery-card', { has: page.locator('.gallery-title', { hasText: new RegExp(`^(\\S+ )?${title}$`) }) });
  // What a card shows: the image's address, 'icon', 'panel', 'gradient' or 'none'.
  const shows = async (title) =>
    card(title).evaluate((el) => {
      const cover = el.querySelector('.gallery-cover');
      if (!cover) return 'none';
      const img = cover.querySelector('img');
      if (img) return new URL(img.src).pathname;
      if (cover.getAttribute('style')?.includes('gradient')) return 'gradient';
      const icon = cover.querySelector('.gallery-cover-icon');
      return icon && icon.textContent.includes('🍋') ? 'icon' : 'panel';
    });
  const all = async () => {
    const out = {};
    for (const t of ['Covered', 'Iconed', 'Content only', 'Photographed', 'Plain', 'Broken']) out[t] = await shows(t);
    return out;
  };
  // Picks a choice, and answers what the Card image item said before it.
  const pick = async (choice) => {
    await page.locator('.collection-toolbar').getByRole('button', { name: 'Settings', exact: true }).click();
    const item = page.getByRole('menuitem', { name: /^Card image/ });
    const before = await item.innerText();
    await item.click();
    await page.getByRole('menuitemradio', { name: choice, exact: true }).click();
    return before;
  };
  const stored = async () => (await api('GET', path)).views.find((v) => v.id === 'g').cardImage;

  await page.goto(`${base}/p/${db.id}`);
  await page.locator('.gallery').waitFor();
  // The broken cover's load error has to arrive before it reads as a panel.
  await eventually(async () => (await shows('Broken')) === 'panel');

  // ---- Automatic ----
  assert.deepEqual(await all(), {
    Covered: cover,
    Iconed: 'icon',
    'Content only': body,
    Photographed: photo,
    Plain: 'panel',
    Broken: 'panel',
  }, 'Automatic does not follow property image, cover, icon, content, panel');
  // The picture fills the card's top, cropped.
  const fit = await card('Covered').locator('.gallery-cover img').evaluate((img) => {
    const box = img.parentElement.getBoundingClientRect();
    const r = img.getBoundingClientRect();
    return { fit: getComputedStyle(img).objectFit, w: Math.round(r.width - box.width), h: Math.round(r.height - box.height) };
  });
  assert.deepEqual(fit, { fit: 'cover', w: 0, h: 0 }, 'the picture does not fill the card top');
  // The title's small icon is drawn only when the picture is not the icon.
  assert.equal(await card('Iconed').locator('.gallery-title .inline-icon').count(), 0, 'the icon is drawn twice');

  // ---- Page content ----
  await pick('Page content');
  await eventually(async () => (await stored()) === 'content');
  assert.deepEqual(await all(), {
    Covered: body,
    Iconed: body,
    'Content only': body,
    Photographed: 'panel',
    Plain: 'panel',
    Broken: 'panel',
  }, 'Page content takes another source');

  // ---- a property ----
  await pick('Photos');
  await eventually(async () => (await stored()) === 'prop:photos');
  await eventually(async () => (await shows('Covered')) === 'panel');
  assert.equal(await shows('Photographed'), photo, 'the chosen property is not drawn');
  assert.equal(await shows('Iconed'), 'panel', 'a row with nothing in the property is not the panel');

  // ---- No image, kept over a reload ----
  // The Settings item names the choice it holds.
  assert.match(await pick('No image'), /Photos/, 'Card image does not show its value');
  await eventually(async () => (await stored()) === 'none');
  await page.reload();
  await page.locator('.gallery').waitFor();
  assert.equal(await page.locator('.gallery-cover').count(), 0, 'No image still draws image areas');

  // ---- a stale choice reads as Automatic ----
  await api('PUT', path, { schema: [{ id: 'link', name: 'Link', type: 'url' }] });
  await api('PUT', path, { views: [{ id: 'g', name: 'Cards', type: 'gallery', cardImage: 'none' }] });
  // Turn the stored choice into a deleted property's id, as the server keeps
  // one on a view nobody touched.
  await api('PUT', path, { schema: [{ id: 'photos', name: 'Photos', type: 'files' }, { id: 'link', name: 'Link', type: 'url' }] });
  await api('PUT', path, { views: [{ id: 'g', name: 'Cards', type: 'gallery', cardImage: 'photos' }] });
  await api('PUT', path, { schema: [{ id: 'link', name: 'Link', type: 'url' }] });
  await page.reload();
  await page.locator('.gallery').waitFor();
  assert.equal(await stored(), 'prop:photos', 'the stale choice was not kept on the server');
  assert.equal(await shows('Covered'), cover, 'a stale choice is not drawn as Automatic');

  // ---- Automatic again, at phone width ----
  await page.setViewportSize({ width: 390, height: 844 });
  await pick('Automatic');
  await eventually(async () => (await stored()) === undefined);
  assert.equal(await shows('Content only'), body, 'Automatic at phone width');
});
