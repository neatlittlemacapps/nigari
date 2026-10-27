import assert from 'node:assert/strict';
import { eventually, withFixture } from './fixture.mjs';

// The instance settings dialog is the first screen built from web/src/ui/
// (spec 001, US1). Its old markup trapped no focus: Tab walked out of the
// dialog into the page behind it, and closing it left focus on nothing,
// because the menu item that opened it was gone. What must hold now, from the
// keyboard alone: focus starts inside, Tab stays inside, Escape closes and
// hands focus back to the user menu's button, the dialog is announced by its
// title, and the webhook form still works (Space ticks an event; adding a
// webhook shows its secret once).
await withFixture(async ({ page }) => {
  page.setDefaultTimeout(15000);

  const menuButton = page.locator('.user-menu-btn');
  await menuButton.focus();
  await page.keyboard.press('Enter');
  const item = page.getByRole('button', { name: 'Instance settings' });
  await item.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Instance settings' });
  await dialog.waitFor();
  const inside = () => dialog.evaluate((d) => d.contains(document.activeElement));
  await eventually(inside);
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    await eventually(inside).catch(() => assert.fail(`Tab ${i + 1} left the settings dialog`));
  }

  // The webhook tab, by keyboard.
  await dialog.getByRole('button', { name: 'Webhooks', exact: true }).focus();
  await page.keyboard.press('Enter');
  const trashed = dialog.getByRole('checkbox', { name: /a page is thrown away/ });
  await trashed.focus();
  await page.keyboard.press('Space');
  assert.equal(await trashed.getAttribute('aria-checked'), 'true', 'Space did not tick the event');

  const address = dialog.getByRole('textbox', { name: 'Address to call' });
  await address.fill('https://hooks.example.test/salt');
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await dialog.getByText('Copy this secret now. It is shown only once.').waitFor();
  await dialog.getByRole('button', { name: 'I have it' }).click();
  await dialog.getByText('Copy this secret now. It is shown only once.').waitFor({ state: 'hidden' });
  await dialog.getByText('https://hooks.example.test/salt').waitFor();

  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await eventually(() => menuButton.evaluate((el) => el === document.activeElement)).catch(() =>
    assert.fail('Escape did not return focus to the user menu'),
  );
});
