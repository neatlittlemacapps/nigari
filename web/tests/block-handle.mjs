import assert from 'node:assert/strict';
import { eventually, withFixture } from './fixture.mjs';

// The block handle and the drop line (epic #812).
//
// #808: the + and drag handle of a block in a column jumped away as the
// pointer moved onto them, so such a block could not be dragged. The pointer
// walks here from a column's text to its handle in 2px steps, as a hand does,
// and the handle has to stay beside that block the whole way; then the block
// is dragged out of its column, and after the drop the handle follows the
// pointer again (the fix holds the handle while the pointer is on it, and a
// hold that outlived the drop left it stuck on the moved block).
//
// #811: the handle is 20px wide with an 18px icon in the muted text colour
// (owner's option B), not BlockNote's 24px squares in pale grey.
//
// #809: the line that shows where a dragged block lands is the focus colour,
// 2px, not BlockNote's #ddeeff (1.13:1 on the light page).
await withFixture(async ({ page, api, base, workspace }) => {
  page.setDefaultTimeout(15000);
  const para = (id, text, children = []) => ({ id, type: 'paragraph', props: {}, content: [{ type: 'text', text, styles: {} }], children });
  const head = (id, text, children) => ({ id, type: 'heading', props: { level: 3 }, content: [{ type: 'text', text, styles: {} }], children });
  const column = (k, name) => head(k, name, [para(`${k}1`, 'Inbox'), para(`${k}2`, 'Tasks'), para(`${k}3`, 'Projects')]);
  const doc = await api('POST', '/api/pages', { title: 'Handles', workspaceId: workspace.id });
  await api('PATCH', `/api/pages/${doc.id}`, {
    content: [
      para('top', 'A paragraph above the columns'),
      { id: 'cols', type: 'columns', props: { count: 3 }, content: [], children: [column('a', 'Do'), column('b', 'Plan'), column('c', 'Think')] },
      para('bottom', 'A paragraph below the columns'),
    ],
  });
  await page.goto(`${base}/p/${doc.id}`);
  await page.locator('[data-id="c3"] .bn-inline-content').waitFor();

  const text = (id) => page.locator(`[data-id="${id}"] .bn-inline-content`).first().boundingBox();
  // Where the side menu is: its right edge sits at the text's left edge of
  // the block it belongs to, its top 3px above that block's line. In the
  // second and third column it sits one column gap further left, past the
  // resize grip that fills the gap (#820, owner 2026-11-24: the grip wins
  // the gap), so `past` is that gap there.
  const menu = () => page.evaluate(() => {
    const m = document.querySelector('.bn-side-menu');
    if (!m) return null;
    const r = m.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(document.querySelector('.bn-container')).getPropertyValue('--columns-gap'));
    return { right: Math.round(r.right), top: Math.round(r.top), past: m.querySelector('[data-past-grip]') ? gap : 0 };
  });
  const later = (id) => /^[bc]\d$/.test(id);
  const besides = async (id) => {
    const t = await text(id);
    const m = await menu();
    return m !== null && (m.past > 0) === later(id) && Math.abs(m.right + m.past - t.x) <= 1 && Math.abs(m.top - t.y) <= 4;
  };

  // ---- #808: walk to the handle of a block in each column ----
  for (const id of ['top', 'a2', 'b2', 'c2']) {
    const t = await text(id);
    const y = t.y + t.height / 2;
    await page.mouse.move(t.x + 10, y);
    await eventually(() => besides(id));
    // Across the grip, in a later column, and on over the whole handle.
    for (let x = t.x + 8; x >= t.x - 38 - (later(id) ? 18 : 0); x -= 2) {
      await page.mouse.move(x, y);
      assert(await besides(id), `the handle of ${id} moved away when the pointer was ${Math.round(t.x - x)}px left of its text`);
    }
  }

  // ---- #811: the handle's size and colour ----
  const look = await page.evaluate(() => {
    const handle = document.querySelector('.bn-side-menu [draggable="true"]');
    const icon = handle.querySelector('svg');
    const probe = document.createElement('span');
    probe.style.color = 'var(--color-text-muted)';
    document.body.append(probe);
    const muted = getComputedStyle(probe).color;
    probe.remove();
    return { width: handle.getBoundingClientRect().width, height: handle.getBoundingClientRect().height, icon: icon.getBoundingClientRect().width, colour: getComputedStyle(icon).color, muted };
  });
  assert.equal(look.width, 20, 'the drag handle is not 20px wide');
  assert.equal(look.height, 24, 'the drag handle is no longer a line tall');
  assert.equal(look.icon, 18, 'the handle icon is not 18px');
  assert.equal(look.colour, look.muted, 'the handle icon is not the muted text colour');

  // ---- #808 + #809: drag Plan › Tasks out of its column, watch the line ----
  const from = await text('b2');
  await page.mouse.move(from.x + 10, from.y + 10);
  for (let x = from.x + 8; x >= from.x - 28; x -= 2) await page.mouse.move(x, from.y + 12);
  await page.mouse.down();
  const to = await text('bottom');
  const steps = 40;
  let line = null;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x - 28 + (to.x + 30 - from.x + 28) * i / steps, from.y + 12 + (to.y + to.height * 0.8 - from.y - 12) * i / steps);
    if (i === steps - 5) {
      line = await page.evaluate(() => {
        // A block from the handle: nigari draws the line (spec 021, blockDrop.ts).
        const l = document.querySelector('.nigari-drop-line');
        if (!l) return null;
        const probe = document.createElement('span');
        probe.style.color = 'var(--color-focus)';
        document.body.append(probe);
        const focus = getComputedStyle(probe).color;
        probe.remove();
        return { colour: getComputedStyle(l).backgroundColor, height: l.getBoundingClientRect().height, focus };
      });
    }
  }
  assert(line, 'no drop line while dragging a block');
  assert.equal(line.colour, line.focus, 'the drop line is not the focus colour');
  assert.equal(Math.round(line.height), 2, 'the drop line is not 2px');
  await page.mouse.up();
  let content;
  await eventually(async () => {
    content = (await api('GET', `/api/pages/${doc.id}`)).content;
    return content.some((b) => b.id === 'b2');
  });
  const plan = content.find((b) => b.id === 'cols').children.find((c) => c.id === 'b');
  assert.deepEqual(plan.children.map((c) => c.id), ['b1', 'b3'], 'the block did not leave its column');

  // ---- after the drop the handle follows the pointer again ----
  for (const id of ['top', 'c3', 'a1']) {
    const t = await text(id);
    await page.mouse.move(t.x + 15, t.y + t.height / 2, { steps: 5 });
    await eventually(() => besides(id)).catch(() => assert.fail(`after the drop the handle did not come to ${id}`));
  }

  // ---- the block menu behind the handle still opens and closes ----
  const t = await text('top');
  await page.mouse.move(t.x + 10, t.y + t.height / 2);
  for (let x = t.x + 8; x >= t.x - 10; x -= 2) await page.mouse.move(x, t.y + t.height / 2);
  await page.locator('.bn-side-menu [draggable="true"]').click();
  await page.getByRole('menuitem', { name: /Delete/ }).waitFor();
  // The open menu stays when the pointer wanders off it: BlockNote froze the
  // handle for the menu, and the hold's release must not undo that.
  const b1 = await text('b1');
  await page.mouse.move(b1.x + 15, b1.y + b1.height / 2, { steps: 8 });
  await page.waitForTimeout(300);
  assert(await page.getByRole('menuitem', { name: /Delete/ }).isVisible(), 'the block menu closed when the pointer moved off it');
  await page.keyboard.press('Escape');
  await page.getByRole('menuitem', { name: /Delete/ }).waitFor({ state: 'detached' });
  const c3 = await text('c3');
  await page.mouse.move(c3.x + 15, c3.y + c3.height / 2, { steps: 8 });
  await eventually(() => besides('c3')).catch(() => assert.fail('after the block menu closed the handle stayed put'));

  // ---- only the handle's icons changed colour ----
  // BlockNote's --bn-colors-side-menu also colours the empty-line placeholder
  // and the nesting guides; setting it darkened those too (found by review).
  const guide = await page.evaluate(() => getComputedStyle(document.querySelector('.bn-container')).getPropertyValue('--bn-colors-side-menu').trim());
  assert.notEqual(guide, '', 'BlockNote no longer sets its side-menu colour');
  assert(!/var\(--editor-side-menu-icon\)|text-muted/.test(guide), `--bn-colors-side-menu was changed (${guide})`);
});

