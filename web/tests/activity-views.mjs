import assert from 'node:assert/strict';
import { eventually, withFixture } from './fixture.mjs';

// View changes in the activity log (spec 013, US5, quickstart §2, SC-006).
// A rename, a new filter, a removed view and a lock each leave one entry,
// worded as what happened to which view of which database; a column resize
// leaves none. The log was where people looked when "Open tasks" suddenly
// hid finished tasks, and views were the one thing it never showed (#178).

await withFixture(async ({ page, api, path }) => {
  page.setDefaultTimeout(15000);
  const toolbar = page.locator('.collection-toolbar');
  const settings = toolbar.getByRole('button', { name: 'Settings', exact: true });
  const menu = page.getByRole('menu', { name: /view settings$/ });
  await api('PUT', path, {
    views: [
      // The fixture's table filters on To do; it keeps that here, so this
      // save is a rename only and the change below is the one filter change.
      { id: 'table', name: 'Inbox', type: 'table', filters: [{ property: 'status', op: 'is', value: 'todo' }] },
      { id: 'board', name: 'Board', type: 'board', groupBy: 'status' },
    ],
  });
  // A filter and a column width, saved the way the interface saves them,
  // before the page loads: the interface's own saves below send its whole
  // copy of the views (#530), and a copy older than these would undo them.
  const views = (await api('GET', path)).views;
  await api('PUT', path, {
    views: views.map((v) => (v.id === 'table' ? { ...v, filters: [{ property: 'status', op: 'is', value: 'done' }] } : v)),
  });
  const filtered = (await api('GET', path)).views;
  await api('PUT', path, { views: filtered.map((v) => (v.id === 'table' ? { ...v, colWidths: { __title: 320 } } : v)) });
  await page.reload();
  await settings.waitFor();

  // Rename from Settings.
  await settings.click();
  await menu.getByRole('menuitem', { name: 'Rename view' }).click();
  const dialog = page.locator('.modal-overlay').last();
  await dialog.locator('input').fill('Open tasks');
  await dialog.getByRole('button', { name: 'Rename', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  await eventually(async () => (await api('GET', path)).views.some((v) => v.name === 'Open tasks'));

  // Remove the board from its own Settings.
  await page.locator('.view-tab', { hasText: 'Board' }).click();
  await settings.click();
  await menu.getByRole('menuitem', { name: 'Remove view' }).click();
  await page.waitForFunction(() => ![...document.querySelectorAll('.view-tab')].some((t) => t.textContent.includes('Board')));

  // Lock.
  await settings.click();
  await menu.getByRole('menuitem', { name: 'Lock views' }).click();
  await toolbar.getByRole('button', { name: 'Views locked' }).waitFor();

  // ---- The log ----
  await page.locator('.user-menu-btn').click();
  await page.getByRole('menuitem', { name: 'Activity log' }).click();
  const log = page.locator('.dialog', { has: page.getByRole('heading', { name: 'Activity log' }) });
  await log.waitFor();
  await log.locator('.user-row').first().waitFor();
  const lines = await log.locator('.user-row-name').evaluateAll((els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
  const db = 'Option editing test';
  const want = [
    `Views locked by Browser Tester, ${db}`,
    `Browser Tester: View deleted “Board”, ${db}`,
    `Browser Tester: View renamed “Inbox → Open tasks”, ${db}`,
    `Browser Tester: View changed “Inbox”, ${db}`,
  ];
  for (const w of want) assert(lines.includes(w), `missing "${w}" in:\n${lines.join('\n')}`);
  // Newest first, each once.
  const at = want.map((w) => lines.indexOf(w));
  assert.deepEqual([...at].sort((a, b) => a - b), at, `out of order: ${at}`);
  for (const w of want) assert.equal(lines.filter((l) => l === w).length, 1, `"${w}" more than once`);
  // The column width, saved after the filter, left nothing: one "View
  // changed" for Inbox, and none for the view under its new name.
  assert.equal(lines.filter((l) => l.includes('View changed “Inbox”')).length, 1, `a layout change was logged:\n${lines.join('\n')}`);
  assert.equal(lines.filter((l) => l.includes('View changed “Open tasks”')).length, 0, `a layout change was logged:\n${lines.join('\n')}`);
  // Nothing about a view offers to be taken back.
  for (const row of await log.locator('.user-row', { hasText: /View |Views / }).all()) {
    assert.equal(await row.getByRole('button', { name: /Take back/ }).count(), 0, 'a view entry offers Take back');
  }
});
console.log('Activity log: rename, re-filter, delete and lock each logged once by view, a column resize not, none revertible passed.');
