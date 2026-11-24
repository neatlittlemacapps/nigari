import assert from 'node:assert/strict';
import { eventually, withFixture } from './fixture.mjs';

// Where a dragged block lands (spec 021, epic #812).
//
// SC-001: the block lands where the line showed, at every kind of spot: between
// plain blocks, above and below each line of a column, a column's first and
// last line, above and below the layout. #809 measured the line one column to
// the left in a layout, and #824 a drop on a column's first line that made an
// extra column.
// SC-002: no drop changes how many columns a layout has (the vertical line
// that would offer a new column comes with PR 2).
// SC-005: a layout takes no room above it, and its presets are in the block
// menu of its lines (owner, 2026-11-21), not on a bar over the page.

// From a line's text left onto its handle in 2px steps, as a hand does;
// returns where the pointer stopped. The handle is 10px left of the text,
// or, in a second or third column, one column gap further, past the resize
// grip that fills the gap (#820, owner 2026-11-24).
const toHandle = async (page, from) => {
  const y = from.y + 12;
  let px = from.x + 8;
  for (; px >= from.x - 10; px -= 2) await page.mouse.move(px, y);
  const h = await page.locator('.bn-side-menu [draggable="true"]').first().boundingBox();
  const stop = h ? Math.round(h.x + h.width / 2) : px;
  for (; px > stop; px -= 2) await page.mouse.move(px, y);
  return px;
};

