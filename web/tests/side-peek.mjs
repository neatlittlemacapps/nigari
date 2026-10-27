import assert from 'node:assert/strict';
import { withFixture } from './fixture.mjs';

// A view can open its rows in a side peek (spec 007, #177). What must hold: a
// click opens the row beside the view and the view stays; another row swaps
// the panel; Escape and Back close it and leave the view where it was; the
// address carries the peek through a reload; Open as full page and ⌘/Ctrl
// still leave the view; a view on Full page behaves exactly as before; and the
// setting is chosen per view from the view's ⋯ menu.
await withFixture(async ({ page, api, base, path }) => {
  page.setDefaultTimeout(15000);
  const collectionId = path.split('/').pop();
  const panel = page.getByRole('complementary', { name: 'Page preview' });
  const peekTitle = () => panel.locator('textarea.page-title').inputValue();
  const peekParam = () => new URL(page.url()).searchParams.get('peek');

  // Enough rows in the To do table that it scrolls, so "the view is where it
  // was" can be measured.
  const rows = [];
  for (let i = 1; i <= 40; i++) {
    rows.push(await api('POST', '/api/pages', { parentId: collectionId, title: `Task ${i}`, props: { status: 'todo' } }));
  }
  const config = await api('GET', path);
  config.views[0].openIn = 'side_peek';
  await api('PUT', path, { views: config.views });

  await page.goto(`${base}/p/${collectionId}`);
  await page.getByText('Task 40', { exact: true }).waitFor();

  // ---- US1: a click opens the row beside the view ----
  const scroller = page.locator('.page-body').first();
  await scroller.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  const scrolled = await scroller.evaluate((el) => el.scrollTop);
  assert(scrolled > 0, 'the table does not scroll; the scroll check would prove nothing');
  await page.getByText('Task 38', { exact: true }).click();
  await panel.waitFor();
  assert.equal(await peekTitle(), 'Task 38', 'the peek shows another page');
  assert.equal(new URL(page.url()).pathname, `/p/${collectionId}`, 'opening a peek navigated away from the view');
  assert.equal(peekParam(), rows[37].id, 'the address does not name the peeked row');
  assert(await page.getByText('Task 39', { exact: true }).isVisible(), 'the view behind the peek is gone');

  // Another row swaps the panel; there is still one.
  await page.getByText('Task 39', { exact: true }).click();
  await eventuallyEqual(peekTitle, 'Task 39', 'clicking another row did not swap the peek');
  assert.equal(await panel.count(), 1, 'a second panel opened');

  // Escape closes it; the view is where it was, and its rows are not loaded
  // again (SC-005: closing a peek only unmounts the editor).
  const rowLoads = [];
  const countRows = (r) => { if (r.url().includes(`/api/collections/${collectionId}/rows`)) rowLoads.push(r.url()); };
  page.on('request', countRows);
  await panel.focus();
  await page.keyboard.press('Escape');
  await panel.waitFor({ state: 'hidden' });
  await page.waitForTimeout(500);
  page.off('request', countRows);
  assert.deepEqual(rowLoads, [], "closing the peek reloaded the view's rows");
  assert.equal(peekParam(), null, 'the address still names a peek after it closed');
  assert.equal(await scroller.evaluate((el) => el.scrollTop), scrolled, 'closing the peek moved the view');

  // Back closes it too, and stays on the view.
  await page.getByText('Task 38', { exact: true }).click();
  await panel.waitFor();
  await page.goBack();
  await panel.waitFor({ state: 'hidden' });
  assert.equal(new URL(page.url()).pathname, `/p/${collectionId}`, 'Back left the view instead of closing the peek');

  // A reload keeps the peek.
  await page.getByText('Task 2', { exact: true }).click();
  await panel.waitFor();
  await page.reload();
  await panel.waitFor();
  assert.equal(await peekTitle(), 'Task 2', 'a reload lost the peeked row');

  // Open as full page navigates to the row.
  await panel.getByRole('button', { name: 'Open as full page' }).click();
  await page.waitForURL((u) => u.pathname === `/p/${rows[1].id}`);
  assert.equal(await panel.count(), 0, 'the peek stayed open over the full page');

  // ⌘/Ctrl-click still opens a tab of its own.
  await page.goto(`${base}/p/${collectionId}`);
  await page.getByText('Task 3', { exact: true }).click({ modifiers: ['ControlOrMeta'] });
  await page.waitForURL((u) => u.pathname === `/p/${rows[2].id}`);
  assert.equal(await panel.count(), 0, 'a modifier click opened a peek');

  // ---- SC-003: a view on Full page navigates, as before ----
  await page.goto(`${base}/p/${collectionId}`);
  await page.locator('.view-tab', { hasText: 'Board' }).click();
  await page.locator('.board-card-title', { hasText: 'Second row' }).click();
  await page.waitForURL((u) => u.pathname !== `/p/${collectionId}`);
  assert.equal(await panel.count(), 0, 'a full-page view opened a peek');

  // ---- US2: the setting, per view, from the ⋯ menu ----
  await page.goto(`${base}/p/${collectionId}`);
  await page.locator('.view-tab', { hasText: 'Board' }).click();
  await page.getByTitle('View options').click();
  await Promise.all([
    page.waitForResponse((r) => r.url().endsWith(path) && r.request().method() === 'PUT'),
    page.getByRole('radio', { name: 'Side peek' }).click(),
  ]);
  const board = (await api('GET', path)).views.find((v) => v.id === 'board');
  assert.equal(board.openIn, 'side_peek', `the board stored ${JSON.stringify(board.openIn)}`);
  await page.keyboard.press('Escape');
  await page.locator('.board-card-title', { hasText: 'Second row' }).click();
  await panel.waitFor();
  assert.equal(await peekTitle(), 'Second row');
  await page.keyboard.press('Escape');
  await panel.waitFor({ state: 'hidden' });

  // Back to Full page: stored as no setting at all.
  await page.getByTitle('View options').click();
  await Promise.all([
    page.waitForResponse((r) => r.url().endsWith(path) && r.request().method() === 'PUT'),
    page.getByRole('radio', { name: 'Full page' }).click(),
  ]);
  const plain = (await api('GET', path)).views.find((v) => v.id === 'board');
  assert.equal('openIn' in plain, false, `full page stored ${JSON.stringify(plain.openIn)}`);

  // ---- US4: centre peek ----
  const centre = page.getByRole('dialog', { name: 'Page preview' });
  const cfg = await api('GET', path);
  cfg.views.find((v) => v.id === 'board').openIn = 'center_peek';
  await api('PUT', path, { views: cfg.views });
  await page.goto(`${base}/p/${collectionId}`);
  await page.locator('.view-tab', { hasText: 'Board' }).click();
  await page.locator('.board-card-title', { hasText: 'Second row' }).click();
  await centre.waitFor();
  assert.equal(new URL(page.url()).searchParams.get('as'), 'center', 'the address does not say the peek is centred');
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    assert(await centre.evaluate((p) => p.contains(document.activeElement)), `centre peek: Tab ${i + 1} left the panel`);
  }
  // The reason it is not ui/Dialog: a dialog the page opens draws over the
  // peek instead of closing it.
  await centre.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('button', { name: 'Version history' }).click();
  const history = page.getByRole('dialog', { name: 'Version history' });
  await history.waitFor();
  assert(await centre.isVisible(), 'opening Version history closed the centre peek');
  await page.keyboard.press('Escape');
  await history.waitFor({ state: 'hidden' });
  assert(await centre.isVisible(), 'closing Version history closed the centre peek too');
  await page.reload();
  await centre.waitFor();
  await page.mouse.click(5, 5);
  await centre.waitFor({ state: 'hidden' });
  assert.equal(new URL(page.url()).searchParams.get('peek'), null, 'a click outside left the peek in the address');

  // A phone has no room beside the view: a side peek opens centred.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/p/${collectionId}`);
  await page.getByText('Task 5', { exact: true }).click();
  await centre.waitFor();
  assert.equal(await panel.count(), 0, 'a side panel opened on a phone');
  await page.setViewportSize({ width: 1200, height: 900 });

  console.log('Peeks: side opens beside the view, swaps, closes with Escape and Back, survives a reload; centre traps Tab and lets the page open its own dialogs; phones open centred; full-page views unchanged; set per view.');
});

async function eventuallyEqual(read, want, message) {
  for (let i = 0; i < 100; i++) {
    if ((await read()) === want) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(await read(), want, message);
}
