import assert from 'node:assert/strict';
import { eventually, withFixture } from './fixture.mjs';

// A page's tag field has a name (#1124). It had only a placeholder, which is
// gone once something is typed, so a screen reader announced a bare edit box.
// Found by its name, it still adds a tag, and it keeps the name with text in it.

await withFixture(async ({ page, api, base, workspace }) => {
  page.setDefaultTimeout(15000);
  const doc = await api('POST', '/api/pages', { title: 'Tagged', workspaceId: workspace.id });
  await page.goto(`${base}/p/${doc.id}`);
  const field = page.getByRole('textbox', { name: 'Add a tag', exact: true });
  await field.waitFor();
  await field.fill('research');
  assert.equal(await page.getByRole('textbox', { name: 'Add a tag', exact: true }).count(), 1, 'the field loses its name once typed in');
  await field.press('Enter');
  await eventually(async () => ((await api('GET', `/api/pages/${doc.id}`)).tags ?? []).includes('research'));
});
