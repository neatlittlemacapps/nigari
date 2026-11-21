import assert from 'node:assert/strict';
import { withFixture } from './fixture.mjs';

await withFixture(async ({ page, api, base, workspace, path }) => {
  const collectionId = path.split('/').pop();
  const targets = await api('POST', '/api/pages', {
    title: 'Projects', type: 'collection', workspaceId: workspace.id,
  });
  const title = 'Design Organisation & Capacity for International Projects';
  const target = await api('POST', '/api/pages', { parentId: targets.id, title });
  await api('PUT', path, {
    schema: [
      { id: 'project', name: 'Project', type: 'relation', relationCollection: targets.id },
      { id: 'due', name: 'Due', type: 'date' },
    ],
    views: [{ id: 'test', name: 'Table', type: 'table', colWidths: { project: 100 } }],
  });
  await api('POST', '/api/pages', {
    parentId: collectionId, title: 'Collect feedback', props: { project: [target.id], due: '2026-11-20' },
  });
  await page.goto(`${base}/p/${collectionId}`);
  const chip = page.locator('.db-table .relation-chip', { hasText: title });
  await chip.waitFor();
  assert.equal(await chip.getAttribute('title'), title);
  const { chipRight, cellRight, overflow, textOverflow } = await chip.evaluate((element) => ({
    chipRight: element.getBoundingClientRect().right,
    cellRight: element.closest('td').getBoundingClientRect().right,
    overflow: element.scrollWidth > element.clientWidth,
    textOverflow: getComputedStyle(element).textOverflow,
  }));
  assert(chipRight <= cellRight, `chip crosses cell edge: ${chipRight} > ${cellRight}`);
  assert.equal(overflow, true, 'the long title is clipped in the narrow column');
  assert.equal(textOverflow, 'ellipsis');
});
