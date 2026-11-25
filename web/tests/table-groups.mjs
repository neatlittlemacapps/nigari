import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eventually, withFixture } from './fixture.mjs';

// A table grouped by a property (spec 024, PR 2a): a header per group with
// its value and count, the group's own totals, folding that is the person's
// own and survives a reload, Collapse all and Expand all, a hidden group and
// Show, the order reversed with No value still last, empty groups, a row with
// several values in each of its groups, and No grouping back to a flat table
// with its foot. The Group menu sets the grouping as a person would.

await withFixture(async ({ page, context, api, base, workspace }) => {
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

  // ---- Dragging rows within and between groups (PR 2b, T024) ----
  const group = (name) => page.locator('tbody.db-group', { has: page.locator('.db-group-name', { hasText: new RegExp(`^${name}$`) }) });
  const rowIn = (name, title) => group(name).locator('tr[data-row-id]', { has: page.locator('.db-title-link', { hasText: new RegExp(`^${title}$`) }) });
  const grab = async (name, title) => {
    await rowIn(name, title).hover();
    const box = await rowIn(name, title).locator('.db-row-handle').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 8, { steps: 2 });
  };
  // Glide, then one more small step: a move's effect shows with the next.
  const glideTo = async (locator, part) => {
    const b = await locator.boundingBox();
    await page.mouse.move(b.x + 200, b.y + b.height * part, { steps: 10 });
    await page.mouse.move(b.x + 201, b.y + b.height * part, { steps: 1 });
  };
  const serverRows = async () => (await api('GET', `${path}/rows?limit=50`)).rows;
  const statusOf = async (title) => (await serverRows()).find((r) => r.title === title)?.props.status;
  const order = async () => (await serverRows()).map((r) => r.title).join('|');

  // Within a group: the shared order, as in a flat table; the value stays.
  await grab('To do', 'Plan tasks');
  await glideTo(rowIn('To do', 'Write spec'), 0.25);
  assert.equal(await rowIn('To do', 'Write spec').evaluate((tr) => tr.classList.contains('row-drop-before')), true, 'no line above Write spec');
  await page.mouse.up();
  await eventually(async () => (await rowsOf('To do')).join('|') === 'Plan tasks|Write spec');
  await eventually(async () => (await order()).startsWith('Plan tasks|Write spec'));
  assert.equal(await statusOf('Plan tasks'), 'todo', 'a drag within a group changed the value');

  // Into another group: the group's value, at the spot of the line, in one request.
  await grab('To do', 'Write spec');
  await glideTo(rowIn('Doing', 'Build it'), 0.25);
  assert.equal(await rowIn('Doing', 'Build it').evaluate((tr) => tr.classList.contains('row-drop-before')), true, 'no line above Build it in Doing');
  await page.mouse.up();
  await eventually(async () => (await statusOf('Write spec')) === 'doing');
  await eventually(async () => (await rowsOf('Doing')).join('|') === 'Write spec|Build it');
  assert.ok((await order()).includes('Write spec|Build it'), `Write spec is not just before Build it: ${await order()}`);
  await page.reload();
  await group('Doing').waitFor();
  assert.deepEqual(await rowsOf('Doing'), ['Write spec', 'Build it'], 'the drop is gone after a reload');
  assert.deepEqual(await rowsOf('To do'), ['Plan tasks']);

  // Into an empty group: the line under its header, and the value alone.
  await grab('Done', 'Ship it');
  await glideTo(group('Blocked').locator('.db-group-head'), 0.5);
  assert.equal(await group('Blocked').locator('.db-group-head').evaluate((tr) => tr.classList.contains('row-drop-into')), true, 'the empty group shows no drop');
  await page.mouse.up();
  await eventually(async () => (await statusOf('Ship it')) === 'blocked');
  await eventually(async () => (await rowsOf('Blocked')).join('|') === 'Ship it');

  // Escape cancels a drag into another group: nothing changes.
  await grab('Doing', 'Build it');
  await glideTo(rowIn('To do', 'Plan tasks'), 0.75);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.waitForTimeout(300);
  assert.equal(await statusOf('Build it'), 'doing', 'a cancelled drag changed the value');

  // A reader folds groups but has no handle to drag by.
  const readerPw = randomUUID();
  await api('POST', '/api/users', { name: 'Rae Reader', email: 'reader@example.test', password: readerPw, workspaces: [{ id: workspace.id, role: 'viewer' }] });
  const readerCtx = await context.browser().newContext({ viewport: { width: 1200, height: 900 }, locale: 'en-US' });
  assert.ok((await readerCtx.request.fetch(`${base}/api/login`, { method: 'POST', data: { email: 'reader@example.test', password: readerPw } })).ok());
  const reader = await readerCtx.newPage();
  await reader.goto(`${base}/p/${db.id}`);
  await reader.locator('.db-group-head').first().waitFor();
  assert.equal(await reader.locator('tbody.db-group tr[data-row-id] .db-row-handle:not(.is-menu-only)').count(), 0, 'a reader can drag a grouped row');
  const readerDoing = reader.locator('.db-group-head', { has: reader.locator('.db-group-name', { hasText: /^Doing$/ }) });
  await readerDoing.getByRole('button', { name: 'Collapse group' }).click();
  await readerDoing.getByRole('button', { name: 'Expand group' }).waitFor();
  await readerCtx.close();

  // Grouped by a formula, no drop into another group can write a value: no
  // line there, and the release changes nothing. Within a group it still moves.
  const withFormula = await api('GET', path);
  await api('PUT', path, {
    ...withFormula,
    schema: [...withFormula.schema, { id: 'size', name: 'Size', type: 'formula', formula: '{est} * 2' }],
    views: withFormula.views.map((v) => (v.id === 'table' ? { ...v, groupBy: 'size', hiddenGroups: undefined } : v)),
  });
  await page.reload();
  await eventually(async () => (await heads()).filter((h) => h.count > 0).length >= 2);
  const [small, large] = (await heads()).filter((h) => h.count > 0).map((h) => h.name);
  const smallRows = await rowsOf(small);
  await grab(small, smallRows[0]);
  await glideTo(group(large).locator('tr[data-row-id]').first(), 0.25);
  assert.equal(await page.locator('.row-drop-before, .row-drop-after, .row-drop-into').count(), 0, 'a formula grouping shows a drop into another group');
  await page.mouse.up();
  await page.waitForTimeout(300);
  assert.deepEqual(await rowsOf(small), smallRows, 'a refused drop moved the row');
  await api('PUT', path, { ...withFormula, views: withFormula.views });
  await page.reload();
  await page.locator('.db-group-head').first().waitFor();

  // A row with several values is in each of its groups.
  await groupMenu();
  await page.locator('.view-group-menu select').selectOption('tags');
  await closePopover();
  await eventually(async () => (await view()).groupBy === 'tags');
  await eventually(async () => (await heads()).length >= 2);
  assert.deepEqual(await rowsOf('Alpha'), ['Plan tasks', 'Write spec']);
  assert.deepEqual(await rowsOf('Beta'), ['Plan tasks', 'Build it']);

  // Dragged out of one of its groups, a row with several values loses only
  // that one: Plan tasks from Alpha into No Tags keeps Beta.
  await grab('Alpha', 'Plan tasks');
  await glideTo(group('No Tags').locator('tr[data-row-id]').first(), 0.25);
  await page.mouse.up();
  await eventually(async () => JSON.stringify((await serverRows()).find((r) => r.title === 'Plan tasks')?.props.tags) === '["b"]');
  await eventually(async () => (await rowsOf('Alpha')).join('|') === 'Write spec');
  assert.ok((await rowsOf('Beta')).includes('Plan tasks'), 'Plan tasks left Beta too');

  // A click on a grouped row's handle still opens its menu.
  const handle = page.locator('tbody.db-group tr[data-row-id] .db-row-handle').first();
  await handle.hover();
  await handle.click();
  await page.getByRole('menuitem', { name: 'Open', exact: true }).waitFor();
  await page.keyboard.press('Escape');

  // Every group hidden: the table says so instead of drawing nothing.
  const all = await api('GET', path);
  await api('PUT', path, { ...all, views: all.views.map((v) => (v.id === 'table' ? { ...v, hiddenGroups: ['a', 'b', ''] } : v)) });
  await page.reload();
  await page.getByText('Every group is hidden. Show one from the Group menu.').waitFor();
  await api('PUT', path, { ...all, views: all.views.map((v) => (v.id === 'table' ? { ...v, hiddenGroups: undefined } : v)) });
  await page.reload();
  await page.locator('.db-group-head').first().waitFor();

  // No grouping: a flat table with its foot again.
  await groupMenu();
  await page.locator('.view-group-menu select').selectOption('');
  await closePopover();
  await eventually(async () => (await view()).grouped !== true);
  await eventually(async () => (await page.locator('.db-group-head').count()) === 0);
  assert.equal(await page.locator('.db-table > tfoot').count(), 1, 'the flat table has no foot');
  assert.equal(await page.locator('.db-table tr[data-row-id]').count(), 5);

  console.log('table-groups: headers, totals, folding, hide and show, order, empty groups, drag within and between groups, into an empty group, several values, a reader, a formula grouping');

  // SC-002 (T026): grouping, folding and unfolding 5,000 rows, timed against
  // the flat table's draw. Only with MEASURE set: 5,000 rows take a while to
  // make, and the numbers go into the pull request, not into an assertion
  // (a CI runner's speed is not the product's).
  if (process.env.MEASURE) {
    const big = await api('POST', '/api/pages', { title: 'Five thousand', type: 'collection', workspaceId: workspace.id });
    const bigPath = `/api/collections/${big.id}`;
    await api('PUT', bigPath, {
      schema: [{ id: 'status', name: 'Status', type: 'select', options }, { id: 'est', name: 'Estimate', type: 'number' }],
      views: [{ id: 'table', name: 'Table', type: 'table' }],
    });
    for (let i = 0; i < 5000; i += 50) {
      await Promise.all(Array.from({ length: 50 }, (_, j) =>
        api('POST', '/api/pages', { parentId: big.id, title: `Row ${i + j}`, props: { status: options[(i + j) % 4].id, est: (i + j) % 7 } })));
    }
    await page.goto(`${base}/p/${big.id}`);
    await eventually(async () => (await page.locator('.db-table tr[data-row-id]').count()) === 5000);
    // Runs `act` in the page and waits, frame by frame, for `done`: the time
    // from the change to the frame that shows it.
    const timed = (act, done) => page.evaluate(async ([act, done]) => {
      const t0 = performance.now();
      new Function(act)();
      for (;;) {
        await new Promise((r) => requestAnimationFrame(r));
        if (new Function(`return (${done})`)()) return Math.round(performance.now() - t0);
      }
    }, [act, done]);
    const pick = (value) => `const s = document.querySelector('.view-group-menu select');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, '${value}');
      s.dispatchEvent(new Event('change', { bubbles: true }));`;
    const rowsDrawn = (n) => `document.querySelectorAll('.db-table tr[data-row-id]').length === ${n}`;
    const runs = { flat: [], grouped: [], fold: [], unfold: [] };
    for (let k = 0; k < 3; k++) {
      await groupMenu();
      runs.grouped.push(await timed(pick('status'), `document.querySelectorAll('.db-group-head').length === 4 && ${rowsDrawn(5000)}`));
      await closePopover();
      const fold = `document.querySelector('.db-group-head button[aria-expanded]').click()`;
      runs.fold.push(await timed(fold, rowsDrawn(3750)));
      runs.unfold.push(await timed(fold, rowsDrawn(5000)));
      await groupMenu();
      runs.flat.push(await timed(pick(''), `document.querySelectorAll('.db-group-head').length === 0 && ${rowsDrawn(5000)}`));
      await closePopover();
    }
    console.log('table-groups: 5,000 rows, ms per run', JSON.stringify(runs));
  }

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
