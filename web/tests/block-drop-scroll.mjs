import assert from 'node:assert/strict';
import { eventually, withFixture } from './fixture.mjs';

// The page scrolls while a dragged block is held near its edge (spec 025,
// #810). The owner's case: a database view dragged up into a right column
// higher on the page.
//
// SC-001: held over the header above the page, without moving, the page
// reaches its top in under 2 s. The pointer rests on purpose: a resting
// pointer gets few dragover events (here none at all), so only the frame loop
// can scroll it.
// SC-003: the database then dropped into the right column lands there, and
// every other block keeps its order.
// SC-004: once the drag ends, the page scrolls no further.
// And: held in the middle of the page, nothing scrolls; held at the bottom
// edge, the page scrolls down.
//
// The first move after the press is a small one, as a hand's is: a jump of
// 20px or more lets BlockNote's handle switch to the block above before the
// drag starts (#984, a bug of its own).

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await withFixture(async ({ page, api, base, workspace, path }) => {
  page.setDefaultTimeout(15000);
  const collectionId = path.split('/').pop();
  const para = (id, text, children = []) => ({ id, type: 'paragraph', props: {}, content: [{ type: 'text', text, styles: {} }], children });
  const head = (id, text, children) => ({ id, type: 'heading', props: { level: 3 }, content: [{ type: 'text', text, styles: {} }], children });
  const fill = (n, p) => Array.from({ length: n }, (_, i) => para(`${p}${i + 1}`, `Filler ${p}${i + 1}`));
  const start = () => [
    { id: 'cols', type: 'columns', props: { count: 2 }, content: [], children: [head('a', 'Left', [para('a1', 'Left one')]), head('b', 'Right', [para('b1', 'Right one')])] },
    ...fill(40, 'f'),
    { id: 'db', type: 'database', props: { collectionId }, content: [], children: [] },
    ...fill(3, 'g'),
  ];
  const doc = await api('POST', '/api/pages', { title: 'Scroll while dragging', workspaceId: workspace.id });
  const scrollTop = () => page.evaluate(() => document.querySelector('.page-body').scrollTop);

  // Opens the page scrolled down to the database and picks it up by its
  // handle; returns where the handle was.
  const pickUp = async () => {
    await api('PATCH', `/api/pages/${doc.id}`, { content: start() });
    await page.goto(`${base}/p/${doc.id}`);
    const db = page.locator('[data-id="db"]').first();
    await db.waitFor();
    await db.scrollIntoViewIfNeeded();
    await sleep(300);
    const box = await db.boundingBox();
    for (let px = box.x + 30; px >= box.x - 6; px -= 2) await page.mouse.move(px, box.y + 14);
    const h = await page.locator('.bn-side-menu [draggable="true"]').first().boundingBox();
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(h.x + h.width / 2 + 6, h.y + h.height / 2 - 2);
    const picked = await page.evaluate(() => [...document.querySelectorAll('.ProseMirror-selectednode')].map((e) => e.closest('[data-id]')?.getAttribute('data-id')));
    assert(picked.includes('db'), `the database was not the block picked up (${picked})`);
    return h;
  };
  // Moves the pointer from (x0, y0) to (x1, y1) in small steps.
  const glide = async (x0, y0, x1, y1, steps = 20) => {
    for (let i = 1; i <= steps; i++) await page.mouse.move(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps);
  };
  const content = () => api('GET', `/api/pages/${doc.id}`).then((r) => r.content);

  // SC-001 and SC-003, three times.
  for (let run = 0; run < 3; run++) {
    const h = await pickUp();
    const from = await scrollTop();
    assert(from > 1000, `the page was not scrolled down to the database (${from})`);
    const x = h.x + 40;
    await glide(h.x + h.width / 2, h.y + h.height / 2, x, 20);
    const t0 = Date.now();
    while ((await scrollTop()) > 0 && Date.now() - t0 < 4000) await sleep(50);
    const took = Date.now() - t0;
    assert.equal(await scrollTop(), 0, `run ${run}: the page did not reach its top while the block was held over the header (SC-001)`);
    assert(took < 2000, `run ${run}: ${from}px took ${took} ms, not under 2 s (SC-001)`);

    const t = await page.locator('[data-id="b1"] .bn-inline-content').first().boundingBox();
    await glide(x, 20, t.x + 30, t.y + t.height * 0.75, 15);
    await sleep(200);
    await page.mouse.up();
    let after;
    await eventually(async () => {
      after = await content();
      return after.find((b) => b.id === 'cols').children[1].children.some((c) => c.id === 'db');
    });
    const cols = after.find((b) => b.id === 'cols');
    assert.deepEqual(cols.children[1].children.map((c) => c.id), ['b1', 'db'], `run ${run}: the right column holds the wrong blocks (SC-003)`);
    assert.deepEqual(cols.children[0].children.map((c) => c.id), ['a1'], `run ${run}: the left column changed (SC-003)`);
    const want = start().map((b) => b.id).filter((id) => id !== 'db');
    assert.deepEqual(after.map((b) => b.id), want, `run ${run}: the other blocks moved (SC-003)`);
  }

  // SC-004: let go over the header part way up; the page stops at once.
  {
    const h = await pickUp();
    await glide(h.x + h.width / 2, h.y + h.height / 2, h.x + 40, 20);
    await sleep(250);
    await page.mouse.up();
    const at = await scrollTop();
    assert(at > 0, 'the page reached its top before the drag ended; the test needs it part way');
    await sleep(500);
    assert.equal(await scrollTop(), at, 'the page went on scrolling after the drag ended (SC-004)');
  }

  // The middle of the page holds still.
  {
    const h = await pickUp();
    const at = await scrollTop();
    const mid = await page.evaluate(() => { const r = document.querySelector('.page-body').getBoundingClientRect(); return (r.top + r.bottom) / 2; });
    await glide(h.x + h.width / 2, h.y + h.height / 2, h.x + 40, mid);
    await sleep(600);
    assert.equal(await scrollTop(), at, 'the page scrolled with the block held in its middle');
    await page.keyboard.press('Escape');
    await page.mouse.up();
  }

  // The bottom edge scrolls down.
  {
    const h = await pickUp();
    await page.evaluate(() => { document.querySelector('.page-body').scrollTop = 0; });
    await sleep(100);
    const bottom = await page.evaluate(() => Math.min(document.querySelector('.page-body').getBoundingClientRect().bottom, innerHeight));
    await glide(h.x + 40, 300, h.x + 40, bottom - 3);
    await sleep(600);
    assert(await scrollTop() > 200, 'the page did not scroll down with the block held at its bottom edge');
    await page.mouse.up();
  }
});
