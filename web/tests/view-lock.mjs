import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eventually, withFixture } from './fixture.mjs';

// The views lock (spec 013, US2, quickstart §1). A person who can edit locks
// a database's views from Settings; from then on nothing that changes a view
// is offered (Settings' view items, ＋ add view, the tab's menu and
// double-click rename, column moves, hides and resizes, the board's grouping,
// filter and sort) and the server refuses whoever tries anyway: a second
// account and an agent. Rows stay editable. Locking from elsewhere reaches an
// open tab without a reload. Unlocking brings everything back.

await withFixture(async ({ page, context, api, base, workspace, path }) => {
  page.setDefaultTimeout(15000);
  const collectionId = path.split('/').pop();
  const toolbar = page.locator('.collection-toolbar');
  const settings = toolbar.getByRole('button', { name: 'Settings', exact: true });
  const menu = page.getByRole('menu', { name: /view settings$/ });
  const marker = toolbar.getByRole('button', { name: 'Views locked' });
  const openSettings = async () => {
    await settings.click();
    await menu.waitFor();
  };
  const menuItems = async () => {
    await openSettings();
    const items = await menu.locator('[role="menuitem"]').evaluateAll((els) => els.map((e) => e.textContent.trim()));
    await page.keyboard.press('Escape');
    await menu.waitFor({ state: 'hidden' });
    return items;
  };

  // ---- Unlocked: the controls the lock will take away are there ----
  await settings.waitFor();
  assert.equal(await marker.count(), 0, 'a marker on an unlocked database');
  let items = await menuItems();
  assert(items.includes('Rename view') && items.includes('Lock views') && !items.includes('Unlock views'), `unlocked menu: ${items}`);
  assert(await toolbar.locator('.view-add').count() > 0, 'no ＋ before locking');
  assert(await page.locator('.col-resize').count() > 0, 'no column grip before locking');

  // ---- Lock from Settings › Database settings ----
  await openSettings();
  await menu.getByRole('menuitem', { name: 'Lock views' }).click();
  await marker.waitFor();
  const stored = await api('GET', path);
  assert.equal(stored.viewsLocked?.byName, 'Browser Tester', JSON.stringify(stored.viewsLocked));

  // The marker says who and when.
  await marker.click();
  const panel = page.locator('.views-lock-panel');
  await panel.waitFor();
  assert.match(await panel.textContent(), /Locked by Browser Tester on /);
  await page.keyboard.press('Escape');
  await panel.waitFor({ state: 'hidden' });

  // ---- Every control that changes a view is gone ----
  items = await menuItems();
  for (const gone of ['Rename view', 'Property visibility', 'Open rows in', 'Move right', 'Remove view', 'Lock views']) {
    assert(!items.some((i) => i.startsWith(gone)), `${gone} offered while locked: ${items}`);
  }
  assert(items.includes('Edit properties') && items.includes('Unlock views'), `locked menu: ${items}`);
  assert.equal(await toolbar.locator('.view-add').count(), 0, '＋ add view offered while locked');
  for (const gone of ['Filter', 'Sort']) {
    assert.equal(await toolbar.getByRole('button', { name: gone }).count(), 0, `${gone} offered while locked`);
  }
  // The table's own filter is still said.
  assert(await toolbar.getByText('Filtered', { exact: true }).isVisible(), 'the filter is no longer said');
  assert.equal(await page.locator('.col-resize').count(), 0, 'a column grip while locked');
  assert.equal(await page.locator('.db-table .th-label').count(), 0, 'a column menu while locked');
  const tab = page.locator('.view-tab', { hasText: 'Table' });
  await tab.click({ button: 'right' });
  await page.waitForTimeout(300);
  assert.equal(await page.getByRole('menu', { name: 'View actions' }).count(), 0, 'the tab menu opened while locked');
  await tab.dblclick();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.modal-overlay').count(), 0, 'double-click offered a rename while locked');
  await page.locator('.view-tab', { hasText: 'Board' }).click();
  await page.locator('.board').waitFor();
  assert.equal(await toolbar.getByRole('button', { name: 'Group' }).count(), 0, "the board's grouping offered while locked");
  await page.locator('.view-tab', { hasText: 'Table' }).click();

  // ---- Rows still edit: a new row from the toolbar ----
  const before = (await api('GET', `${path}/rows`)).total;
  await toolbar.getByRole('button', { name: 'New', exact: true }).click();
  await eventually(async () => (await api('GET', `${path}/rows`)).total === before + 1);

  // ---- The schema is not locked: Edit properties saves, the views stay as
  // they are. Status is the table's filter and the board's grouping; removing
  // it used to rewrite both views, the server refused the whole save, and the
  // dialog closed with every edit in it lost (code review). ----
  const viewsBefore = JSON.stringify((await api('GET', path)).views);
  await openSettings();
  await menu.getByRole('menuitem', { name: 'Edit properties' }).click();
  await page.getByRole('heading', { name: 'Collection properties' }).waitFor();
  const propItems = page.locator('.schema-item');
  const propNames = () => propItems.locator('.schema-row > .prop-input').evaluateAll((inputs) => inputs.map((i) => i.value));
  await propItems.nth((await propNames()).indexOf('Status')).locator('button[title="Delete property"]').click();
  await page.locator('.confirm-dialog').getByRole('button', { name: 'Delete property', exact: true }).click();
  await page.getByPlaceholder('New property name', { exact: true }).fill('Notes');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('heading', { name: 'Collection properties' }).waitFor({ state: 'hidden' });
  await eventually(async () => (await api('GET', path)).schema.map((p) => p.name).join() === 'Labels,Notes');
  assert.equal(JSON.stringify((await api('GET', path)).views), viewsBefore, 'Edit properties changed the locked views');

  // ---- A second account who can edit: sees it, is refused by the server ----
  const password = randomUUID();
  await api('POST', '/api/users', { name: 'Mo Member', email: 'member@example.test', password, workspaces: [{ id: workspace.id, role: 'member' }] });
  const other = await context.browser().newContext({ viewport: { width: 1200, height: 900 }, locale: 'en-US' });
  const login = await other.request.fetch(`${base}/api/login`, { method: 'POST', data: { email: 'member@example.test', password } });
  assert.ok(login.ok(), `the member could not sign in: ${login.status()}`);
  const views = (await api('GET', path)).views;
  const renamed = views.map((v) => (v.id === 'table' ? { ...v, name: 'Mine now' } : v));
  const refused = await other.request.fetch(`${base}${path}`, { method: 'PUT', data: { views: renamed } });
  assert.equal(refused.status(), 409);
  assert.equal((await refused.json()).code, 'views_locked');
  const memberPage = await other.newPage();
  await memberPage.goto(`${base}/p/${collectionId}`);
  await memberPage.locator('.collection-toolbar').getByRole('button', { name: 'Views locked' }).waitFor();
  assert.equal(await memberPage.locator('.view-add').count(), 0, 'the member is offered ＋ while locked');

  // ---- An agent: sees the lock, is refused with the same rule ----
  const { token } = await api('POST', '/api/tokens', { name: 'agent', scope: 'write' });
  const mcp = async (name, args) => {
    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
    });
    return (await res.json()).result;
  };
  const seen = await mcp('get_collection', { page_id: collectionId });
  assert.match(seen.content[0].text, /"views_locked":\{/);
  const agent = await mcp('set_view', { page_id: collectionId, view_id: 'table', name: 'Agent was here' });
  assert(agent.isError, 'set_view went through while locked');
  assert.match(agent.content[0].text, /views are locked; a person can unlock them in the interface/);
  // An agent cannot lift the lock: the route is for a browser sign-in.
  const lift = await fetch(`${base}${path}/lock`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  assert.equal(lift.status, 403);
  assert.equal((await api('GET', path)).views.find((v) => v.id === 'table').name, 'Table');

  // ---- Unlocked by the member: the owner's open tab follows without a reload ----
  const unlocked = await other.request.fetch(`${base}${path}/lock`, { method: 'DELETE' });
  assert.ok(unlocked.ok());
  await marker.waitFor({ state: 'detached' });
  await toolbar.locator('.view-add').waitFor();
  assert(await page.locator('.col-resize').count() > 0, 'no column grip after unlocking');
  // Locked again from elsewhere: the open tab takes the controls away.
  assert.ok((await other.request.fetch(`${base}${path}/lock`, { method: 'PUT' })).ok());
  await marker.waitFor();
  await eventually(async () => (await toolbar.locator('.view-add').count()) === 0);

  // ---- Unlock from Settings ----
  await openSettings();
  await menu.getByRole('menuitem', { name: 'Unlock views' }).click();
  await marker.waitFor({ state: 'detached' });
  assert.equal((await api('GET', path)).viewsLocked, null);
  items = await menuItems();
  assert(items.includes('Rename view') && items.includes('Lock views'), `after unlocking: ${items}`);
  await other.close();
});
console.log('View lock: lock from Settings, marker with who and when, every view control gone, rows still edit, second account and agent refused, live lock and unlock, unlock from Settings passed.');
