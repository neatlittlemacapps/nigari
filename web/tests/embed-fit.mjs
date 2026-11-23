import assert from 'node:assert/strict';
import { eventually, withFixture } from './fixture.mjs';

// A database in a document is part of the page, not a card on it, and fits
// its rows (spec 023, #910). Before, the block had a border, a rounded card
// and a background, and inside them the full page's 48px sides and 40px foot:
// the title, tabs and table sat indented from the text, and an empty band
// followed the last row. Every row was drawn, so a long database pushed the
// rest of the document out of reach; now a table, list or gallery there draws
// 25 rows, and Show more adds 25 (owner, 2026-11-23). A database page is
// unchanged. SHOTS=<dir> writes screenshots for a look by eye.

const shots = process.env.SHOTS;

await withFixture(async ({ page, api, base, workspace }) => {
  page.setDefaultTimeout(15000);
  const make = async (title, n) => {
    const c = await api('POST', '/api/pages', { title, type: 'collection', workspaceId: workspace.id });
    const path = `/api/collections/${c.id}`;
    await api('PUT', path, {
      schema: [
        { id: 'size', name: 'Size', type: 'number' },
        { id: 'stage', name: 'Stage', type: 'select', options: [{ id: 'a', name: 'A', color: '#337ea9' }] },
      ],
      views: [
        { id: 'table', name: 'Table', type: 'table' },
        { id: 'list', name: 'List', type: 'list' },
        { id: 'gallery', name: 'Gallery', type: 'gallery' },
        { id: 'board', name: 'Board', type: 'board' },
      ],
    });
    for (let i = 1; i <= n; i++) await api('POST', '/api/pages', { parentId: c.id, title: `Row ${i}`, props: { size: 1, stage: 'a' } });
    return c;
  };
  const one = await make('One row', 1);
  const many = await make('Many rows', 120);
  const para = (id, text) => ({ id, type: 'paragraph', props: {}, content: [{ type: 'text', text, styles: {} }], children: [] });
  const doc = await api('POST', '/api/pages', { title: 'Fits its content', workspaceId: workspace.id });
  await api('PATCH', `/api/pages/${doc.id}`, {
    content: [
      para('p1', 'Text above the database.'),
      { id: 'db1', type: 'database', props: { collectionId: one.id }, content: [], children: [] },
      para('p2', 'Text between.'),
      { id: 'db2', type: 'database', props: { collectionId: many.id }, content: [], children: [] },
      para('p3', 'Text below.'),
    ],
  });

  const embeds = page.locator('.bn-db-embed');
  const first = embeds.nth(0);
  const second = embeds.nth(1);
  const rowsOf = (embed) => embed.locator('.db-table tbody tr[data-row-id]');
  const more = (embed) => embed.getByRole('button', { name: 'Show more', exact: true });
  const open = async () => {
    await page.goto(`${base}/p/${doc.id}`);
    await eventually(async () => (await embeds.count()) === 2 && (await rowsOf(first).count()) === 1 && (await rowsOf(second).count()) > 0);
  };

  for (const [width, height] of [[1280, 900], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await open();

    // ---- US1: no card, and the content lines up with the text ----
    const card = await first.evaluate((el) => {
      const s = getComputedStyle(el);
      return { border: s.borderTopWidth, radius: s.borderTopLeftRadius, bg: s.backgroundColor, overflow: s.overflow };
    });
    assert.deepEqual(card, { border: '0px', radius: '0px', bg: 'rgba(0, 0, 0, 0)', overflow: 'visible' }, `${width}px: the database still has a card around it`);

    const left = async (loc) => (await loc.boundingBox()).x;
    const textX = await page.evaluate(() => {
      // The text's own left edge, not its block's box.
      const p = [...document.querySelectorAll('.bn-inline-content')].find((n) => n.textContent === 'Text above the database.');
      const r = document.createRange();
      r.selectNodeContents(p);
      return r.getBoundingClientRect().x;
    });
    const titleX = await first.locator('.bn-db-title').evaluate((el) => el.getBoundingClientRect().x);
    // The title's icon is its first thing; the first tab is a button with
    // its own padding, so its box, not its text, starts at the edge.
    const tabX = await left(first.locator('.view-tab, .view-picker').first());
    const gridX = await left(first.locator('.db-table .db-title-col').first());
    // On a phone the row gutter (52px) does not fit the page's 18px margin:
    // the table reaches the screen's edge and its grid starts 34px in.
    const gridAt = width <= 768 ? 34 : 0;
    for (const [name, x, want] of [['title', titleX, 0], ['first tab', tabX, 0], ['first column', gridX, gridAt]]) {
      assert(Math.abs(x - textX - want) <= 2, `${width}px: the ${name} starts at ${x}, the text at ${textX} (+${want})`);
    }
    // The gutter, where a row's handle and + show, is whole on the screen.
    const gutterX = await left(first.locator('.db-table tbody .db-row-gutter').first());
    assert(gutterX >= 0, `${width}px: the row gutter starts off the screen, at ${gutterX}`);

    // ---- SC-001: the block ends at its summary row ----
    const foot = await first.locator('.db-calc-row').boundingBox();
    const block = await first.boundingBox();
    const gap = block.y + block.height - (foot.y + foot.height);
    assert(gap <= 16, `${width}px: ${gap}px of empty space under the summary row (at most 16)`);
    assert.equal(await more(first).count(), 0, 'a one-row table offers Show more');

    if (shots) await page.screenshot({ path: `${shots}/embed-fit-${width}.png`, fullPage: true });
  }

  await page.setViewportSize({ width: 1280, height: 900 });

  // ---- US1: the row gutter still works, in the margin ----
  await rowsOf(first).first().hover();
  const handle = rowsOf(first).first().locator('.db-row-handle');
  await eventually(async () => Number(await handle.evaluate((el) => getComputedStyle(el.closest('.db-row-gutter-btns')).opacity)) === 1);
  const handleBox = await handle.boundingBox();
  const gridLeft = await left0(first.locator('.db-table .db-title-col').first());
  assert(handleBox.x + handleBox.width <= gridLeft + 1, 'the row handle overlaps the first column');
  assert(handleBox.x >= 0, 'the row handle is off the screen');

  // ---- US1: the title still opens the database ----
  const title = first.locator('.bn-db-title');
  await title.hover();
  await eventually(async () => Number(await first.locator('.bn-db-open').evaluate((el) => getComputedStyle(el).opacity)) === 1);

  // ---- US2: 25 rows, then Show more by 25, then all ----
  assert.equal(await rowsOf(second).count(), 25, 'a long table in a document draws more than 25 rows');
  assert.equal((await second.locator('.db-calc-row .db-title-col').textContent()).trim(), '120 rows', 'the summary counts only the drawn rows');
  assert((await second.locator('.db-calc-row').textContent()).includes('Σ 120'), 'the sum reads only the drawn rows');
  for (const want of [50, 75, 100, 120]) {
    await more(second).click();
    await eventually(async () => (await rowsOf(second).count()) === want);
  }
  assert.equal(await more(second).count(), 0, 'Show more stays once every row is drawn');

  // ---- US2: a list and a gallery, and another view starts at 25 again ----
  const tab = (name) => second.locator('.view-tab', { hasText: name }).first();
  await tab('List').click();
  await eventually(async () => (await second.locator('.list-row').count()) === 25);
  await more(second).click();
  await eventually(async () => (await second.locator('.list-row').count()) === 50);
  await tab('Gallery').click();
  await eventually(async () => (await second.locator('.gallery-card').count()) === 25);
  assert.equal(await more(second).count(), 1, 'a long gallery offers no Show more');

  // ---- US2: a row added from the embed's New is drawn past the limit ----
  await tab('Table').click();
  await eventually(async () => (await rowsOf(second).count()) === 25);
  await second.hover();
  await second.locator('.collection-actions').getByRole('button', { name: 'New', exact: true }).click();
  await eventually(async () => (await rowsOf(second).count()) === 26);
  assert.equal((await rowsOf(second).nth(24).textContent()).startsWith('Row 25'), true, 'the 25 first rows are not the ones drawn');
  assert.equal(await more(second).count(), 1, 'Show more went when the new row was drawn');

  // ---- US3: a board keeps its capped height ----
  await tab('Board').click();
  const boardH = await second.locator('.board').evaluate((el) => el.getBoundingClientRect().height);
  assert(boardH <= Math.min(560, 0.7 * 900) + 1, `the board is ${boardH}px tall, past its cap`);

  // ---- FR-008: the database's own page draws every row ----
  await page.goto(`${base}/p/${many.id}`);
  await eventually(async () => (await page.locator('.db-table tbody tr[data-row-id]').count()) === 121);
  assert.equal(await page.getByRole('button', { name: 'Show more', exact: true }).count(), 0, 'a database page offers Show more');

  // ---- Dark ----
  if (shots) {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(`${base}/p/${doc.id}`);
    await eventually(async () => (await rowsOf(first).count()) === 1);
    await page.screenshot({ path: `${shots}/embed-fit-dark.png`, fullPage: true });
  }
  console.log('embed fit: passed');
});

async function left0(loc) {
  return (await loc.boundingBox()).x;
}
