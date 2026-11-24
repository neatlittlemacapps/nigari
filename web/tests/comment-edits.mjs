import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eventually, withFixture } from './fixture.mjs';

// Spec 017: a comment's author edits it by keyboard, "(edited)" opens its
// earlier versions, another person sees no Edit, and reactions toggle, count
// across people and name who gave them, on a resolved comment too and inside
// a side peek.
await withFixture(async ({ page, context, api, base, workspace, path }) => {
  page.setDefaultTimeout(15000);
  const size = { viewport: { width: 1200, height: 900 }, locale: 'en-US' };
  const doc = await api('POST', '/api/pages', { title: 'Discussed page', workspaceId: workspace.id });
  const password = randomUUID();
  await api('POST', '/api/users', { name: 'Mo Member', email: 'member@example.test', password, workspaces: [{ id: workspace.id, role: 'member' }] });
  const other = await context.browser().newContext(size);
  assert.ok((await other.request.fetch(`${base}/api/login`, { method: 'POST', data: { email: 'member@example.test', password } })).ok());
  const mine = await api('POST', `/api/pages/${doc.id}/comments`, { body: 'The frist draft' });
  const theirs = await other.request.fetch(`${base}/api/pages/${doc.id}/comments`, { method: 'POST', data: { body: 'Written by Mo' } });
  const theirsId = (await theirs.json()).id;

  await page.goto(`${base}/p/${doc.id}`);
  await page.getByRole('button', { name: 'Comments', exact: true }).first().click();
  const panel = page.locator('.comments-panel');
  const item = (id) => panel.locator(`[data-comment-id="${id}"]`);
  await item(mine.id).waitFor();

  // Only the author has Edit.
  assert.equal(await item(theirsId).getByRole('button', { name: 'Edit', exact: true }).count(), 0, "another person's comment offers Edit");

  // Edit, then Escape: nothing changes and focus is back on Edit.
  await item(mine.id).hover();
  await item(mine.id).getByRole('button', { name: 'Edit', exact: true }).click();
  const box = item(mine.id).getByRole('textbox', { name: 'Edit comment' });
  await box.fill('Thrown away');
  await box.press('Escape');
  await panel.waitFor(); // Escape left the edit, not the panel
  await eventually(async () => (await item(mine.id).locator('.cp-body').innerText()) === 'The frist draft');
  await eventually(async () => page.evaluate(() => document.activeElement?.textContent?.includes('Edit') ?? false));

  // Edit by keyboard: Enter on Edit, type, ⌘/Ctrl+Enter saves.
  await page.keyboard.press('Enter');
  await box.waitFor();
  await box.fill('The first draft');
  await box.press('ControlOrMeta+Enter');
  await eventually(async () => (await item(mine.id).locator('.cp-body').first().innerText()) === 'The first draft');
  const stored = (await api('GET', `/api/pages/${doc.id}/comments`)).find((c) => c.id === mine.id);
  assert.equal(stored.body, 'The first draft');
  assert.ok(stored.editedAt, 'the stored comment is not marked edited');

  // (edited) opens the earlier versions.
  await item(mine.id).getByRole('button', { name: '(edited)' }).click();
  const versions = page.getByRole('dialog', { name: 'Earlier versions' });
  await versions.getByText('The frist draft').waitFor();
  // Focus lands on the list, visibly, not on the popover's hidden Close.
  await eventually(async () => page.evaluate(() => document.activeElement?.classList.contains('cp-versions-list') ?? false));
  await page.keyboard.press('Escape');
  await versions.waitFor({ state: 'hidden' });

  // React through the picker, then Mo reacts too: the chip counts 2 and names both.
  await item(mine.id).hover();
  await item(mine.id).getByRole('button', { name: 'Add reaction' }).click();
  // The arrows move between the six and stay inside the picker.
  const picker = page.getByRole('dialog', { name: 'Add reaction' });
  await picker.getByRole('button', { name: 'Thumbs up' }).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Heart', 'ArrowRight left the picker');
  await page.keyboard.press('Enter');
  const heart = () => item(mine.id).locator('.cp-chip');
  await eventually(async () => (await heart().count()) === 1 && (await heart().getAttribute('aria-pressed')) === 'true');
  await other.request.fetch(`${base}/api/comments/${mine.id}/reactions/heart`, { method: 'PUT' });
  await page.reload();
  await item(mine.id).waitFor();
  await eventually(async () => (await heart().innerText()).includes('2'));
  assert.equal(await heart().getAttribute('aria-label'), 'You, Mo Member reacted with Heart');

  // Pressing my chip takes mine back; Mo's stays.
  await heart().click();
  await eventually(async () => (await heart().getAttribute('aria-pressed')) === 'false' && (await heart().innerText()).includes('1'));

  // A resolved comment keeps its reactions and can still be reacted to.
  await item(theirsId).hover();
  await item(theirsId).getByRole('button', { name: 'Resolve' }).click();
  await panel.getByText(/Show 1 resolved/).click();
  await item(theirsId).hover();
  await item(theirsId).getByRole('button', { name: 'Add reaction' }).click();
  await page.getByRole('dialog', { name: 'Add reaction' }).getByRole('button', { name: 'Done' }).click();
  await eventually(async () => (await item(theirsId).locator('.cp-chip').count()) === 1);

  // Inside a side peek: the same panel, the same controls.
  const coll = path.split('/').pop();
  const config = await api('GET', path);
  config.views[0].openIn = 'side_peek';
  await api('PUT', path, { views: config.views });
  const row = await api('POST', '/api/pages', { parentId: coll, title: 'Row with a comment', props: { status: 'todo' } });
  const rowComment = await api('POST', `/api/pages/${row.id}/comments`, { body: 'On a row' });
  await page.goto(`${base}/p/${coll}`);
  await page.getByText('Row with a comment', { exact: true }).click();
  const peek = page.getByRole('complementary', { name: 'Page preview' });
  await peek.waitFor();
  // The peek's top bar is narrow; its ⋯ menu always offers the comments.
  await peek.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'To the comments' }).click();
  const peekItem = page.locator(`.comments-panel [data-comment-id="${rowComment.id}"]`);
  await peekItem.waitFor();
  await peekItem.hover();
  await peekItem.getByRole('button', { name: 'Edit', exact: true }).click();
  const peekBox = peekItem.getByRole('textbox', { name: 'Edit comment' });
  await peekBox.fill('On a row, edited');
  await peekBox.press('ControlOrMeta+Enter');
  await peekItem.getByRole('button', { name: '(edited)' }).waitFor();
  assert.ok(new URL(page.url()).searchParams.get('peek'), 'saving the edit closed the peek');

  await other.close();
  console.log('Comment edits: keyboard edit, versions, author-only Edit, reactions with names, resolved, side peek.');
});
