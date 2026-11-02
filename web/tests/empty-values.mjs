import assert from 'node:assert/strict';
import { eventually, withFixture } from './fixture.mjs';

// #269: an empty date looked filled in. An empty <input type="date"> draws
// whatever the browser likes, and Safari draws today's date in full colour,
// so a row looked dated when it was not; and every other type showed "no
// value" its own way. Now an empty date is a button until it is clicked, the
// row page says "Empty" for every field you fill in yourself, list-shaped
// fields say what a click adds, and clearing a date stores nothing.
await withFixture(async ({ page, api, base, path }) => {
  page.setDefaultTimeout(15000);
  const collectionId = path.split('/').pop();
  await api('PUT', path, {
    schema: [
      { id: 'due', name: 'Due', type: 'date' },
      { id: 'count', name: 'Count', type: 'number' },
      { id: 'note', name: 'Note', type: 'text' },
      { id: 'site', name: 'Site', type: 'url' },
      { id: 'owner', name: 'Owner', type: 'person' },
      { id: 'tasks', name: 'Tasks', type: 'checklist' },
      { id: 'link', name: 'Link', type: 'relation', relationCollection: collectionId },
    ],
    views: [{ id: 'table', name: 'Table', type: 'table' }],
  });
  const row = await api('POST', '/api/pages', { parentId: collectionId, title: 'Blank row', props: {} });
  const due = async () => (await api('GET', `/api/pages/${row.id}`)).props?.due;

  // The row page: every empty field reads as empty, none is a date input.
  await page.goto(`${base}/p/${row.id}`);
  const props = page.locator('.row-props');
  const field = (name) => props.locator('.row-prop', { has: page.locator('.row-prop-label', { hasText: name }) })
    .locator('.row-prop-value');
  await field('Due').waitFor();
  assert.equal(await props.locator('input[type="date"]').count(), 0, 'an empty date must not be a date input');
  for (const name of ['Due', 'Count', 'Note', 'Site']) {
    assert.equal((await field(name).innerText()).trim(), 'Empty', `${name} must read "Empty"`);
    const colour = await field(name).locator('.prop-empty').evaluate((el) => getComputedStyle(el).opacity);
    assert.equal(colour, '0.5', `${name} must be muted`);
  }
  assert.equal((await field('Owner').innerText()).trim(), 'Add person');
  assert.equal((await field('Tasks').innerText()).trim(), 'Add sub-task');
  assert.equal((await field('Link').innerText()).trim(), 'Add link');

  // One click opens the date input, focused; a date typed in is saved.
  await field('Due').getByRole('button', { name: 'Edit: Due' }).click();
  const input = field('Due').locator('input[type="date"]');
  await input.waitFor();
  assert.equal(await input.evaluate((el) => el === document.activeElement), true, 'the input must take focus');
  await input.fill('2026-07-18');
  await eventually(async () => (await due()) === '2026-07-18');

  // Clearing it stores nothing (null), not "", and the field reads Empty again.
  await input.fill('');
  await eventually(async () => (await due()) == null);
  await input.blur();
  await eventually(async () => (await field('Due').innerText()).trim() === 'Empty');
  assert.equal(await props.locator('input[type="date"]').count(), 0);

  // Clicked and left without a date: back to Empty, nothing written.
  await field('Due').getByRole('button', { name: 'Edit: Due' }).click();
  await field('Due').locator('input[type="date"]').waitFor();
  await page.locator('.row-prop-label', { hasText: 'Note' }).click();
  await eventually(async () => (await field('Due').innerText()).trim() === 'Empty');
  assert.equal(await due() ?? null, null, 'leaving an empty date must write nothing');

  // An empty number opens its input on a click, and a typed number saves.
  await field('Count').getByRole('button', { name: 'Edit: Count' }).click();
  await field('Count').locator('input[type="number"]').fill('7');
  await eventually(async () => (await api('GET', `/api/pages/${row.id}`)).props?.count === 7);

  // The table: an empty date cell is blank, not a date input and not the
  // word "Empty", and is still something to click.
  await page.goto(`${base}/p/${collectionId}`);
  const cell = page.locator('.collection-scroll .db-table tbody tr', { hasText: 'Blank row' })
    .getByRole('button', { name: 'Edit: Due' });
  await cell.waitFor();
  assert.equal((await cell.innerText()).trim(), '');
  const box = await cell.boundingBox();
  assert(box && box.width > 20 && box.height > 10, `the empty cell must be a click target, got ${JSON.stringify(box)}`);
  await cell.click();
  await page.locator('.collection-scroll .db-table tbody tr', { hasText: 'Blank row' })
    .locator('input[type="date"]').waitFor();

  console.log('Empty values: an empty date is no date input, reads Empty on the row page, saves and clears to null.');
});
