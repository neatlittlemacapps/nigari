import assert from 'node:assert/strict';
import { eventually, withFixture } from './fixture.mjs';

// Every table row has a handle and a + (spec 022, #370). A drag on the
// handle moves the row, with the editor's drop line on the gap it lands in;
// the server saves it by neighbour, so the order survives a reload and a
// filter's hidden rows keep their places. Escape cancels. The + adds a row
// right below (Alt: above). In a tree only the top-level rows have a handle.
//
// Before this, a table's rows could not be put in order at all.

await withFixture(async ({ page, api, base, path }) => {
  page.setDefaultTimeout(15000);
  const collectionId = path.split('/').pop();
  await api('PUT', path, {
    schema: [
      { id: 'kind', name: 'Kind', type: 'select', options: [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }] },
      { id: 'kids', name: 'Sub-items', type: 'relation', relationCollection: collectionId },
    ],
    views: [
      { id: 'table', name: 'Table', type: 'table' },
      { id: 'alpha', name: 'Alpha only', type: 'table', filters: [{ property: 'kind', op: 'is', value: 'a' }] },
    ],
  });
  // The fixture's own two rows go, so the order below is the whole database.
  for (const r of (await api('GET', `${path}/rows?limit=50`)).rows) await api('DELETE', `/api/pages/${r.id}`);
  const ids = {};
  for (const [title, kind] of [['A', 'a'], ['B', 'b'], ['C', 'a'], ['D', 'b'], ['E', 'a']]) {
    ids[title] = (await api('POST', '/api/pages', { parentId: collectionId, title, props: { kind } })).id;
  }
  // A new row has no title of its own (the interface says Untitled): _ here.
  const serverOrder = async () => (await api('GET', `${path}/rows?limit=50`)).rows.map((r) => r.title || '_').join('');
  const shown = () => page.locator('.db-table tbody tr[data-row-id] .db-title-link').allTextContents();
  const row = (title) => page.locator('.db-table tbody tr[data-row-id]', { has: page.locator('.db-title-link', { hasText: new RegExp(`^${title}$`) }) });

  await page.goto(`${base}/p/${collectionId}`);
  await eventually(async () => (await shown()).join('') === 'ABCDE');

  // ---- A drag, with the line on the gap ----
  const grab = async (title) => {
    await row(title).hover();
    const box = await row(title).locator('.db-row-handle').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 8, { steps: 2 });
  };
  const over = async (title, part) => {
    const b = await row(title).boundingBox();
    await page.mouse.move(b.x + 200, b.y + b.height * part, { steps: 8 });
  };
  await grab('E');
  await over('B', 0.25);
  assert.equal(await row('B').evaluate((tr) => tr.classList.contains('row-drop-before')), true, 'the line sits on the gap above B');
  assert.equal(await row('E').evaluate((tr) => tr.classList.contains('is-row-dragged')), true, 'the dragged row is faded');
  await page.mouse.up();
  await eventually(async () => (await shown()).join('') === 'AEBCD');
  await eventually(async () => (await serverOrder()) === 'AEBCD');
  assert.equal(await page.getByRole('menu').count(), 0, 'the release that ends a drag opens no menu');

  // To the last place.
  await grab('A');
  await over('D', 0.9);
  await page.mouse.up();
  await eventually(async () => (await serverOrder()) === 'EBCDA');

  // ---- Escape cancels ----
  await grab('C');
  await over('E', 0.2);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  assert.equal(await page.locator('.db-table tr.row-drop-before, .db-table tr.row-drop-after').count(), 0, 'Escape took the line away');
  await page.waitForTimeout(300);
  assert.equal(await serverOrder(), 'EBCDA', 'a cancelled drag moves nothing');

  // ---- Kept on reload ----
  await page.reload();
  await eventually(async () => (await shown()).join('') === 'EBCDA');

  // ---- A filtered view: the hidden rows keep their places ----
  await page.locator('.view-tab', { hasText: 'Alpha only' }).click();
  await eventually(async () => (await shown()).join('') === 'ECA');
  await grab('A');
  await over('C', 0.2);
  await page.mouse.up();
  await eventually(async () => (await shown()).join('') === 'EAC');
  // Just before C in the database: B, which this view hides, stays before
  // it, and D after C.
  await eventually(async () => (await serverOrder()) === 'EBACD');
  await page.locator('.view-tab', { hasText: 'Table' }).click();
  await eventually(async () => (await shown()).join('') === 'EBACD');

  // ---- The +: below, and above with Alt ----
  await row('B').hover();
  await row('B').locator('.db-row-add').click();
  await eventually(async () => (await serverOrder()) === 'EB_ACD');
  await row('C').hover();
  await row('C').locator('.db-row-add').click({ modifiers: ['Alt'] });
  await eventually(async () => (await serverOrder()) === 'EB_A_CD');

  // ---- The row's menu: from the handle, a right-click, and back ----
  await row('A').hover();
  await row('A').locator('.db-row-handle').click();
  const menu = page.getByRole('menu', { name: 'Row actions' });
  await menu.waitFor();
  for (const name of ['Open', 'Open in', 'Add row below', 'Edit property', 'Comment', 'Copy link', 'Duplicate', 'Move to trash']) {
    assert.equal(await menu.getByRole('menuitem', { name, exact: true }).count(), 1, `the row menu offers ${name}`);
  }
  await menu.getByText(/^Edited .* by /).waitFor();
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'hidden' });
  assert.equal(await row('A').locator('.db-row-handle').evaluate((b) => b === document.activeElement), true, 'Escape gives focus back to the handle');
  // Edit property › Kind opens that cell's own editor.
  await row('A').locator('.db-row-handle').click();
  await menu.getByRole('menuitem', { name: 'Edit property', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Kind', exact: true }).click();
  await page.locator('.select-menu').waitFor();
  await page.locator('.select-backdrop').click();
  // A right-click anywhere on the row opens the same menu at the pointer;
  // Duplicate puts the copy right below, Move to trash takes it away.
  await row('C').locator('td').nth(2).click({ button: 'right' });
  await menu.getByRole('menuitem', { name: 'Duplicate', exact: true }).click();
  await eventually(async () => (await serverOrder()) === 'EB_A_CCopy of CD');
  await row('Copy of C').locator('td').nth(2).click({ button: 'right' });
  await menu.getByRole('menuitem', { name: 'Move to trash', exact: true }).click();
  await page.locator('.confirm-dialog').getByRole('button', { name: 'Move to trash' }).click();
  await eventually(async () => (await serverOrder()) === 'EB_A_CD');

  // ---- A tree: only top-level rows have a handle ----
  await api('PATCH', `/api/pages/${ids.E}`, { propsPatch: { kids: [ids.D] } });
  await api('PUT', path, {
    ...(await api('GET', path)),
    views: [{ id: 'table', name: 'Table', type: 'table', subItemProp: 'kids' }],
  });
  await page.reload();
  await row('D').waitFor();
  await row('D').hover();
  assert.equal(await row('D').locator('.db-row-handle:not(.is-menu-only)').count(), 0, 'a sub-item has no drag handle: its place is its relation\'s order');
  assert.equal(await row('D').locator('.db-row-handle.is-menu-only').count(), 1, 'a sub-item\'s handle still opens its menu');
  assert.equal(await row('E').locator('.db-row-handle:not(.is-menu-only)').count(), 1, 'a top-level row keeps its handle');

  // ---- A sorted view: the drag takes the sort away, for this person only ----
  // (owner, 2026-11-23). The rows are drawn in their own order as the drag
  // starts, so the line shows where the row really goes; the bar offers Reset
  // and Save for everyone; the new place is shared at once either way.
  for (const r of (await api('GET', `${path}/rows?limit=50`)).rows) if (!r.title) await api('DELETE', `/api/pages/${r.id}`);
  await api('PATCH', `/api/pages/${ids.E}`, { propsPatch: { kids: [] } });
  const sorted = { id: 'table', name: 'Table', type: 'table', sort: { property: 'kind', dir: 'asc' } };
  await api('PUT', path, { ...(await api('GET', path)), views: [sorted] });
  const sharedSort = async () => (await api('GET', path)).views[0].sort;
  await page.reload();
  // Alpha first (E, A, C by their own order), then Beta (B, D).
  await eventually(async () => (await shown()).join('') === 'EACBD');
  await grab('D');
  await eventually(async () => (await shown()).join('') === 'EBACD');
  await over('E', 0.2);
  await page.mouse.up();
  await eventually(async () => (await serverOrder()) === 'DEBAC');
  await eventually(async () => (await shown()).join('') === 'DEBAC');
  const bar = page.locator('.view-change-bar');
  await bar.waitFor();
  assert.match(await bar.textContent(), /Only you see these changes/);
  assert.deepEqual(await sharedSort(), { property: 'kind', dir: 'asc' }, 'the view keeps its sort for everyone else');
  // Reset: the sort comes back, and D keeps its new place among the Betas.
  await bar.getByRole('button', { name: 'Reset' }).click();
  await eventually(async () => (await shown()).join('') === 'EACDB');
  assert.equal(await serverOrder(), 'DEBAC', 'Reset brings the sort back, not the old order');

  // ---- Locked views: a sorted view still drags (the sort is the person's own) ----
  assert.ok((await page.request.fetch(`${base}${path}/lock`, { method: 'PUT' })).ok());
  await page.reload();
  await eventually(async () => (await shown()).join('') === 'EACDB');
  await grab('B');
  await over('D', 0.2);
  await page.mouse.up();
  await eventually(async () => (await serverOrder()) === 'BDEAC');
  assert.deepEqual(await sharedSort(), { property: 'kind', dir: 'asc' }, 'a lock keeps the shared sort');

  console.log('row-handle: drag, line, Escape, reload, filtered view, + below and above, row menu, tree, sorted view, locked view');
});
