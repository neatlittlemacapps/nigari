import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withFixture } from './fixture.mjs';

// A reader's cells (#1118). Someone who may only read a workspace used to get
// every cell's editor in a table, a list and on a board: a select opened its
// options, a date its picker, a Files & media cell Add files. The change then
// failed with "Change not saved". Now a reader's cells hold no control at all,
// and the owner's still do (so the test can tell the two apart).

const CONTROLS = ':is(button, input:not([disabled]), select, textarea, [contenteditable=true])';

await withFixture(async ({ context, api, base, workspace }) => {
  const db = await api('POST', '/api/pages', { title: 'Readers', type: 'collection', workspaceId: workspace.id });
  const path = `/api/collections/${db.id}`;
  await api('PUT', path, {
    schema: [
      { id: 'stage', name: 'Stage', type: 'select', options: [{ id: 'a', name: 'Alpha', color: '#337ea9' }] },
      { id: 'tags', name: 'Tags', type: 'multiselect', options: [{ id: 'x', name: 'X', color: '#448361' }] },
      { id: 'due', name: 'Due', type: 'date' },
      { id: 'note', name: 'Note', type: 'text' },
      { id: 'link', name: 'Link', type: 'url' },
      { id: 'done', name: 'Done', type: 'checkbox' },
      { id: 'qty', name: 'Qty', type: 'number' },
      { id: 'media', name: 'Media', type: 'files' },
    ],
    views: [
      { id: 'table', name: 'Table', type: 'table' },
      { id: 'list', name: 'List', type: 'list' },
      { id: 'board', name: 'Board', type: 'board', groupBy: 'stage' },
    ],
  });
  await api('POST', '/api/pages', { parentId: db.id, title: 'Filled', props: { stage: 'a', tags: ['x'], due: '2027-03-14', note: 'n', link: 'example.com', done: true, qty: 3 } });
  await api('POST', '/api/pages', { parentId: db.id, title: 'Empty', props: {} });

  const readerPw = randomUUID();
  await api('POST', '/api/users', { name: 'Rae Reader', email: 'reader@example.test', password: readerPw, workspaces: [{ id: workspace.id, role: 'viewer' }] });
  const readerCtx = await context.browser().newContext({ viewport: { width: 1400, height: 900 }, locale: 'en-US' });
  assert.ok((await readerCtx.request.fetch(`${base}/api/login`, { method: 'POST', data: { email: 'reader@example.test', password: readerPw } })).ok());
  const reader = await readerCtx.newPage();
  const owner = await context.newPage();

  const cellControls = async (p, view) => {
    await p.goto(`${base}/p/${db.id}`);
    await p.locator('.view-tab', { hasText: view }).first().click();
    // The value cells only: a row's own name, Open and the card's "+N more"
    // are not editors.
    const rows = view === 'Table' ? 'tr[data-row-id] :is(td[data-prop-id], td.db-check-col)' : view === 'List' ? '.list-row-prop' : '.board-card-props :is(.card-prop-edit, .card-fact)';
    await p.locator(rows).first().waitFor();
    await p.waitForTimeout(300);
    return p.locator(`${rows} ${CONTROLS}`).count();
  };

  for (const view of ['Table', 'List', 'Board']) {
    const mine = await cellControls(owner, view);
    const theirs = await cellControls(reader, view);
    assert.ok(mine > 0, `${view}: the owner's cells hold no control, so the test proves nothing`);
    assert.equal(theirs, 0, `${view}: a reader's cells hold ${theirs} control(s)`);
  }
  await readerCtx.close();
  console.log('reader-cells: a reader gets no cell editor in a table, a list or on a board');
});
