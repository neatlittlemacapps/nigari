import assert from 'node:assert/strict';
import { eventually, withFixture } from './fixture.mjs';

// A board's lanes (spec 013, US4, quickstart §6). A board grouped by Status
// gets a sub-group from Settings; one lane per value of it and a No value
// lane, the right cards in each cell; ten drags between cells each land with
// both values (SC-005), in one change; a lane folds for this person only; a
// formula's lanes are drawn but no drop between them changes anything
// (FR-018); taking the sub-group away gives back the plain board.

await withFixture(async ({ page, api, path }) => {
  page.setDefaultTimeout(15000);
  // Tall enough for all three lanes at once: a drag here does not scroll the
  // page (a mouse wheel does, mid-drag), and the test is about the cells.
  await page.setViewportSize({ width: 1400, height: 1600 });
  const collectionId = path.split('/').pop();
  await api('PUT', path, {
    schema: [
      { id: 'status', name: 'Status', type: 'select', options: [
        { id: 'todo', name: 'To do', color: '#337ea9' },
        { id: 'done', name: 'Done', color: '#448361' },
      ] },
      { id: 'lane', name: 'Team', type: 'select', options: [
        { id: 'x', name: 'Red team', color: '#d44c47' },
        { id: 'y', name: 'Blue team', color: '#337ea9' },
      ] },
      { id: 'score', name: 'Score', type: 'formula', formula: '1+1' },
    ],
    views: [{ id: 'board', name: 'Board', type: 'board', groupBy: 'status' }],
  });
  const rows = (await api('GET', `${path}/rows`)).rows ?? (await api('GET', `${path}/rows`));
  const first = (Array.isArray(rows) ? rows : rows.rows).find((r) => r.title === 'First row');
  await api('PATCH', `/api/pages/${first.id}`, { propsPatch: { status: 'todo', lane: 'x' } });
  await page.reload();
  const board = page.locator('.board');
  await board.waitFor();
  assert.equal(await page.locator('.board-lane').count(), 0, 'lanes before a sub-group');

  // ---- Settings › Sub-group › Team ----
  await page.locator('.collection-toolbar').getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Sub-group/ }).click();
  await page.getByRole('menuitemradio', { name: 'Team' }).click();
  await eventually(async () => (await api('GET', path)).views[0].subGroupBy === 'lane');
  const lane = (id) => page.locator(`.board-lane[data-lane="${id}"]`);
  const cell = (laneId, col) => lane(laneId).locator(`.board-col[data-col$="${col}"]`);
  await lane('x').waitFor();
  assert.deepEqual(await page.locator('.board-lane .board-lane-name').allTextContents(), ['Red team', 'Blue team', 'No Team']);
  await cell('x', 'todo').locator('.board-card', { hasText: 'First row' }).waitFor();
  await cell('__unset__', 'done').locator('.board-card', { hasText: 'Second row' }).waitFor();

  // ---- Ten drags between cells, each landing with both values ----
  const drag = async (title, toLane, toCol) => {
    const card = page.locator('.board-card', { hasText: title }).first();
    const from = await card.boundingBox();
    await page.mouse.move(from.x + 30, from.y + 12);
    await page.mouse.down();
    await page.mouse.move(from.x + 40, from.y + 20, { steps: 2 });
    // Measured twice: once the drag is under way the placeholder and the
    // lifted card change the lanes' heights, so the cell may have moved.
    for (let i = 0; i < 2; i++) {
      const to = await cell(toLane, toCol).boundingBox();
      await page.mouse.move(to.x + to.width / 2, to.y + Math.min(60, to.height / 2), { steps: 6 });
    }
    await page.mouse.up();
  };
  const props = async (id) => (await api('GET', `/api/pages/${id}`)).props;
  const moves = [
    ['y', 'done'], ['x', 'done'], ['__unset__', 'todo'], ['y', 'todo'], ['x', 'todo'],
    ['y', '__unset__'], ['__unset__', '__unset__'], ['x', 'done'], ['y', 'done'], ['x', 'todo'],
  ];
  for (const [toLane, toCol] of moves) {
    await drag('First row', toLane, toCol);
    const want = { lane: toLane === '__unset__' ? '' : toLane, status: toCol === '__unset__' ? '' : toCol };
    await eventually(async () => {
      const p = await props(first.id);
      return (p.lane ?? '') === want.lane && (p.status ?? '') === want.status;
    }).catch(async () => assert.fail(`drag to ${toLane}/${toCol}: stored ${JSON.stringify(await props(first.id))}`));
    await cell(toLane, toCol).locator('.board-card', { hasText: 'First row' }).waitFor();
  }
  // One change per drag, not two: the history has one entry for each.
  const history = await api('GET', `/api/pages/${first.id}/history`).catch(() => null);
  if (Array.isArray(history)) assert(history.length <= moves.length + 2, `history grew by ${history.length} for ${moves.length} drags`);

  // ---- Fold a lane: only its heading and count stay ----
  // The fold is stored a moment later (usePersonalViews); waiting for it
  // keeps the reload below from racing the request.
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/personal/') && r.request().method() === 'PUT'),
    lane('y').getByRole('button', { name: 'Fold lane' }).click(),
  ]);
  await eventually(async () => (await lane('y').locator('.board-col').count()) === 0);
  assert.match(await lane('y').locator('.board-count').textContent(), /^\d+$/);
  await page.reload();
  await lane('y').getByRole('button', { name: 'Unfold lane' }).waitFor();
  assert.equal(await lane('y').locator('.board-col').count(), 0, 'a folded lane opened again after a reload');
  await lane('y').getByRole('button', { name: 'Unfold lane' }).click();
  await lane('y').locator('.board-col').first().waitFor();

  // ---- A formula's lanes: drawn, but no drop between them ----
  const views = (await api('GET', path)).views.map((v) => ({ ...v, subGroupBy: 'score' }));
  await api('PUT', path, { views });
  await page.reload();
  await lane('2').waitFor();
  const before = await props(first.id);
  await drag('First row', '__unset__', 'done');
  await page.waitForTimeout(600);
  assert.deepEqual(await props(first.id), before, 'a drop between formula lanes changed the row');
  // Within its own lane a card still changes column.
  const otherCol = before.status === 'done' ? 'todo' : 'done';
  await drag('First row', '2', otherCol);
  await eventually(async () => (await props(first.id)).status === otherCol);

  // ---- No sub-group: the plain board ----
  await page.locator('.collection-toolbar').getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Sub-group/ }).click();
  await page.getByRole('menuitemradio', { name: 'No sub-group' }).click();
  await eventually(async () => (await page.locator('.board-lane').count()) === 0);
  await page.locator('.board > .board-col').first().waitFor();

  console.log('Board lanes: sub-group from Settings, lanes with No value, ten cell drags with both values, fold kept over a reload, formula lanes refuse a drop between them, back to the plain board passed.');
});
