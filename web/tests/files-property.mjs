import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eventually, openTableRow, withFixture } from './fixture.mjs';

// A Files & media property (spec 028, US3). What must hold:
// - in a table cell, a click opens a panel; Add files takes files from the
//   picker and from a drop, each lands in the value in order;
// - the cell shows them compact, thumbnails and chips, then "+N";
// - ⌘/Ctrl+↓ on a name moves the file, Remove takes it out of the value;
// - a reload keeps it all;
// - a reader sees and opens the files, and on the row's page has nothing to
//   change them with (a table cell is #1118);
// - the row's page in a side peek shows the full list and Add files;
// - on a phone a tap on the cell opens the panel.

// A 1×1 PNG: a real image, so the thumbnail is drawn from the upload.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

await withFixture(async ({ page, context, api, base, workspace }) => {
  page.setDefaultTimeout(15000);
  const db = await api('POST', '/api/pages', { title: 'Site visits', type: 'collection', workspaceId: workspace.id });
  const path = `/api/collections/${db.id}`;
  await api('PUT', path, {
    schema: [{ id: 'media', name: 'Media', type: 'files' }],
    views: [{ id: 'table', name: 'Table', type: 'table' }],
  });
  const visit = await api('POST', '/api/pages', { parentId: db.id, title: 'North facade', props: {} });
  await api('POST', '/api/pages', { parentId: db.id, title: 'Roof', props: {} });
  const media = async () => (await api('GET', `/api/pages/${visit.id}`)).props.media ?? [];
  const names = async () => (await media()).map((f) => f.name);

  const row = (p) => p.locator('tr[data-row-id]', { has: p.locator('.db-title-link', { hasText: /^North facade$/ }) });
  const cell = (p) => row(p).getByRole('button', { name: 'Edit: Media' });
  const panel = (p) => p.locator('.prop-files-popover');

  await page.goto(`${base}/p/${db.id}`);
  await page.locator('.db-table').waitFor();

  // ---- the picker: three images and a PDF, in the order chosen ----
  await cell(page).click();
  await panel(page).getByRole('button', { name: 'Add files' }).waitFor();
  await panel(page).locator('input[type=file]').setInputFiles([
    { name: 'one.png', mimeType: 'image/png', buffer: PNG },
    { name: 'two.png', mimeType: 'image/png', buffer: PNG },
    { name: 'three.png', mimeType: 'image/png', buffer: PNG },
    { name: 'quote.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF\n') },
  ]);
  await eventually(async () => (await media()).length === 4);
  assert.deepEqual(new Set(await names()), new Set(['one.png', 'two.png', 'three.png', 'quote.pdf']), 'the picked files are not all in the value');
  for (const f of await media()) assert.match(f.url, /^\/files\/[^/]+$/, `${f.name} is not stored as an upload of this instance`);

  // ---- a drop on the panel ----
  const dropped = await page.evaluateHandle(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['dropped'], 'notes.txt', { type: 'text/plain' }));
    return dt;
  });
  const target = panel(page).locator('.ui-file-drop');
  await target.dispatchEvent('dragenter', { dataTransfer: dropped });
  await panel(page).getByText('Drop files here').waitFor();
  await target.dispatchEvent('drop', { dataTransfer: dropped });
  await eventually(async () => (await names()).includes('notes.txt'));
  assert.equal((await names()).at(-1), 'notes.txt', 'a dropped file did not land after the others');

  // ---- reorder with the keyboard, then remove ----
  const before = await names();
  await panel(page).getByRole('link', { name: `Open ${before[0]}` }).focus();
  await page.keyboard.press('ControlOrMeta+ArrowDown');
  await eventually(async () => (await names())[1] === before[0]);
  assert.equal(await panel(page).getByRole('link', { name: `Open ${before[0]}` }).evaluate((el) => el === document.activeElement), true, 'the moved file lost the focus');
  await panel(page).getByRole('button', { name: 'Remove notes.txt' }).click();
  await eventually(async () => !(await names()).includes('notes.txt'));
  assert.equal((await names()).length, 4, 'Remove took more than one file');

  // ---- the cell: compact, three then +1 ----
  await page.keyboard.press('Escape');
  await panel(page).waitFor({ state: 'hidden' });
  const compact = cell(page).locator('.ui-file-list[data-variant=compact]');
  assert.equal(await compact.locator('[role=listitem].ui-file-item').count(), 3, 'the cell does not show three files');
  assert.equal(await compact.locator('.ui-file-more').innerText(), '+1', 'the cell does not say +1');
  const rowHeight = await row(page).evaluate((el) => el.getBoundingClientRect().height);
  const plain = await page.locator('tr[data-row-id]', { has: page.locator('.db-title-link', { hasText: /^Roof$/ }) }).evaluate((el) => el.getBoundingClientRect().height);
  assert.ok(Math.abs(rowHeight - plain) <= 1, `a row with files is ${rowHeight}px, a row without ${plain}px`);

  // ---- a reload keeps it ----
  await page.reload();
  await page.locator('.db-table').waitFor();
  assert.equal(await cell(page).locator('[role=listitem].ui-file-item').count(), 3, 'the files are gone after a reload');

  // ---- the row's page in a side peek ----
  const config = await api('GET', path);
  config.views[0].openIn = 'side_peek';
  await api('PUT', path, { views: config.views });
  await page.reload();
  await page.locator('.db-table').waitFor();
  await openTableRow(page, 'North facade');
  const peek = page.getByRole('complementary', { name: 'Page preview' });
  await peek.locator('.ui-file-list[data-variant=full]').waitFor();
  assert.equal(await peek.locator('.ui-file-list[data-variant=full] .ui-file-item').count(), 4, 'the peek does not list every file');
  assert.equal(await peek.getByRole('button', { name: 'Add files' }).count(), 1, 'the peek has no Add files');

  // ---- a reader opens files and changes nothing ----
  const readerPw = randomUUID();
  await api('POST', '/api/users', { name: 'Rae Reader', email: 'reader@example.test', password: readerPw, workspaces: [{ id: workspace.id, role: 'viewer' }] });
  const readerCtx = await context.browser().newContext({ viewport: { width: 1200, height: 900 }, locale: 'en-US' });
  assert.ok((await readerCtx.request.fetch(`${base}/api/login`, { method: 'POST', data: { email: 'reader@example.test', password: readerPw } })).ok());
  const reader = await readerCtx.newPage();
  await reader.goto(`${base}/p/${db.id}`);
  await reader.locator('.db-table').waitFor();
  // The table's cells still offer a reader their editor, for every type
  // (#1118): the row's page is where a reader is held to reading today.
  assert.equal(await row(reader).locator('.ui-file-list[data-variant=compact] [role=listitem].ui-file-item').count(), 3, 'a reader does not see the files');
  await reader.goto(`${base}/p/${visit.id}`);
  const list = reader.locator('.ui-file-list[data-variant=full]');
  await list.waitFor();
  assert.equal(await list.getByRole('link', { name: 'Open quote.pdf' }).count(), 1, 'a reader cannot open a file');
  assert.equal(await reader.getByRole('button', { name: 'Add files' }).count(), 0, 'a reader has Add files');
  assert.equal(await reader.getByRole('button', { name: /^Remove / }).count(), 0, 'a reader has Remove');
  await readerCtx.close();

  // ---- a phone: a tap opens the panel ----
  const phoneCtx = await context.browser().newContext({
    storageState: await context.storageState(), hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 }, locale: 'en-US', colorScheme: 'dark',
  });
  const phone = await phoneCtx.newPage();
  await phone.goto(`${base}/p/${db.id}`);
  await phone.locator('.db-table').waitFor();
  await cell(phone).scrollIntoViewIfNeeded();
  await cell(phone).tap();
  await panel(phone).getByRole('button', { name: 'Add files' }).waitFor();
  const box = await panel(phone).boundingBox();
  assert.ok(box && box.x >= 0 && box.x + box.width <= 390, `the panel runs off a phone's screen: ${JSON.stringify(box)}`);
  const inner = await panel(phone).locator('.prop-files-editor').boundingBox();
  assert.ok(inner && inner.x + inner.width <= box.x + box.width, `the files run past the panel's edge: ${JSON.stringify(inner)}`);
  await phoneCtx.close();

  console.log('files-property: picker, drop, reorder, remove, reload, peek, reader and phone hold');
});
