import assert from 'node:assert/strict';
import { eventually, withFixture } from './fixture.mjs';

// #278: with the palette on Automatic, the options To do (blue), Done (green)
// and Third (an older #123456) were drawn blue, green, green: Third fell back
// to the colourful palette's third colour, which is the very green Done takes.
// This is the fixture's own select, which is where the bug was seen. The rule
// itself is checked in scripts/check-chartcolours.mjs; this checks the chart
// as drawn on the page.
await withFixture(async ({ page, api, base, path }) => {
  page.setDefaultTimeout(15000);
  const collectionId = path.split('/').pop();
  const { schema } = await api('GET', path);
  await api('POST', '/api/pages', { parentId: collectionId, title: 'Third row', props: { status: 'third' } });
  await api('PUT', path, {
    schema,
    views: [{ id: 'chart', name: 'Chart', type: 'chart', chartKind: 'donut', groupBy: 'status' }],
  });

  const swatches = () => page.locator('figure.chart .chart-group .chart-swatch')
    .evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
  const seen = {};
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(`${base}/p/${collectionId}`);
    await eventually(async () => (await swatches()).length === 3);
    const colours = await swatches();
    assert.equal(new Set(colours).size, 3, `${scheme}: three groups, three colours; got ${colours.join(', ')}`);
    seen[scheme] = colours.join(' ');
  }
  // The dark run drew dark colours, so it tested dark and not light twice
  // (a theme saved in the app would outrank the emulated system setting).
  assert.notEqual(seen.dark, seen.light, 'the dark run must draw the dark palette');

  console.log('Chart colours: To do, Done and Third are three colours on Automatic, light and dark.');
});
