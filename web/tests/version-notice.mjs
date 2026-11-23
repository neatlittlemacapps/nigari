import assert from 'node:assert/strict';
import { eventually, withFixture } from './fixture.mjs';

// "A new version is available" says so once per page load (#923). The owner
// saw it pop up again and again on a day with several releases. The tab's
// build and the server disagreed, and the flag meant to stop a repeat lived
// inside the effect that builds the live-updates connection: every rebuild
// (the 60-second watchdog, Sync, pull-to-refresh) reset it and the toast came
// back. It also came twice on opening, once from /api/me and once from the
// connection's hello.
//
// The fixture is in that state on purpose: web/tests/README.md builds the
// frontend without NIGARI_VERSION, so it says 'dev' while the server carries
// its release number, and the notice is due on every load. What must hold:
// one notice on opening, with Reload beside it; none after five Syncs, each
// waited out until its new connection said hello; one again after a reload
// that still brings the old build, because the reload fixed nothing.
await withFixture(async ({ context, base, api }) => {
  const me = await api('GET', '/api/me');
  // Count every notice raised (toast.ts dispatches them all through one
  // event, shown or not) and every live-updates hello received.
  await context.addInitScript(() => {
    window.__notices = 0;
    window.__hellos = 0;
    window.addEventListener('nigari:toast', (e) => {
      if (e.detail.message.includes('A new version is available')) window.__notices++;
    });
    const Native = window.EventSource;
    window.EventSource = class extends Native {
      constructor(...args) {
        super(...args);
        this.addEventListener('message', (e) => {
          if (String(e.data).includes('"hello"')) window.__hellos++;
        });
      }
    };
  });
  const read = (page) => page.evaluate(() => ({ notices: window.__notices, hellos: window.__hellos }));

  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(`${base}/`);
  const toast = page.locator('.toast', { hasText: 'A new version is available' });
  await toast.waitFor().catch(() =>
    assert.fail(`no notice: is web/dist stamped with the server's own version (${me.version})? Build it without NIGARI_VERSION.`),
  );
  assert.ok(await toast.getByRole('button', { name: 'Reload', exact: true }).isVisible(), 'the notice has no Reload button');
  // Both sources have spoken once the hello is in: /api/me and the connection.
  await eventually(async () => (await read(page)).hellos >= 1);
  await page.waitForTimeout(300);
  assert.equal((await read(page)).notices, 1, 'opening the app announced the new version more than once');

  // Sync, as the button and pull-to-refresh do: each rebuilds the live
  // connection, whose hello used to repeat the notice.
  for (let i = 0; i < 5; i++) {
    const before = (await read(page)).hellos;
    await page.evaluate(() => window.dispatchEvent(new Event('nigari:refresh')));
    await eventually(async () => (await read(page)).hellos > before);
  }
  await page.waitForTimeout(300);
  assert.equal((await read(page)).notices, 1, 'Sync brought the notice back');

  // Reload from the notice: the page loads again, still on the old build here,
  // and says so once more — that reload did not bring the new version.
  await page.locator('.toast', { hasText: 'A new version is available' }).waitFor();
  await Promise.all([
    page.waitForEvent('load'),
    toast.getByRole('button', { name: 'Reload', exact: true }).click(),
  ]);
  await toast.waitFor();
  await eventually(async () => (await read(page)).hellos >= 1);
  await page.waitForTimeout(300);
  assert.equal((await read(page)).notices, 1, 'a reload onto the same old build was not told exactly once');

  console.log('Version notice: once per page load with Reload; Sync does not repeat it; a reload that changes nothing hears it again.');
});
