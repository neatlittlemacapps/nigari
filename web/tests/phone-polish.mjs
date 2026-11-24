import assert from 'node:assert/strict';
import { eventually, withFixture } from './fixture.mjs';

// Three small readability fixes found by the ux-ui-audits of 2026-11-23.
//
// #924: every toast was white on the danger colour, 2.3:1 in dark, and its
// button kept the page's text colour, 1.8:1 there. A notice now is ink (the
// pill colours) and a failure the destructive colour with its paired text,
// and the button takes the toast's colour; each pair must reach 4.5:1 in both
// themes.
// #921: in a document on a phone the view picker was squeezed to "B…" by
// Group and New; both are icons there now and the picker keeps its floor.
// #911: an empty date in a list line was an invisible 10×21px button; a list
// line shows nothing for it now, as for every other empty value.
// SHOTS=<dir> writes screenshots for a look by eye.

const shots = process.env.SHOTS;

const contrastOf = (el) => {
  const lum = (color) => {
    const rgb = color.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  // The colour behind el: its own, or the first ancestor's that has one.
  let n = el;
  let bg = 'rgba(0, 0, 0, 0)';
  while (n && /rgba\(0, 0, 0, 0\)|transparent/.test(bg)) {
    bg = getComputedStyle(n).backgroundColor;
    n = n.parentElement;
  }
  const [a, b] = [lum(getComputedStyle(el).color), lum(bg)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

await withFixture(async ({ page, context, api, base, workspace }) => {
  page.setDefaultTimeout(15000);

  const c = await api('POST', '/api/pages', { title: 'Tasks', type: 'collection', workspaceId: workspace.id });
  await api('PUT', `/api/collections/${c.id}`, {
    schema: [
      { id: 'stage', name: 'Stage', type: 'select', options: [{ id: 'a', name: 'A', color: '#337ea9' }] },
      { id: 'due', name: 'Due', type: 'date' },
    ],
    views: [
      { id: 'board', name: 'Board', type: 'board' },
      { id: 'list', name: 'List', type: 'list', visibleProps: ['stage', 'due'] },
    ],
  });
  await api('POST', '/api/pages', { parentId: c.id, title: 'No date yet', props: { stage: 'a' } });
  const doc = await api('POST', '/api/pages', { title: 'Plan', workspaceId: workspace.id });
  await api('PATCH', `/api/pages/${doc.id}`, {
    content: [{ id: 'db1', type: 'database', props: { collectionId: c.id }, content: [], children: [] }],
  });

  const setTheme = (theme) => page.evaluate((th) => { document.documentElement.dataset.theme = th; }, theme);
  const fire = (kind, withAction) =>
    page.evaluate(([k, a]) => {
      const detail = { message: k === 'error' ? 'Change not saved' : 'A new version is available', kind: k };
      if (a) detail.action = { label: 'Reload', run: () => {} };
      window.dispatchEvent(new CustomEvent('nigari:toast', { detail }));
    }, [kind, withAction]);

  // ---- #924: toasts ---------------------------------------------------------
  await page.goto(`${base}/p/${doc.id}`);
  await page.locator('.bn-db-embed').first().waitFor();
  for (const theme of ['light', 'dark']) {
    await setTheme(theme);
    for (const kind of ['info', 'error']) {
      await fire(kind, true);
      // By its message: since #933 a toast stays while the pointer is on the
      // toaster, so the app's own version notice can still be the last one.
      const toast = page.locator('.toast').filter({ hasText: kind === 'error' ? 'Change not saved' : /^A new version is available(?!:)/ }).last();
      await toast.waitFor();
      assert.equal(await toast.evaluate((n) => n.classList.contains('toast-error')), kind === 'error');
      // The warning mark belongs to failures only.
      assert.equal((await toast.textContent()).includes('⚠'), kind === 'error', `${theme} ${kind}: mark`);
      const text = await toast.evaluate(contrastOf);
      const button = await toast.getByRole('button', { name: 'Reload' }).evaluate(contrastOf);
      assert(text >= 4.5, `${theme} ${kind} toast text ${text.toFixed(2)}:1`);
      assert(button >= 4.5, `${theme} ${kind} toast button ${button.toFixed(2)}:1`);
      if (shots) await page.screenshot({ path: `${shots}/toast-desktop-${theme}-${kind}.png` });
      await toast.getByRole('button', { name: 'Reload' }).click();
    }
  }

  // ---- #921: the view picker in a document on a phone -----------------------
  // A touch phone, as someone holds it: there the embed's buttons are always
  // shown (spec 012), which is when they squeezed the picker.
  const phone = await context.browser().newContext({
    storageState: await context.storageState(), hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 }, locale: 'en-US',
  });
  const touch = await phone.newPage();
  for (const theme of ['light', 'dark']) {
    await touch.goto(`${base}/p/${doc.id}`);
    await touch.evaluate((th) => { document.documentElement.dataset.theme = th; }, theme);
    const page = touch;
    const toolbar = page.locator('.bn-db-embed .collection-toolbar').first();
    const picker = toolbar.locator('.view-picker');
    await picker.waitFor();
    // Group and New are icons with their names for a screen reader.
    await toolbar.getByRole('button', { name: 'Group', exact: true }).waitFor();
    await toolbar.getByRole('button', { name: 'New', exact: true }).waitFor();
    assert.equal((await toolbar.getByRole('button', { name: 'New', exact: true }).textContent()).trim(), '');
    const name = picker.locator('.view-picker-name');
    assert.equal((await name.textContent()).trim(), 'Board');
    await eventually(async () => name.evaluate((n) => n.scrollWidth <= n.clientWidth));
    if (shots) await page.screenshot({ path: `${shots}/picker-phone-${theme}.png` });

    // A toast on a phone stays inside the screen.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('nigari:toast', { detail: { message: 'Change not saved', kind: 'error' } })));
    const box = await page.locator('.toast').last().boundingBox();
    assert(box.x >= 0 && box.x + box.width <= 390, `toast inside the screen: ${JSON.stringify(box)}`);
    // And above the update banner, which a test build shows (no version set).
    const banner = page.locator('.update-banner');
    if (await banner.count()) {
      const b = await banner.boundingBox();
      assert(box.y + box.height <= b.y, `toast over the update banner: ${JSON.stringify({ box, b })}`);
    }
    if (shots) await page.screenshot({ path: `${shots}/toast-phone-${theme}.png` });
  }
  await phone.close();

  // ---- #911: an empty date in a list line ----------------------------------
  for (const [width, height] of [[1280, 900], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.goto(`${base}/p/${c.id}`);
    if (width > 400) await page.locator('.view-tab', { hasText: 'List' }).click();
    else {
      await page.locator('.view-picker').click();
      await page.getByRole('menuitemradio', { name: 'List' }).click();
    }
    const row = page.locator('.list-row', { hasText: 'No date yet' });
    await row.waitFor();
    // The select still shows; the empty date offers no button of its own.
    await row.locator('.list-row-prop').first().locator('.select-chip, .prop-select, span').first().waitFor();
    assert.equal(await row.getByRole('button', { name: 'Edit: Due' }).count(), 0, `${width}px: no tiny date button`);
    // Every button left in the line is at least 24×24 (WCAG 2.5.8).
    const small = await row.locator('button').evaluateAll((bs) =>
      bs.map((b) => b.getBoundingClientRect()).filter((r) => r.width > 0 && (r.width < 24 || r.height < 24)).length,
    );
    assert.equal(small, 0, `${width}px: ${small} button(s) under 24px in the list line`);
  }

  console.log('Phone polish: toast contrast in both themes, view picker readable in a document, no tiny empty date in a list passed.');
});
