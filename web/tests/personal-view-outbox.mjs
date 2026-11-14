import assert from 'node:assert/strict';
import { eventually, withFixture } from './fixture.mjs';

// A filter changed just before the page goes away is not lost (#594). The page
// sends what still waits with `keepalive` when it is leaving, and the browser
// does not always finish that request: after a reload straight after an edit it
// never reached the server about half the time. The edit is therefore also
// noted in the browser's storage, and the next open of the database sends it
// again.
//
// The browser's loss cannot be provoked from outside (a request made while the
// page unloads is not seen by the test driver), so it is made to happen in the
// page: while `window.__dropKeepalive` is set, a keepalive request for the
// person's state is not sent at all, as the browser failed to send it.
await withFixture(async ({ page, api, base, path }) => {
  page.setDefaultTimeout(15000);
  const collectionId = path.split('/').pop();
  const rows = page.locator('.collection-scroll .db-table tbody tr').filter({ hasText: /(First|Second) row/ });
  const personal = async () => (await api('GET', `${path}/personal`)).states;

  await page.addInitScript(() => {
    const send = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input.url;
      if (window.localStorage.getItem('dropKeepalive') === '1' && init?.keepalive && /\/personal\//.test(url)) {
        window.localStorage.setItem('dropped', String(Number(window.localStorage.getItem('dropped') ?? 0) + 1));
        return Promise.reject(new TypeError('Failed to fetch'));
      }
      return send(input, init);
    };
  });

await page.goto(`${base}/p/${collectionId}`);
  // The fixture's table is shared with "Status is To do": one of two rows.
  await eventually(async () => (await rows.count()) === 1);
  await page.waitForTimeout(500);

  // The person takes the filter off for themselves and reloads at once, inside
  // the 400 ms the edit waits before it is sent.
  await page.evaluate(() => window.localStorage.setItem('dropKeepalive', '1'));
  await page.locator('.collection-scroll .fs-controls button', { hasText: 'Filter' }).first().click();
  await page.locator('.fs-remove').first().click();
  await page.locator('.fs-backdrop').click({ position: { x: 5, y: 5 } });
  await eventually(async () => (await rows.count()) === 2);
  await page.reload();
  // The request was dropped, and the server has nothing.
  assert.equal(await page.evaluate(() => window.localStorage.getItem('dropped')), '1', 'the request that was to be lost was never made, so the test proves nothing');
  assert.deepEqual(await personal(), {}, 'the server has the state although its only request was dropped');

  // The network works again. The reopened database still shows the person's
  // own view, and sends it.
  await page.evaluate(() => window.localStorage.setItem('dropKeepalive', '0'));
  await eventually(async () => (await rows.count()) === 2);
  await eventually(async () => Object.keys(await personal()).length === 1);
  const stored = (await personal()).table;
  assert.deepEqual(stored.filters, [], `the state stored afterwards is ${JSON.stringify(stored)}`);

  // Nothing is left to send: a later open does not send it again over a newer
  // change made meanwhile (here, put back from another device).
  await api('DELETE', `${path}/personal/table`);
  await page.reload();
  await eventually(async () => (await rows.count()) === 1);
  assert.deepEqual(await personal(), {}, 'an old edit was sent again');

  console.log('Personal view outbox: an edit whose request was lost is shown after the reload and sent again, once.');
});
