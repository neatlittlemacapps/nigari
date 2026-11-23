import assert from 'node:assert/strict';
import { eventually, withFixture } from './fixture.mjs';

// A checkbox is something you tick down the side of a table or list, and on a
// phone a collection's views are one picker so its actions stay on screen
// (owner, 2026-11-22).
await withFixture(async ({ page, api, base, path }) => {
  page.setDefaultTimeout(15000);
  const config = await api('GET', path);
  await api('PUT', path, {
    schema: [...config.schema, { id: 'ok', name: 'Applied', type: 'checkbox' }],
    views: [
      { id: 'table', name: 'Table', type: 'table' },
      { id: 'list', name: 'List', type: 'list' },
      ...config.views.filter((v) => v.type === 'board'),
    ],
  });
  const collectionId = path.split('/').pop();
  const listed = await api('GET', `${path}/rows`);
  const first = (listed.rows ?? listed).find((r) => r.title === 'First row');
  const ticked = async () => (await api('GET', `/api/pages/${first.id}`)).props.ok === true;

  // Desktop: the tabs stay; the table's first column is the checkbox.
  await page.goto(`${base}/p/${collectionId}`);
  await page.locator('.view-tab', { hasText: 'Table' }).waitFor();
  assert.equal(await page.locator('.view-picker').count(), 0, 'desktop keeps the tabs');
  const firstHead = page.locator('.db-table thead th').first();
  assert.match(await firstHead.getAttribute('class'), /db-check-col/, 'the checkbox leads the table');
  assert.equal(await page.locator('.db-table thead').getByRole('button', { name: 'Applied', exact: true }).count(), 1, 'the checkbox column is drawn once, its menu named after it');
  // Its heading keeps the column's menu (Hide in view among it).
  await page.locator('.db-table thead').getByRole('button', { name: 'Applied', exact: true }).click();
  assert.equal(await page.getByRole('menuitem', { name: 'Hide in view' }).count(), 1, 'the lead column can be hidden from its heading');
  await page.keyboard.press('Escape');
  // The other columns move among themselves; the box keeps its stored place.
  await page.locator('.db-table thead').getByRole('button', { name: 'Labels', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Move left' }).click();
  await eventually(async () => {
    const order = (await api('GET', path)).views.find((v) => v.id === 'table').colOrder ?? [];
    return order.join() === 'labels,status,ok';
  });
  const heads = await page.locator('.db-table thead th').evaluateAll((ths) => ths.map((th) => th.className.includes('db-check-col') ? 'ok' : (th.dataset.colId ?? 'name')));
  assert.deepEqual(heads, ['ok', 'name', 'labels', 'status'], 'drawn: box, name, then the moved columns');
  const view = page.url();
  await page.getByRole('checkbox', { name: 'Applied: First row' }).click();
  await eventually(ticked);
  assert.equal(page.url(), view, 'ticking in the table must not open the row');

  // Phone: one picker, and every action beside it on screen.
  await page.setViewportSize({ width: 390, height: 844 });
  const picker = page.locator('.view-picker');
  await picker.waitFor();
  assert.equal(await page.locator('.view-tab').count(), 0, 'no tabs on a phone');
  for (const name of ['Filter', 'Sort', 'Settings', 'New']) {
    const button = page.locator('.collection-toolbar').getByRole('button', { name, exact: true });
    const box = await button.boundingBox();
    assert(box && box.x >= 0 && box.x + box.width <= 390, `${name} is on screen`);
  }
  await picker.click();
  await page.getByRole('menuitemradio', { name: 'List' }).click();
  await eventually(async () => (await picker.textContent()).includes('List'));

  // The list leads with the box; a tick writes and leaves the row closed.
  const box = page.getByRole('checkbox', { name: 'Applied: First row' });
  await box.waitFor();
  const listUrl = page.url();
  await box.click();
  await eventually(async () => !(await ticked()));
  assert.equal(page.url(), listUrl, 'ticking in the list must not open the row');
  assert.equal(await page.locator('.list-row-props input[type="checkbox"]').count(), 0, 'the box is not repeated among the properties');

  // The picker can add a view.
  await picker.click();
  await page.getByRole('menuitem', { name: 'Add view' }).click();
  await page.getByRole('menuitem', { name: 'Gallery' }).click();
  await eventually(async () => (await api('GET', path)).views.some((v) => v.type === 'gallery'));

  console.log('Checkbox views: the box leads tables and lists, and a phone picks views from one menu.');
});
