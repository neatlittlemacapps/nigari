import assert from 'node:assert/strict';
import { eventually, withFixture } from './fixture.mjs';

// A database in a document stays quiet until it is reached for (spec 012, US5,
// #280): its toolbar's buttons are hidden at rest and keep their box, appear
// on hover and when focus enters (one Tab from the view reaches them, SC-005),
// stay while a popover opened from them is open, are always shown on a touch
// screen, and fold per embed. A filter of the view still says so at rest
// ("Filtered"), and a database's own page never folds its toolbar.
//
// Before this the buttons folded only while no filter was on, and faded away
// under an open filter popover once the pointer left for it.

await withFixture(async ({ page, context, api, base, workspace, path }) => {
  page.setDefaultTimeout(15000);
  const collectionId = path.split('/').pop();
  // The fixture's table view filters on "Status is To do": filtered at rest.
  const doc = await api('POST', '/api/pages', { title: 'Two databases', workspaceId: workspace.id });
  await api('PATCH', `/api/pages/${doc.id}`, {
    content: [
      { id: 'db1', type: 'database', props: { collectionId }, content: [], children: [] },
      { id: 'p1', type: 'paragraph', props: {}, content: [{ type: 'text', text: 'Between the two.', styles: {} }], children: [] },
      { id: 'db2', type: 'database', props: { collectionId }, content: [], children: [] },
    ],
  });
  await page.goto(`${base}/p/${doc.id}`);
  const embeds = page.locator('.bn-db-embed');
  await eventually(async () => (await embeds.count()) === 2);
  const first = embeds.nth(0);
  const second = embeds.nth(1);
  const actions = (embed) => embed.locator('.collection-actions');
  const opacity = (embed) => actions(embed).evaluate((el) => Number(getComputedStyle(el).opacity));
  const rest = async () => {
    // The window's corner: outside both embeds, and focus on nothing in them.
    await page.mouse.move(2, 2);
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  };
  await first.locator('.collection-actions').waitFor({ state: 'attached' });

  // ---- At rest: hidden, in its box, and "Filtered" said beside the tabs ----
  await rest();
  await eventually(async () => (await opacity(first)) === 0 && (await opacity(second)) === 0);
  const box = await actions(first).boundingBox();
  assert(box && box.width > 0 && box.height > 0, 'the folded buttons gave up their box');
  assert(await first.getByText('Filtered', { exact: true }).isVisible(), '"Filtered" is not shown at rest');
  assert(await actions(first).getByRole('button', { name: /Filter/ }).first().evaluate((b) => b.tabIndex >= 0), 'a folded button left the tab order');

  // ---- Hover shows them, in place; the other embed stays folded ----
  await first.hover();
  await eventually(async () => (await opacity(first)) === 1);
  assert.equal(await opacity(second), 0, 'the second embed unfolded with the first');
  assert.deepEqual(await actions(first).boundingBox(), box, 'the toolbar moved when its buttons appeared');
  assert.equal(await first.getByText('Filtered', { exact: true }).isVisible(), false, 'the marker stays while the buttons say it');

  // ---- One Tab from the view reaches them ----
  await rest();
  await eventually(async () => (await opacity(first)) === 0);
  // The ＋ follows the tabs now that an embed has views of its own (spec 014).
  await first.locator('.view-add').focus();
  await page.keyboard.press('Tab');
  assert(await page.evaluate(() => !!document.activeElement?.closest('.collection-actions')), 'one Tab from the view does not reach the buttons');
  await eventually(async () => (await opacity(first)) === 1);

  // ---- An open popover keeps them shown when the pointer leaves ----
  await rest();
  await first.hover();
  await actions(first).getByRole('button', { name: /Filter/ }).first().click();
  await page.locator('.fs-popover').first().waitFor();
  await rest();
  await page.waitForTimeout(400);
  assert.equal(await opacity(first), 1, 'the buttons folded under their open popover');
  await page.locator('.fs-backdrop').first().click({ position: { x: 2, y: 2 } });
  await page.locator('.fs-popover').first().waitFor({ state: 'hidden' });
  await rest();
  await eventually(async () => (await opacity(first)) === 0);

  // ---- Reduced motion: no fade ----
  // In seconds; the app's global reduced-motion rule writes a near-zero
  // duration rather than none, so "no fade" is anything under a millisecond.
  const fade = () => actions(first).evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration));
  assert((await fade()) >= 0.1, 'the buttons do not fade in');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert((await fade()) < 0.001, 'the fade runs under reduced motion');
  await page.emulateMedia({ reducedMotion: null });

  // ---- A database's own page never folds ----
  await page.goto(`${base}/p/${collectionId}`);
  await page.locator('.collection-actions').first().waitFor();
  await rest();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.collection-actions').first().evaluate((el) => Number(getComputedStyle(el).opacity)), 1, "a database's own toolbar folded");

  // ---- A touch screen: always shown ----
  const phone = await context.browser().newContext({
    storageState: await context.storageState(), hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 }, locale: 'en-US',
  });
  const touch = await phone.newPage();
  await touch.goto(`${base}/p/${doc.id}`);
  await touch.locator('.bn-db-embed .collection-actions').first().waitFor({ state: 'attached' });
  assert.equal(await touch.evaluate(() => matchMedia('(hover: none)').matches), true, 'the touch context still reports hover');
  assert.equal(await touch.locator('.bn-db-embed .collection-actions').first().evaluate((el) => Number(getComputedStyle(el).opacity)), 1, 'the buttons are folded on a touch screen');
  await phone.close();
});
console.log('Embed toolbar fold: hidden at rest in its box, hover, one Tab, open popover, reduced motion, own page, touch and two embeds passed.');