// ---- a second editor on the page keeps its own handle ----
// A document with a database in it, and one of the database's rows open in a
// side peek, is two editors on one page. Each holds only its own handle:
// holding the document's froze the peek's too, which threw (BlockNote's
// freezeMenu reads a menu that editor had never shown; found by review). The
// peek's own blocks show no handle at all, on main too (#826).
await withFixture(async ({ page, api, base, workspace, path }) => {
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const collectionId = path.split('/').pop();
  await api('POST', '/api/pages', { parentId: collectionId, title: 'Peeked row', props: { status: 'todo' } });
  const config = await api('GET', path);
  for (const view of config.views) view.openIn = 'side_peek';
  await api('PUT', path, { views: config.views });
  const para = (id, text) => ({ id, type: 'paragraph', props: {}, content: [{ type: 'text', text, styles: {} }], children: [] });
  const doc = await api('POST', '/api/pages', { title: 'With a database', workspaceId: workspace.id });
  await api('PATCH', `/api/pages/${doc.id}`, { content: [para('line', 'A line in the document'), { id: 'emb', type: 'database', props: { collectionId }, children: [] }] });
  await page.goto(`${base}/p/${doc.id}`);
  await page.getByText('Peeked row', { exact: true }).first().click();
  const panel = page.getByRole('complementary', { name: 'Page preview' });
  await panel.locator('.bn-container').waitFor();
  assert.equal(await page.locator('.bn-container').count(), 2, 'the page does not hold two editors');
  const box = await page.locator('[data-id="line"] .bn-inline-content').first().boundingBox();
  await page.mouse.move(box.x + 10, box.y + box.height / 2);
  for (let x = box.x + 8; x >= box.x - 10; x -= 2) await page.mouse.move(x, box.y + box.height / 2);
  await page.waitForTimeout(150);
  assert.equal(await page.locator('.bn-side-menu').count(), 1, 'holding the document\'s handle showed a second one');
  assert.equal(await panel.locator('.bn-side-menu').count(), 0, 'holding the document\'s handle showed one in the peek');
  await page.mouse.move(box.x + 40, box.y + box.height / 2, { steps: 4 });
  await page.waitForTimeout(150);
  // Moving over the database's table throws in BlockNote's table handles,
  // on main too (#825); that one is left to its own fix.
  const ours = errors.filter((m) => !m.includes("reading 'rows'"));
  assert.deepEqual(ours, [], `errors while holding a handle: ${ours.join('; ')}`);
});
