import assert from 'node:assert/strict';
import { withFixture } from './fixture.mjs';

// The templates menu beside New and the view options menu (…) are opened from
// a database toolbar that scrolls sideways on a phone. Drawn inside it, both
// were clipped to a white rim under the buttons: the page dimmed and nothing
// could be chosen (found on an iPhone, 2026-10-26). They are portaled now
// (src/anchoredMenu.ts). What must hold: the whole menu is on screen and is
// the thing a tap at its centre lands on, on a phone and on a desktop.
await withFixture(async ({ page, base, path }) => {
  page.setDefaultTimeout(15000);
  const collectionId = path.split('/').pop();

  const reachable = async (menuSelector, label, size) => {
    const menu = page.locator(menuSelector).last();
    await menu.waitFor();
    const box = await menu.boundingBox();
    assert(box && box.height > 40, `${label} (${size}): the menu is ${box?.height ?? 0}px high`);
    assert(box.y >= 0 && box.y + box.height <= page.viewportSize().height + 1, `${label} (${size}): the menu leaves the screen`);
    const hit = await page.evaluate(([sel, x, y]) => {
      const el = document.elementFromPoint(x, y);
      return !!el && !!el.closest(sel);
    }, [menuSelector, box.x + box.width / 2, box.y + box.height / 2]);
    assert(hit, `${label} (${size}): something else covers the menu`);
    await page.keyboard.press('Escape');
    await page.locator('.fs-backdrop').last().click({ position: { x: 2, y: 2 } }).catch(() => {});
  };

  for (const [size, viewport] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1200, height: 900 }]]) {
    await page.setViewportSize(viewport);
    await page.goto(`${base}/p/${collectionId}`);
    const templates = page.getByRole('button', { name: 'Templates', exact: true });
    await templates.scrollIntoViewIfNeeded();
    await templates.click();
    await reachable('.dbt-menu', 'templates', size);

    const options = page.getByRole('button', { name: 'View options', exact: true });
    await options.scrollIntoViewIfNeeded();
    await options.click();
    await reachable('.view-tab-menu', 'view options', size);
  }

  console.log('Toolbar menus: templates and view options open in full, on a phone and a desktop.');
});