await withFixture(async ({ page, api, base, workspace }) => {
  page.setDefaultTimeout(15000);
  const para = (id, text, children = []) => ({ id, type: 'paragraph', props: {}, content: [{ type: 'text', text, styles: {} }], children });
  const head = (id, text, children) => ({ id, type: 'heading', props: { level: 3 }, content: [{ type: 'text', text, styles: {} }], children });
  const column = (k, name) => head(k, name, [para(`${k}1`, `${name} one`), para(`${k}2`, `${name} two`), para(`${k}3`, `${name} three`)]);
  const start = () => [
    para('mover', 'The block that is dragged'),
    para('top', 'A paragraph above the columns'),
    { id: 'cols', type: 'columns', props: { count: 3 }, content: [], children: [column('a', 'Do'), column('b', 'Plan'), column('c', 'Think')] },
    para('bottom', 'A paragraph below the columns'),
    para('last', 'The last paragraph'),
  ];
  const doc = await api('POST', '/api/pages', { title: 'Drops', workspaceId: workspace.id });

  const text = (id) => page.locator(`[data-id="${id}"] .bn-inline-content`).first().boundingBox();
  const open = async () => {
    await api('PATCH', `/api/pages/${doc.id}`, { content: start() });
    await page.goto(`${base}/p/${doc.id}`);
    await page.locator('[data-id="c3"] .bn-inline-content').waitFor();
    await page.mouse.move(1, 1);
  };
  // Drags "mover" by its handle to (x, y) in small steps, as a hand does, and
  // returns where the line was just before the drop.
  const drag = async (x, y) => {
    const from = await text('mover');
    await page.mouse.move(from.x + 10, from.y + 10);
    const hx = await toHandle(page, from);
    await page.mouse.down();
    const steps = 30;
    for (let i = 1; i <= steps; i++) await page.mouse.move(hx + (x - hx) * i / steps, from.y + 12 + (y - from.y - 12) * i / steps);
    const line = await page.evaluate(() => {
      const l = document.querySelector('.nigari-drop-line');
      if (!l) return null;
      const r = l.getBoundingClientRect();
      return { left: r.left, right: r.right, y: (r.top + r.bottom) / 2, height: r.height, colour: getComputedStyle(l).backgroundColor };
    });
    const others = await page.locator('[class*="prosemirror-dropcursor"]').count();
    await page.mouse.up();
    return { line, others };
  };
  // Where "mover" ended up: its parent's id (null at the top) and its place.
  const landed = async () => {
    let found = null;
    await eventually(async () => {
      const content = (await api('GET', `/api/pages/${doc.id}`)).content;
      const walk = (blocks, parent) => {
        for (let i = 0; i < blocks.length; i++) {
          const b = blocks[i];
          if (b.id === 'mover') return { parent, index: i, siblings: blocks.map((s) => s.id), content };
          const r = walk(b.children ?? [], b.id);
          if (r) return r;
        }
        return null;
      };
      const r = walk(content, null);
      // Moved: no longer the first block of the page.
      if (r && !(r.parent === null && r.index === 0)) found = r;
      return found !== null;
    });
    return found;
  };

  // Each spot: where the pointer goes (a line's id and how far down its text,
  // 0 = top, 1 = bottom; or a gap under a line), where the block must land,
  // and which boxes the line must sit between.
  const spots = [
    { name: 'between two plain blocks', at: ['bottom', 0.8], parent: null, after: 'bottom', between: ['bottom', 'last'] },
    { name: 'above the layout', at: ['top', 0.8], parent: null, after: 'top', between: ['top', 'a'] },
    { name: 'upper half of a column\'s first line', at: ['b', 0.25], column: 'b', first: true },
    { name: 'lower half of a column\'s first line', at: ['b', 0.75], parent: 'b', after: null, between: ['b', 'b1'] },
    { name: 'between two lines of the middle column', at: ['b2', 0.25], parent: 'b', after: 'b1', between: ['b1', 'b2'] },
    { name: 'lower half of the last column\'s last line', at: ['c3', 0.8], parent: 'c', after: 'c3', between: ['c3', 'bottom'] },
    { name: 'upper half of the first column\'s last line', at: ['a3', 0.25], parent: 'a', after: 'a2', between: ['a2', 'a3'] },
  ];

  for (const s of spots) {
    await open();
    const t = await text(s.at[0]);
    const { line, others } = await drag(t.x + 30, t.y + t.height * s.at[1]);
    assert(line, `${s.name}: no drop line while dragging`);
    assert.equal(others, 0, `${s.name}: BlockNote's own line showed too`);
    const r = await landed();
    const cols = r.content.find((b) => b.id === 'cols');
    assert.equal(cols.children.length, 3, `${s.name}: the layout no longer has 3 columns (SC-002)`);
    assert.equal(cols.props.count, 3, `${s.name}: the layout's count changed (SC-002)`);
    if (s.first) {
      // Above a column's first line: the block is the column's first line now,
      // and the old one is its next line.
      const col = cols.children[['a', 'b', 'c'].indexOf(s.column)];
      assert.equal(col.id, 'mover', `${s.name}: the block is not the column's first line`);
      assert.deepEqual(col.children.map((c) => c.id), [s.column, `${s.column}1`, `${s.column}2`, `${s.column}3`], `${s.name}: the column's lines are out of order`);
      continue;
    }
    assert.equal(r.parent, s.parent, `${s.name}: landed under ${r.parent}, not ${s.parent}`);
    const want = s.after === null ? 0 : r.siblings.indexOf(s.after) + 1;
    assert.equal(r.index, want, `${s.name}: landed at ${r.index} among ${r.siblings.join(',')}`);
  }

  // The line sat where the block then landed: draw again and compare with the
  // boxes the block went between, before the drop moved anything.
  for (const s of spots.filter((x) => x.between)) {
    await open();
    const [above, below] = await Promise.all(s.between.map(text));
    const t = await text(s.at[0]);
    const from = await text('mover');
    await page.mouse.move(from.x + 10, from.y + 10);
    for (let px = from.x + 8; px >= from.x - 10; px -= 2) await page.mouse.move(px, from.y + 12);
    await page.mouse.down();
    for (let i = 1; i <= 30; i++) await page.mouse.move(from.x - 10 + (t.x + 40 - from.x) * i / 30, from.y + 12 + (t.y + t.height * s.at[1] - from.y - 12) * i / 30);
    const l = await page.evaluate(() => { const r = document.querySelector('.nigari-drop-line').getBoundingClientRect(); return { y: (r.top + r.bottom) / 2, left: r.left, right: r.right }; });
    await page.mouse.up();
    assert(l.y >= above.y + above.height - 1 && l.y <= below.y + 1, `${s.name}: the line (y ${l.y}) is not between ${s.between.join(' and ')}`);
    const col = await page.locator(`[data-id="${s.between[0]}"] .bn-block-content`).first().boundingBox();
    assert(l.left <= col.x + 1 && l.right >= col.x + col.width - 1, `${s.name}: the line is not across ${s.between[0]}'s line (x ${l.left}–${l.right})`);
  }

  // ---- one spot per gap: a slow sweep down a gap shows one line ----
  await open();
  {
    const a = await text('bottom');
    const b = await text('last');
    const from = await text('mover');
    await page.mouse.move(from.x + 10, from.y + 10);
    for (let px = from.x + 8; px >= from.x - 10; px -= 2) await page.mouse.move(px, from.y + 12);
    await page.mouse.down();
    await page.mouse.move(a.x + 40, a.y + a.height * 0.6, { steps: 20 });
    const ys = new Set();
    for (let y = a.y + a.height * 0.6; y <= b.y + b.height * 0.4; y += 1) {
      await page.mouse.move(a.x + 40, y);
      ys.add(await page.evaluate(() => Math.round(document.querySelector('.nigari-drop-line')?.getBoundingClientRect().top ?? -1)));
    }
    await page.mouse.up();
    assert.equal(ys.size, 1, `the line moved between ${ys.size} spots in one gap: ${[...ys].join(', ')}`);
  }

  // ---- SC-005: a layout takes no room above its first line ----
  await open();
  const toColumns = await page.evaluate(() => {
    const top = document.querySelector('[data-id="top"] .bn-block-content').getBoundingClientRect();
    const first = document.querySelector('[data-id="a"] .bn-block-content').getBoundingClientRect();
    const next = document.querySelector('[data-id="mover"] .bn-block-content').getBoundingClientRect();
    const after = document.querySelector('[data-id="top"] .bn-block-content').getBoundingClientRect();
    return { columns: Math.round(first.top - top.bottom), plain: Math.round(after.top - next.bottom) };
  });
  assert.equal(toColumns.columns, toColumns.plain, `a paragraph to the columns' first line is ${toColumns.columns}px, between two paragraphs ${toColumns.plain}px`);
  // Nothing of the layout sits over the line above it: its presets are in the
  // block menu now (owner, 2026-11-21), not on a bar over the block.
  assert.equal(await page.locator('.bn-columns-bar').count(), 0, 'the layout bar is still drawn over the page');

  // ---- the layouts are in the block menu of a line in the layout ----
  const blockMenu = async (id) => {
    const box = await text(id);
    await page.mouse.move(box.x + 20, box.y + box.height / 2, { steps: 4 });
    for (let px = box.x + 8; px >= box.x - 10; px -= 2) await page.mouse.move(px, box.y + box.height / 2);
    const handle = page.locator('.bn-side-menu [draggable="true"]').first();
    await handle.click();
    return page.locator('.bn-menu-dropdown').first();
  };
  let menu = await blockMenu('b2');
  const item = menu.getByRole('menuitem', { name: 'Column layout' });
  await item.hover();
  const presets = page.locator('.bn-columns-layouts [role="menuitem"]');
  await presets.first().waitFor();
  assert.deepEqual(await presets.allInnerTexts().then((x) => x.map((s) => s.trim())), ['50 / 50', '70 / 30', '30 / 70', '33 / 33 / 34', '25 / 50 / 25', '25 / 25 / 25 / 25'], 'the layout submenu offers other presets');
  await presets.filter({ hasText: '25 / 50 / 25' }).click();
  await eventually(async () => {
    const cols = (await api('GET', `/api/pages/${doc.id}`)).content.find((b) => b.id === 'cols');
    return cols.props.widths === '25,50,25' && cols.children.length === 3;
  }).catch(() => assert.fail('choosing 25 / 50 / 25 in the block menu did not set the layout'));
  await page.keyboard.press('Escape');
  await page.mouse.move(1, 1);
  // A block outside a layout has no layout item.
  menu = await blockMenu('last');
  await menu.getByRole('menuitem', { name: 'Delete' }).waitFor();
  assert.equal(await menu.getByRole('menuitem', { name: 'Column layout' }).count(), 0, 'a plain block offers a column layout');
  await page.keyboard.press('Escape');

  // ---- the layouts change the number of columns, as the bar did ----
  const layoutPage = async (kids) => {
    await api('PATCH', `/api/pages/${doc.id}`, { content: [para('mover', 'The block that is dragged'), { id: 'cols', type: 'columns', props: { count: kids.length }, content: [], children: kids }] });
    await page.goto(`${base}/p/${doc.id}`);
    await page.locator('[data-id="x1"] .bn-inline-content').waitFor();
    await page.mouse.move(1, 1);
  };
  const columns = async () => (await api('GET', `/api/pages/${doc.id}`)).content.find((b) => b.id === 'cols');
  const pick = async (id, label) => {
    const m = await blockMenu(id);
    await m.getByRole('menuitem', { name: 'Column layout' }).hover();
    const p = page.locator('.bn-columns-layouts [role="menuitem"]').filter({ hasText: label });
    await p.waitFor();
    await p.click();
    await page.mouse.move(1, 1);
  };
  await layoutPage([para('x1', 'Left'), para('y1', 'Right')]);
  // The current layout is ticked.
  {
    const m = await blockMenu('x1');
    await m.getByRole('menuitem', { name: 'Column layout' }).hover();
    const ticked = page.locator('.bn-columns-layouts [role="menuitem"]').filter({ hasText: '50 / 50' }).locator('svg');
    await ticked.first().waitFor().catch(() => assert.fail('the current layout is not ticked'));
    assert.equal(await page.locator('.bn-columns-layouts [role="menuitem"]').filter({ hasText: '70 / 30' }).locator('svg').count(), 0, 'a layout that is not the current one is ticked');
    await page.keyboard.press('Escape');
    await page.mouse.move(1, 1);
  }
  await pick('x1', '33 / 33 / 34');
  await eventually(async () => (await columns()).children.length === 3).catch(() => assert.fail('a three-column layout did not add the third column'));
  assert.equal((await columns()).props.count, 3, 'the count did not follow the three-column layout');
  await page.locator('[data-id="x1"] .bn-inline-content').waitFor();
  await pick('x1', '70 / 30');
  await eventually(async () => (await columns()).children.length === 2).catch(() => assert.fail('back to two columns did not remove the empty third'));
  // A last column with something in it stays.
  await layoutPage([para('x1', 'Left'), para('y1', 'Middle'), para('z1', 'Right, with text')]);
  await pick('x1', '50 / 50');
  await eventually(async () => String((await columns()).props.count) === '2');
  assert.equal((await columns()).children.length, 3, 'a column with text in it was removed by a layout');

  // ---- the keyboard's way: the / menu inside a layout ----
  await layoutPage([para('x1', 'Left'), para('y1', 'Right')]);
  await page.locator('[data-id="y1"] .bn-inline-content').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/25 / 50 / 25');
  await page.locator('.bn-suggestion-menu-item', { hasText: '25 / 50 / 25' }).first().waitFor();
  await page.keyboard.press('Enter');
  await eventually(async () => (await columns()).props.widths === '25,50,25').catch(() => assert.fail('the / menu did not set the layout'));
  // Outside a layout the / menu has no layouts.
  await page.locator('[data-id="mover"] .bn-inline-content').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/25 / 50 / 25');
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.bn-suggestion-menu-item', { hasText: '25 / 50 / 25' }).count(), 0, 'the / menu offers a layout outside a layout');
  await page.keyboard.press('Escape');

  // ---- a phone: a tap shows the handle, and its menu has the layouts ----
  {
    const phone = await page.context().browser().newContext({ storageState: await page.context().storageState(), hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 }, locale: 'en-US' });
    const p = await phone.newPage();
    await p.goto(`${base}/p/${doc.id}`);
    const line = p.locator('[data-id="x1"] .bn-inline-content');
    await line.waitFor();
    const lb = await line.boundingBox();
    await p.touchscreen.tap(lb.x + 10, lb.y + lb.height / 2);
    const handle = p.locator('.bn-side-menu [draggable="true"]').first();
    await handle.waitFor().catch(() => assert.fail('a tap on a line in a layout shows no block handle on a phone'));
    const hb = await handle.boundingBox();
    await p.touchscreen.tap(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await p.locator('.bn-menu-dropdown [role="menuitem"]', { hasText: 'Column layout' }).waitFor().catch(() => assert.fail('the block menu on a phone has no Column layout'));
    await phone.close();
  }

  // ---- a layout inside a column: a drop beside its first line is above or
  // below the inner layout, and makes no column (found by review; #824) ----
  const inner = { id: 'inner', type: 'columns', props: { count: 2 }, content: [], children: [para('x', 'Inner left'), para('y', 'Inner right')] };
  await api('PATCH', `/api/pages/${doc.id}`, { content: [para('mover', 'The block that is dragged'), { id: 'cols', type: 'columns', props: { count: 2 }, content: [], children: [head('a', 'Do', [inner, para('a2', 'After the inner layout')]), head('b', 'Plan', [])] }] });
  await page.goto(`${base}/p/${doc.id}`);
  await page.locator('[data-id="y"] .bn-inline-content').waitFor();
  await page.mouse.move(1, 1);
  const y = await text('y');
  await drag(y.x + 10, y.y + y.height * 0.25);
  let after = null;
  await eventually(async () => {
    after = (await api('GET', `/api/pages/${doc.id}`)).content;
    return after[0].id !== 'mover';
  });
  const outer = after.find((b) => b.id === 'cols');
  const innerNow = JSON.stringify(outer).includes('"inner"') && (function find(bs) { for (const b of bs) { if (b.id === 'inner') return b; const r = find(b.children ?? []); if (r) return r; } return null; })(outer.children);
  assert.equal(outer.children.length, 2, 'the outer layout gained a column');
  assert(innerNow, 'the inner layout is gone');
  assert.deepEqual(innerNow.children.map((c) => c.id), ['x', 'y'], 'the inner layout gained a column');
});

