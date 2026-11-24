import assert from 'node:assert/strict';
import { withFixture, eventually } from './fixture.mjs';

// The block handle, its selection and the columns' divider (#818, #820; owner
// 2026-11-24):
// - #818: a block chosen with its handle shows nigari's soft selection tint
//   (primary-subtle), not BlockNote's 4px blue outline, and only while it is
//   chosen: nothing on hover, and gone when its menu closes. The handle says
//   what it does after a short rest on it.
// - #818: ⌘/ (Ctrl+/ here) opens the block menu of the line the caret is in,
//   and closing it gives the caret back to that line.
// - #820: the divider between two columns takes the whole gap and reaches
//   past the row, and over it the handle of the column right of it stays put.
// - A tap on the handle on a phone opens the menu of the line it belongs to.
//   The mouse move a phone sends ahead of the tap's click moved the handle to
//   the layout's last column first.
await withFixture(async ({ page, api, base, workspace }) => {
  page.setDefaultTimeout(15000);
  const para = (id, text, children = []) => ({ id, type: 'paragraph', props: {}, content: [{ type: 'text', text, styles: {} }], children });
  const doc = await api('POST', '/api/pages', { title: 'Selection', workspaceId: workspace.id });
  await api('PATCH', `/api/pages/${doc.id}`, {
    content: [
      para('p1', 'The first paragraph'),
      para('p2', 'The second paragraph'),
      { id: 'cols', type: 'columns', props: { count: 3 }, content: [], children: [para('x', 'Left'), para('y', 'Middle'), para('z', 'Right')] },
      para('end', 'The end'),
    ],
  });
  await page.goto(`${base}/p/${doc.id}`);
  await page.locator('[data-id="end"] .bn-inline-content').waitFor();
  await page.addStyleTag({ content: '.update-banner,.toaster{display:none!important}' });

  const text = (id) => page.locator(`[data-id="${id}"] .bn-inline-content`).first().boundingBox();
  const subtle = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--color-primary-subtle)';
    document.body.append(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  });
  const look = (id) => page.evaluate((id) => {
    const c = document.querySelector(`[data-id="${id}"] > .bn-block > .bn-block-content`);
    const s = getComputedStyle(c);
    return { background: s.backgroundColor, outline: s.outlineStyle === 'none' ? 'none' : s.outlineColor };
  }, id);
  const tinted = async (id) => (await look(id)).background === subtle;
  const toHandle = async (id) => {
    const t = await text(id);
    const y = t.y + t.height / 2;
    await page.mouse.move(t.x + 10, y);
    for (let x = t.x + 8; x >= t.x - 10; x -= 2) await page.mouse.move(x, y);
    const h = page.locator('.bn-side-menu [draggable="true"]').first();
    await h.hover();
    return h;
  };
  const menuItem = () => page.getByRole('menuitem', { name: /Delete/ });

  // ---- nothing on hover ----
  const handle = await toHandle('p1');
  assert(!(await tinted('p1')), 'a block is tinted while its handle is only hovered');

  // ---- the tooltip, after a rest ----
  const tip = () => page.evaluate(() => {
    const el = document.querySelector('.bn-side-menu [data-tip]');
    if (!el) return null;
    const s = getComputedStyle(el, '::after');
    return { opacity: Number(s.opacity), text: el.getAttribute('data-tip') };
  });
  await eventually(async () => (await tip())?.opacity === 1).catch(() => assert.fail('no tooltip after resting on the handle'));
  const said = (await tip()).text;
  assert(said.includes('Drag to move'), `the tooltip says ${JSON.stringify(said)}`);
  assert(/Click or (Ctrl\+\/|⌘\/) to open the menu/.test(said), `the tooltip does not name the click and the key: ${JSON.stringify(said)}`);

  // ---- a click on the handle: the tint, while the menu is open ----
  await handle.click();
  await menuItem().waitFor();
  await eventually(() => tinted('p1')).catch(() => assert.fail('the block its menu acts on is not tinted'));
  const chosen = await look('p1');
  assert.notEqual(chosen.outline, 'rgb(100, 160, 255)', 'BlockNote’s blue outline is still drawn');
  assert(!(await tinted('p2')), 'another block is tinted too');
  assert.equal(await tip().then((x) => x?.opacity ?? 0), 0, 'the tooltip stays over the open menu');
  await page.keyboard.press('Escape');
  await menuItem().waitFor({ state: 'detached' });
  await eventually(async () => !(await tinted('p1'))).catch(() => assert.fail('the tint stayed after the menu closed'));

  // ---- ⌘/ opens the menu of the caret's line, and gives the caret back ----
  await page.mouse.move(1, 1);
  await page.locator('[data-id="p2"] .bn-inline-content').click();
  await page.keyboard.press('End');
  await page.keyboard.press('ControlOrMeta+/');
  await menuItem().waitFor().catch(() => assert.fail('⌘/ opened no block menu'));
  await eventually(() => tinted('p2')).catch(() => assert.fail('⌘/ opened the menu of another block'));
  await page.keyboard.press('Escape');
  await menuItem().waitFor({ state: 'detached' });
  await page.keyboard.type('!');
  await eventually(async () => {
    const p2 = (await api('GET', `/api/pages/${doc.id}`)).content.find((b) => b.id === 'p2');
    return p2?.content?.[0]?.text === 'The second paragraph!';
  }).catch(() => assert.fail('after the menu ⌘/ opened closed, typing did not go to the line'));

  // ---- the divider fills the gap and reaches past the row ----
  const geo = await page.evaluate(() => {
    const g = document.querySelector('.col-resize.bn-columns-grip').getBoundingClientRect();
    const group = document.querySelector('[data-id="cols"] > .bn-block > .bn-block-group');
    const gap = parseFloat(getComputedStyle(group).columnGap);
    const cols = [...group.children].map((c) => c.getBoundingClientRect());
    const line = getComputedStyle(document.querySelector('.col-resize.bn-columns-grip'), '::before');
    return { left: g.left, right: g.right, top: g.top, bottom: g.bottom, gap, colRight: cols[0].right, nextLeft: cols[1].left, lineTop: parseFloat(line.top), lineBottom: parseFloat(line.bottom) };
  });
  assert(Math.abs(geo.left - geo.colRight) <= 1 && Math.abs(geo.right - geo.nextLeft) <= 1, `the divider does not fill the gap: ${JSON.stringify(geo)}`);
  // The drawn line reaches past the row; the target does not, so a click on
  // the line above or below the layout still lands in its text (review).
  assert(geo.lineTop <= -4 && geo.lineBottom <= -4, `the divider's line ends with the row: ${JSON.stringify(geo)}`);
  const p2box = await page.locator('[data-id="p2"] > .bn-block > .bn-block-content').boundingBox();
  assert(geo.top >= p2box.y + p2box.height - 1, `the divider's target reaches over the line above: ${JSON.stringify(geo)}`);

  // ---- over the divider the middle column's handle stays put, then is reached ----
  const y = await text('y');
  const mid = y.y + y.height / 2;
  await page.mouse.move(y.x + 10, mid);
  const menuRight = () => page.evaluate(() => Math.round(document.querySelector('.bn-side-menu')?.getBoundingClientRect().right ?? -1));
  await eventually(async () => Math.abs((await menuRight()) - (y.x - geo.gap)) <= 1).catch(() => assert.fail('the middle column’s handle is not one gap left of its text'));
  for (let x = y.x + 8; x >= y.x - geo.gap - 10; x -= 2) {
    await page.mouse.move(x, mid);
    assert(Math.abs((await menuRight()) - (y.x - geo.gap)) <= 1, `the middle column’s handle moved when the pointer was ${Math.round(y.x - x)}px left of its text`);
  }
  await page.locator('.bn-side-menu [draggable="true"]').first().click();
  await menuItem().waitFor();
  await eventually(() => tinted('y')).catch(() => assert.fail('the handle reached past the divider is not the middle column’s'));
  await page.keyboard.press('Escape');

  // ---- a phone: a tap on the handle opens that line's menu ----
  {
    const phone = await page.context().browser().newContext({ storageState: await page.context().storageState(), hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 }, locale: 'en-US' });
    const p = await phone.newPage();
    await p.goto(`${base}/p/${doc.id}`);
    const line = p.locator('[data-id="x"] .bn-inline-content');
    await line.waitFor();
    const lb = await line.boundingBox();
    await p.touchscreen.tap(lb.x + 10, lb.y + lb.height / 2);
    const h = p.locator('.bn-side-menu [draggable="true"]').first();
    await h.waitFor();
    const hb = await h.boundingBox();
    await p.touchscreen.tap(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await p.getByRole('menuitem', { name: /Delete/ }).waitFor().catch(() => assert.fail('a tap on the handle opened no menu'));
    const tint = await p.evaluate(() => getComputedStyle(document.querySelector('[data-id="x"] > .bn-block > .bn-block-content')).backgroundColor);
    assert.equal(tint, subtle, 'a tap on the first column’s handle opened another line’s menu');
    await phone.close();
  }
});

console.log('Block selection: the soft tint only while a block is chosen, the handle’s tooltip, ⌘/ for its menu, the divider filling the column gap, and a tap opening its own line’s menu (#818, #820).');
