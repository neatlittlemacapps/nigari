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
  const serverRowsOf = async (id) => (await api('GET', `/api/collections/${id}/rows?limit=50`)).rows;

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


  // ---- Lists, dates, layouts, phone and dark (PR 3: T025's rest, T028, T030) ----
  const notes = await api('POST', '/api/pages', { title: 'Grouped notes', type: 'collection', workspaceId: workspace.id });
  const notesPath = `/api/collections/${notes.id}`;
  await api('PUT', notesPath, {
    schema: [
      { id: 'status', name: 'Status', type: 'select', options },
      { id: 'due', name: 'Due', type: 'date' },
    ],
    views: [
      { id: 'list', name: 'List', type: 'list', grouped: true, groupBy: 'status' },
      { id: 'board', name: 'Board', type: 'board', groupBy: 'status' },
      // A table made before spec 024 from a board: its groupBy is kept from
      // the board, unused, and it must stay flat (SC-004).
      { id: 'old', name: 'Old table', type: 'table', groupBy: 'status' },
    ],
  });
  // 2 and 4 March 2026 are in ISO week 10, 20 March in week 12.
  for (const [title, props] of [
    ['Monday note', { status: 'todo', due: '2026-03-02' }],
    ['Wednesday note', { status: 'todo', due: '2026-03-04' }],
    ['Later note', { status: 'doing', due: '2026-03-20' }],
    ['April note', { status: 'done', due: '2026-04-15' }],
    ['Undated note', {}],
  ]) await api('POST', '/api/pages', { parentId: notes.id, title, props });
  const notesView = async (id) => (await api('GET', notesPath)).views.find((v) => v.id === id);
  const tab = (name) => page.locator('.view-tab', { hasText: new RegExp(`^${name}$`) });
  const listGroup = (name) => page.locator('.list-group-head', { has: page.locator('.db-group-name', { hasText: new RegExp(`^${name}$`) }) });
  const listRowsAfter = (name) => listGroup(name).evaluate((head) => {
    const out = [];
    for (let el = head.nextElementSibling; el && el.classList.contains('list-row'); el = el.nextElementSibling) out.push(el.querySelector('.list-row-title')?.textContent);
    return out;
  });

  // A grouped list: a header with its count before each group's rows.
  await page.goto(`${base}/p/${notes.id}`);
  await page.locator('.list-group-head').first().waitFor();
  assert.deepEqual(await heads(), [
    { name: 'To do', count: 2 },
    { name: 'Doing', count: 1 },
    { name: 'Done', count: 1 },
    { name: 'No Status', count: 1 },
  ]);
  assert.deepEqual(await listRowsAfter('To do'), ['Monday note', 'Wednesday note']);
  // Folding, the person's own, as in a table.
  await listGroup('To do').getByRole('button', { name: 'Collapse group' }).click();
  await eventually(async () => (await listRowsAfter('To do')).length === 0);
  await listGroup('To do').getByRole('button', { name: 'Expand group' }).click();
  await eventually(async () => (await listRowsAfter('To do')).length === 2);
  // Hidden from the header's menu, for everyone.
  await listGroup('Done').hover();
  await listGroup('Done').getByRole('button', { name: 'Group actions' }).click();
  await page.getByRole('menuitem', { name: 'Hide group' }).click();
  await eventually(async () => JSON.stringify((await notesView('list')).hiddenGroups) === '["done"]');
  await eventually(async () => (await listGroup('Done').count()) === 0);

  // A date groups by month unless another period is chosen; the Group menu
  // offers the period, and a new period forgets what the old one hid.
  await groupMenu();
  await page.locator('.view-group-menu select').first().selectOption('due');
  await eventually(async () => (await notesView('list')).groupBy === 'due');
  await eventually(async () => (await heads()).length === 3);
  assert.deepEqual((await heads()).map((h) => h.count), [3, 1, 1], 'by month: March 3, April 1, No Due 1');
  assert.match((await heads())[0].name, /March 2026/);
  const period = page.locator('.view-group-menu').getByRole('combobox', { name: 'Period' });
  assert.equal(await period.inputValue(), 'month');
  await period.selectOption('week');
  await eventually(async () => (await notesView('list')).groupPeriod === 'week');
  await eventually(async () => (await heads()).length === 4);
  assert.deepEqual((await heads()).map((h) => h.count), [2, 1, 1, 1], 'by ISO week: week 10 has 2, week 12, April and No Due 1');
  assert.match((await heads())[0].name, /^Week of /);
  await closePopover();

  // Grouped by a date's period, a drop into another group cannot write a
  // value: a table refuses it with no line (FR-011).
  const withDate = await api('GET', notesPath);
  const put = await api('PUT', notesPath, { schema: withDate.schema, views: [...withDate.views, { id: 'bydate', name: 'By date', type: 'table', grouped: true, groupBy: 'due', groupPeriod: 'month' }] });
  await eventually(async () => !!(await notesView('bydate')));
  await page.reload();
  await tab('By date').click();
  await page.locator('tbody.db-group').first().waitFor();
  await grab('March 2026', 'Monday note');
  await glideTo(rowIn('April 2026', 'April note'), 0.25);
  assert.equal(await page.locator('.row-drop-before, .row-drop-after, .row-drop-into').count(), 0, 'a date grouping shows a drop into another group');
  await page.mouse.up();
  await page.waitForTimeout(300);
  assert.equal((await serverRowsOf(notes.id)).find((r) => r.title === 'Monday note')?.props.due, '2026-03-02', 'a refused drop changed the date');

  // A table from before grouping stays flat; a board turned into a table is
  // grouped by its columns' property.
  await tab('Old table').click();
  await page.locator('.db-table tr[data-row-id]').first().waitFor();
  assert.equal(await page.locator('.db-group-head').count(), 0, 'an old converted table is grouped');
  await tab('Board').click();
  await page.locator('.collection-toolbar').getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('menu', { name: /view settings$/ }).getByRole('menuitem', { name: /^Layout/ }).hover();
  await page.getByRole('menuitemradio', { name: 'Table', exact: true }).click();
  await eventually(async () => (await notesView('board')).type === 'table' && (await notesView('board')).grouped === true);
  await eventually(async () => (await heads()).map((h) => h.name).join('|') === 'To do|Doing|Done|No Status');

  // At phone width, in light and dark: the headers span the list and read
  // clearly (their text against their own background).
  const contrast = (el) => {
    const rgb = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    const lum = (c) => { const [r, g, b] = rgb(c); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    let bg = 'rgba(0, 0, 0, 0)';
    for (let n = el; n && /rgba\(0, 0, 0, 0\)|transparent/.test(bg); n = n.parentElement) bg = getComputedStyle(n).backgroundColor;
    const [a, b] = [lum(getComputedStyle(el).color), lum(bg)].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
  };
  // Views are tabs on a wide screen and one menu on a phone: pick at full
  // width, then narrow.
  const onPhone = async (view, scheme) => {
    await page.setViewportSize({ width: 1200, height: 900 });
    await tab(view).click();
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 390, height: 800 });
    await page.locator('.db-group-head').first().waitFor();
  };
  for (const scheme of ['light', 'dark']) {
    await onPhone('List', scheme);
    const list = await page.locator('.list-view').boundingBox();
    const head = await page.locator('.list-group-head').first().boundingBox();
    assert.ok(head.width >= list.width - 2, `${scheme}: a list header does not span the list on a phone (${head.width} of ${list.width})`);
    const ratio = await page.locator('.list-group-head .db-group-name').first().evaluate(contrast);
    assert.ok(ratio >= 4.5, `${scheme}: a group header's text has contrast ${ratio.toFixed(2)}`);
    // A view named after its layout takes the new layout's name.
    await onPhone((await notesView('board')).name, scheme);
    const tableRatio = await page.locator('tbody.db-group .db-group-name').first().evaluate(contrast);
    assert.ok(tableRatio >= 4.5, `${scheme}: a table group header's text has contrast ${tableRatio.toFixed(2)}`);
  }
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 1200, height: 900 });

  console.log('table-groups: headers, totals, folding, hide and show, order, empty groups, drag within and between groups, into an empty group, several values, a reader, a formula grouping, a grouped list, dates by month and week, old and converted tables, phone, light and dark');

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
