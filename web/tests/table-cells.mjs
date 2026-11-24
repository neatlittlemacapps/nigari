import assert from 'node:assert/strict';
import { withFixture } from './fixture.mjs';

// What a table's cells draw (#813, #814, #806). A long relation or select
// name stays inside its column, cut with an ellipsis and whole on hover; the
// Name column has the same text size and weight as a text cell and a date;
// and a select cell offers a new option in English ("Create “…”"), where it
// said "Anlegen" in every language.

await withFixture(async ({ page, api, workspace, path }) => {
  page.setDefaultTimeout(15000);
  const areas = await api('POST', '/api/pages', { title: 'Areas', type: 'collection', workspaceId: workspace.id });
  const long = await api('POST', '/api/pages', { parentId: areas.id, title: 'Design Organisation & Capacity' });
  await api('PUT', path, {
    schema: [
      { id: 'area', name: 'Area', type: 'relation', relationCollection: areas.id },
      { id: 'tag', name: 'Tag', type: 'select', options: [{ id: 'x', name: 'A rather long select option name', color: '#337ea9' }] },
      { id: 'due', name: 'Due', type: 'date' },
      { id: 'note', name: 'Note', type: 'text' },
    ],
    // Narrow columns, as after dragging their edges in.
    views: [{ id: 'table', name: 'Table', type: 'table', colWidths: { area: 110, tag: 100 } }],
  });
  await api('POST', '/api/pages', {
    parentId: path.split('/').pop(), title: 'Plan the capacity review',
    props: { area: [long.id], tag: 'x', due: '2026-11-09', note: 'Some note' },
  });
  await page.reload();
  const row = page.locator('.db-table tbody tr', { hasText: 'Plan the capacity review' });
  await row.locator('.relation-chip', { hasText: 'Design' }).waitFor();

  // ---- #813: the chips stay in their cells, cut, with the full name on hover ----
  for (const [prop, name] of [['area', 'Design Organisation & Capacity'], ['tag', 'A rather long select option name']]) {
    const cell = row.locator(`td[data-prop-id="${prop}"]`);
    const chip = cell.locator('.prop-chip').first();
    const [c, k] = await Promise.all([cell.boundingBox(), chip.boundingBox()]);
    assert(k.x + k.width <= c.x + c.width + 0.5, `${prop}: the chip ends at ${k.x + k.width}, past its cell at ${c.x + c.width}`);
    assert(k.height < 30, `${prop}: the chip wraps its name over lines (${k.height}px tall)`);
    assert.equal(await chip.getAttribute('title'), name, `${prop}: no full name on hover`);
    const cut = await chip.evaluate((el) => el.scrollWidth > el.clientWidth && getComputedStyle(el).textOverflow === 'ellipsis');
    assert(cut, `${prop}: the long name is not cut with an ellipsis`);
  }

  // ---- #814: the Name column reads like the other cells ----
  const look = (loc) => loc.evaluate((el) => {
    const s = getComputedStyle(el);
    return `${s.fontFamily} ${s.fontSize} ${s.fontWeight}`;
  });
  const text = await look(row.locator('td[data-prop-id="note"] .prop-text'));
  assert.equal(await look(row.locator('.db-title-link')), text, 'the Name column differs from a text cell');
  assert.equal(await look(row.locator('td[data-prop-id="due"] input')), text, 'a date differs from a text cell');

  // ---- #806: a new option is offered in English ----
  await row.locator('td[data-prop-id="tag"] .select-cell-value').click();
  await page.locator('.select-search').fill('Urgent');
  const create = page.locator('.select-create');
  assert.equal((await create.textContent()).trim(), 'Create “Urgent”');
  await page.keyboard.press('Escape');
});
console.log('Table cells: long relation and select names stay in their column with an ellipsis and the full name on hover, the Name column matches the other cells, a new option is offered in English passed.');
