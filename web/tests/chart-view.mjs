import assert from 'node:assert/strict';
import { eventually, withFixture } from './fixture.mjs';

// A database drawn as a chart (spec 004, US1, US2, US4). What must hold: a
// chart added from the + menu is drawn at once, grouped by the first select;
// each group's number equals what the same filter shows in a table (SC-002);
// a click on a group lists its rows; switching the kind or the value redraws
// the same rows; the chart reads the server's counts and does not load every
// row; the table alternative and the keyboard reach every group; and a chart
// shown in a document keeps the document's own filters (#26).
await withFixture(async ({ page, api, base, workspace, path }) => {
  page.setDefaultTimeout(15000);
  const collectionId = path.split('/').pop();
  const config = await api('GET', path);
  await api('PUT', path, { schema: [...config.schema, { id: 'hours', name: 'Hours', type: 'number' }] });
  // The fixture has one row To do and one Done; three more To do with hours,
  // and one without a status.
  for (const [title, props] of [
    ['Third row', { status: 'todo', hours: 2 }],
    ['Fourth row', { status: 'todo', hours: 3 }],
    ['Fifth row', { status: 'todo' }],
    ['Sixth row', { hours: 5 }],
  ]) await api('POST', '/api/pages', { parentId: collectionId, title, props });

  const rowLoads = [];
  page.on('request', (r) => {
    if (r.url().includes(`/api/collections/${collectionId}/rows`)) rowLoads.push(r.url());
  });

  await page.goto(`${base}/p/${collectionId}`);
  await page.getByTitle('Add view').click();
  await page.locator('.view-add-menu').getByRole('button', { name: 'Chart', exact: true }).click();

  // ---- US1: drawn at once, grouped by the first select ----
  const figure = page.locator('figure.chart');
  await figure.getByText('Count of rows by Status').waitFor();
  const group = (name) => figure.locator('.chart-group', { hasText: name });
  await group('To do').waitFor();
  const valueOf = async (name) => (await group(name).locator('.chart-group-value').innerText()).trim();
  for (const [name, filter] of [
    ['To do', { property: 'status', op: 'is', value: 'todo' }],
    ['Done', { property: 'status', op: 'is', value: 'done' }],
    ['No value', { property: 'status', op: 'is_empty', value: '' }],
  ]) {
    const p = new URLSearchParams({ filter: JSON.stringify(filter), limit: '1' });
    const { total } = await api('GET', `${path}/rows?${p}`);
    assert.equal(await valueOf(name), String(total), `${name}: the chart and the table disagree`);
  }
  assert.equal(await group('No value').evaluate((el) => el.nextElementSibling), null, 'No value is not drawn last');
  rowLoads.length = 0;
  await page.waitForTimeout(300);
  const stored = (await api('GET', path)).views.find((v) => v.type === 'chart');
  assert.equal(stored?.groupBy, 'status', 'the new chart was not saved with its grouping');

  // A click on a group lists exactly its rows.
  await group('Done').click();
  const rowsSection = figure.locator('.chart-rows');
  await rowsSection.getByText('Second row', { exact: true }).waitFor();
  assert.equal(await rowsSection.locator('.list-row').count(), 1, 'the Done group listed other rows');
  await rowsSection.getByRole('button', { name: 'Close' }).click();
  await rowsSection.waitFor({ state: 'hidden' });

  // ---- US2: another value, other kinds ----
  const settings = page.locator('.chart-settings');
  // The settings live in one panel (US5): the kinds are radios, the rest
  // dropdowns.
  const panel = page.getByRole('dialog', { name: 'Chart settings' });
  const openPanel = async () => {
    if (await panel.isVisible()) return;
    await settings.getByRole('button', { name: 'Chart settings' }).click();
    await panel.waitFor();
  };
  const closePanel = async () => {
    if (!(await panel.isVisible())) return;
    await page.keyboard.press('Escape');
    await panel.waitFor({ state: 'hidden' });
  };
  const choose = async (label, option) => {
    await openPanel();
    if (label === 'Chart') {
      await panel.getByRole('radio', { name: option, exact: true }).check();
      return;
    }
    await panel.getByRole('combobox', { name: label }).click();
    await page.getByRole('option', { name: option, exact: true }).click();
  };
  await choose('Value', 'Sum');
  await figure.getByText('Sum of Hours by Status').waitFor();
  await eventually(async () => (await valueOf('To do')) === '5');
  await figure.getByText(/rows have no number in Hours/).waitFor();
  await choose('Chart', 'Donut');
  await figure.locator('.chart-centre').getByText('10').waitFor();
  await choose('Chart', 'Number');
  await figure.locator('.chart-number-value').getByText('10').waitFor();
  await choose('Chart', 'Horizontal bars');
  await group('To do').waitFor();
  await choose('Value', 'Count of rows');
  await eventually(async () => (await valueOf('To do')) === '4');
  await page.reload();
  await group('To do').waitFor();
  const saved = (await api('GET', path)).views.find((v) => v.type === 'chart');
  assert.equal(saved.chartKind, 'hbar', 'the kind was not saved with the view');
  assert.deepEqual(rowLoads.filter((u) => !u.includes('filter')), [], 'a chart loaded every row instead of the counts');

  // ---- US4: the table and the keyboard ----
  await openPanel();
  await panel.getByRole('switch', { name: 'Show as table' }).click();
  await closePanel();
  const table = figure.locator('table.chart-table');
  await table.waitFor();
  assert.equal(await table.locator('tbody tr').count(), 3, 'the table does not list every group');
  await group('To do').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => document.activeElement?.textContent ?? ''), 'Done1', 'ArrowRight did not move to the next group');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  assert.match(await page.evaluate(() => document.activeElement?.textContent ?? ''), /^No value/, 'the last group let the focus wrap or leave');
  await page.keyboard.press('Enter');
  await rowsSection.getByText('Sixth row', { exact: true }).waitFor();

  // ---- #26: in a document, with the document's own filter ----
  const doc = await api('POST', '/api/pages', { title: 'Weekly note', workspaceId: workspace.id });
  await api('PATCH', `/api/pages/${doc.id}`, {
    content: [{
      id: 'db', type: 'database',
      props: { collectionId, local: JSON.stringify({ viewId: saved.id, views: { [saved.id]: { filters: [{ property: 'status', op: 'is', value: 'done' }] } } }) },
      content: [], children: [],
    }],
  });
  await page.goto(`${base}/p/${doc.id}`);
  const embedded = page.locator('.bn-db-embed figure.chart');
  await embedded.locator('.chart-group', { hasText: 'Done' }).waitFor();
  assert.equal(await embedded.locator('.chart-group').count(), 1, "the document's filter did not reach its chart");
});
