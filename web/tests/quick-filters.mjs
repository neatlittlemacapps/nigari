import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eventually, withFixture } from './fixture.mjs';

// Quick filters (spec 013, US3, quickstart §5). The view's owner offers Labels
// as a quick filter from Settings; every viewer sees the chip; a viewer's pick
// narrows the view for them alone, survives a reload, and clears with its ✕;
// Save for everyone turns a pick into a shared filter; taking the quick
// filter off the view takes the chip away for everyone.
// The fixture: First row (labels To do, Done), Second row (labels Done).
await withFixture(async ({ page, context, api, base, workspace, path }) => {
  page.setDefaultTimeout(15000);
  const collectionId = path.split('/').pop();
  const size = { viewport: { width: 1200, height: 900 }, locale: 'en-US' };
  const rowsOn = (p) => p.locator('.collection-scroll .db-table tbody tr').filter({ hasText: /(First|Second) row/ });
  const chipOn = (p) => p.locator('.quick-filters').getByRole('button', { name: /^Labels/ });
  const table = async () => (await api('GET', path)).views.find((v) => v.id === 'table');

  // A table without a shared filter, so both rows show.
  const views = (await api('GET', path)).views.map((v) => (v.id === 'table' ? { ...v, filters: [] } : v));
  await api('PUT', path, { views });
  await page.goto(`${base}/p/${collectionId}`);
  await eventually(async () => (await rowsOn(page).count()) === 2);
  assert.equal(await page.locator('.quick-filters').count(), 0, 'chips before any quick filter is offered');

  // ---- The owner offers Labels from Settings › Quick filters ----
  await page.locator('.collection-toolbar').getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Quick filters/ }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Labels' }).click();
  // Status too, so the order is kept as added.
  await page.getByRole('menuitemcheckbox', { name: 'Status' }).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await eventually(async () => JSON.stringify((await table()).quickFilters) === '["labels","status"]');
  await chipOn(page).waitFor();

  // ---- A colleague sees the chips and picks a value ----
  const password = randomUUID();
  await api('POST', '/api/users', { name: 'Mo Member', email: 'member@example.test', password, workspaces: [{ id: workspace.id, role: 'member' }] });
  const other = await context.browser().newContext(size);
  assert.ok((await other.request.fetch(`${base}/api/login`, { method: 'POST', data: { email: 'member@example.test', password } })).ok());
  const colleague = await other.newPage();
  await colleague.goto(`${base}/p/${collectionId}`);
  await eventually(async () => (await rowsOn(colleague).count()) === 2);
  // A pick is stored a moment later (debounced, usePersonalViews); waiting
  // for that request keeps the test off the clock of a page that is not in
  // front, whose timers the browser slows.
  const stored = (p) => p.waitForResponse((r) => r.url().includes('/personal/') && r.request().method() === 'PUT');
  await chipOn(colleague).click();
  await Promise.all([stored(colleague), colleague.getByRole('menuitem', { name: 'To do' }).click()]);
  await eventually(async () => (await rowsOn(colleague).count()) === 1);
  await colleague.locator('.db-table tbody tr', { hasText: 'First row' }).waitFor();
  assert.match(await chipOn(colleague).textContent(), /Labels: To do/);
  await colleague.locator('.view-change-bar').waitFor();
  // The pick is the colleague's alone: the view is unchanged, the owner sees both rows.
  assert.equal((await table()).filters?.length ?? 0, 0, 'a pick changed the shared view');
  await page.reload();
  await eventually(async () => (await rowsOn(page).count()) === 2);
  assert.match(await chipOn(page).textContent(), /^Labels/);
  assert.doesNotMatch(await chipOn(page).textContent(), /To do/, 'the owner sees the colleague\'s pick');

  // ---- It is on the colleague's account: a reload keeps it ----
  await colleague.reload();
  await eventually(async () => (await rowsOn(colleague).count()) === 1);

  // ---- The ✕ clears it ----
  await colleague.getByRole('button', { name: 'Clear Labels' }).click();
  await eventually(async () => (await rowsOn(colleague).count()) === 2);
  await colleague.locator('.view-change-bar').waitFor({ state: 'hidden' });

  // ---- Save for everyone turns a pick into a shared filter ----
  await chipOn(colleague).click();
  await colleague.getByRole('menuitem', { name: 'To do' }).click();
  await eventually(async () => (await rowsOn(colleague).count()) === 1);
  await colleague.locator('.view-change-bar').getByRole('button', { name: 'Save for everyone' }).click();
  await eventually(async () => JSON.stringify((await table()).filters) === JSON.stringify([{ property: 'labels', op: 'is', value: 'todo' }]));
  await colleague.locator('.view-change-bar').waitFor({ state: 'hidden' });
  assert.doesNotMatch(await chipOn(colleague).textContent(), /To do/, 'the chip stayed picked after Save for everyone');
  await eventually(async () => (await rowsOn(page).count()) === 1);

  // ---- Taking the quick filter off the view takes the chip away ----
  const now = (await api('GET', path)).views.map((v) => (v.id === 'table' ? { ...v, quickFilters: ['status'] } : v));
  await api('PUT', path, { views: now });
  await eventually(async () => (await chipOn(colleague).count()) === 0);
  await colleague.locator('.quick-filters').getByRole('button', { name: /^Status/ }).waitFor();

  console.log('Quick filters: offered from Settings, a colleague\'s pick is theirs and survives a reload, the ✕ clears it, Save for everyone makes it shared, removing it removes the chip passed.');
});
