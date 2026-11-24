import assert from 'node:assert/strict';
import { eventually, withFixture } from './fixture.mjs';

// A table grouped by a property (spec 024, PR 2a): a header per group with
// its value and count, the group's own totals, folding that is the person's
// own and survives a reload, Collapse all and Expand all, a hidden group and
// Show, the order reversed with No value still last, empty groups, a row with
// several values in each of its groups, and No grouping back to a flat table
// with its foot. The Group menu sets the grouping as a person would.

await withFixture(async ({ page, api, base, workspace }) => {
  page.setDefaultTimeout(15000);
  const db = await api('POST', '/api/pages', { title: 'Grouped tasks', type: 'collection', workspaceId: workspace.id });
  const path = `/api/collections/${db.id}`;
  const options = [
    { id: 'todo', name: 'To do', color: '#337ea9' },
    { id: 'doing', name: 'Doing', color: '#cb912f' },
    { id: 'blocked', name: 'Blocked', color: '#d44c47' },
    { id: 'done', name: 'Done', color: '#448361' },
  ];
  await api('PUT', path, {
    schema: [
      { id: 'status', name: 'Status', type: 'select', options },
      { id: 'tags', name: 'Tags', type: 'multiselect', options: [{ id: 'a', name: 'Alpha', color: '#337ea9' }, { id: 'b', name: 'Beta', color: '#448361' }] },
      { id: 'est', name: 'Estimate', type: 'number' },
    ],
    views: [{ id: 'table', name: 'Table', type: 'table' }],
  });
  for (const [title, props] of [
    ['Write spec', { status: 'todo', tags: ['a'], est: 3 }],
    ['Plan tasks', { status: 'todo', tags: ['a', 'b'], est: 2 }],
    ['Build it', { status: 'doing', tags: ['b'], est: 5 }],
    ['Ship it', { status: 'done', est: 1 }],
    ['Someday', { est: 8 }],
  ]) await api('POST', '/api/pages', { parentId: db.id, title, props });

  const heads = () => page.locator('.db-group-head').evaluateAll((els) =>
    els.map((el) => ({ name: el.querySelector('.db-group-name')?.textContent?.trim(), count: Number(el.querySelector('.db-group-count')?.textContent) })));
  const rowsOf = (name) => page.locator('tbody.db-group', { has: page.locator('.db-group-name', { hasText: name }) }).locator('tr[data-row-id] .db-title-link').allTextContents();
  const view = async () => (await api('GET', path)).views.find((v) => v.id === 'table');
  const groupMenu = async () => {
    await page.locator('.collection-toolbar').getByRole('button', { name: 'Group', exact: true }).click();
    await page.locator('.view-group-menu').waitFor();
  };
  const closePopover = () => page.keyboard.press('Escape');
  const headerMenu = async (name) => {
    const head = page.locator('.db-group-head', { has: page.locator('.db-group-name', { hasText: name }) });
    await head.hover();
    await head.getByRole('button', { name: 'Group actions' }).click();
  };

  await page.goto(`${base}/p/${db.id}`);
  await page.locator('.db-table').waitFor();
  assert.equal(await page.locator('.db-group-head').count(), 0, 'a table nobody grouped draws groups');

  // The Group menu groups the table by Status.
  await groupMenu();
  await page.locator('.view-group-menu select').selectOption('status');
  await closePopover();
  await eventually(async () => (await view()).grouped === true && (await view()).groupBy === 'status');
  await eventually(async () => (await heads()).length === 4);
  // The options' order, No value last; a select's option with no rows is not drawn.
  assert.deepEqual(await heads(), [
    { name: 'To do', count: 2 },
    { name: 'Doing', count: 1 },
    { name: 'Done', count: 1 },
    { name: 'No Status', count: 1 },
  ]);
  assert.deepEqual(await rowsOf('To do'), ['Write spec', 'Plan tasks']);
  // Each group sums its own rows; the table's own foot is gone while grouped.
  const totals = await page.locator('tbody.db-group .db-group-calc').evaluateAll((els) => els.map((el) => el.textContent));
  assert.equal(totals.length, 4, 'not every group has its totals');
  assert.match(totals[0], /Σ 5\b/, `To do's estimate total is not 5: ${totals[0]}`);
  assert.match(totals[1], /Σ 5\b/, `Doing's estimate total is not 5: ${totals[1]}`);
  assert.equal(await page.locator('.db-table > tfoot').count(), 0, 'the overall foot is still drawn while grouped');

  // Folding: the person's own, kept across a reload, not stored on the view.
  const todo = page.locator('.db-group-head', { has: page.locator('.db-group-name', { hasText: 'To do' }) });
  await todo.getByRole('button', { name: 'Collapse group' }).click();
  await eventually(async () => (await rowsOf('To do')).length === 0);
  assert.equal(await todo.getByRole('button', { name: 'Expand group' }).getAttribute('aria-expanded'), 'false');
  await page.waitForTimeout(1200); // the personal state is saved after a short wait
  await page.reload();
  await page.locator('.db-group-head').first().waitFor();
  assert.equal((await rowsOf('To do')).length, 0, 'a folded group opened again after a reload');
  assert.equal((await view()).foldedGroups, undefined, 'folding was stored on the view, for everyone');
  await todo.getByRole('button', { name: 'Expand group' }).click();
  await eventually(async () => (await rowsOf('To do')).length === 2);

  // Collapse all and Expand all, from a group's menu.
  await headerMenu('Doing');
  await page.getByRole('menuitem', { name: 'Collapse all groups' }).click();
  await eventually(async () => (await page.locator('tbody.db-group tr[data-row-id]').count()) === 0);
  await headerMenu('Doing');
  await page.getByRole('menuitem', { name: 'Expand all groups' }).click();
  await eventually(async () => (await page.locator('tbody.db-group tr[data-row-id]').count()) === 5);

  // Hide a group from its menu; the Group menu lists it and Show brings it back.
  await headerMenu('Done');
  await page.getByRole('menuitem', { name: 'Hide group' }).click();
  await eventually(async () => JSON.stringify((await view()).hiddenGroups) === '["done"]');
  assert.deepEqual((await heads()).map((h) => h.name), ['To do', 'Doing', 'No Status']);
  await groupMenu();
  const hiddenRow = page.locator('.view-group-hidden-row', { hasText: 'Done' });
  await hiddenRow.getByRole('button', { name: 'Show' }).click();
  await eventually(async () => (await view()).hiddenGroups === undefined);

  // Reverse order keeps No value last; Show empty groups draws Blocked.
  await page.getByText('Reverse order').click();
  await page.getByText('Show empty groups').click();
  await closePopover();
  await eventually(async () => (await view()).groupReverse === true && (await view()).showEmptyGroups === true);
  await eventually(async () => (await heads()).length === 5);
  assert.deepEqual(await heads(), [
    { name: 'Done', count: 1 },
    { name: 'Blocked', count: 0 },
    { name: 'Doing', count: 1 },
    { name: 'To do', count: 2 },
    { name: 'No Status', count: 1 },
  ]);

  // A row with several values is in each of its groups.
  await groupMenu();
  await page.locator('.view-group-menu select').selectOption('tags');
  await closePopover();
  await eventually(async () => (await view()).groupBy === 'tags');
  await eventually(async () => (await heads()).length >= 2);
  assert.deepEqual(await rowsOf('Alpha'), ['Write spec', 'Plan tasks']);
  assert.deepEqual(await rowsOf('Beta'), ['Plan tasks', 'Build it']);

  // While grouped, no row handle starts a drag (that comes with PR 2b), but
  // a row's menu still opens from it.
  const handle = page.locator('tbody.db-group tr[data-row-id] .db-row-handle').first();
  await handle.hover();
  await handle.click();
  await page.getByRole('menuitem', { name: 'Open', exact: true }).waitFor();
  await page.keyboard.press('Escape');

  // No grouping: a flat table with its foot again.
  await groupMenu();
  await page.locator('.view-group-menu select').selectOption('');
  await closePopover();
  await eventually(async () => (await view()).grouped !== true);
  await eventually(async () => (await page.locator('.db-group-head').count()) === 0);
  assert.equal(await page.locator('.db-table > tfoot').count(), 1, 'the flat table has no foot');
  assert.equal(await page.locator('.db-table tr[data-row-id]').count(), 5);

  if (process.env.SHOTS) {
    await api('PUT', path, { ...(await api('GET', path)), views: [{ id: 'table', name: 'Table', type: 'table', grouped: true, groupBy: 'status' }] });
    for (const [scheme, w, h] of [['light', 1280, 800], ['dark', 1280, 800], ['light', 390, 800], ['dark', 390, 800]]) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: w, height: h });
      await page.goto(`${base}/p/${db.id}`);
      await page.locator('.db-group-head').first().waitFor();
      await page.screenshot({ path: `${process.env.SHOTS}/groups-${scheme}-${w}.png` });
      await groupMenu();
      await page.screenshot({ path: `${process.env.SHOTS}/menu-${scheme}-${w}.png` });
      await closePopover();
    }
  }
});
