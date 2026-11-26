import assert from 'node:assert/strict';
import { withFixture, eventually, openTableRow } from './fixture.mjs';

// Three bugs of the drag and drop epic (#812), each in a document that holds a
// database:
// - #825: moving the pointer over the database's table, or clicking a cell,
//   threw in BlockNote's table handles (it took the database's rows for one
//   of its own tables). No error may reach the page.
// - #826: a row opened in a side peek over the document showed no block
//   handle; the document's editor claimed the pointer. The peek's handle must
//   show beside the peek's line, and the document's must not.
// - #820: a block dragged up a column past a database, along the column's
//   edge where its handle is, must land where the line showed. The drop used
//   to decide again from boxes read at the drop, while a column opening that
//   the edge had started was still closing, and made a new column instead.
await withFixture(async ({ page, api, base, workspace, path }) => {
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const collectionId = path.split('/').pop();
  for (let i = 1; i <= 4; i++) await api('POST', '/api/pages', { parentId: collectionId, title: `Task ${i}`, props: { status: 'todo' } });
  const config = await api('GET', path);
  config.views[0].openIn = 'side_peek';
  await api('PUT', path, { views: config.views });
  const para = (id, text, children = []) => ({ id, type: 'paragraph', props: {}, content: [{ type: 'text', text, styles: {} }], children });
  const menus = () => page.evaluate(() => [...document.querySelectorAll('.bn-side-menu')].map((m) => {
    const r = m.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, inPeek: !!m.closest('[aria-label="Page preview"]') };
  }));

  // ---- #825 ----
  const doc = await api('POST', '/api/pages', { title: 'Host', workspaceId: workspace.id });
  await api('PATCH', `/api/pages/${doc.id}`, { content: [para('line', 'A line in the document'), { id: 'emb', type: 'database', props: { collectionId }, children: [] }, para('after', 'After')] });
  await page.goto(`${base}/p/${doc.id}`);
  await page.getByText('Task 4', { exact: true }).waitFor();
  const table = await page.locator('[data-id="emb"] .db-table').first().boundingBox();
  for (let y = table.y + 5; y < table.y + table.height; y += 10) {
    for (let x = table.x + 10; x < table.x + table.width; x += 80) await page.mouse.move(x, y);
  }
  await page.mouse.click(table.x + table.width - 30, table.y + 50);
  await page.waitForTimeout(200);
  assert.deepEqual(errors, [], 'the pointer over the database table threw (#825)');

  // ---- #826 ----
  await page.keyboard.press('Escape');
  await openTableRow(page, 'Task 2');
  const panel = page.getByRole('complementary', { name: 'Page preview' });
  await panel.waitFor();
  const rowId = new URL(page.url()).searchParams.get('peek');
  await api('PATCH', `/api/pages/${rowId}`, { content: [para('p1', 'Peek line one'), para('p2', 'Peek line two')] });
  await page.reload();
  const peekLine = panel.getByText('Peek line two');
  await peekLine.waitFor();
  const pl = await peekLine.boundingBox();
  // From the line's text toward where its handle sits, as a hand does.
  for (let x = pl.x + 40; x >= pl.x - 20; x -= 3) await page.mouse.move(x, pl.y + pl.height / 2);
  let shown = [];
  await eventually(async () => (shown = await menus()).length > 0).catch(() => {});
  assert.notEqual(shown.length, 0, 'no block handle shows beside the peek\'s line (#826)');
  assert.equal(shown.length, 1, `expected one block handle on the page, got ${shown.length}`);
  assert(shown[0].inPeek, 'the handle shown belongs to the document behind the peek (#826)');
  assert(shown[0].right <= pl.x + 2 && shown[0].top <= pl.y + pl.height && shown[0].bottom >= pl.y, `the peek's handle is not beside its line: ${JSON.stringify(shown[0])}, line at ${pl.x},${pl.y}`);
  // Back on the document, beside the peek: the document's handle again.
  await page.keyboard.press('Escape');
  await panel.waitFor({ state: 'detached' });
  const dl = await page.locator('[data-id="line"] .bn-inline-content').first().boundingBox();
  for (let x = dl.x + 40; x >= dl.x - 20; x -= 3) await page.mouse.move(x, dl.y + dl.height / 2);
  await eventually(async () => (shown = await menus()).length === 1 && !shown[0].inPeek);
  assert.deepEqual(errors, [], 'errors on the page');

  // ---- #820: up a column past a database ----
  await page.setViewportSize({ width: 1200, height: 1400 });
  const head = (id, text, children) => ({ id, type: 'heading', props: { level: 3 }, content: [{ type: 'text', text, styles: {} }], children });
  const cols = await api('POST', '/api/pages', { title: 'Columns', workspaceId: workspace.id });
  const start = () => [
    { id: 'cols', type: 'columns', props: { count: 2 }, content: [], children: [
      head('a', 'Left', [para('a1', 'Left one'), { id: 'emb2', type: 'database', props: { collectionId }, children: [] }, para('a2', 'Left two below the database')]),
      head('b', 'Right', [para('b1', 'Right one')]),
    ] },
  ];
  const tree = async () => {
    const c = (await api('GET', `/api/pages/${cols.id}`)).content;
    const layout = c.find((b) => b.id === 'cols');
    return layout ? layout.children.map((h) => `${h.id}[${(h.children ?? []).map((x) => x.id).join(',')}]`).join(' | ') : 'no layout';
  };
  for (const [frac, want] of [[0.85, 'a[a1,a2,emb2] | b[b1]'], [0.4, 'a[a2,a1,emb2] | b[b1]']]) {
    await api('PATCH', `/api/pages/${cols.id}`, { content: start() });
    await page.goto(`${base}/p/${cols.id}`);
    await page.locator('[data-id="emb2"]').getByText('Task 4', { exact: true }).waitFor();
    await page.mouse.move(1, 1);
    const box = async (id) => page.locator(`[data-id="${id}"] .bn-inline-content`).first().boundingBox();
    const from = await box('a2');
    const to = await box('a1');
    await page.mouse.move(from.x + 10, from.y + 10);
    for (let px = from.x + 8; px >= from.x - 10; px -= 2) await page.mouse.move(px, from.y + 12);
    await page.mouse.down();
    // Up along the column's edge, past the database, and in over the line.
    const x = to.x + 30;
    const y = to.y + to.height * frac;
    for (let i = 1; i <= 60; i++) await page.mouse.move(from.x - 10 + (x - from.x + 10) * i / 60, from.y + 12 + (y - from.y - 12) * i / 60);
    const line = await page.evaluate(() => {
      const l = document.querySelector('.nigari-drop-line');
      if (!l) return null;
      const r = l.getBoundingClientRect();
      return { width: r.width, y: (r.top + r.bottom) / 2 };
    });
    await page.mouse.up();
    assert(line && line.width > 100, `no horizontal line before the drop: ${JSON.stringify(line)}`);
    // The line was under the line "Left one" or above it: the block lands there.
    const lineUnder = line.y > to.y + to.height / 2;
    assert.equal(lineUnder, frac > 0.5, `the line is on the wrong side of "Left one": ${line.y} for a line at ${to.y}–${to.y + to.height}`);
    let got = '';
    await eventually(async () => (got = await tree()) !== 'a[a1,emb2,a2] | b[b1]');
    assert.equal(got, want, `dropped at ${frac} of "Left one": the block did not land where the line showed`);
  }
  assert.deepEqual(errors, [], 'errors on the page');
  console.log('Block guards: the database table throws nothing (#825); a peek shows its own block handle and the document its own (#826); a block dragged up a column past a database lands where the line showed (#820).');
});
