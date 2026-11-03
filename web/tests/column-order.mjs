import assert from 'node:assert/strict';
import { eventually, withFixture } from './fixture.mjs';

// A table column moves within its view (spec 012, US2, #132): by dragging its
// header, with a marker on the gap it will drop into, and from the header's
// menu by keyboard. The order is the view's own (colOrder): another view of the
// database and the schema, which the Properties dialog sets, keep theirs. The
// resize grip on a header's edge still resizes, the title column stays first,
// and an order an agent set with set_view is drawn.
//
// Before this, a header ignored a drag, and the only way to change the order
// was the Properties dialog, which moved the property in every view.

await withFixture(async ({ page, api, base, path }) => {
  page.setDefaultTimeout(15000);
  const schema = [
    { id: 'status', name: 'Status', type: 'select', options: [{ id: 'todo', name: 'To do' }] },
    { id: 'effort', name: 'Effort', type: 'number' },
    { id: 'due', name: 'Due', type: 'date' },
    { id: 'owner', name: 'Owner', type: 'text' },
  ];
  await api('PUT', path, {
    schema,
    views: [
      { id: 'table', name: 'Table', type: 'table' },
      { id: 'second', name: 'Second', type: 'table' },
    ],
  });
  await page.reload();
  const headers = () => page.locator('.db-table thead th').allTextContents();
  const label = (name) => page.locator('.db-table thead th .th-label', { hasText: name });
  const view = async (id) => (await api('GET', path)).views.find((v) => v.id === id);
  await eventually(async () => (await headers()).join() === 'Name,Status,Effort,Due,Owner');

  // ---- A drag, with the marker on the gap ----
  const drag = async (name, toX, { release = true } = {}) => {
    const box = await label(name).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    // In steps, as a hand moves: the 5px threshold first, then across.
    await page.mouse.move(box.x + box.width / 2 + 8, box.y + box.height / 2, { steps: 2 });
    await page.mouse.move(toX, box.y + box.height / 2, { steps: 8 });
    if (release) await page.mouse.up();
    return box;
  };
  const status = await page.locator('.db-table thead th[data-col-id="status"]').boundingBox();
  await drag('Owner', status.x + 4, { release: false });
  assert.equal(await page.locator('th.col-drop-before[data-col-id="status"]').count(), 1, 'the marker sits on the gap before Status');
  assert.equal(await page.locator('th.is-col-dragged[data-col-id="owner"]').count(), 1, 'the dragged header is dimmed');
  await page.mouse.up();
  await eventually(async () => (await headers()).join() === 'Name,Owner,Status,Effort,Due');
  assert.equal(await page.getByRole('menu').count(), 0, 'the click that ends a drag opens no menu');
  await eventually(async () => JSON.stringify((await view('table')).colOrder) === '["owner","status","effort","due"]');
  assert.equal((await view('second')).colOrder, undefined, 'the other view keeps its order');
  assert.deepEqual((await api('GET', path)).schema.map((p) => p.id), ['status', 'effort', 'due', 'owner'], 'the schema keeps its order');

  // ---- Kept on reload; the second view and the Properties dialog unchanged ----
  await page.reload();
  await eventually(async () => (await headers()).join() === 'Name,Owner,Status,Effort,Due');
  await page.locator('.view-tab', { hasText: 'Second' }).click();
  await eventually(async () => (await headers()).join() === 'Name,Status,Effort,Due,Owner');
  // The properties dialog, from Settings › Edit properties (spec 012, US4).
  await page.locator('.collection-toolbar').getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Edit properties', exact: true }).click();
  const names = await page.locator('.schema-item .schema-row > .prop-input').evaluateAll((inputs) => inputs.map((i) => i.value));
  assert.deepEqual(names, ['Status', 'Effort', 'Due', 'Owner'], 'the Properties dialog keeps the schema order');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.locator('.view-tab', { hasText: 'Table' }).click();
  await eventually(async () => (await headers()).join() === 'Name,Owner,Status,Effort,Due');

  // ---- Escape cancels a drag ----
  await drag('Due', status.x + 4, { release: false });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  assert.equal((await headers()).join(), 'Name,Owner,Status,Effort,Due', 'Escape cancels the drag');

  // ---- The header menu, by keyboard, focus kept ----
  await label('Status').focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu', { name: 'Status column' });
  await menu.waitFor();
  assert.deepEqual(await menu.getByRole('menuitem').allTextContents(), ['Move left', 'Move right', 'Hide in view']);
  await page.keyboard.press('ArrowDown');
  await eventually(async () => (await menu.getByRole('menuitem', { name: 'Move right' }).evaluate((el) => el === document.activeElement)) ||
    (await page.keyboard.press('ArrowDown'), false));
  await page.keyboard.press('Enter');
  await eventually(async () => (await headers()).join() === 'Name,Owner,Effort,Status,Due');
  await eventually(async () => await label('Status').evaluate((el) => el === document.activeElement));
  // The first column has no Move left, the last no Move right.
  await label('Owner').click();
  assert.deepEqual(await page.getByRole('menu', { name: 'Owner column' }).getByRole('menuitem').allTextContents(), ['Move right', 'Hide in view']);
  await page.keyboard.press('Escape');
  await label('Due').click({ button: 'right' });
  assert.deepEqual(await page.getByRole('menu', { name: 'Due column' }).getByRole('menuitem').allTextContents(), ['Move left', 'Hide in view']);
  await page.keyboard.press('Escape');

  // ---- An edge drag still resizes ----
  const effort = await page.locator('.db-table thead th[data-col-id="effort"]').boundingBox();
  const grip = await page.locator('.db-table thead th[data-col-id="effort"] .col-resize').boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 + 60, grip.y + grip.height / 2, { steps: 6 });
  await page.mouse.up();
  await eventually(async () => ((await view('table')).colWidths?.effort ?? 0) > effort.width + 30);
  assert.equal((await headers()).join(), 'Name,Owner,Effort,Status,Due', 'a resize moves nothing');

  // ---- The title stays first ----
  const title = await page.locator('.db-table thead th.db-title-col').boundingBox();
  assert.equal(await page.locator('.db-table thead th.db-title-col .th-label').count(), 0, 'the title has no menu and no drag');
  await drag('Due', title.x + 2);
  await eventually(async () => (await headers()).join() === 'Name,Due,Owner,Effort,Status');

  // ---- Hide in view: gone from this view only ----
  await label('Owner').click();
  await page.getByRole('menuitem', { name: 'Hide in view' }).click();
  await eventually(async () => (await headers()).join() === 'Name,Due,Effort,Status');
  assert.deepEqual((await view('table')).hidden, ['owner']);
  assert.equal((await view('second')).hidden, undefined);

  // ---- An order an agent set is drawn ----
  const { token } = await api('POST', '/api/tokens', { name: 'agent', scope: 'write' });
  const res = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'set_view', arguments: { page_id: path.split('/').pop(), view_id: 'second', column_order: ['due', 'effort'] } },
    }),
  });
  const reply = await res.json();
  assert(!reply.result?.isError && !reply.error, JSON.stringify(reply));
  await page.reload();
  await page.locator('.view-tab', { hasText: 'Second' }).click();
  await eventually(async () => (await headers()).join() === 'Name,Due,Effort,Status,Owner');
});
console.log('Column order: drag with marker, reload, other view and schema unchanged, Escape, keyboard menu with focus, resize, title first, hide, set_view passed.');
