// A row's page manages its database's properties (spec 015, #582). A
// property's name opens its menu (Rename, Edit property, Property
// visibility, Duplicate property, Delete property); + Add a property sits
// under the list; properties hidden on row pages fold under "N more
// properties". A table's column heading offers the same property actions
// beside its own (move, hide): both menus come from one list
// (actions/propertyActions.ts). Before this, the row's page only changed
// values, and every property change meant the Edit properties dialog.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eventually, withFixture } from './fixture.mjs';

await withFixture(async ({ page, api, base, workspace, path, read }) => {
  page.setDefaultTimeout(15000);
  const collectionId = path.split('/').pop();
  const first = (await api('GET', `/api/collections/${collectionId}/rows`)).rows?.find?.((r) => r.title === 'First row')
    ?? (await api('GET', '/api/pages')).find((p) => p.title === 'First row');
  const props = page.locator('.row-props');
  const name = (n) => props.getByRole('button', { name: n, exact: true });
  const menu = page.getByRole('menu');
  const ask = page.locator('.confirm-dialog');
  const schemaNames = async () => (await read()).schema.map((p) => p.name);
  const prop = async (id) => (await read()).schema.find((p) => p.id === id);

  await page.goto(`${base}/p/${first.id}`);
  await props.waitFor();

  // ---- the menu, by click and by keyboard ----
  await name('Status').click();
  await menu.waitFor();
  const items = await menu.getByRole('menuitem').allInnerTexts();
  assert.deepEqual(items.map((s) => s.trim().split('\n')[0]), ['Rename', 'Edit property', 'Property visibility', 'Duplicate property', 'Delete property']);
  assert.match(items[2], /Always show/, 'the submenu does not show its current value');
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'hidden' });
  await eventually(async () => (await page.evaluate(() => document.activeElement?.textContent)) === 'Status');
  await page.keyboard.press('Enter');
  await menu.waitFor();
  await page.keyboard.press('Escape');

  // ---- rename: Enter saves, Escape cancels ----
  await name('Labels').click();
  await menu.getByRole('menuitem', { name: 'Rename' }).click();
  const field = props.getByRole('textbox', { name: 'Property name' });
  await field.fill('Tags');
  await field.press('Escape');
  await name('Labels').waitFor();
  assert.deepEqual(await schemaNames(), ['Status', 'Labels'], 'Escape saved the rename');
  await name('Labels').click();
  await menu.getByRole('menuitem', { name: 'Rename' }).click();
  await field.fill('Tags');
  await field.press('Enter');
  await name('Tags').waitFor();
  await eventually(async () => (await schemaNames()).join() === 'Status,Tags');

  // ---- a change made elsewhere since the page opened is kept ----
  const stored = await read();
  await api('PUT', path, { schema: [...stored.schema, { id: 'estimate', name: 'Estimate', type: 'number' }] });
  await name('Tags').click();
  await menu.getByRole('menuitem', { name: 'Duplicate property' }).click();
  await eventually(async () => (await schemaNames()).join() === 'Status,Tags,Copy of Tags,Estimate');
  const copy = (await read()).schema[2];
  assert.equal(copy.type, 'multiselect');
  assert.deepEqual(copy.options.map((o) => o.name), ['To do', 'Done', 'Third'], 'the copy lost its options');
  await name('Copy of Tags').waitFor();

  // ---- edit property: a type change saves at once; the rest on close ----
  await name('Copy of Tags').click();
  await menu.getByRole('menuitem', { name: 'Edit property' }).click();
  const panel = page.getByRole('dialog', { name: 'Edit property' });
  await panel.waitFor();
  await panel.getByRole('combobox', { name: 'Type' }).selectOption('select');
  await eventually(async () => (await prop(copy.id)).type === 'select');
  await panel.getByPlaceholder('+ Option').fill('Later');
  await panel.getByPlaceholder('+ Option').press('Enter');
  // An option's own editor opens outside the panel; using it must not close
  // the panel (review finding).
  await panel.getByRole('button', { name: 'Later', exact: true }).click();
  const optionName = page.getByRole('textbox', { name: 'Option name' });
  await optionName.fill('Later on');
  await page.keyboard.press('Escape');
  await optionName.waitFor({ state: 'hidden' });
  assert(await panel.isVisible(), 'editing an option closed the panel');
  await panel.getByRole('textbox', { name: 'Property name' }).fill('Phase');
  assert.equal((await prop(copy.id)).name, 'Copy of Tags', 'the panel saved before it closed');
  await page.keyboard.press('Escape');
  await panel.waitFor({ state: 'hidden' });
  await eventually(async () => (await prop(copy.id)).name === 'Phase');
  assert((await prop(copy.id)).options.some((o) => o.name === 'Later on'), 'the new option was not saved');

  // ---- delete asks, naming the property and the database ----
  await name('Phase').click();
  await menu.getByRole('menuitem', { name: 'Delete property' }).click();
  await ask.waitFor();
  assert.match(await ask.locator('.confirm-message').innerText(), /Delete “Phase” from “Option editing test”\? It will be removed from all views\./);
  await ask.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert((await schemaNames()).includes('Phase'), 'Cancel deleted the property');
  await name('Phase').click();
  await menu.getByRole('menuitem', { name: 'Delete property' }).click();
  await ask.getByRole('button', { name: 'Delete property', exact: true }).click();
  await eventually(async () => !(await schemaNames()).includes('Phase'));

  // ---- add a property: pick a type, it is made with the type's name, its
  // name opens for editing ----
  await props.getByRole('button', { name: 'Add a property' }).click();
  await page.getByRole('menu', { name: 'Add a property' }).getByRole('menuitem', { name: 'Date', exact: true }).click();
  await eventually(async () => (await read()).schema.some((p) => p.name === 'Date' && p.type === 'date'));
  const newName = props.getByRole('textbox', { name: 'Property name' });
  await newName.waitFor();
  assert.equal(await newName.inputValue(), 'Date');
  await newName.fill('Due');
  await newName.press('Enter');
  await eventually(async () => (await read()).schema.some((p) => p.name === 'Due' && p.type === 'date'));
  await name('Due').waitFor();

  // ---- visibility: always hide, hide when empty, the fold ----
  const visibility = async (n, choice) => {
    await name(n).click();
    await menu.getByRole('menuitem', { name: 'Property visibility' }).click();
    await page.getByRole('menuitemradio', { name: choice }).click();
  };
  await visibility('Estimate', 'Always hide');
  await eventually(async () => (await prop('estimate')).pageVisibility === 'hide');
  await visibility('Due', 'Hide when empty');
  const dueId = (await read()).schema.find((p) => p.name === 'Due').id;
  await eventually(async () => (await prop(dueId)).pageVisibility === 'hide_empty');
  // Set while open, Due stays where it is until the page opens again.
  await name('Due').waitFor();
  await page.reload();
  await props.waitFor();
  const fold = props.getByRole('button', { name: /more propert/ });
  assert.equal((await fold.innerText()).trim(), '2 more properties');
  assert.equal(await name('Estimate').count(), 0, 'an always-hidden property is shown');
  assert.equal(await name('Due').count(), 0, 'an empty hide-when-empty property is shown');
  await fold.click();
  await name('Estimate').waitFor();
  await name('Due').waitFor();
  assert.equal(await props.getByRole('img', { name: 'Hidden on row pages' }).count(), 2);
  await props.getByRole('button', { name: 'Hide 2 properties' }).click();
  await name('Estimate').waitFor({ state: 'hidden' });
  // Not remembered: unfolded, then another page, then back: folded again.
  await fold.click();
  await page.goto(`${base}/p/${collectionId}`);
  await page.goto(`${base}/p/${first.id}`);
  await props.waitFor();
  assert.equal(await name('Estimate').count(), 0, 'the fold was remembered');
  // A filled hide-when-empty property shows.
  await api('PATCH', `/api/pages/${first.id}`, { propsPatch: { [dueId]: '2026-11-14' } });
  await page.reload();
  await props.waitFor();
  await name('Due').waitFor();
  assert.equal((await fold.innerText()).trim(), '1 more property');
  // Always show again removes the key.
  await fold.click();
  await visibility('Estimate', 'Always show');
  await eventually(async () => !('pageVisibility' in (await prop('estimate'))));
  // A view is not affected: the table still shows every column.
  await page.goto(`${base}/p/${collectionId}`);
  await page.locator('.db-table thead').waitFor();
  const heads = await page.locator('.db-table thead th').allInnerTexts();
  assert(heads.some((h) => /due/i.test(h)), 'a hidden-on-row-pages property left the table');

  // ---- the column heading: the same property actions, and the view's ----
  await page.locator('.db-table thead').getByRole('button', { name: 'Status', exact: true }).click();
  await menu.waitFor();
  const headItems = (await menu.getByRole('menuitem').allInnerTexts()).map((s) => s.trim().split('\n')[0]);
  assert.deepEqual(headItems, ['Rename', 'Edit property', 'Duplicate property', 'Move right', 'Hide in view', 'Delete property']);
  await menu.getByRole('menuitem', { name: 'Rename' }).click();
  const headField = page.locator('.db-table thead').getByRole('textbox', { name: 'Property name' });
  await headField.fill('State');
  await headField.press('Enter');
  await eventually(async () => (await prop('status')).name === 'State');

  // ---- in a side peek ----
  const stored2 = await read();
  await api('PUT', path, { views: stored2.views.map((v) => (v.type === 'table' ? { ...v, openIn: 'side_peek' } : v)) });
  await page.reload();
  await page.locator('.db-title-link', { hasText: 'First row' }).click();
  const peek = page.getByRole('complementary', { name: 'Page preview' });
  await peek.waitFor();
  await peek.locator('.row-props').getByRole('button', { name: 'State', exact: true }).click();
  await menu.getByRole('menuitem', { name: 'Rename' }).waitFor();
  const hit = await menu.getByRole('menuitem', { name: 'Rename' }).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
  });
  assert(hit, 'the property menu is drawn under the side peek');
  await page.keyboard.press('Escape');

  // ---- a reader: plain labels, no Add, but the fold opens ----
  const password = randomUUID();
  await api('POST', '/api/users', { name: 'Rita Reader', email: 'reader@example.test', password, workspaces: [{ id: workspace.id, role: 'viewer' }] });
  const other = await page.context().browser().newContext({ viewport: { width: 1200, height: 900 }, locale: 'en-US' });
  const login = await other.request.fetch(`${base}/api/login`, { method: 'POST', data: { email: 'reader@example.test', password } });
  assert.ok(login.ok(), `the reader could not sign in: ${login.status()}`);
  const reader = await other.newPage();
  await reader.goto(`${base}/p/${first.id}`);
  const rprops = reader.locator('.row-props');
  await rprops.waitFor();
  assert.equal(await rprops.getByRole('button', { name: 'State', exact: true }).count(), 0, 'a reader got a property menu');
  assert.equal(await rprops.getByRole('button', { name: 'Add a property' }).count(), 0, 'a reader was offered Add a property');
  await api('PUT', path, { schema: (await read()).schema.map((p) => (p.id === 'estimate' ? { ...p, pageVisibility: 'hide' } : p)) });
  await reader.reload();
  await rprops.getByRole('button', { name: '1 more property' }).click();
  await rprops.getByText('Estimate', { exact: true }).waitFor();
  await other.close();
});
console.log('Row properties: menu, rename, a change elsewhere kept, duplicate, edit panel, delete, add, visibility and fold, column heading, side peek and reader passed.');
