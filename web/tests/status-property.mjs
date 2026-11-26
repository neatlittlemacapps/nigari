import assert from 'node:assert/strict';
import { eventually, withFixture, openTableRow } from './fixture.mjs';

// The status property (spec 016, PR 1): a select whose options sit in three
// groups. In the real UI: a status added in the properties dialog shows its
// options under To-do / In progress / Complete; Move to changes an option's
// group by mouse and by keyboard; the last option of a group cannot be
// deleted; a select converted to a status guesses groups by name; a board
// grouped by it lists columns in group order; a new row starts in the first
// To-do option; a row's side peek sets it through the grouped picker.
await withFixture(async ({ page, api, base, path, open, read }) => {
  page.setDefaultTimeout(15000);
  const collectionId = path.split('/').pop();
  const stored = async () => (await read()).schema;
  const rowsOf = async () => {
    const r = await api('GET', `${path}/rows`);
    return Array.isArray(r) ? r : r.rows;
  };
  // The options deliberately start out of group order: Done first.
  await api('PUT', path, {
    schema: [{ id: 'phase', name: 'Phase', type: 'select', options: [
      { id: 'done', name: 'Done', color: '#448361' },
      { id: 'doing', name: 'Doing', color: '#337ea9' },
      { id: 'backlog', name: 'Backlog', color: '#123456' },
    ] }],
    views: [
      { id: 'table', name: 'Table', type: 'table' },
      { id: 'board', name: 'Board', type: 'board', groupBy: 'phase' },
    ],
  });
  const seed = [];
  for (const [title, phase] of [['Alpha', 'doing'], ['Beta', 'done']]) {
    seed.push(await api('POST', '/api/pages', { parentId: collectionId, title, props: { phase } }));
  }
  await page.goto(`${base}/p/${collectionId}`);
  await open();

  // ---- add a Status property: options under the three headings ----
  const list = page.locator('.schema-list > div');
  await page.getByPlaceholder('New property name').fill('Stage');
  await page.locator('.schema-add').getByLabel('Type').selectOption('status');
  await page.locator('.schema-add').getByRole('button', { name: 'Add', exact: true }).click();
  const stage = list.nth(1);
  await stage.locator('.schema-status-group').first().waitFor();
  const groups = stage.locator('.schema-status-group');
  const headings = () => stage.locator('.schema-status-label').allTextContents();
  const chipsIn = (g) => groups.nth(g).locator('.opt-chip').allTextContents();
  // The dialog renders a moment after a click: wait for the chips instead of reading once.
  const chipsAre = async (g, want, why) => {
    await eventually(async () => JSON.stringify(await chipsIn(g)) === JSON.stringify(want))
      .catch(async () => assert.deepEqual(await chipsIn(g), want, why));
  };
  assert.deepEqual(await headings(), ['To-do', 'In progress', 'Complete'], 'group headings');
  await chipsAre(0, ['Not started']);
  await chipsAre(1, ['In progress']);
  await chipsAre(2, ['Done']);

  // ---- a new option goes into the group whose input it was typed in ----
  const addInput = stage.getByRole('textbox', { name: '+ Option · To-do' });
  await addInput.fill('Later');
  await addInput.press('Enter');
  await chipsAre(0, ['Not started', 'Later']);

  // ---- Move to by mouse: the option changes heading ----
  const chip = (name) => stage.locator('.opt-chip', { hasText: new RegExp(`^${name}$`) });
  const menu = page.getByRole('menu', { name: 'Move to' });
  await chip('Later').click();
  await page.getByRole('button', { name: 'Move to', exact: true }).click();
  await menu.waitFor();
  // The item of the option's current group carries a tick.
  await menu.getByRole('menuitem', { name: 'To-do' }).locator('.ui-menu-tick').waitFor();
  await menu.getByRole('menuitem', { name: 'In progress' }).click();
  await eventually(async () => (await chipsIn(1)).includes('Later'));
  await chipsAre(0, ['Not started'], 'Later left To-do');

  // ---- Move to by keyboard: Tab to the button, Enter, arrows, Enter ----
  await chip('Later').focus();
  await page.keyboard.press('Enter');
  const name = page.getByRole('textbox', { name: 'Option name' });
  await name.waitFor();
  const focused = () => page.evaluate(() => (document.activeElement?.textContent ?? '').trim());
  for (let i = 0; i < 8 && (await focused()) !== 'Move to'; i++) await page.keyboard.press('Tab');
  assert.equal(await focused(), 'Move to', 'Tab never reached Move to');
  await page.keyboard.press('Enter');
  await menu.waitFor();
  for (let i = 0; i < 4 && (await focused()) !== 'Complete'; i++) await page.keyboard.press('ArrowDown');
  assert.equal(await focused(), 'Complete', 'the arrows did not reach Complete');
  await page.keyboard.press('Enter');
  await eventually(async () => (await chipsIn(2)).includes('Later'));
  await chipsAre(1, ['In progress']);

  // ---- the last option of a group cannot be deleted ----
  await chip('Not started').click();
  await page.getByRole('button', { name: 'Delete option', exact: true }).click();
  await page.getByText('Each group needs at least one option. Add another to this group first.').waitFor();
  assert.equal(await page.getByRole('dialog').count(), 0, 'a delete confirmation opened');
  await chipsAre(0, ['Not started'], 'the refused option disappeared');

  // ---- a select becomes a status: groups guessed by name, in group order ----
  await list.nth(0).getByLabel('Type').selectOption('status');
  const phase = list.nth(0).locator('.schema-status-group');
  const phaseChips = (g) => phase.nth(g).locator('.opt-chip').allTextContents();
  await phase.first().waitFor();
  assert.deepEqual(await phaseChips(0), ['Backlog'], 'Backlog is not To-do');
  assert.deepEqual(await phaseChips(1), ['Doing'], 'Doing is not In progress');
  assert.deepEqual(await phaseChips(2), ['Done'], 'Done is not Complete');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('heading', { name: 'Collection properties' }).waitFor({ state: 'hidden' });
  const schema = await stored();
  const byId = Object.fromEntries(schema.map((p) => [p.id, p]));
  assert.equal(byId.phase.type, 'status');
  assert.deepEqual(byId.phase.options.map((o) => [o.id, o.group]),
    [['backlog', 'todo'], ['doing', 'in_progress'], ['done', 'complete']]);
  assert.equal(byId.stage.type, 'status');
  assert.deepEqual(byId.stage.options.map((o) => [o.name, o.group]),
    [['Not started', 'todo'], ['In progress', 'in_progress'], ['Done', 'complete'], ['Later', 'complete']]);
  for (const row of seed) {
    assert.equal((await api('GET', `/api/pages/${row.id}`)).props.phase, row.props.phase, 'the conversion changed a value');
  }

  // ---- a board grouped by it: columns in group order ----
  await page.locator('.view-tab', { hasText: 'Board' }).click();
  await page.locator('.board').waitFor();
  const columns = async () => (await page.locator('.board-col .board-chip').allTextContents()).filter((s) => !/^No /.test(s));
  await eventually(async () => (await columns()).join() === 'Backlog,Doing,Done');

  // ---- a new row starts in the first To-do option ----
  await page.locator('.view-tab', { hasText: 'Table' }).click();
  const before = new Set((await rowsOf()).map((r) => r.id));
  await page.locator('.view-menu-wrap').getByRole('button', { name: 'New', exact: true }).click();
  let fresh;
  await eventually(async () => {
    fresh = (await rowsOf()).find((r) => !before.has(r.id));
    return !!fresh;
  });
  assert.equal((await api('GET', `/api/pages/${fresh.id}`)).props.phase, 'backlog', 'a new row did not start in the first To-do option');

  // ---- set a value in a side peek through the grouped picker ----
  const config = await read();
  config.views[0].openIn = 'side_peek';
  await api('PUT', path, { views: config.views });
  await page.goto(`${base}/p/${collectionId}`);
  await openTableRow(page, 'Alpha');
  const panel = page.getByRole('complementary', { name: 'Page preview' });
  await panel.waitFor();
  await panel.getByRole('button', { name: 'Doing', exact: true }).click();
  const labels = page.locator('.select-group-label');
  await labels.first().waitFor();
  assert.deepEqual(await labels.allTextContents(), ['To-do', 'In progress', 'Complete']);
  await page.locator('.select-option-main', { hasText: 'Done' }).click();
  await eventually(async () => (await api('GET', `/api/pages/${seed[0].id}`)).props.phase === 'done');

  // =====================================================================
  // Part 2 (spec 016, US2, T035): the group features. A tasks database with
  // a status of one option per group, five rows, and a projects database
  // whose rollups count the tasks by group.
  // =====================================================================
  const workspaceId = (await api('GET', '/api/workspaces'))[0].id;
  const tasks = await api('POST', '/api/pages', { title: 'Tasks', type: 'collection', workspaceId });
  const tpath = `/api/collections/${tasks.id}`;
  const opt = (id, name, group) => ({ id, name, color: '#337ea9', group });
  await api('PUT', tpath, {
    schema: [{ id: 'st', name: 'Progress', type: 'status', options: [
      opt('open', 'Open', 'todo'), opt('work', 'Working', 'in_progress'), opt('shipped', 'Shipped', 'complete'),
    ] }],
    views: [
      { id: 'tbl', name: 'Table', type: 'table' },
      { id: 'chart', name: 'Chart', type: 'chart', groupBy: 'st' },
    ],
  });
  const taskRows = {};
  for (const [title, st] of [['T-open-1', 'open'], ['T-open-2', 'open'], ['T-work', 'work'], ['T-ship-1', 'shipped'], ['T-ship-2', 'shipped']]) {
    taskRows[title] = await api('POST', '/api/pages', { parentId: tasks.id, title, props: { st } });
  }
  const tbody = page.locator('.collection-scroll .db-table tbody tr').filter({ hasText: /T-/ });
  const shown = async () => (await tbody.allTextContents()).map((x) => x.match(/T-[a-z]+(?:-\d)?/)?.[0]).sort();
  const shownIs = async (want, why) => {
    const sorted = [...want].sort();
    await eventually(async () => JSON.stringify(await shown()) === JSON.stringify(sorted))
      .catch(async () => assert.deepEqual(await shown(), sorted, why));
  };
  const savedTbl = async () => (await api('GET', tpath)).views.find((v) => v.id === 'tbl');
  const setTbl = async (patch) => api('PUT', tpath, {
    views: (await api('GET', tpath)).views.map((v) => (v.id === 'tbl' ? { ...v, ...patch } : v)),
  });
  await page.goto(`${base}/p/${tasks.id}`);
  await shownIs(['T-open-1', 'T-open-2', 'T-work', 'T-ship-1', 'T-ship-2'], 'the unfiltered table');

  // ---- 1. "Group is not Complete" through the filter row ----
  await page.getByRole('button', { name: /^Filter/ }).click();
  await page.locator('.fs-add').selectOption({ label: 'Progress' });
  const op = page.locator('.fs-op');
  assert.deepEqual((await op.locator('option').allTextContents()).filter((x) => /^Group/.test(x)), ['Group is', 'Group is not'], 'a status offers both group operators');
  await op.selectOption({ label: 'Group is not' });
  await page.locator('.fs-check', { hasText: 'Complete' }).locator('input').check();
  await shownIs(['T-open-1', 'T-open-2', 'T-work'], 'Group is not Complete shows the open rows');
  // A filter edited in the toolbar is the person's own until saved for everyone.
  await page.locator('.fs-backdrop').click({ position: { x: 5, y: 5 } });
  await page.getByRole('button', { name: 'Save for everyone' }).click();
  await eventually(async () => {
    const f = (await savedTbl()).filters?.[0];
    return f?.op === 'group_is_not' && JSON.stringify(f.values) === '["complete"]';
  });
  // An option added to Complete later and one visible row moved onto it: the
  // row leaves the view and the filter is not edited (US2 scenario 1).
  const cfg = await api('GET', tpath);
  const st = cfg.schema.find((p) => p.id === 'st');
  st.options.push(opt('wontdo', "Won't do", 'complete'));
  await api('PUT', tpath, { schema: cfg.schema.map((p) => (p.id === 'st' ? st : p)) });
  await api('PATCH', `/api/pages/${taskRows['T-open-2'].id}`, { props: { st: 'wontdo' } });
  const filterBefore = JSON.stringify((await savedTbl()).filters);
  await page.reload();
  await shownIs(['T-open-1', 'T-work'], 'a row moved to a new Complete option is gone without editing the filter');
  assert.equal(JSON.stringify((await savedTbl()).filters), filterBefore, 'the filter was edited');

  // ---- 3. a row made in a view filtered "Group is In progress" ----
  await setTbl({ filters: [{ property: 'st', op: 'group_is', value: '', values: ['in_progress'] }] });
  await page.reload();
  await shownIs(['T-work'], 'Group is In progress shows the working row');
  const rowIds = async () => {
    const r = await api('GET', `${tpath}/rows`);
    return (Array.isArray(r) ? r : r.rows).map((x) => x.id);
  };
  const had = new Set(await rowIds());
  await page.locator('.view-menu-wrap').getByRole('button', { name: 'New', exact: true }).click();
  let madeId;
  await eventually(async () => {
    madeId = (await rowIds()).find((id) => !had.has(id));
    return !!madeId;
  });
  assert.equal((await api('GET', `/api/pages/${madeId}`)).props.st, 'work', "a new row in a Group is In progress view did not take that group's first option");
  await api('DELETE', `/api/pages/${madeId}`);

  // ---- 2. a quick filter chip lists the groups; a pick filters by group ----
  await setTbl({ filters: [], quickFilters: ['st'] });
  await page.reload();
  const qchip = page.locator('.quick-filters').getByRole('button', { name: /^Progress/ });
  await qchip.waitFor();
  await qchip.click();
  await page.getByRole('menuitem', { name: 'In progress', exact: true }).first().click();
  await shownIs(['T-work'], 'the In progress group pick');
  assert.match(await qchip.textContent(), /Progress: In progress \(group\)/, 'the qchip does not show the group pick');
  await qchip.click();
  await page.getByRole('menuitem', { name: 'Complete', exact: true }).first().click();
  await shownIs(['T-ship-1', 'T-ship-2', 'T-open-2'], 'the Complete group pick includes the option added later');
  await page.getByRole('button', { name: 'Clear Progress' }).click();
  await shownIs(['T-open-1', 'T-open-2', 'T-work', 'T-ship-1', 'T-ship-2'], 'clearing the qchip');

  // ---- 4. rollups counting tasks by group ----
  const projects = await api('POST', '/api/pages', { title: 'Projects', type: 'collection', workspaceId });
  const ppath = `/api/collections/${projects.id}`;
  const rollup = (id, name, agg) => ({
    id, name, type: 'rollup', rollupRelation: 'tasks', rollupTarget: 'st', rollupAgg: agg,
    rollupWhereProp: 'st', rollupWhereOp: 'group_is', rollupWhereValues: ['complete'],
  });
  await api('PUT', ppath, {
    schema: [
      { id: 'tasks', name: 'Tasks', type: 'relation', relationCollection: tasks.id },
      rollup('donecount', 'Done count', 'count'),
      rollup('donepct', 'Done pct', 'percent'),
    ],
    views: [{ id: 'tbl', name: 'Table', type: 'table' }],
  });
  await api('POST', '/api/pages', { parentId: projects.id, title: 'Launch', props: { tasks: Object.values(taskRows).map((r) => r.id) } });
  await page.goto(`${base}/p/${projects.id}`);
  const launch = page.locator('.collection-scroll .db-table tbody tr', { hasText: 'Launch' });
  const cell = async (name) => {
    await launch.waitFor();
    const heads = await page.locator('.collection-scroll .db-table thead th').allTextContents();
    const i = heads.findIndex((h) => h.includes(name));
    assert.ok(i >= 0, `no column ${name} in ${heads}`);
    return (await launch.locator('td, th').nth(i).textContent()).trim();
  };
  const cellIs = async (name, re, why) => {
    await eventually(async () => re.test(await cell(name)))
      .catch(async () => assert.match(await cell(name), re, why));
  };
  // Shipped x2 and Won't do are Complete: 3 of 5.
  await cellIs('Done count', /^3$/, 'the count rollup is the Complete group, an option added later included');
  await cellIs('Done pct', /60/, 'the percent rollup is 3 of 5');
  // Moving a related row to Complete changes it with no condition edit.
  await api('PATCH', `/api/pages/${taskRows['T-work'].id}`, { props: { st: 'shipped' } });
  await page.reload();
  await cellIs('Done count', /^4$/, 'the count rollup did not follow the moved row');
  await cellIs('Done pct', /80/, 'the percent rollup is 4 of 5');
  // The rollup settings show the group operators and the ticked group.
  await open();
  const pctProp = page.locator('.schema-list > div').nth(2);
  await pctProp.locator('.schema-where').waitFor();
  assert.deepEqual((await pctProp.locator('.schema-where select option').allTextContents()).filter((x) => /^Group/.test(x)), ['Group is', 'Group is not']);
  assert.equal(await pctProp.locator('.schema-where .fs-check.on', { hasText: 'Complete' }).count(), 1, 'the rollup condition does not show Complete ticked');
  await page.keyboard.press('Escape');

  // ---- 5. a chart grouped by the status: by option, then by status group ----
  await api('PATCH', `/api/pages/${taskRows['T-work'].id}`, { props: { st: 'work' } });
  await page.goto(`${base}/p/${tasks.id}`);
  await page.locator('.view-tab', { hasText: 'Chart' }).click();
  const figure = page.locator('figure.chart');
  const barLabels = async () => (await figure.locator('.chart-group .chart-group-label').allTextContents()).map((x) => x.trim());
  await eventually(async () => (await barLabels()).includes('Working'));
  assert.deepEqual((await barLabels()).slice(0, 4), ['Open', 'Working', 'Shipped', "Won't do"], 'by option');
  await page.locator('.chart-settings').getByRole('button', { name: 'Chart settings' }).click();
  const cpanel = page.getByRole('dialog', { name: 'Chart settings' });
  await cpanel.getByRole('combobox', { name: 'Group by' }).click();
  await page.getByRole('option', { name: 'Status group', exact: true }).click();
  await eventually(async () => (await barLabels()).join() === 'To-do,In progress,Complete')
    .catch(async () => assert.deepEqual(await barLabels(), ['To-do', 'In progress', 'Complete']));
  const valueOf = async (n) => (await figure.locator('.chart-group', { hasText: n }).locator('.chart-group-value').innerText()).trim();
  assert.deepEqual([await valueOf('To-do'), await valueOf('In progress'), await valueOf('Complete')], ['1', '1', '3'], 'the bars count rows by group');
  await eventually(async () => (await api('GET', tpath)).views.find((v) => v.id === 'chart').statusGroups === true);
  await page.keyboard.press('Escape');

  console.log('Status property: groups under headings, Move to by mouse and keyboard, last option kept, select converted by name, board columns in group order, new row in first To-do, side peek picker, group filter, quick filter chip, new row in a group view, rollup by group, chart by status group passed.');
});
