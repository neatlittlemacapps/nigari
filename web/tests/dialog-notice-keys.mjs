import assert from 'node:assert/strict';
import { eventually, withFixture } from './fixture.mjs';

// The small keyboard and screen reader fixes bundled in one pull request:
// #572 a confirmation is named, takes focus (Cancel when it destroys) and
// keeps Tab inside; #802 an arrow key in a ui/Dialog stays in the dialog;
// #933 a notice is read politely and only a failure interrupts, a toast holds
// while the pointer is on it and has Dismiss; #531 Filter and Sort say they
// open a popover and whether it is open; #745 Escape closes the Filter
// popover and a calendar's Settings row says "Date property".
await withFixture(async ({ page, base, path, api }) => {
  page.setDefaultTimeout(15000);
  const collectionId = path.split('/').pop();
  await page.locator('.collection-toolbar').waitFor();

  // ---- #572: the confirmation ----
  const ask = (danger) =>
    page.evaluate((danger) => {
      window.dispatchEvent(new CustomEvent('nigari:dialog', { detail: { kind: 'confirm', message: 'Delete this?', danger, confirmText: 'Delete', resolve: () => {} } }));
    }, danger);
  await ask(true);
  const confirm = page.getByRole('alertdialog', { name: 'Delete this?' });
  await confirm.waitFor();
  await eventually(() => page.evaluate(() => document.activeElement?.textContent === 'Cancel')).catch(() =>
    assert.fail('a destructive confirmation did not start on Cancel'),
  );
  const inConfirm = () => confirm.evaluate((d) => d.contains(document.activeElement));
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press(i % 2 ? 'Shift+Tab' : 'Tab');
    assert(await inConfirm(), `Tab ${i + 1} left the confirmation`);
  }
  await page.keyboard.press('Escape');
  await confirm.waitFor({ state: 'detached' });
  await ask(false);
  await confirm.waitFor();
  await eventually(() => page.evaluate(() => document.activeElement?.textContent === 'Delete')).catch(() =>
    assert.fail('a plain confirmation did not start on its answer'),
  );
  await page.keyboard.press('Escape');
  await confirm.waitFor({ state: 'detached' });

  // ---- #802: arrows in a ui/Dialog ----
  await page.locator('.user-menu-btn').click();
  await page.getByRole('menuitem', { name: 'Instance settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Instance settings' });
  await dialog.waitFor();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).focus();
  for (const key of ['ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight']) {
    await page.keyboard.press(key);
    assert(await dialog.evaluate((d) => d.contains(document.activeElement)), `${key} on Cancel left the dialog`);
  }
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });

  // ---- #933: notices ----
  const polite = page.locator('.toast-say[aria-live="polite"]');
  const assertive = page.locator('.toast-say[aria-live="assertive"]');
  const toast = (kind, message) =>
    page.evaluate(([kind, message]) => {
      window.dispatchEvent(new CustomEvent('nigari:toast', { detail: { kind, message } }));
    }, [kind, message]);
  await toast('info', 'Version restored');
  await eventually(async () => (await polite.textContent()) === 'Version restored');
  assert.equal(await assertive.textContent(), '', 'a notice went to the assertive region');
  assert.equal(await page.locator('.toaster[aria-live]').count(), 0, 'the visible toaster is itself a live region again');
  await toast('error', 'Change not saved');
  await eventually(async () => (await assertive.textContent()) === 'Change not saved');
  // Held while the pointer is on it: still there after its 4 seconds.
  const first = page.locator('.toast').filter({ hasText: 'Version restored' });
  await first.hover();
  await page.waitForTimeout(5000);
  assert(await first.isVisible(), 'a toast under the pointer went away');
  await first.getByRole('button', { name: 'Dismiss' }).click();
  await first.waitFor({ state: 'detached' });
  // Escape on a toast's button closes that toast.
  const second = page.locator('.toast').filter({ hasText: 'Change not saved' });
  await second.getByRole('button', { name: 'Dismiss' }).focus();
  await page.keyboard.press('Escape');
  await second.waitFor({ state: 'detached' });
  await page.mouse.move(5, 5);

  // ---- #531 and #745: Filter, Sort and the calendar's date ----
  await page.goto(`${base}/p/${collectionId}`);
  const bar = page.locator('.collection-toolbar');
  const filter = bar.getByRole('button', { name: /^Filter/ }).first();
  const sort = bar.getByRole('button', { name: 'Sort', exact: true });
  for (const b of [filter, sort]) {
    assert.equal(await b.getAttribute('aria-haspopup'), 'dialog');
    assert.equal(await b.getAttribute('aria-expanded'), 'false');
  }
  await filter.click();
  await page.locator('.fs-popover').waitFor();
  assert.equal(await filter.getAttribute('aria-expanded'), 'true');
  await page.keyboard.press('Escape');
  await page.locator('.fs-popover').waitFor({ state: 'detached' }).catch(() => assert.fail('Escape did not close the Filter popover'));
  assert.equal(await filter.getAttribute('aria-expanded'), 'false');

  const { schema, views } = await api('GET', path);
  const dateProp = schema.find((p) => p.type === 'date') ?? { id: 'when', name: 'Date', type: 'date' };
  await api('PUT', path, {
    schema: schema.some((p) => p.type === 'date') ? schema : [...schema, dateProp],
    views: [...views, { id: 'cal', name: 'Calendar', type: 'calendar', dateProp: dateProp.id }],
  });
  await page.goto(`${base}/p/${collectionId}`);
  await page.locator('.view-tab', { hasText: 'Calendar' }).first().click();
  await bar.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Date property/ }).waitFor().catch(() => assert.fail('no "Date property" row in a calendar’s Settings'));
  await page.keyboard.press('Escape');

  // ---- #745: on a phone a submenu is a sheet too, its rows 44px ----
  await page.setViewportSize({ width: 390, height: 844 });
  await bar.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Open rows in/ }).click();
  const sub = page.locator('.ui-menu-positioner[data-sheet]').filter({ has: page.getByRole('menuitemradio') }).last();
  await sub.waitFor().catch(() => assert.fail('a submenu on a phone is not a sheet'));
  const heights = await sub.locator('.ui-menu-item').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  assert(heights.length && heights.every((h) => h >= 44), `sheet rows under 44px: ${heights}`);

  console.log('Dialog, notice and keyboard fixes: confirmation, dialog arrows, toasts, Filter and Sort, calendar date, phone submenus passed.');
});
