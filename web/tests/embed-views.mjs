import assert from 'node:assert/strict';
import { eventually, withFixture } from './fixture.mjs';

// A database embedded in a document has views of its own (spec 014, US1, US2,
// US3, US5). Everything a person does to the embed's views (add, copy from the
// database's, rename, move, remove, settings) lives in the document; the
// database's own views are compared before and after and must not move
// (SC-001). An embed written before this spec, in the old shape, shows what it
// showed and becomes a list of views of its own only on its first change.

await withFixture(async ({ page, api, base, workspace, path, read }) => {
  page.setDefaultTimeout(15000);
  const collectionId = path.split('/').pop();
  const embedDoc = async (title, blocks) => {
    const doc = await api('POST', '/api/pages', { title, workspaceId: workspace.id });
    await api('PATCH', `/api/pages/${doc.id}`, { content: blocks });
    return doc;
  };
  const block = (id, local = '') => ({ id, type: 'database', props: { collectionId, local }, content: [], children: [] });
  // What the document stores for an embed: its block's `local`, decoded.
  const storedLocal = async (doc, id) => {
    const content = (await api('GET', `/api/pages/${doc.id}`)).content;
    const props = content.find((b) => b.id === id)?.props ?? {};
    return props.local ? JSON.parse(props.local) : null;
  };
  const dbViews = async () => JSON.stringify((await read()).views);
  // Each takes an embed (a locator), so two embeds in one document are told apart.
  const tabs = (emb) => emb.locator('.view-tab');
  const tabNames = async (emb) => (await tabs(emb).allInnerTexts()).map((s) => s.trim());
  const addMenu = (emb) => emb.locator('.view-add');
  const menuNamed = (name) => page.getByRole('menu', { name });
  const dialogFill = async (value, button) => {
    const dialog = page.locator('.modal-overlay').last();
    await dialog.waitFor();
    await dialog.locator('input').fill(value);
    await dialog.getByRole('button', { name: button, exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
  };

  const original = await dbViews();

  // ---- An embed written before this spec shows what it showed (SC-002) ----
  const doc = await embedDoc('Plan', [block('emb')]);
  await page.goto(`${base}/p/${doc.id}`);
  const embed = page.locator('.bn-db-embed').first();
  await tabs(embed).first().waitFor();
  assert.deepEqual(await tabNames(embed), ['Table', 'Board'], "the embed offers the database's views");
  await eventually(async () => (await page.locator('.bn-db-embed .db-table tbody tr').filter({ hasText: /row/ }).count()) === 1);
  assert.equal(await storedLocal(doc, 'emb'), null, 'looking at an embed wrote to the document');

  // A new row made in the embed's view takes what its filters fix (the table
  // is filtered to Status is To do), sent as the view's filters because the
  // view lives in the document, not in the database (spec 014, R5).
  const rowsBefore = (await api('GET', `/api/collections/${collectionId}/rows?limit=100`)).total;
  await embed.getByRole('button', { name: 'New', exact: true }).click();
  await eventually(async () => (await api('GET', `/api/collections/${collectionId}/rows?limit=100`)).total === rowsBefore + 1);
  const newRow = (await api('GET', `/api/collections/${collectionId}/rows?limit=100`)).rows.find((r) => r.title === '');
  assert.equal(newRow?.props?.status, 'todo', 'a row made in the embed did not take the value its filter fixes');
  await eventually(async () => (await page.locator('.bn-db-embed .db-table tbody tr').count()) >= 2);

  // Opening the Board tab writes the open view, in the shape the block had.
  await tabs(embed).nth(1).click();
  await eventually(async () => (await storedLocal(doc, 'emb'))?.viewId === 'board');
  assert.equal((await storedLocal(doc, 'emb')).v, undefined, 'a tab switch turned an old embed into the new shape');

  // ---- Add a view with the ＋: the document changes, the database does not ----
  await addMenu(embed).click();
  await menuNamed('Add view').getByRole('menuitem', { name: 'List', exact: true }).click();
  await eventually(async () => (await tabNames(embed)).includes('List'));
  // The editor saves the document a moment after the change.
  await eventually(async () => (await storedLocal(doc, 'emb'))?.v === 2);
  const local = await storedLocal(doc, 'emb');
  assert.equal(local.v, 2, 'the first change did not write the new shape');
  assert.deepEqual(local.views.map((v) => v.name), ['Table', 'Board', 'List']);
  assert.equal(local.viewId, local.views[2].id, 'the new view is not the open one');
  assert.equal(await dbViews(), original, "adding a view in a document changed the database's views");
  assert.equal(await menuNamed('Add view').count(), 0);

  // ---- Start from one of the database's views (US2) ----
  await addMenu(embed).click();
  const add = menuNamed('Add view');
  await add.getByText('Views on Option editing test', { exact: true }).waitFor();
  assert.equal(await add.getByRole('menuitem', { name: 'Form', exact: true }).count(), 0, 'an embed was offered a form');
  await add.getByRole('menuitem', { name: 'Board', exact: true }).last().click();
  await eventually(async () => (await tabNames(embed)).length === 4);
  await eventually(async () => (await storedLocal(doc, 'emb')).views.length === 4);
  const copied = (await storedLocal(doc, 'emb')).views[3];
  assert.equal(copied.type, 'board');
  assert.equal(copied.groupBy, 'status', "the copy lost the database view's grouping");
  assert.notEqual(copied.id, 'board', 'the copy shares an id with the database view');
  assert.equal(await dbViews(), original, 'copying a view changed the database');

  // Changing the copy leaves the database's view alone.
  await embed.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('menu', { name: /view settings$/ }).getByRole('menuitem', { name: 'Rename view' }).click();
  await dialogFill('Sprint board', 'Rename');
  await eventually(async () => (await storedLocal(doc, 'emb')).views[3].name === 'Sprint board');
  assert.equal(await dbViews(), original, 'renaming the copy renamed the database view');

  // ---- A filter saved for everyone goes into the embed only (US1) ----
  await tabs(embed).first().click();
  await embed.locator('.fs-controls button', { hasText: 'Filter' }).first().click();
  await page.locator('.fs-remove').first().click();
  // The popover closes on a click beside it.
  await page.locator('.fs-backdrop').click({ position: { x: 5, y: 5 } });
  await page.locator('.fs-backdrop').waitFor({ state: 'hidden' });
  await embed.getByRole('button', { name: 'Save for everyone', exact: true }).click();
  await eventually(async () => ((await storedLocal(doc, 'emb')).views[0].filters ?? []).length === 0);
  assert.equal(await dbViews(), original, 'a filter saved in the embed changed the database');

  // ---- Move, then remove ----
  await tabs(embed).nth(2).click({ button: 'right' });
  await page.getByRole('menu', { name: 'View actions' }).getByRole('menuitem', { name: 'Move left', exact: true }).click();
  await eventually(async () => (await storedLocal(doc, 'emb')).views[1].name === 'List');
  assert.equal(await dbViews(), original);
  for (let i = 0; i < 3; i++) {
    await tabs(embed).last().click({ button: 'right' });
    await page.getByRole('menu', { name: 'View actions' }).getByRole('menuitem', { name: 'Remove view', exact: true }).click();
    await eventually(async () => (await tabNames(embed)).length === 3 - i);
  }
  await eventually(async () => (await storedLocal(doc, 'emb')).views.length === 1);
  await tabs(embed).first().click({ button: 'right' });
  const actions = page.getByRole('menu', { name: 'View actions' });
  await actions.waitFor();
  assert.equal(await actions.getByRole('menuitem', { name: 'Remove view', exact: true }).count(), 0, 'the last view of an embed can be removed');
  await page.keyboard.press('Escape');
  assert.equal(await dbViews(), original, 'removing the embed views changed the database');

  // ---- Two embeds of one database in one document stay apart ----
  const two = await embedDoc('Two', [block('one'), block('two')]);
  await page.goto(`${base}/p/${two.id}`);
  await eventually(async () => (await page.locator('.bn-db-embed').count()) === 2);
  const first = page.locator('.bn-db-embed').nth(0);
  const second = page.locator('.bn-db-embed').nth(1);
  await addMenu(first).click();
  await menuNamed('Add view').getByRole('menuitem', { name: 'Gallery', exact: true }).click();
  await eventually(async () => (await tabNames(first)).includes('Gallery'));
  assert.deepEqual(await tabNames(second), ['Table', 'Board'], "a view added to one embed appeared in the other");
  await eventually(async () => ((await storedLocal(two, 'one'))?.views ?? []).length === 3);
  assert.equal(await storedLocal(two, 'two'), null, 'the other embed was written');
  assert.equal(await dbViews(), original);

  // ---- An embed made by an agent (the new shape) shows its own views ----
  const made = await embedDoc('Agent made', [block('agent', JSON.stringify({
    v: 2,
    viewId: 'mine',
    views: [{ id: 'mine', name: 'Only mine', type: 'list' }, { id: 'other', name: 'Another', type: 'gallery' }],
  }))]);
  await page.goto(`${base}/p/${made.id}`);
  await tabs(embed).first().waitFor();
  assert.deepEqual(await tabNames(embed), ['Only mine', 'Another']);
  assert.equal(await dbViews(), original);

  console.log("Embed views: add, copy, rename, filter, move, remove all stay in the document; the database's views never moved.");
});
