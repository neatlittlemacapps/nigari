import assert from 'node:assert/strict';
import { eventually, withFixture } from './fixture.mjs';

// A board drag shows where the card will land (spec 012, US3, #133): the
// column under the pointer is marked as the target, and a placeholder the
// card's height stands at the place the view's sort gives the card there.
// Ten drags across columns land where the placeholder was (SC-003), on a
// sorted board and an unsorted one; over its own column nothing is added and
// a drop changes nothing; a finger does the same after its hold; under
// reduced motion the placeholder appears without its fade.
//
// Before this, nothing showed where in the column the card would go, and a
// card that landed elsewhere than expected felt broken.

await withFixture(async ({ page, context, api, path }) => {
  page.setDefaultTimeout(15000);
  const collectionId = path.split('/').pop();
  await api('PUT', path, {
    schema: [
      { id: 'status', name: 'Status', type: 'select', options: [
        { id: 'todo', name: 'To do', color: '#337ea9' },
        { id: 'doing', name: 'Doing', color: '#cb912f' },
        { id: 'done', name: 'Done', color: '#448361' },
      ] },
      { id: 'effort', name: 'Effort', type: 'number' },
    ],
    views: [
      { id: 'sorted', name: 'Sorted', type: 'board', groupBy: 'status', sort: { property: 'effort', dir: 'asc' } },
      { id: 'plain', name: 'Plain', type: 'board', groupBy: 'status' },
    ],
  });
  // The fixture's two rows stay; these join them.
  const seed = [
    ['Card 1', 'todo', 5], ['Card 2', 'doing', 2], ['Card 3', 'done', 8], ['Card 4', 'todo', 1],
    ['Card 5', 'doing', 7], ['Card 6', 'done', 3], ['Card 7', 'todo', 4], ['Card 8', 'doing', 6],
  ];
  for (const [title, status, effort] of seed) {
    await api('POST', '/api/pages', { parentId: collectionId, title, props: { status, effort } });
  }
  await page.reload();
  const col = (id) => page.locator(`.board-col[data-col="${id}"]`);
  const titles = (id) => col(id).locator('.board-card .board-card-title').allTextContents();
  // The place marker's index among the column's cards, -1 if none.
  const placeIn = (id) => col(id).locator('.board-cards').evaluate((el) =>
    [...el.children].filter((c) => !c.classList.contains('is-dragging')).findIndex((c) => c.classList.contains('board-drop-place')));
  await col('todo').locator('.board-card').first().waitFor();

  const press = async (title) => {
    const card = page.locator('.board-card', { hasText: title }).first();
    const box = await card.boundingBox();
    await page.mouse.move(box.x + 30, box.y + 12);
    await page.mouse.down();
    await page.mouse.move(box.x + 40, box.y + 20, { steps: 2 });
    return box;
  };
  const over = async (id) => {
    const box = await col(id).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + 60, { steps: 6 });
  };

  // ---- Ten drags across columns, sorted then unsorted ----
  const drags = [
    ['Card 1', 'doing'], ['Card 4', 'done'], ['Card 6', 'todo'], ['Card 8', 'todo'], ['Card 3', 'doing'],
  ];
  for (const viewName of ['Sorted', 'Plain']) {
    await page.locator('.view-tab', { hasText: viewName }).click();
    await col('todo').locator('.board-card').first().waitFor();
    for (const [title, to] of drags) {
      const from = (await page.locator('.board-col', { has: page.locator('.board-card', { hasText: title }) }).first().getAttribute('data-col'));
      const target = from !== to ? to : from === 'todo' ? 'doing' : 'todo';
      const cardBox = await press(title);
      await over(target);
      assert.equal(await col(target).evaluate((el) => el.classList.contains('drag-over')), true, `${viewName}: ${target} is the target`);
      const at = await placeIn(target);
      assert(at >= 0, `${viewName}: a place marker in ${target} for ${title}`);
      const place = await col(target).locator('.board-drop-place').boundingBox();
      assert(Math.abs(place.height - cardBox.height) <= 1, `${viewName}: the marker is the card's height (${place.height} vs ${cardBox.height})`);
      await page.mouse.up();
      await eventually(async () => (await titles(target)).indexOf(title) === at);
      assert.equal(await page.locator('.board-drop-place').count(), 0, 'the marker leaves with the drag');
    }
  }

  // ---- Over its own column: no marker, and a drop changes nothing ----
  await page.locator('.view-tab', { hasText: 'Sorted' }).click();
  const ownCol = await page.locator('.board-col', { has: page.locator('.board-card', { hasText: 'Card 2' }) }).first().getAttribute('data-col');
  const before = await titles(ownCol);
  await press('Card 2');
  await over(ownCol);
  assert.equal(await placeIn(ownCol), -1, 'no marker over its own column');
  assert.equal(await col(ownCol).evaluate((el) => el.classList.contains('drag-over')), false, 'its own column is not a target');
  await page.mouse.up();
  await page.waitForTimeout(300);
  assert.deepEqual(await titles(ownCol), before, 'a drop on its own column changes nothing');

  // ---- Reduced motion: the marker appears without its fade ----
  const animation = async () => {
    await press('Card 2');
    await over(ownCol === 'done' ? 'todo' : 'done');
    const name = await page.locator('.board-drop-place').evaluate((el) => getComputedStyle(el).animationName);
    await page.keyboard.press('Escape').catch(() => {});
    await page.mouse.move(5, 5, { steps: 2 });
    await page.mouse.up();
    return name;
  };
  // Released outside every column, the card stays where it is.
  const where = async () => page.locator('.board-col', { has: page.locator('.board-card', { hasText: 'Card 2' }) }).first().getAttribute('data-col');
  assert.equal(await animation(), 'board-drop-in', 'the marker fades in');
  assert.equal(await where(), ownCol);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await animation(), 'none', 'reduced motion: no fade');
  await page.emulateMedia({ reducedMotion: null });

  // ---- A finger: hold, then drag; the same target and marker ----
  const touch = await context.browser().newContext({
    storageState: await context.storageState(), hasTouch: true, viewport: { width: 1200, height: 900 }, locale: 'en-US',
  });
  const phone = await touch.newPage();
  phone.setDefaultTimeout(15000);
  await phone.goto(page.url());
  await phone.locator('.view-tab', { hasText: 'Sorted' }).click();
  const card = phone.locator('.board-card', { hasText: 'Card 2' }).first();
  await card.waitFor();
  const from = await phone.locator('.board-col', { has: phone.locator('.board-card', { hasText: 'Card 2' }) }).first().getAttribute('data-col');
  const to = from === 'done' ? 'todo' : 'done';
  const box = await card.boundingBox();
  const dest = await phone.locator(`.board-col[data-col="${to}"]`).boundingBox();
  const pointer = (type, x, y) => phone.evaluate(([type, x, y]) => {
    const target = type === 'pointerdown' ? document.elementFromPoint(x, y) : window;
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1 }));
  }, [type, x, y]);
  await pointer('pointerdown', box.x + 30, box.y + 12);
  await phone.waitForTimeout(450); // the hold that arms a drag on a finger
  for (let i = 1; i <= 8; i++) {
    await pointer('pointermove', box.x + 30 + ((dest.x + dest.width / 2 - box.x - 30) * i) / 8, box.y + 12 + ((dest.y + 60 - box.y - 12) * i) / 8);
  }
  const target = phone.locator(`.board-col[data-col="${to}"]`);
  assert.equal(await target.evaluate((el) => el.classList.contains('drag-over')), true, 'touch: the column is the target');
  const at = await target.locator('.board-cards').evaluate((el) => [...el.children].findIndex((c) => c.classList.contains('board-drop-place')));
  assert(at >= 0, 'touch: a place marker');
  await pointer('pointerup', dest.x + dest.width / 2, dest.y + 60);
  await eventually(async () => (await target.locator('.board-card .board-card-title').allTextContents()).indexOf('Card 2') === at);
  await touch.close();
});
console.log('Board drop marker: ten drags land on the marker (sorted and unsorted), own column, reduced motion and touch passed.');
