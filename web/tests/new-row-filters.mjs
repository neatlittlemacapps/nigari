import assert from 'node:assert/strict';
import { withFixture } from './fixture.mjs';

// A row made in a filtered view takes the values the view's filters pin down
// (spec 005, #139). New in a view filtered to "Status is To do" used to create
// an empty row, which matched nothing and vanished from the view at once. What
// must hold now: the row arrives with Status = To do and stays; in a view whose
// filters cannot be met by one value, a notice says the row is not shown and
// its Open goes to the row; and a view without filters creates rows as before,
// with no notice.
await withFixture(async ({ page, api, base, path }) => {
  page.setDefaultTimeout(15000);
  const collectionId = path.split('/').pop();
  const notice = page.locator('.toast', { hasText: "doesn't match this view's filters" });

  // Press the toolbar's New (a board has a New per column too) and return
  // the row the server made.
  const pressNew = async () => {
    const [created] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith('/api/pages') && r.request().method() === 'POST'),
      page.locator('.split-btn').getByRole('button', { name: 'New', exact: true }).click(),
    ]);
    return created.json();
  };

  // US1: the fixture's Table view is filtered to Status is To do.
  await page.goto(`${base}/p/${collectionId}`);
  const row = await pressNew();
  const stored = await api('GET', `/api/pages/${row.id}`);
  assert.equal(stored.props?.status, 'todo', `the new row stored ${JSON.stringify(stored.props)}, want status todo`);
  assert.equal(row.matchesView, true, 'the server said the new row does not match its own view');
  // A new row has no title of its own, so the view shows it as Untitled.
  await page.getByText('Untitled', { exact: true }).first().waitFor()
    .catch(() => assert.fail('the new row is not shown in the view it was made in'));
  assert.equal(await notice.count(), 0, 'a row that shows was announced as hidden');

  // US2: a filter with several values has no single answer, so the row
  // cannot be made to fit, and the notice says so.
  const config = await api('GET', path);
  config.views[0].filters = [{ property: 'status', op: 'is', value: '', values: ['todo', 'done'] }];
  await api('PUT', path, { views: config.views });
  await page.reload();
  const hidden = await pressNew();
  assert.equal(hidden.matchesView, false, 'a row outside the view was reported as matching');
  await notice.waitFor();
  await notice.getByRole('button', { name: 'Open' }).click();
  await page.waitForURL((u) => u.pathname.endsWith(`/p/${hidden.id}`));

  // An unfiltered view: nothing changes, no notice.
  await page.goto(`${base}/p/${collectionId}`);
  await page.locator('.view-tab', { hasText: 'Board' }).click();
  const plain = await pressNew();
  assert.equal(plain.matchesView, true, 'a view with no filters reported a mismatch');
  const plainStored = await api('GET', `/api/pages/${plain.id}`);
  assert.equal(plainStored.props?.status, undefined, 'an unfiltered view pinned a value');
  await page.waitForTimeout(500);
  assert.equal(await notice.count(), 0, 'an unfiltered view showed the notice');

  console.log('New row filters: the view pins its single answers, a row that cannot show is announced, Open opens it.');
});
