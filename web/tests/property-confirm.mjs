// Deleting a property asks first (#524, spec 014 FR-013). The ✕ beside a
// property used to drop it from the draft without a word, and Save then took it
// out of every view of the database; deleting a single option already asked.
import assert from 'node:assert/strict';
import { withFixture } from './fixture.mjs';

await withFixture(async ({ page, api, workspace, path, open, read }) => {
  page.setDefaultTimeout(15000);
  const items = page.locator('.schema-item');
  const names = () => items.locator('.schema-row > .prop-input').evaluateAll((inputs) => inputs.map((i) => i.value));
  // The ✕ is named by its text; its title says what it does. Found by the
  // property's place, since an input's value is not an attribute to match.
  const cross = async (name) => items.nth((await names()).indexOf(name)).locator('button[title="Delete property"]');
  const ask = page.locator('.confirm-dialog');

  // Cancel keeps the property, and the question names it and the database.
  await open();
  await (await cross('Status')).click();
  await ask.waitFor();
  const text = await ask.locator('.confirm-message').innerText();
  assert.match(text, /Delete “Status” from “Option editing test”\? It will be removed from all views\./);
  assert.doesNotMatch(text, /links to rows/, 'a select property has no links to mention');
  await ask.getByRole('button', { name: 'Cancel', exact: true }).click();
  await ask.waitFor({ state: 'hidden' });
  assert.deepEqual(await names(), ['Status', 'Labels']);

  // Confirmed, it leaves the draft; Save stores it.
  await (await cross('Status')).click();
  await ask.getByRole('button', { name: 'Delete property', exact: true }).click();
  await ask.waitFor({ state: 'hidden' });
  assert.deepEqual(await names(), ['Labels']);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('heading', { name: 'Collection properties' }).waitFor({ state: 'hidden' });
  assert.deepEqual((await read()).schema.map((p) => p.id), ['labels']);

  // A property added in this visit is not stored yet: nothing to ask.
  await open();
  await page.getByPlaceholder('New property name', { exact: true }).fill('Draft only');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await (await cross('Draft only')).click();
  assert.equal(await ask.count(), 0, 'a property that was never saved asked before going');
  assert.deepEqual(await names(), ['Labels']);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();

  // A relation says its links go too, naming the other database.
  const other = await api('POST', '/api/pages', { title: 'Other database', type: 'collection', workspaceId: workspace.id });
  const stored = await read();
  await api('PUT', path, {
    schema: [...stored.schema, { id: 'link', name: 'Link', type: 'relation', relationCollection: other.id }],
  });
  await page.reload();
  await open();
  await (await cross('Link')).click();
  await ask.waitFor();
  assert.match(
    await ask.locator('.confirm-message').innerText(),
    /Delete “Link” from “Option editing test”\? It will be removed from all views\.\s+Its links to rows of “Other database” go with it\./,
  );
  await ask.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.deepEqual(await names(), ['Labels', 'Link']);
});
console.log('Property confirm: delete asks, Cancel keeps, confirm removes, drafts and relations passed.');
