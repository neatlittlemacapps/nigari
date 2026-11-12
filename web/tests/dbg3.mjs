import { eventually, withFixture } from './fixture.mjs';
await withFixture(async ({ page, api, base, workspace, path }) => {
  page.setDefaultTimeout(15000);
  const collectionId = path.split('/').pop();
  const doc = await api('POST', '/api/pages', { title: 'A', workspaceId: workspace.id });
  await api('PATCH', `/api/pages/${doc.id}`, { content: [{ id: 'db', type: 'database', props: { collectionId }, content: [], children: [] }] });
  let t0 = 0; const ev = [];
  page.on('response', (r) => { const u = r.url(); if (/personal$/.test(u)) ev.push(['personal', Date.now() - t0]); else if (/\/rows\?/.test(u)) ev.push(['rows', Date.now() - t0]); else if (/collections\/[0-9a-f]+$/.test(u)) ev.push(['config', Date.now() - t0]); });
  await page.goto(`${base}/p/${doc.id}`);
  for (let i = 0; i < 6; i++) {
    ev.length = 0; t0 = Date.now();
    await page.reload();
    await page.locator('.bn-db-embed .db-table tbody tr').filter({ hasText: /row/ }).first().waitFor();
    const firstRow = Date.now() - t0;
    await new Promise((r) => setTimeout(r, 800));
    console.log(i, 'firstRow', firstRow, ev.map((e) => e.join('@')).join(' '));
  }
});