// ---- sideways (spec 021, PR 2): a new column, and two blocks side by side ----
// US2: at a column's edge a vertical line shows, the columns slide apart
// (FR-005), moving away closes them, and a drop makes the column with the Q3
// widths (FR-006). FR-008: a column a drag empties goes, and a layout left
// with one column turns back into plain blocks. US3: at a plain block's edge
// the two become a layout of two. FR-010: no sideways on a phone-width page.
await withFixture(async ({ page, api, base, workspace }) => {
  page.setDefaultTimeout(15000);
  const para = (id, text, children = []) => ({ id, type: 'paragraph', props: {}, content: [{ type: 'text', text, styles: {} }], children });
  const bullet = (id, text) => ({ id, type: 'bulletListItem', props: {}, content: [{ type: 'text', text, styles: {} }], children: [] });
  const layout = (id, kids, widths) => ({ id, type: 'columns', props: { count: kids.length, ...(widths ? { widths } : {}) }, content: [], children: kids });
  const doc = await api('POST', '/api/pages', { title: 'Sideways', workspaceId: workspace.id });
  const text = (id) => page.locator(`[data-id="${id}"] .bn-inline-content`).first().boundingBox();
  const content = async () => (await api('GET', `/api/pages/${doc.id}`)).content;
  const open = async (blocks, wait) => {
    await api('PATCH', `/api/pages/${doc.id}`, { content: [para('mover', 'The block that is dragged'), ...blocks] });
    await page.goto(`${base}/p/${doc.id}`);
    await page.locator(`[data-id="${wait}"] .bn-inline-content`).waitFor();
    await page.mouse.move(1, 1);
  };
  // Picks up a block by its handle and moves it to (x, y) in small steps.
  const lift = async (id = 'mover') => {
    const from = await text(id);
    await page.mouse.move(from.x + 10, from.y + 10);
    const x = await toHandle(page, from);
    await page.mouse.down();
    return { x, y: from.y + 12 };
  };
  // Moves on to (x, y) and rests there half a second, nudging by half a
  // pixel so dragover keeps coming: a sideways drop is offered only after a
  // rest at its edge (#820, owner 2026-11-24). `pass` moves on without it.
  const glide = async (from, x, y, { pass = false } = {}) => {
    for (let i = 1; i <= 25; i++) await page.mouse.move(from.x + (x - from.x) * i / 25, from.y + (y - from.y) * i / 25);
    if (!pass) for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(90);
      await page.mouse.move(x + (i % 2) / 2, y);
    }
    return { x, y };
  };
  const theLine = () => page.evaluate(() => {
    const l = document.querySelector('.nigari-drop-line');
    if (!l) return null;
    const r = l.getBoundingClientRect();
    return { vertical: r.height > r.width, x: (r.left + r.right) / 2 };
  });
  const tracks = (id) => page.evaluate((id) => getComputedStyle(document.querySelector(`[data-id="${id}"] > .bn-block > .bn-block-group`)).gridTemplateColumns.split(' ').length, id);
  const row = (id) => page.locator(`[data-id="${id}"] > .bn-block > .bn-block-group`).first().boundingBox();
  const settled = async (check, message) => {
    let ok = false;
    for (let i = 0; i < 40 && !ok; i++) {
      await page.waitForTimeout(150);
      ok = await check();
    }
    assert(ok, message);
  };
  const find = (blocks, id) => { for (const b of blocks) { if (b.id === id) return b; const r = find(b.children ?? [], id); if (r) return r; } return null; };

  // ---- US2: the line, the opening, moving away, the drop ----
  await open([layout('cols', [para('x', 'Left'), para('y', 'Right')])], 'y');
  let r = await row('cols');
  let at = await lift();
  // Passing through the edge shows the ordinary line: a column waits for a
  // rest there (#820, owner 2026-11-24).
  at = await glide(at, r.x + r.width - 4, r.y + 10, { pass: true });
  let line = await theLine();
  assert(line && !line.vertical, 'passing through an edge offered a new column at once');
  at = await glide(at, r.x + r.width - 4, r.y + 10);
  line = await theLine();
  assert(line && line.vertical, 'no vertical line at the right edge of the last column after a rest there');
  await settled(async () => (await tracks('cols')) === 3, 'the columns did not slide apart for the new column');
  // Back over a column's text: the horizontal line, and the columns close.
  const yText = await text('y');
  at = await glide(at, yText.x + 20, yText.y + yText.height * 0.75);
  line = await theLine();
  assert(line && !line.vertical, 'moving away from the edge kept the vertical line');
  await settled(async () => (await tracks('cols')) === 2, 'moving away did not close the opening');
  // And back to the edge, then drop.
  at = await glide(at, r.x + r.width - 4, r.y + 10);
  await settled(async () => (await tracks('cols')) === 3, 'the columns did not open again');
  // Found by review: the closing ran on the grown layout, so for a moment the
  // three columns sat in four tracks and the row jumped.
  // The row is looked up on every frame: the drop replaces its element, and
  // one read once before the drop measured a detached node from then on
  // ("none", one track), which failed this check whenever the first frame
  // came after the drop.
  await page.evaluate(() => {
    window.__most = 0;
    const tick = () => {
      const g = document.querySelector('[data-id="cols"] > .bn-block > .bn-block-group');
      if (g) window.__most = Math.max(window.__most, getComputedStyle(g).gridTemplateColumns.split(' ').length);
      if (window.__most < 9) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.mouse.up();
  await settled(async () => (find(await content(), 'cols')?.children.length ?? 0) === 3, 'the drop at the edge made no column');
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__most), 3, 'after the drop the new column sat beside an empty track');
  let cols = find(await content(), 'cols');
  assert.deepEqual(cols.children.map((c) => c.id), ['x', 'y', 'mover'], 'the new column is not where the line was');
  assert.equal(Number(cols.props.count), 3, 'the count did not go up with the new column');
  assert.equal(cols.props.widths ?? '', '', '50/50 plus one is not three equal columns (Q3)');

  // ---- Q3: a column of its own width keeps it; a row of 3 opens at the far right ----
  await open([layout('cols', [para('x', 'Wide'), para('y', 'Narrow'), para('z', 'Narrow too')], '40,30,30')], 'z');
  r = await row('cols');
  at = await lift();
  // The gap between two columns of 3 offers no column (Q1): a horizontal line.
  const xBox = await page.locator('[data-id="x"]').first().boundingBox();
  at = await glide(at, xBox.x + xBox.width + 2, r.y + 10);
  line = await theLine();
  assert(line && !line.vertical, 'a row of 3 offered a column between two columns');
  at = await glide(at, r.x + r.width - 4, r.y + 10);
  line = await theLine();
  assert(line && line.vertical, 'a row of 3 offered no column at its far right');
  await page.mouse.up();
  await settled(async () => (find(await content(), 'cols')?.children.length ?? 0) === 4, 'a row of 3 did not take a 4th column');
  cols = find(await content(), 'cols');
  assert.equal(cols.props.widths, '40,20,20,20', `40/30/30 plus one is ${cols.props.widths}, not 40/20/20/20 (Q3)`);
  // A row of 4 offers no edge.
  await open([layout('cols', [para('w', 'One'), para('x', 'Two'), para('y', 'Three'), para('z', 'Four')])], 'z');
  r = await row('cols');
  at = await lift();
  at = await glide(at, r.x + r.width - 4, r.y + 10);
  line = await theLine();
  await page.mouse.up();
  assert(line && !line.vertical, 'a row of 4 offered a 5th column');

  // ---- FR-008: an emptied middle column goes; one left turns back into blocks ----
  await open([layout('cols', [para('x', 'One'), para('y', 'Two'), para('z', 'Three')], '25,50,25'), para('end', 'The end')], 'end');
  {
    const end = await text('end');
    let a = await lift('y');
    a = await glide(a, end.x + 30, end.y + end.height * 0.8);
    await page.mouse.up();
    await settled(async () => (find(await content(), 'cols')?.children.length ?? 0) === 2, 'the emptied middle column did not go');
    cols = find(await content(), 'cols');
    assert.equal(Number(cols.props.count), 2, 'the count did not drop with the emptied column');
    assert.equal(cols.props.widths, '', `25/50/25 without its middle is ${cols.props.widths}, not two halves`);
  }
  await open([layout('cols', [para('x', 'One'), para('y', 'Two', [para('y1', 'Its next line')])]), para('end', 'The end')], 'y1');
  {
    const end = await text('end');
    let a = await lift('x');
    a = await glide(a, end.x + 30, end.y + end.height * 0.8);
    await page.mouse.up();
    await settled(async () => !find(await content(), 'cols'), 'a layout left with one column stayed a layout');
    const ids = (await content()).map((b) => b.id);
    assert.deepEqual(ids, ['mover', 'y', 'y1', 'end', 'x'], `the last column did not turn back into plain blocks: ${ids.join(',')}`);
  }
  // Found by review: a column dropped just above its own layout, which the
  // drag turns back into plain blocks, landed nowhere and was lost.
  await open([layout('cols', [para('x', 'One'), para('y', 'Two')])], 'y');
  {
    const m = await text('mover');
    let a = await lift('x');
    a = await glide(a, m.x + 30, m.y + m.height * 0.8);
    await page.mouse.up();
    await settled(async () => !find(await content(), 'cols'), 'a column dropped above its own layout: the layout stayed');
    const ids = (await content()).map((b) => b.id);
    assert.deepEqual(ids, ['mover', 'x', 'y'], `a column dropped above its own layout was lost or misplaced: ${ids.join(',')}`);
  }

  // ---- the opening slides (FR-005): a width between shut and open is drawn ----
  await open([layout('cols', [para('x', 'Left'), para('y', 'Right')])], 'y');
  {
    await page.evaluate(() => {
      const g = document.querySelector('[data-id="cols"] > .bn-block > .bn-block-group');
      window.__widths = [];
      const tick = () => {
        const t = getComputedStyle(g).gridTemplateColumns.split(' ');
        if (t.length === 3) window.__widths.push(parseFloat(t[2]));
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const rr = await row('cols');
    let a = await lift();
    a = await glide(a, rr.x + rr.width - 4, rr.y + 10);
    await settled(async () => (await tracks('cols')) === 3, 'the columns did not open');
    await page.waitForTimeout(400);
    const widths = await page.evaluate(() => window.__widths);
    await page.mouse.up();
    const full = Math.max(...widths);
    assert(widths.some((w) => w > 1 && w < full - 1), `the new track jumped open instead of sliding: ${widths.slice(0, 12).join(',')}`);
  }

  // ---- US3: beside a plain block, left and right ----
  for (const [edge, want] of [['right', ['a', 'mover']], ['left', ['mover', 'a']]]) {
    await open([para('a', 'A paragraph to stand beside'), bullet('li', 'A list item')], 'li');
    const a = await page.locator('[data-id="a"] .bn-block-content').first().boundingBox();
    let p = await lift();
    p = await glide(p, edge === 'right' ? a.x + a.width - 4 : a.x + 4, a.y + a.height / 2);
    line = await theLine();
    assert(line && line.vertical, `no vertical line at the ${edge} edge of a plain block`);
    await page.mouse.up();
    let made = null;
    await settled(async () => { made = (await content()).find((b) => b.type === 'columns'); return !!made; }, `a drop at the ${edge} edge made no layout`);
    assert.deepEqual(made.children.map((c) => c.id), want, `beside, ${edge}: the two are in the wrong order`);
    assert.equal(Number(made.props.count), 2, 'beside: not a layout of two');
  }
  // No line beside a list item.
  await open([para('a', 'A paragraph'), bullet('li', 'A list item')], 'li');
  {
    const li = await page.locator('[data-id="li"] .bn-block-content').first().boundingBox();
    let p = await lift();
    p = await glide(p, li.x + li.width - 4, li.y + li.height / 2);
    line = await theLine();
    await page.mouse.up();
    assert(line && !line.vertical, 'a list item offered a layout beside it');
  }

  // ---- FR-007: reduced motion opens without the slide ----
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open([layout('cols', [para('x', 'Left'), para('y', 'Right')])], 'y');
  r = await row('cols');
  at = await lift();
  at = await glide(at, r.x + r.width - 4, r.y + 10);
  await settled(async () => (await tracks('cols')) === 3, 'with reduced motion the room did not open');
  const moving = await page.evaluate(() => getComputedStyle(document.querySelector('[data-id="cols"] > .bn-block > .bn-block-group')).transitionDuration);
  await page.mouse.up();
  assert(moving.split(',').every((d) => parseFloat(d) < 0.01), `with reduced motion the columns still slide (${moving})`);
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  // ---- FR-010: a phone-width page offers no column ----
  await page.setViewportSize({ width: 390, height: 844 });
  await open([layout('cols', [para('x', 'Left'), para('y', 'Right')])], 'y');
  r = await row('cols');
  at = await lift();
  at = await glide(at, r.x + r.width - 2, r.y + 10);
  line = await theLine();
  await page.mouse.up();
  assert(!line || !line.vertical, 'a phone-width page offered a new column');
});
