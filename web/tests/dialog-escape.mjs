import assert from 'node:assert/strict';
import { eventually, withFixture } from './fixture.mjs';

// Escape closes every dialog, Tab stays inside it, and closing hands focus
// back (#134). The dialogs built by hand on useExclusiveModal decided their
// own keys, and 11 of 17 decided nothing: the Language & time dialog ignored
// Escape, and so did the profile, tokens, activity, calendar and two-factor
// dialogs from the user menu. modal.ts handles all three now. What must hold,
// from the keyboard alone, for each dialog the user menu opens: focus starts
// inside, a full round of Tab never leaves it, Escape closes it and focus is
// back on the user menu's button. And a confirmation on top of a dialog takes
// Escape for itself.
await withFixture(async ({ page }) => {
  page.setDefaultTimeout(15000);
  const menuButton = page.locator('.user-menu-btn');

  const open = async (item) => {
    await menuButton.focus();
    await page.keyboard.press('Enter');
    const button = page.getByRole('button', { name: item, exact: true });
    await button.focus();
    await page.keyboard.press('Enter');
  };
  const top = () => page.locator('.modal-overlay').last();
  const inside = () => top().evaluate((o) => o.contains(document.activeElement));

  for (const item of ['Profile', 'API tokens', 'Activity log', 'Subscribe to calendar', 'Two-factor (2FA)', 'Language and time', 'Manage users', 'Open rows in new tab']) {
    await open(item);
    await top().waitFor();
    await eventually(inside).catch(() => assert.fail(`${item}: focus did not move into the dialog`));
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press(i % 5 === 4 ? 'Shift+Tab' : 'Tab');
      await eventually(inside).catch(() => assert.fail(`${item}: Tab ${i + 1} left the dialog`));
    }
    await page.keyboard.press('Escape');
    await top().waitFor({ state: 'detached' }).catch(() => assert.fail(`${item}: Escape did not close it`));
    await eventually(() => menuButton.evaluate((el) => el === document.activeElement)).catch(() =>
      assert.fail(`${item}: focus did not return to the user menu`),
    );
  }

  // A confirmation over a dialog: Escape cancels the confirmation only.
  await open('API tokens');
  await top().waitFor();
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('salt:dialog', { detail: { kind: 'confirm', message: 'Sure?', resolve: () => {} } }));
  });
  await page.locator('.confirm-dialog').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('.confirm-dialog').waitFor({ state: 'detached' });
  assert.equal(await page.locator('.modal-overlay').count(), 1, 'Escape on a confirmation closed the dialog under it too');
  await page.keyboard.press('Escape');
  await page.locator('.modal-overlay').first().waitFor({ state: 'detached' });

  console.log('Dialog keys: Escape closes, Tab stays inside and focus returns, for eight user-menu dialogs.');
});
