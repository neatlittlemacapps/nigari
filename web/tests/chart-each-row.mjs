import assert from 'node:assert/strict';
import { eventually, withFixture } from './fixture.mjs';

// Each row (spec 004, FR-030, FR-031). The owner's case: a collection with
// only a name and a number, where the first chart stayed a single number with
// no way to group. What must hold: a new chart there is bars, one per row,
// valued by the number, highest first; switching kinds keeps Each row; a
// row's bar opens that row; and on a database with nothing to group by and no
// number, picking bars says what to add instead of staying a number chart.
await withFixture(async ({ page, api, base, workspace }) => {
  page.setDefaultTimeout(15000);
  const made = async (title, schema) => {
    const c = await api('POST', '/api/pages', { title, type: 'collection', workspaceId: workspace.id });
    await api('PUT', `/api/collections/${c.id}`, { schema, views: [{ id: 'table', name: 'Table', type: 'table' }] });
    return c.id;
  };
  const addChart = async (id) => {
    await page.goto(`${base}/p/${id}`);
    await page.getByTitle('Add view').click();
    await page.locator('.view-add-menu').getByRole('button', { name: 'Chart', exact: true }).click();
  };
  const figure = page.locator('figure.chart');
  const settings = page.locator('.chart-settings');
  const choose = async (label, option) => {
    await settings.getByRole('combobox', { name: label }).click();
    await page.getByRole('option', { name: option, exact: true }).click();
  };

  // ---- the owner's collection: a name and a number ----
  const costs = await made('Costs', [{ id: 'amount', name: 'Amount', type: 'number' }]);
  const ids = {};
  for (const [title, amount] of [['Food', 450], ['Rent', 1200], ['Fun', 80]]) {
    ids[title] = (await api('POST', '/api/pages', { parentId: costs, title, props: { amount } })).id;
  }
  await addChart(costs);
  await figure.getByText('Amount of each row').waitFor();
  const labels = () => figure.locator('.chart-group .chart-group-label').allInnerTexts();
  await eventually(async () => (await labels()).join(' ') === 'Rent Food Fun');
  assert.deepEqual(await figure.locator('.chart-group .chart-group-value').allInnerTexts(), ['1,200', '450', '80'], 'each bar is not its row\'s number');
  await eventually(async () => {
    const v = (await api('GET', `/api/collections/${costs}`)).views.find((x) => x.type === 'chart');
    return v?.groupBy === '__row' && v.agg === 'sum' && v.aggProp === 'amount';
  });
  assert.equal(await settings.getByRole('combobox', { name: 'What to show' }).innerText(), 'Each row', '"What to show" does not say Each row');

  // Kinds switch and keep Each row; a number chart adds the rows up.
  await choose('Chart', 'Donut');
  await figure.locator('.chart-centre').getByText('1,730').waitFor();
  await choose('Chart', 'Number');
  await figure.locator('.chart-number-value').getByText('1,730').waitFor();
  await choose('Chart', 'Vertical bars');
  await eventually(async () => (await labels()).join(' ') === 'Rent Food Fun');

  // A row's bar opens that row (FR-030), in whatever way the view opens rows.
  await figure.locator('.chart-group', { hasText: 'Rent' }).click();
  await eventually(async () => {
    const u = new URL(page.url());
    return u.pathname === `/p/${ids.Rent}` || u.searchParams.get('peek') === ids.Rent;
  });

  // ---- nothing to group by and no number (FR-031) ----
  const names = await made('Names only', []);
  await api('POST', '/api/pages', { parentId: names, title: 'Ada' });
  await addChart(names);
  await figure.locator('.chart-number-value').waitFor();
  await choose('Chart', 'Vertical bars');
  await figure.getByText(/This database has nothing to group by\. Add a select/).waitFor();
  const what = settings.getByRole('combobox', { name: 'What to show' });
  assert.equal(await what.innerText(), 'Nothing to group by');
  assert.ok(await what.isDisabled(), '"What to show" offers a choice there is none of');
  assert.equal(await settings.getByRole('combobox', { name: 'Chart' }).innerText(), 'Vertical bars', 'the kind picked was not kept');
  const stored = (await api('GET', `/api/collections/${names}`)).views.find((x) => x.type === 'chart');
  assert.equal(stored.chartKind, 'number', 'a chart the server cannot draw was saved');
});
