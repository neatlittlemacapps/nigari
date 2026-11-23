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
  // The row handle's gutter (spec 022) sits in the margin ahead of every
  // column; the first column after it is the checkbox.
  const firstHead = page.locator('.db-table thead th:not(.db-row-gutter)').first();
  assert.match(await firstHead.getAttribute('class'), /db-check-col/, 'the checkbox leads the table');
  assert.match(await page.locator('.db-table thead th').first().getAttribute('class'), /db-row-gutter/, 'the row handle stays in front of the checkbox');
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
  const heads = await page.locator('.db-table thead th:not(.db-row-gutter)').evaluateAll((ths) => ths.map((th) => th.className.includes('db-check-col') ? 'ok' : (th.dataset.colId ?? 'name')));
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

  // On a phone a list row stays one line and the whole list scrolls sideways
  // together (#906): no properties wrapped under the title, and each
  // property starts at the same place in every row.
  const layout = await page.locator('.list-view').evaluate((list) => {
    const rows = [...list.querySelectorAll('.list-row')];
    return {
      heights: rows.map((r) => r.getBoundingClientRect().height),
      titleTops: rows.map((r) => r.querySelector('.list-row-title').getBoundingClientRect().top - r.getBoundingClientRect().top),
      propLefts: rows.map((r) => [...r.querySelectorAll('.list-row-prop')].map((c) => Math.round(c.getBoundingClientRect().left))),
      overflowX: getComputedStyle(list).overflowX,
    };
  });
  assert(layout.heights.length > 1, 'the list has rows to compare');
  assert(layout.heights.every((h) => h < 60), `a list row stays one line on a phone (heights ${layout.heights})`);
  assert.equal(layout.overflowX, 'auto', 'the list scrolls sideways on a phone');
  assert(layout.propLefts.every((l) => l.length === layout.propLefts[0].length && l.every((x, i) => x === layout.propLefts[0][i])), `properties line up row to row (${JSON.stringify(layout.propLefts)})`);
  // A long title pushes the properties off screen; the list, not the page,
  // then scrolls, and every row moves with it.
  await api('PATCH', `/api/pages/${first.id}`, { title: 'First row with a title long enough to need the whole width of a phone screen' });
  await eventually(async () => (await page.locator('.list-view').evaluate((l) => l.scrollWidth > l.clientWidth)));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'the page itself does not scroll sideways');
  const moved = await page.locator('.list-view').evaluate((l) => {
    const before = [...l.querySelectorAll('.list-row-title')].map((t) => t.getBoundingClientRect().left);
    l.scrollLeft = 80;
    const after = [...l.querySelectorAll('.list-row-title')].map((t) => t.getBoundingClientRect().left);
    return before.map((b, i) => Math.round(b - after[i]));
  });
  assert(moved.every((d) => d === moved[0] && d > 0), `every row scrolls together (${moved})`);
  await page.locator('.list-view').evaluate((l) => { l.scrollLeft = 0; });

  // The picker can add a view.
  await picker.click();
  await page.getByRole('menuitem', { name: 'Add view' }).click();
  await page.getByRole('menuitem', { name: 'Gallery' }).click();
  await eventually(async () => (await api('GET', path)).views.some((v) => v.type === 'gallery'));

  console.log('Checkbox views: the box leads tables and lists, a phone list scrolls sideways in one piece, and a phone picks views from one menu.');
});
