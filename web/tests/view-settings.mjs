import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eventually, withFixture } from './fixture.mjs';

// A view's toolbar has one Settings button (spec 012, US4, #270). Before, the
// same settings were spread over a Properties button, an unlabelled ⋯, a
// Columns popover and loose <select>s for a timeline's dates and a table's
// sub-items. This walks the list of everything those offered and does each
// one from Settings (SC-004); checks the values on the right, Escape and
// focus, Tab, the bottom sheet at phone width, that
// a reader gets no Settings (a document's database: embeds.mjs), and that the
// menu draws over a side peek.

await withFixture(async ({ page, context, api, base, workspace, path }) => {
  page.setDefaultTimeout(15000);
  const collectionId = path.split('/').pop();
  await api('PUT', path, {
    schema: [
      { id: 'status', name: 'Status', type: 'select', options: [{ id: 'todo', name: 'To do' }, { id: 'done', name: 'Done' }] },
      { id: 'start', name: 'Starts', type: 'date' },
      { id: 'end', name: 'Ends', type: 'date' },
      { id: 'parent', name: 'Parent', type: 'relation', relationCollection: collectionId },
    ],
    views: [
      { id: 'table', name: 'Table', type: 'table' },
      { id: 'timeline', name: 'Timeline', type: 'timeline', dateProp: 'start' },
      { id: 'spare', name: 'Spare', type: 'board', groupBy: 'status' },
    ],
  });
  await page.reload();
  const toolbar = page.locator('.collection-toolbar');
  const settings = toolbar.getByRole('button', { name: 'Settings', exact: true });
  const menu = page.getByRole('menu', { name: /view settings$/ });
  const view = async (id) => (await api('GET', path)).views.find((v) => v.id === id);
  const openSettings = async () => {
    await settings.click();
    await menu.waitFor();
  };
  const submenu = async (label) => {
    await menu.getByRole('menuitem', { name: new RegExp('^' + label) }).hover();
    const sub = page.getByRole('menu').filter({ hasNot: page.getByRole('menuitem', { name: 'Rename view' }) }).last();
    await sub.waitFor();
    return sub;
  };
  const close = async () => {
    await page.keyboard.press('Escape');
    if (await menu.isVisible()) await page.keyboard.press('Escape');
    await menu.waitFor({ state: 'hidden' });
  };

  // ---- The toolbar: Settings just before New; the old controls gone ----
  await settings.waitFor();
  const order = await toolbar.locator('.collection-actions button').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label') || b.textContent.trim()));
  assert(order.indexOf('Settings') >= 0 && order.indexOf('Settings') < order.findIndex((n) => /New/.test(n)), `Settings is not before New: ${order}`);
  for (const gone of ['Properties', 'View options', 'Columns']) {
    assert.equal(await toolbar.getByRole('button', { name: gone, exact: true }).count(), 0, `${gone} is still in the toolbar`);
  }
  assert.equal(await toolbar.locator('select').count(), 0, 'a <select> is still in the toolbar');
  assert.equal(await settings.getAttribute('aria-haspopup'), 'menu');

  // ---- Values on the right, the danger item last of its group ----
  await openSettings();
  assert.equal(await menu.getAttribute('aria-label'), 'Table view settings');
  const rowText = (name) => menu.getByRole('menuitem', { name: new RegExp('^' + name) }).textContent();
  assert.match(await rowText('Property visibility'), /Property visibility\s*4 of 4/);
  assert.match(await rowText('Open rows in'), /Open rows in\s*Full page/);
  assert.match(await rowText('Sub-items'), /Sub-items\s*No sub-items/);
  const items = await menu.locator('[role="menuitem"]').evaluateAll((els) => els.map((e) => e.textContent.trim()));
  assert(items.indexOf('Remove view') > items.indexOf('Move right') && items.indexOf('Edit properties') > items.indexOf('Remove view'), `order: ${items}`);
  assert(await menu.getByText('View settings', { exact: true }).isVisible());
  assert(await menu.getByText('Database settings', { exact: true }).isVisible());

  // ---- Escape closes with focus back on Settings; Tab does not leave the menu open behind ----
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'hidden' });
  await eventually(() => settings.evaluate((b) => b === document.activeElement));
  await settings.press('Enter');
  await menu.waitFor();
  await eventually(async () => (await page.evaluate(() => document.activeElement?.textContent?.trim())) === 'Rename view');
  await page.keyboard.press('Tab');
  // ui/Menu's rule (spec 010): Tab never moves focus behind an open menu.
  const where = await page.evaluate(() => [!!document.activeElement?.closest('[role="menu"]'), !!document.querySelector('[role="menu"]')]);
  assert(where[0] || !where[1], 'Tab left focus behind the open menu');
  if (await menu.isVisible()) await close();

  // ---- Every old action, found and done from Settings (SC-004) ----
  // Property visibility (Columns): hide one, show all, hide all.
  await openSettings();
  let sub = await submenu('Property visibility');
  await sub.getByRole('menuitemcheckbox', { name: 'Ends' }).click();
  await eventually(async () => JSON.stringify((await view('table')).hidden) === '["end"]');
  assert.match(await rowText('Property visibility'), /3 of 4/, 'the value follows the change');
  await sub.getByRole('menuitem', { name: 'Hide all' }).click();
  await eventually(async () => (await view('table')).hidden?.length === 4);
  await sub.getByRole('menuitem', { name: 'Show all' }).click();
  await eventually(async () => (await view('table')).hidden?.length === 0);
  await close();

  // Open rows in (⋯).
  await openSettings();
  sub = await submenu('Open rows in');
  await sub.getByRole('menuitemradio', { name: 'Side peek' }).click();
  await eventually(async () => (await view('table')).openIn === 'side_peek');
  if (await menu.isVisible()) await close();
  await openSettings();
  assert.match(await rowText('Open rows in'), /Side peek/);
  await close();

  // Sub-items (the table's <select>).
  await openSettings();
  sub = await submenu('Sub-items');
  await sub.getByRole('menuitemradio', { name: 'Parent' }).click();
  await eventually(async () => (await view('table')).subItemProp === 'parent');
  if (await menu.isVisible()) await close();

  // Rename view (⋯).
  await openSettings();
  await menu.getByRole('menuitem', { name: 'Rename view' }).click();
  const renameDialog = page.locator('.modal-overlay').last();
  await renameDialog.waitFor();
  await renameDialog.locator('input').fill('Main table');
  await renameDialog.getByRole('button', { name: 'Rename', exact: true }).click();
  await renameDialog.waitFor({ state: 'detached' });
  await eventually(async () => (await view('table')).name === 'Main table');
  await eventually(() => settings.evaluate((b) => b === document.activeElement));

  // Move right, Move left (⋯).
  await openSettings();
  await menu.getByRole('menuitem', { name: 'Move right' }).click();
  await eventually(async () => (await api('GET', path)).views[1].id === 'table');
  await openSettings();
  await menu.getByRole('menuitem', { name: 'Move left' }).click();
  await eventually(async () => (await api('GET', path)).views[0].id === 'table');

  // Edit properties (the Properties button).
  await openSettings();
  await menu.getByRole('menuitem', { name: 'Edit properties' }).click();
  await page.getByRole('heading', { name: 'Collection properties' }).waitFor();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();

  // The timeline's start and end (its two <select>s).
  await page.locator('.view-tab', { hasText: 'Timeline' }).click();
  await openSettings();
  assert.equal(await menu.getAttribute('aria-label'), 'Timeline view settings');
  assert.match(await rowText('Start date'), /Starts/);
  assert.match(await rowText('End date'), /No end date/);
  assert.equal(await menu.getByRole('menuitem', { name: /^Sub-items/ }).count(), 0, 'a timeline has no sub-items');
  sub = await submenu('End date');
  await sub.getByRole('menuitemradio', { name: 'Ends' }).click();
  await eventually(async () => (await view('timeline')).endDateProp === 'end');
  if (await menu.isVisible()) await close();

  // Remove view (⋯), last and in the danger colour.
  await page.locator('.view-tab', { hasText: 'Spare' }).click();
  await openSettings();
  const remove = menu.getByRole('menuitem', { name: 'Remove view' });
  assert(await remove.evaluate((el) => el.classList.contains('is-danger')), 'Remove view is not drawn as danger');
  assert.equal(await menu.getByRole('menuitem', { name: /^Start date/ }).count(), 0, 'a board has no timeline dates');
  await remove.click();
  const confirm = page.getByRole('alertdialog');
  if (await confirm.count()) await confirm.getByRole('button', { name: /Remove/ }).click();
  await eventually(async () => !(await api('GET', path)).views.some((v) => v.id === 'spare'));

  // ---- A phone: the menu is a sheet along the bottom ----
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/p/${collectionId}`);
  await settings.scrollIntoViewIfNeeded();
  await openSettings();
  const box = await menu.boundingBox();
  assert(box.x <= 16 && box.x + box.width >= 374 && box.y + box.height >= 820, `not a bottom sheet: ${JSON.stringify(box)}`);
  await close();
  await page.setViewportSize({ width: 1200, height: 900 });

  // ---- From a side peek: the menu draws over the peek ----
  const child = await api('POST', '/api/pages', { parentId: collectionId, title: 'Sub-database', type: 'collection' });
  await api('PUT', `/api/collections/${child.id}`, { schema: [{ id: 'note', name: 'Note', type: 'text' }], views: [{ id: 'inner', name: 'Inner', type: 'table' }] });
  await page.goto(`${base}/p/${collectionId}`);
  await page.locator('.db-title-link', { hasText: 'Sub-database' }).click();
  const peek = page.getByRole('complementary', { name: 'Page preview' });
  await peek.waitFor();
  const peekSettings = peek.getByRole('button', { name: 'Settings', exact: true });
  await peekSettings.click();
  await menu.waitFor();
  const hit = await menu.getByRole('menuitem', { name: 'Rename view' }).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
  });
  assert(hit, 'the Settings menu is drawn under the side peek');
  await close();

  // A database in a document has no Settings: embeds.mjs asserts it, with
  // the rest of the embed's toolbar.

  // ---- A reader: offered nothing to change ----
  const password = randomUUID();
  await api('POST', '/api/users', { name: 'Rita Reader', email: 'reader@example.test', password, workspaces: [{ id: workspace.id, role: 'viewer' }] });
  const other = await context.browser().newContext({ viewport: { width: 1200, height: 900 }, locale: 'en-US' });
  const login = await other.request.fetch(`${base}/api/login`, { method: 'POST', data: { email: 'reader@example.test', password } });
  assert.ok(login.ok(), `the reader could not sign in: ${login.status()}`);
  const reader = await other.newPage();
  await reader.goto(`${base}/p/${collectionId}`);
  await reader.locator('.collection-toolbar').waitFor();
  assert.equal(await reader.locator('.collection-toolbar').getByRole('button', { name: 'Settings', exact: true }).count(), 0, 'a reader is offered Settings');
  // The other ways to the same view actions are gated with it: the server
  // refuses them, so offering them only promises what it undoes.
  assert.equal(await reader.locator('.view-add').count(), 0, 'a reader is offered ＋ Add view');
  await reader.locator('.view-tab').first().click({ button: 'right' });
  await reader.waitForTimeout(300);
  assert.equal(await reader.getByRole('menu', { name: 'View actions' }).count(), 0, "a reader's right-click offers the view actions");
  await other.close();
});
console.log('View settings: every old action from Settings, values, Escape and Tab, phone sheet, side peek and reader passed.');
