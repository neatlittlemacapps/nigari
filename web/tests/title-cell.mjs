import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eventually, withFixture } from './fixture.mjs';

// A table row's name cell (spec 026, #981). The name was one button that
// opened the row, so renaming meant opening it. What must hold now:
// - an editor's click on the cell (beside a short name too) renames in place,
//   Enter saves, Escape keeps the old name, a double click does not open;
// - the Open button opens the row as the view says (full page, side peek),
//   ⌘/Ctrl on it or on the name opens a tab of its own;
// - with a row in the peek its button reads Close, the row is tinted, and
//   Close shuts the peek; in a grouped table every copy says so, and only the
//   clicked copy turns into a field;
// - Enter on the focused name edits and Tab reaches Open;
// - a reader's click opens the row and the button is there for them too;
// - on a touch screen every row shows its button and a tap edits.

await withFixture(async ({ page, context, api, base, workspace }) => {
  page.setDefaultTimeout(15000);
  const db = await api('POST', '/api/pages', { title: 'Projects', type: 'collection', workspaceId: workspace.id });
  const path = `/api/collections/${db.id}`;
  await api('PUT', path, {
    schema: [{ id: 'tags', name: 'Tags', type: 'multiselect', options: [{ id: 'a', name: 'Alpha', color: '#337ea9' }, { id: 'b', name: 'Beta', color: '#448361' }] }],
    views: [{ id: 'table', name: 'Table', type: 'table' }],
  });
  const rows = {};
  for (const [title, props] of [
    ['Roadmap review', { tags: ['a'] }],
    ['Launch notes', { tags: ['a', 'b'] }],
    ['Short', {}],
  ]) rows[title] = await api('POST', '/api/pages', { parentId: db.id, title, props });
  const titleOf = async (id) => (await api('GET', `/api/pages/${id}`)).title;
  const row = (p, title) => p.locator('tr[data-row-id]', { has: p.locator('.db-title-link', { hasText: new RegExp(`^${title}$`) }) });
  const field = (p) => p.getByRole('textbox', { name: 'Row title' });
  // Over the name cell: the side peek covers the middle of a row.
  const hover = (p, title) => row(p, title).locator('td.db-title-col').hover({ position: { x: 12, y: 10 } });
  const panel = page.getByRole('complementary', { name: 'Page preview' });
  const setView = async (patch) => {
    const config = await api('GET', path);
    Object.assign(config.views[0], patch);
    await api('PUT', path, { views: config.views });
  };

  await page.goto(`${base}/p/${db.id}`);
  await page.locator('.db-table').waitFor();

  // ---- US1: a click renames in place ----
  await row(page, 'Roadmap review').locator('.db-title-link').click();
  await field(page).waitFor();
  assert.equal(new URL(page.url()).pathname, `/p/${db.id}`, 'a click on the name left the table');
  assert.equal(await field(page).inputValue(), 'Roadmap review', 'the field does not hold the name');
  assert.equal(await field(page).evaluate((el) => el === document.activeElement), true, 'the field has no cursor in it');
  // The row being typed hides its button; the others keep theirs.
  const editing = page.locator('tr[data-editing]');
  assert.equal(await editing.count(), 1, 'not exactly one row is editing');
  assert.equal(await editing.locator('.ui-cell-action').isVisible(), false, 'the button of the row being typed still shows');
  await field(page).fill('Roadmap review Q1');
  await page.keyboard.press('Enter');
  await eventually(async () => (await titleOf(rows['Roadmap review'].id)) === 'Roadmap review Q1');
  await row(page, 'Roadmap review Q1').waitFor();
  assert.equal(await field(page).count(), 0, 'the field stayed after Enter');

  // Escape keeps the old name.
  await row(page, 'Launch notes').locator('.db-title-link').click();
  await field(page).fill('Thrown away');
  await page.keyboard.press('Escape');
  await row(page, 'Launch notes').waitFor();
  assert.equal(await titleOf(rows['Launch notes'].id), 'Launch notes', 'Escape saved the name');

  // The whole cell is the target: the empty space beside a short name edits.
  const shortCell = row(page, 'Short').locator('td.db-title-col');
  const box = await shortCell.boundingBox();
  const link = await row(page, 'Short').locator('.db-title-link').boundingBox();
  assert(box.x + box.width - (link.x + link.width) > 80, 'the short name fills its cell; the check would prove nothing');
  await page.mouse.click(link.x + link.width + 40, box.y + box.height / 2);
  await field(page).waitFor();
  await page.keyboard.press('Escape');

  // A double click edits too, and opens nothing.
  await row(page, 'Short').locator('.db-title-link').dblclick();
  await field(page).waitFor();
  assert.equal(new URL(page.url()).pathname, `/p/${db.id}`, 'a double click left the table');
  await page.keyboard.press('Escape');

  // An empty name saves as an unnamed row.
  await row(page, 'Short').locator('.db-title-link').click();
  await field(page).fill('');
  await page.keyboard.press('Enter');
  await eventually(async () => (await titleOf(rows.Short.id)) === '');
  await row(page, 'Untitled').waitFor();

  // ---- US2: the Open button, full page ----
  const target = row(page, 'Launch notes');
  await hover(page, 'Launch notes');
  const open = target.getByRole('button', { name: 'Open Launch notes' });
  assert.equal(await open.evaluate((el) => getComputedStyle(el.parentElement).opacity), '1', 'hover does not show the Open button');
  const other = row(page, 'Roadmap review Q1').locator('.ui-cell-action');
  assert.equal(await other.evaluate((el) => getComputedStyle(el).opacity), '0', 'a row not hovered shows its button');
  assert.equal(await other.evaluate((el) => el.closest('tr').offsetHeight), await target.evaluate((el) => el.offsetHeight), 'rows differ in height');
  await open.click();
  await page.waitForURL((u) => u.pathname === `/p/${rows['Launch notes'].id}`);

  // ⌘/Ctrl on the name opens the row in a tab of its own, for an editor too.
  await page.goto(`${base}/p/${db.id}`);
  await row(page, 'Launch notes').locator('.db-title-link').click({ modifiers: ['ControlOrMeta'] });
  await page.waitForURL((u) => u.pathname === `/p/${rows['Launch notes'].id}`);
  assert.equal(await field(page).count(), 0, 'a modifier click renamed');

  // ---- US3: a side peek, Close and the tint ----
  // The side peek lies over the page's right part. With the name column
  // left to share out the table's width it reaches under the peek, Close
  // with it, so the column is set narrower, as a person does.
  await page.setViewportSize({ width: 1600, height: 900 });
  await setView({ openIn: 'side_peek', colWidths: { __title: 260 } });
  await page.goto(`${base}/p/${db.id}`);
  await hover(page, 'Launch notes');
  await row(page, 'Launch notes').getByRole('button', { name: 'Open Launch notes' }).click();
  await panel.waitFor();
  const close = row(page, 'Launch notes').getByRole('button', { name: 'Close Launch notes' });
  await close.waitFor();
  await page.mouse.move(5, 5);
  assert.equal(await close.evaluate((el) => getComputedStyle(el.parentElement).opacity), '1', 'Close is hidden without hovering');
  assert.equal(await row(page, 'Launch notes').evaluate((el) => el.classList.contains('is-peeked')), true, 'the open row is not marked');
  const tint = await row(page, 'Launch notes').locator('td.db-title-col').evaluate((el) => getComputedStyle(el).backgroundColor);
  const plain = await row(page, 'Roadmap review Q1').locator('td.db-title-col').evaluate((el) => getComputedStyle(el).backgroundColor);
  assert.notEqual(tint, plain, 'the open row is not tinted');
  // Another row's Open swaps the peek; Close and the mark move with it.
  await hover(page, 'Roadmap review Q1');
  await row(page, 'Roadmap review Q1').getByRole('button', { name: 'Open Roadmap review Q1' }).click();
  await row(page, 'Roadmap review Q1').getByRole('button', { name: 'Close Roadmap review Q1' }).waitFor();
  assert.equal(await page.locator('tr.is-peeked').count(), 1, 'two rows are marked as open');
  await row(page, 'Roadmap review Q1').getByRole('button', { name: 'Close Roadmap review Q1' }).click();
  await panel.waitFor({ state: 'hidden' });
  assert.equal(await page.locator('tr.is-peeked').count(), 0, 'the mark stayed after Close');

  // ---- US4: Enter edits, Tab reaches Open ----
  await row(page, 'Launch notes').locator('.db-title-link').focus();
  await page.keyboard.press('Enter');
  await field(page).waitFor();
  await page.keyboard.press('Escape');
  await row(page, 'Launch notes').locator('.db-title-link').focus();
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  assert.equal(focused, 'Open Launch notes', `Tab from the name went to ${focused}`);
  assert.equal(await row(page, 'Launch notes').locator('.ui-cell-action').evaluate((el) => getComputedStyle(el).opacity), '1', 'the focused button is not shown');
  await page.keyboard.press('Enter');
  await panel.waitFor();
  await row(page, 'Launch notes').getByRole('button', { name: 'Close Launch notes' }).click();
  await panel.waitFor({ state: 'hidden' });

  // ---- a grouped table: one copy edits, every copy shows Close ----
  await setView({ grouped: true, groupBy: 'tags' });
  await page.goto(`${base}/p/${db.id}`);
  await page.locator('.db-group-head').first().waitFor();
  const copies = row(page, 'Launch notes');
  await eventually(async () => (await copies.count()) === 2);
  await copies.nth(1).locator('.db-title-link').click();
  await field(page).waitFor();
  assert.equal(await field(page).count(), 1, 'both copies turned into a field');
  assert.equal(await page.locator('tbody.db-group').nth(1).locator('tr[data-editing]').count(), 1, 'the field is not in the copy clicked');
  await page.keyboard.press('Escape');
  await copies.nth(0).locator('td.db-title-col').hover({ position: { x: 12, y: 10 } });
  await copies.nth(0).getByRole('button', { name: 'Open Launch notes' }).click();
  await panel.waitFor();
  await eventually(async () => (await page.locator('tr.is-peeked').count()) === 2);
  assert.equal(await page.getByRole('button', { name: 'Close Launch notes' }).count(), 2, 'not every copy reads Close');
  await page.getByRole('button', { name: 'Close Launch notes' }).first().click();
  await panel.waitFor({ state: 'hidden' });
  await setView({ grouped: false, groupBy: undefined, openIn: undefined, colWidths: undefined });
  await page.setViewportSize({ width: 1200, height: 900 });

  // ---- US5: a reader opens on click and has the button ----
  const readerPw = randomUUID();
  await api('POST', '/api/users', { name: 'Rae Reader', email: 'reader@example.test', password: readerPw, workspaces: [{ id: workspace.id, role: 'viewer' }] });
  const readerCtx = await context.browser().newContext({ viewport: { width: 1200, height: 900 }, locale: 'en-US' });
  assert.ok((await readerCtx.request.fetch(`${base}/api/login`, { method: 'POST', data: { email: 'reader@example.test', password: readerPw } })).ok());
  const reader = await readerCtx.newPage();
  await reader.goto(`${base}/p/${db.id}`);
  await reader.locator('.db-table').waitFor();
  assert.equal(await row(reader, 'Launch notes').getByRole('button', { name: 'Open Launch notes' }).count(), 1, 'a reader has no Open button');
  await row(reader, 'Launch notes').locator('.db-title-link').click();
  await reader.waitForURL((u) => u.pathname === `/p/${rows['Launch notes'].id}`);
  assert.equal(await field(reader).count(), 0, "a reader's click made a field");
  await readerCtx.close();

  // ---- a touch screen: every row shows its button, a tap edits ----
  const phoneCtx = await context.browser().newContext({
    storageState: await context.storageState(), hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 }, locale: 'en-US',
  });
  const phone = await phoneCtx.newPage();
  await phone.goto(`${base}/p/${db.id}`);
  await phone.locator('.db-table').waitFor();
  const shown = await phone.locator('tr[data-row-id] .ui-cell-action').evaluateAll((els) => els.map((el) => getComputedStyle(el).opacity));
  assert.deepEqual(shown, ['1', '1', '1'], `not every row shows its button on a touch screen: ${shown}`);
  const btn = await phone.getByRole('button', { name: 'Open Launch notes' }).boundingBox();
  assert(btn.height >= 30, `the touch button is ${btn.height}px high`);
  await row(phone, 'Launch notes').locator('.db-title-link').tap();
  await field(phone).waitFor();
  assert.equal(new URL(phone.url()).pathname, `/p/${db.id}`, 'a tap on the name left the table');
  await phone.keyboard.press('Escape');
  await phone.getByRole('button', { name: 'Open Launch notes' }).tap();
  await phone.waitForURL((u) => u.pathname === `/p/${rows['Launch notes'].id}`);
  await phoneCtx.close();

  console.log('title-cell: renaming in place, Open and Close, keyboard, reader and touch hold');
});
