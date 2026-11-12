import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eventually, withFixture } from './fixture.mjs';

// A person's own filter for a view (spec 013, US1, quickstart §3 and §4).
// The fixture's Table view is shared with "Status is To do": it shows one of
// the two rows. What must hold:
//   1. A filter edit is the person's alone: a bar says so, the stored view
//      and a colleague's screen do not change.
//   2. It is on the account: a second device of the same person shows it.
//   5. A colleague saving another shared filter does not take it away.
//   4. Reset brings the shared view back.
//   7. A new row takes the values the person's own filter pins down.
//   3. Save for everyone makes it the view, for the colleague too.
//   6. A reader may filter for themselves and is not offered Save for everyone.
//   Embed: in a document the change is personal too, and Save for everyone
//      writes it into the document's embed, not the database's view.
await withFixture(async ({ page, context, api, base, workspace, path }) => {
  page.setDefaultTimeout(15000);
  const collectionId = path.split('/').pop();
  const size = { viewport: { width: 1200, height: 900 }, locale: 'en-US' };
  const rowsOn = (p, scope = '.collection-scroll') => p.locator(`${scope} .db-table tbody tr`).filter({ hasText: /(First|Second) row/ });
  const barOn = (p) => p.locator('.view-change-bar');
  const sharedFilters = async () => (await api('GET', path)).views.find((v) => v.id === 'table').filters ?? [];
  const personal = async () => (await api('GET', `${path}/personal`)).states;
  const removeFilter = async (p, scope = '.collection-scroll') => {
    await p.locator(`${scope} .fs-controls button`, { hasText: 'Filter' }).first().click();
    await p.locator('.fs-remove').first().click();
    // The popover closes on a click beside it.
    await p.locator('.fs-backdrop').click({ position: { x: 5, y: 5 } });
    await p.locator('.fs-backdrop').waitFor({ state: 'hidden' });
  };

  // A colleague who can edit, on their own screen.
  const password = randomUUID();
  await api('POST', '/api/users', { name: 'Mo Member', email: 'member@example.test', password, workspaces: [{ id: workspace.id, role: 'member' }] });
  const other = await context.browser().newContext(size);
  assert.ok((await other.request.fetch(`${base}/api/login`, { method: 'POST', data: { email: 'member@example.test', password } })).ok());
  const colleague = await other.newPage();
  await colleague.goto(`${base}/p/${collectionId}`);
  await eventually(async () => (await rowsOn(colleague).count()) === 1);

  // ---- 1. The person removes the filter: theirs alone ----
  await eventually(async () => (await rowsOn(page).count()) === 1);
  assert.equal(await barOn(page).count(), 0, 'a bar on an unchanged view');
  await removeFilter(page);
  await eventually(async () => (await rowsOn(page).count()) === 2);
  await barOn(page).waitFor();
  assert.match(await barOn(page).textContent(), /Only you see these changes/);
  assert(await barOn(page).getByRole('button', { name: 'Reset' }).isVisible());
  assert(await barOn(page).getByRole('button', { name: 'Save for everyone' }).isVisible());
  await eventually(async () => 'table' in (await personal()));
  assert.deepEqual(await sharedFilters(), [{ property: 'status', op: 'is', value: 'todo' }], 'the shared view changed');
  await colleague.reload();
  await eventually(async () => (await rowsOn(colleague).count()) === 1);
  assert.equal(await barOn(colleague).count(), 0, 'the colleague sees a bar for somebody else\'s change');

  // ---- 2. The same person on a second device ----
  const device = await context.browser().newContext({ ...size, storageState: await context.storageState() });
  const second = await device.newPage();
  await second.goto(`${base}/p/${collectionId}`);
  await eventually(async () => (await rowsOn(second).count()) === 2);
  await barOn(second).waitFor();

  // ---- 5. The colleague saves another shared filter: the person keeps theirs ----
  const views = (await api('GET', path)).views;
  const done = await other.request.fetch(`${base}${path}`, {
    method: 'PUT',
    data: { views: views.map((v) => (v.id === 'table' ? { ...v, filters: [{ property: 'status', op: 'is', value: 'done' }] } : v)) },
  });
  assert.ok(done.ok());
  await page.reload();
  await eventually(async () => (await rowsOn(page).count()) === 2);
  await barOn(page).waitFor();

  // ---- 4. Reset: the shared view again (now "Status is Done") ----
  await barOn(page).getByRole('button', { name: 'Reset' }).click();
  await barOn(page).waitFor({ state: 'hidden' });
  await eventually(async () => (await rowsOn(page).count()) === 1);
  await page.locator('.db-table tbody tr', { hasText: 'Second row' }).waitFor();
  await eventually(async () => Object.keys(await personal()).length === 0);

  // ---- 7. A new row follows the person's own filter ----
  await api('PUT', `${path}/personal/table`, { filters: [{ property: 'status', op: 'is', value: 'third' }] });
  await page.reload();
  await barOn(page).waitFor();
  await eventually(async () => (await rowsOn(page).count()) === 0);
  const [created] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/pages') && r.request().method() === 'POST'),
    page.locator('.split-btn').getByRole('button', { name: 'New', exact: true }).click(),
  ]);
  const row = await created.json();
  assert.equal((await api('GET', `/api/pages/${row.id}`)).props?.status, 'third', 'the new row did not take the personal filter\'s value');
  assert.equal(row.matchesView, true);
  await page.getByText('Untitled', { exact: true }).first().waitFor();

  // ---- 3. Save for everyone ----
  await barOn(page).getByRole('button', { name: 'Save for everyone' }).click();
  await barOn(page).waitFor({ state: 'hidden' });
  await eventually(async () => (await sharedFilters())[0]?.value === 'third');
  await eventually(async () => Object.keys(await personal()).length === 0);
  // The colleague's open screen follows without a reload.
  await eventually(async () => (await colleague.getByText('Untitled', { exact: true }).count()) > 0 && (await rowsOn(colleague).count()) === 0);
  assert.equal(await barOn(colleague).count(), 0);

  // ---- 6. A reader: their own filter, no Save for everyone ----
  const readerPw = randomUUID();
  await api('POST', '/api/users', { name: 'Rae Reader', email: 'reader@example.test', password: readerPw, workspaces: [{ id: workspace.id, role: 'viewer' }] });
  const readerCtx = await context.browser().newContext(size);
  assert.ok((await readerCtx.request.fetch(`${base}/api/login`, { method: 'POST', data: { email: 'reader@example.test', password: readerPw } })).ok());
  const reader = await readerCtx.newPage();
  await reader.goto(`${base}/p/${collectionId}`);
  await reader.getByText('Untitled', { exact: true }).first().waitFor();
  await removeFilter(reader);
  await eventually(async () => (await rowsOn(reader).count()) === 2);
  await barOn(reader).waitFor();
  assert(await barOn(reader).getByRole('button', { name: 'Reset' }).isVisible());
  assert.equal(await barOn(reader).getByRole('button', { name: 'Save for everyone' }).count(), 0, 'a reader is offered Save for everyone');
  assert.equal((await sharedFilters())[0]?.value, 'third', 'a reader changed the shared view');

  // ---- Embed: personal first, then saved into the document ----
  const doc = await api('POST', '/api/pages', { title: 'Project A', workspaceId: workspace.id });
  await api('PATCH', `/api/pages/${doc.id}`, {
    content: [{ id: 'db', type: 'database', props: { collectionId }, content: [], children: [] }],
  });
  const localOf = async () => {
    const block = (await api('GET', `/api/pages/${doc.id}`)).content.find((b) => b.type === 'database');
    return block.props.local ? JSON.parse(block.props.local) : {};
  };
  await page.goto(`${base}/p/${doc.id}`);
  const embed = '.bn-db-embed';
  await page.locator(`${embed} .db-table`).waitFor();
  await page.getByText('Untitled', { exact: true }).first().waitFor();
  assert.equal(await page.locator(`${embed} .view-change-bar`).count(), 0);
  await removeFilter(page, embed);
  await eventually(async () => (await rowsOn(page, embed).count()) === 2);
  const embedBar = page.locator(`${embed} .view-change-bar`);
  await embedBar.waitFor();
  const scope = `embed:${doc.id}:db:table`;
  await eventually(async () => scope in (await personal()));
  assert.deepEqual(await localOf(), {}, 'the document was written before saving for everyone');
  assert.equal((await sharedFilters())[0]?.value, 'third', 'an embed\'s filter reached the database\'s view');
  // The database's own page is not touched by the embed's personal change.
  await second.goto(`${base}/p/${collectionId}`);
  await second.getByText('Untitled', { exact: true }).first().waitFor();
  assert.equal(await rowsOn(second).count(), 0);
  assert.equal(await barOn(second).count(), 0, 'an embed\'s personal change shows on the database\'s page');

  await embedBar.getByRole('button', { name: 'Save for everyone' }).click();
  await embedBar.waitFor({ state: 'hidden' });
  // The first change turns the embed into a list of views of its own (spec
  // 014): the filter is gone from its copy of the table, not from the database's.
  await eventually(async () => {
    const local = await localOf();
    return local.v === 2 && local.views.find((v) => v.id === 'table')?.filters?.length === 0;
  });
  await eventually(async () => !(scope in (await personal())));
  assert.equal((await sharedFilters())[0]?.value, 'third', 'saving an embed for everyone changed the database\'s view');
  assert.equal(await rowsOn(page, embed).count(), 2);

  console.log('Personal view: own filter with a bar, on a second device, kept over a colleague\'s save, Reset, new row pinned, Save for everyone, a reader without Save, and an embed saved into its document passed.');
});
