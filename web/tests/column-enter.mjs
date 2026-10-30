import assert from 'node:assert/strict';
import { eventually, withFixture } from './fixture.mjs';

// Enter inside a column stays in that column (#317). A column is one block
// (the column's first) and the rest of the column is that block's children;
// BlockNote's Enter knows nothing of that, so it split the first block into a
// SIBLING, which is the next column, and an empty line further down was
// "lifted" one level, out of the column into a column of its own.
await withFixture(async ({ page, api, base, workspace }) => {
  page.setDefaultTimeout(15000);
  const para = (id, text) => ({ id, type: 'paragraph', props: {}, content: text ? [{ type: 'text', text, styles: {} }] : [], children: [] });
  const doc = await api('POST', '/api/pages', { title: 'Columns', workspaceId: workspace.id });
  await api('PATCH', `/api/pages/${doc.id}`, {
    content: [
      { id: 'cols', type: 'columns', props: { count: 2 }, content: [], children: [para('left', 'Left'), para('right', 'Right')] },
      {
        id: 'cols2',
        type: 'columns',
        props: { count: 2 },
        content: [],
        children: [{ id: 'item', type: 'bulletListItem', props: {}, content: [{ type: 'text', text: 'Item', styles: {} }], children: [] }, para('other', 'Other')],
      },
    ],
  });
  await page.goto(`${base}/p/${doc.id}`);
  const text = (b) => (b.content ?? []).map((c) => c.text ?? '').join('');
  const saved = async () => (await api('GET', `/api/pages/${doc.id}`)).content;
  const columns = (content, id) => content.find((b) => b.id === id).children;
  const end = async (id) => {
    // At the line's right edge: the inline content is as wide as the column,
    // so that is past the last letter.
    const line = page.locator(`[data-id="${id}"] .bn-inline-content`).first();
    const box = await line.boundingBox();
    await line.click({ position: { x: box.width - 2, y: box.height / 2 } });
  };

  // ---- the first block of a column: the new line goes under it ----
  await end('left');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Below left');
  // ---- a line further down: Enter on an empty line stays in the column ----
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Third');
  // ---- split in the middle of a column's first block ----
  await end('right');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  // ---- a list item as a column's first block keeps making list items ----
  await end('item');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Next');

  let content;
  await eventually(async () => {
    content = await saved();
    const left = columns(content, 'cols')[0];
    return text(left.children?.[2] ?? {}) === 'Third' && columns(content, 'cols2')[0].children?.length === 1;
  }).catch(() => {});
  content ??= await saved();
  const [left, right, ...extra] = columns(content, 'cols');
  assert.equal(extra.length, 0, `Enter made a new column: ${JSON.stringify(columns(content, 'cols').map(text))}`);
  assert.equal(text(left), 'Left');
  assert.deepEqual(left.children.map(text), ['Below left', '', 'Third'], 'the left column did not keep its new lines');
  assert.equal(text(right), 'Ri', 'the right column\'s first block was not split at the cursor');
  assert.deepEqual(right.children.map(text), ['ght'], 'the split-off text did not stay in the right column');
  const [item, other, ...extra2] = columns(content, 'cols2');
  assert.equal(extra2.length, 0, 'Enter in a list item made a new column');
  assert.equal(text(other), 'Other');
  assert.deepEqual(item.children.map((b) => [b.type, text(b)]), [['bulletListItem', 'Next']], 'the list did not continue in its column');

  // ---- the slash menu still takes Enter inside a column ----
  await end('other');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/Heading 1');
  await page.locator('.bn-suggestion-menu').waitFor();
  await page.keyboard.press('Enter');
  await eventually(async () => {
    const o = columns(await saved(), 'cols2')[1];
    return o.children?.[0]?.type === 'heading';
  });
});
