import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { eventually, withFixture } from './fixture.mjs';

// A workspace's icon from the Workspace picture dialog (#593). The picker there
// is the page icon picker, which makes four kinds of value: an emoji, a Lucide
// icon, a Material icon and an uploaded picture. The server cut every icon to
// eight characters, so "lucide:Rocket" was stored as "lucide:R" and the sidebar
// drew nothing: the workspace came out without a picture. This picks a Lucide
// icon, a Material icon and an uploaded picture and checks that each is stored
// whole and drawn in the sidebar.

// A 16x16 red PNG, written here so no fixture file has to be kept.
function png() {
  const crc = (buf) => {
    let c, crcv = 0xffffffff;
    for (const b of buf) {
      c = (crcv ^ b) & 0xff;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcv = (crcv >>> 8) ^ c;
    }
    return (crcv ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(16, 0); ihdr.writeUInt32BE(16, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(16 * 3, 0).map((_, i) => (i % 3 === 0 ? 200 : 40))]);
  const raw = Buffer.concat(Array.from({ length: 16 }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

await withFixture(async ({ page, api, base, workspace }) => {
  page.setDefaultTimeout(15000);
  const picture = join(tmpdir(), `nigari-ws-icon-${process.pid}.png`);
  writeFileSync(picture, png());
  const stored = async () => (await api('GET', '/api/workspaces')).find((w) => w.id === workspace.id);
  await page.goto(`${base}/`);
  const switcher = page.locator('aside').getByRole('button', { name: new RegExp(workspace.name) }).first();
  await switcher.waitFor();
  const pictureDialog = page.getByRole('dialog', { name: 'Workspace picture' });
  const openDialog = async () => {
    await switcher.click();
    await page.getByText('Workspace settings', { exact: true }).first().click();
    await page.locator('.ws-row', { hasText: 'Picture' }).first().click();
    await pictureDialog.waitFor();
  };
  const choose = async (tab) => {
    await pictureDialog.getByRole('button', { name: /Choose…/ }).click();
    await page.locator('.icon-picker').waitFor();
    await page.locator('.icon-picker').getByRole('button', { name: tab, exact: true }).first().click();
  };
  // What the sidebar draws for the workspace: an <img>, an <svg> or its text.
  const avatar = () => page.locator('aside .ws-img, aside .ws-emoji svg, aside .ws-emoji img').first();

  // A Lucide icon.
  await openDialog();
  await choose('Icons');
  // Pick one whose reference is longer than eight characters, the cut that hid
  // this: the buttons are titled with the icon's name.
  const longLucide = page.locator('.icon-picker .icon-grid button[title]').nth(0);
  const lucideName = await longLucide.getAttribute('title');
  assert((`lucide:${lucideName}`).length > 8, 'the test picked an icon short enough to hide the bug');
  await longLucide.click();
  await pictureDialog.waitFor({ state: 'hidden' });
  assert.equal((await stored()).icon, `lucide:${lucideName}`, 'a Lucide icon was not stored whole');
  await eventually(async () => (await page.locator('aside .ws-emoji svg').count()) > 0);

  // A Material icon.
  await openDialog();
  await choose('Icons');
  await page.locator('.icon-picker').getByRole('button', { name: 'Material', exact: true }).click();
  const mdiButton = page.locator('.icon-picker .icon-grid button[title]').nth(0);
  await mdiButton.waitFor();
  const mdiName = await mdiButton.getAttribute('title');
  await mdiButton.click();
  await pictureDialog.waitFor({ state: 'hidden' });
  assert.equal((await stored()).icon, `mdi:${mdiName}`, 'a Material icon was not stored whole');
  await eventually(async () => (await page.locator('aside .ws-emoji svg').count()) > 0);

  // A picture uploaded in the picker's Upload tab.
  await openDialog();
  await choose('Upload');
  await page.locator('.icon-picker input[type=file]').setInputFiles(picture);
  await pictureDialog.waitFor({ state: 'hidden' });
  const uploaded = (await stored()).icon;
  assert.match(uploaded, /^\/files\/[A-Za-z0-9._-]+\.png$/, `an uploaded picture was stored as ${JSON.stringify(uploaded)}`);
  await eventually(async () => (await page.locator('aside .ws-emoji img').count()) > 0);
  const loaded = await page.locator('aside .ws-emoji img').first().evaluate((img) => img.complete && img.naturalWidth > 0);
  assert(loaded, 'the uploaded picture does not load');
  assert(await avatar().isVisible(), 'the workspace shows no picture');

  console.log('Workspace icon: a Lucide icon, a Material icon and an uploaded picture are stored whole and drawn.');
});
