import assert from 'node:assert/strict';
import { eventually, withFixture } from './fixture.mjs';

// A chart is built once and then updated, not rebuilt (#368, #319). The
// owner's two reports: a new chart view on a database of N rows played its
// grow-in animation again and again, about once per row; and changing a chart
// setting drew the chart twice in a row. Both were one bug: every new input
// destroyed the Chart.js chart and built a new one, and every new chart plays
// its animation from zero.
//
// Counted in the page: Chart.js asks a canvas for its 2D context once per
// chart it builds on it, so the calls on the chart's own canvas are the
// number of charts built.
await withFixture(async ({ page, api, base, workspace }) => {
  page.setDefaultTimeout(15000);
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    window.__chartBuilds = 0;
    HTMLCanvasElement.prototype.getContext = function (...args) {
      if (this.closest('.chart-canvas')) window.__chartBuilds++;
      return get.apply(this, args);
    };
  });
  const builds = () => page.evaluate(() => window.__chartBuilds);
  // Long enough for every reload a change sets off (the rows event waits
  // 400 ms before it reloads) and for a 200 ms animation after it.
  const settle = () => page.waitForTimeout(2500);

  const c = await api('POST', '/api/pages', { title: 'Tasks', type: 'collection', workspaceId: workspace.id });
  const options = ['To do', 'Doing', 'Done'].map((name, i) => ({ id: `s${i}`, name, color: '#337ea9' }));
  await api('PUT', `/api/collections/${c.id}`, {
    schema: [
      { id: 'status', name: 'Status', type: 'select', options },
      { id: 'points', name: 'Points', type: 'number' },
    ],
    views: [{ id: 'table', name: 'Table', type: 'table' }],
  });
  for (let i = 0; i < 20; i++) {
    await api('POST', '/api/pages', { parentId: c.id, title: `Task ${i + 1}`, props: { status: `s${i % 3}`, points: i + 1 } });
  }

  // ---- #368: a new chart view on 20 rows is built once ----
  await page.goto(`${base}/p/${c.id}`);
  await page.getByTitle('Add view').click();
  await page.locator('.view-add-menu').getByRole('button', { name: 'Chart', exact: true }).click();
  const figure = page.locator('figure.chart');
  await eventually(async () => (await figure.locator('.chart-group').count()) > 0);
  await settle();
  assert.equal(await builds(), 1, 'a new chart view was built more than once');

  // ---- #319: a changed setting updates the chart, it does not rebuild it ----
  const panel = page.getByRole('dialog', { name: 'Chart settings' });
  await page.locator('.chart-settings').getByRole('button', { name: 'Chart settings' }).click();
  await panel.waitFor();
  const before = await builds();
  // What the canvas shows, so a chart that stopped redrawing altogether does
  // not pass as one that stopped rebuilding.
  const pixels = () => page.locator('.chart-canvas canvas').evaluate((c) => c.toDataURL());
  const labels = () => figure.locator('.chart-group .chart-group-label').allInnerTexts();
  const values = () => figure.locator('.chart-group .chart-group-value').allInnerTexts();
  assert.deepEqual(await labels(), ['To do', 'Doing', 'Done']);
  let drawn = await pixels();
  await panel.getByRole('combobox', { name: 'Sort' }).click();
  await page.getByRole('option', { name: 'Name, Z to A', exact: true }).click();
  await settle();
  assert.equal(await builds(), before, 'changing the sort rebuilt the chart');
  assert.deepEqual(await labels(), ['To do', 'Done', 'Doing'], 'the sort did not reach the chart');
  assert.notEqual(await pixels(), drawn, 'the canvas did not redraw for the new sort');
  drawn = await pixels();

  // A row changed elsewhere (an agent, another tab) updates the chart too.
  const row = (await api('POST', '/api/pages', { parentId: c.id, title: 'Task 21', props: { status: 's0' } })).id;
  assert.ok(row);
  await eventually(async () => (await values()).join(' ') === '8 6 7');
  await settle();
  assert.equal(await builds(), before, 'a row added elsewhere rebuilt the chart');
  assert.notEqual(await pixels(), drawn, 'the canvas did not redraw for the new row');
});
