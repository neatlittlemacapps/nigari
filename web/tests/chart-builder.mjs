import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { eventually, withFixture } from './fixture.mjs';

// The chart builder (spec 004, US5): Notion's flow, as the owner walked
// through it. What must hold: each of the five / entries asks for a database
// and leaves a chart of its kind with the settings open (FR-018, R14); every
// setting survives a reload (SC-007); hovering a bar shows our tooltip
// (R17); Save chart as gives a PNG (FR-026); and a viewer of the workspace sees
// the chart and can save it, but gets no settings (FR-027).
await withFixture(async ({ page, context, api, base, workspace, path }) => {
  page.setDefaultTimeout(15000);
  const collectionId = path.split('/').pop();
  const config = await api('GET', path);
  await api('PUT', path, { schema: [...config.schema, { id: 'hours', name: 'Hours', type: 'number' }] });
  for (const [title, props] of [
    ['Third row', { status: 'todo', hours: 2 }],
    ['Fourth row', { status: 'done', hours: 7 }],
  ]) await api('POST', '/api/pages', { parentId: collectionId, title, props });

  const panel = page.getByRole('dialog', { name: 'Chart settings' });
  const newDoc = async (title) => {
    const doc = await api('POST', '/api/pages', { title, workspaceId: workspace.id });
    await api('PATCH', `/api/pages/${doc.id}`, { content: [{ id: 'intro', type: 'paragraph', props: {}, content: [], children: [] }] });
    await page.goto(`${base}/p/${doc.id}`);
    return doc.id;
  };
  const slash = async (entry) => {
    await page.locator('[data-id="intro"] .bn-inline-content').click();
    await page.keyboard.type('/' + entry);
    await page.locator('.bn-suggestion-menu').waitFor();
    await page.keyboard.press('Enter');
  };
  const chartBlocks = async (docId) => {
    const doc = await api('GET', `/api/pages/${docId}`);
    return JSON.stringify(doc.content);
  };

  // ---- the five / entries ----
  const entries = [
    ['Bar chart', 'Vertical bars', 'bar'],
    ['Horizontal bar chart', 'Horizontal bars', 'hbar'],
    ['Line chart', 'Line', 'line'],
    ['Donut chart', 'Donut', 'donut'],
    ['Number chart', 'Number', 'number'],
  ];
  let barDoc = '';
  for (const [entry, radio, kind] of entries) {
    const docId = await newDoc(entry);
    if (kind === 'bar') barDoc = docId;
    await slash(entry);
    await page.getByText('Choose a database to chart').waitFor();
    await page.locator('.bn-db-picker').getByRole('button', { name: /Option editing test/ }).click();
    await panel.waitFor();
    assert.ok(await panel.getByRole('radio', { name: radio, exact: true }).isChecked(), `${entry}: the settings show another kind`);
    await page.keyboard.press('Escape');
    await panel.waitFor({ state: 'hidden' });
    await page.locator('figure.chart').waitFor();
    // The block shows the new view, and the view is of the asked kind.
    let viewId = '';
    await eventually(async () => {
      const m = (await chartBlocks(docId)).match(/viewId\\+":\\+"(v[a-z0-9]+)/);
      viewId = m?.[1] ?? '';
      return !!viewId;
    });
    const view = (await api('GET', path)).views.find((v) => v.id === viewId);
    assert.equal(view?.type, 'chart', `${entry}: no chart view was added`);
    assert.equal(view.chartKind ?? 'bar', kind, `${entry}: the view is of another kind`);
  }

  // ---- every setting survives a reload (SC-007) ----
  await page.goto(`${base}/p/${barDoc}`);
  const figure = page.locator('figure.chart');
  await figure.locator('.chart-group').first().waitFor();
  const open = async () => {
    if (await panel.isVisible()) return;
    await page.getByRole('button', { name: 'Chart settings' }).click();
    await panel.waitFor();
  };
  const choose = async (label, option) => {
    await open();
    await panel.getByRole('combobox', { name: label }).click();
    await page.getByRole('option', { name: option, exact: true }).click();
  };
  await choose('Value', 'Sum');
  await choose('Sort', 'Value, high to low');
  await choose('Colours', 'Blue');
  await choose('Height', 'Large');
  await panel.getByRole('switch', { name: 'Value labels' }).click();
  await panel.getByRole('switch', { name: 'Done' }).click();
  await panel.getByRole('textbox', { name: 'Caption' }).fill('Hours per status');
  await page.keyboard.press('Escape');
  await panel.waitFor({ state: 'hidden' });
  await eventually(async () => {
    const v = (await api('GET', path)).views.find((x) => x.chartStyle?.caption === 'Hours per status');
    return v && v.agg === 'sum' && v.aggProp === 'hours' && v.chartSort === 'value_desc' && v.chartStyle.palette === 'blue' &&
      v.chartStyle.height === 'large' && v.chartStyle.labels === true && v.hiddenGroups?.includes('done');
  });
  await page.reload();
  await figure.getByText('Hours per status').waitFor();
  await open();
  for (const [label, want] of [['Value', 'Sum'], ['Of', 'Hours'], ['Sort', 'Value, high to low'], ['Colours', 'Blue'], ['Height', 'Large']]) {
    assert.equal((await panel.getByRole('combobox', { name: label }).innerText()).trim(), want, `${label} did not survive a reload`);
  }
  assert.ok(await panel.getByRole('switch', { name: 'Value labels' }).isChecked(), 'value labels did not survive a reload');
  assert.ok(!(await panel.getByRole('switch', { name: 'Done' }).isChecked()), 'a hidden group came back after a reload');
  assert.equal(await panel.getByRole('textbox', { name: 'Caption' }).inputValue(), 'Hours per status');
  await page.keyboard.press('Escape');
  await panel.waitFor({ state: 'hidden' });
  assert.equal(await figure.locator('.chart-group', { hasText: 'Done' }).count(), 0, 'a hidden group is still drawn');

  // ---- the tooltip (R17) ----
  const box = await figure.locator('.chart-canvas canvas').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.8);
  const tip = figure.locator('.chart-tooltip');
  await tip.waitFor();
  assert.match(await tip.innerText(), /To do[\s\S]*Click to view data/, 'the tooltip does not name the group and the click');
  await page.mouse.move(1, 1);
  await tip.waitFor({ state: 'hidden' });

  // ---- Save chart as (FR-026) ----
  await page.getByRole('button', { name: 'Save chart as' }).click();
  const save = page.getByRole('dialog', { name: 'Save chart as' });
  await save.waitFor();
  const [download] = await Promise.all([page.waitForEvent('download'), save.getByRole('button', { name: 'Download PNG' }).click()]);
  assert.match(download.suggestedFilename(), /\.png$/);
  const file = readFileSync(await download.path());
  assert.ok(file.length > 2000 && file.subarray(1, 4).toString() === 'PNG', 'the download is not a picture of the chart');
  await page.keyboard.press('Escape');

  // ---- a viewer: the chart and Save, no settings (FR-027) ----
  const password = randomUUID();
  await api('POST', '/api/users', { name: 'Vera Viewer', email: 'viewer@example.test', password, workspaces: [{ id: workspace.id, role: 'viewer' }] });
  const other = await context.browser().newContext({ viewport: { width: 1200, height: 900 }, locale: 'en-US' });
  const login = await other.request.fetch(`${base}/api/login`, { method: 'POST', data: { email: 'viewer@example.test', password } });
  assert.ok(login.ok(), `the viewer could not sign in: ${login.status()}`);
  const viewer = await other.newPage();
  await viewer.goto(`${base}/p/${barDoc}`);
  await viewer.locator('figure.chart .chart-group').first().waitFor();
  assert.ok(await viewer.getByRole('button', { name: 'Save chart as' }).isVisible(), 'a viewer cannot save the chart');
  assert.equal(await viewer.getByRole('button', { name: 'Chart settings' }).count(), 0, 'a viewer is offered the settings');
  await other.close();
});
