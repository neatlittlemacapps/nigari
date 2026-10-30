import assert from 'node:assert/strict';
import { eventually, withFixture } from './fixture.mjs';

// The rename to nigari (spec 011, FR-007): a browser that used salt.md keeps
// its preferences under salt-… keys. On the first load of nigari they move to
// nigari-… keys before anything reads them, so the theme, the open tabs and
// the recent pages are as they were, and no salt key is left behind. A second
// load changes nothing.
await withFixture(async ({ page, api, base, workspace }) => {
  page.setDefaultTimeout(15000);
  const doc = await api('POST', '/api/pages', { title: 'Kept across the rename', workspaceId: workspace.id });

  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(base);
  // What salt.md left in this browser.
  await page.evaluate((id) => {
    localStorage.clear();
    localStorage.setItem('salt-theme', 'dark');
    localStorage.setItem('salt-tabs', JSON.stringify([id]));
    localStorage.setItem('salt-recents', JSON.stringify([id]));
    localStorage.setItem('salt-sec-favorites', '1');
  }, doc.id);
  await page.reload();

  // Dark although the system is light: the theme came along.
  await eventually(async () => (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
  const keys = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])));
  assert.deepEqual(Object.keys(keys).filter((k) => k.startsWith('salt')), [], 'a salt key is left in the browser');
  assert.equal(keys['nigari-theme'], 'dark');
  assert.ok(JSON.parse(keys['nigari-recents'] ?? '[]').includes(doc.id), 'the recent pages did not move');
  assert.ok(JSON.parse(keys['nigari-tabs'] ?? '[]').includes(doc.id), 'the open tabs did not move');
  assert.equal(keys['nigari-sec-favorites'], '1', 'a sidebar section did not move');

  // A second load: same store.
  await page.reload();
  await eventually(async () => (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
  const again = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('salt')));
  assert.deepEqual(again, [], 'a second load brought a salt key back');
});
