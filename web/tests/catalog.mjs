import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { eventually } from './fixture.mjs';

// The component catalogue (web/catalog.html), checked the three ways spec 001
// promises (FR-013, US2):
//
//   1. Each section, in light and dark, looks as it did in the reference shots
//      (see below). A difference is reported, not failed: it may be the
//      change the pull request is for.
//   2. axe finds no serious or critical violation, in either theme, with the
//      dialogs closed and open.
//   3. The keyboard does what the contract says: arrows, typeahead and Escape
//      in Select; focus trapped in a dialog and returned on close; Cancel first
//      in a destructive AlertDialog, which an outside click does not close;
//      Space on Checkbox and Switch; a disabled Button ignores a click.
//
// Before the components, 24 dialogs and the menus each re-decided focus and
// keys, and only two exposed a menu role. A check that runs on every component
// is the only way that stays fixed.
//
// The catalogue is served by Vite from web/ (it needs web/node_modules), with
// no backend: it renders on tokens.css alone.
//
// Reference shots are never committed. Shots taken on one machine never match
// another's: CI's runner draws text differently enough that every section
// differed by about a thousand pixels from shots taken elsewhere, with nothing
// changed. So the reference is drawn on the same machine, just before:
//
//   UPDATE_BASELINES=1 node catalog.mjs      # draw the reference (before a change)
//   node catalog.mjs                         # compare (after it)
//
// CI does the same with main: it draws the base branch's catalogue
// (CATALOG_WEB=<base>/web), then compares the pull request's against it.
// CATALOG_BASELINES says where the reference lives (default: a temp dir).
// CATALOG_SHOTS_ONLY=1 takes the shots and skips axe and the keyboard.

const web = process.env.CATALOG_WEB ? resolve(process.env.CATALOG_WEB) : resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baselines = process.env.CATALOG_BASELINES ?? join(tmpdir(), 'salt-catalog-baselines');
const update = process.env.UPDATE_BASELINES === '1';
const shotsOnly = process.env.CATALOG_SHOTS_ONLY === '1';
const changes = [];
// Pixels a shot may differ by after the anti-aliasing allowance in
// changedPixels. A count, not a share: two recoloured 14px checkboxes are
// 0.3% of their section, and a share let them through.
const MAX_CHANGED = 25;

const listener = createServer();
listener.listen(0, '127.0.0.1');
await once(listener, 'listening');
const port = listener.address().port;
await new Promise((r) => listener.close(r));

const vite = spawn(join(web, 'node_modules/.bin/vite'), ['--config', 'vite.catalog.config.ts', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
  cwd: web,
  env: { ...process.env, CI: '1' },
  stdio: 'ignore',
});
const base = `http://127.0.0.1:${port}/catalog.html`;
let browser;
const failures = [];

try {
  await eventually(async () => {
    if (vite.exitCode !== null) throw new Error('Vite exited before serving the catalogue');
    try {
      return (await fetch(base)).ok;
    } catch {
      return false;
    }
  });
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
  });
  const context = await browser.newContext({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (e) => failures.push(`page error: ${e.message}`));

  // Pixels of two PNGs, compared in the browser itself: no image library.
  async function changedPixels(a, b) {
    return page.evaluate(async ([a, b]) => {
      const load = (b64) =>
        new Promise((ok, fail) => {
          const img = new Image();
          img.onload = () => ok(img);
          img.onerror = fail;
          img.src = 'data:image/png;base64,' + b64;
        });
      const [x, y] = await Promise.all([load(a), load(b)]);
      if (x.width !== y.width || x.height !== y.height) return Infinity;
      const px = (img) => {
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        return g.getImageData(0, 0, img.width, img.height).data;
      };
      const p = px(x);
      const q = px(y);
      const w = x.width;
      const h = x.height;
      // A pixel counts as changed only when no pixel within one of its place
      // in the other image is close to it. Anti-aliasing on another machine
      // moves edges by a fraction of a pixel; that passes. A new colour, size
      // or spacing moves whole areas; that does not.
      const near = (a, ia, b, ib) =>
        Math.abs(a[ia] - b[ib]) <= 24 && Math.abs(a[ia + 1] - b[ib + 1]) <= 24 && Math.abs(a[ia + 2] - b[ib + 2]) <= 24;
      const matched = (a, b, x0, y0) => {
        const i = (y0 * w + x0) * 4;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x0 + dx;
            const yy = y0 + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            if (near(a, i, b, (yy * w + xx) * 4)) return true;
          }
        }
        return false;
      };
      let off = 0;
      for (let yy = 0; yy < h; yy++) {
        for (let xx = 0; xx < w; xx++) {
          if (!matched(p, q, xx, yy) || !matched(q, p, xx, yy)) off++;
        }
      }
      return off;
    }, [a.toString('base64'), b.toString('base64')]);
  }

  async function matches(name, shot) {
    const file = join(baselines, `${name}.png`);
    if (update) {
      writeFileSync(file, shot);
      return;
    }
    if (!existsSync(file)) return; // no reference drawn: nothing to compare
    const changed = await changedPixels(readFileSync(file), shot);
    if (changed > MAX_CHANGED) {
      // Outside the repository, so a failed run leaves nothing to commit by
      // mistake; CI uploads this directory.
      const actual = process.env.CATALOG_ACTUAL ?? join(tmpdir(), 'salt-catalog-actual');
      mkdirSync(actual, { recursive: true });
      writeFileSync(join(actual, `${name}.png`), shot);
      const what = changed === Infinity ? 'a different size than' : `${changed} pixels changed from`;
      changes.push(`${name}: ${what} the reference (this run's shot: ${join(actual, name)}.png)`);
    }
  }

  async function axe(label) {
    const result = await new AxeBuilder({ page }).analyze();
    for (const v of result.violations) {
      if (v.impact === 'serious' || v.impact === 'critical') {
        failures.push(`axe (${label}): ${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join('; ')}`);
      }
    }
  }

  if (update) mkdirSync(baselines, { recursive: true });

  // 1 and 2: every section, both themes; the dialogs open.
  for (const theme of ['light', 'dark']) {
    await page.goto(`${base}?theme=${theme}`);
    await page.locator('[data-section]').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    for (const section of await page.locator('[data-section]').all()) {
      const id = await section.getAttribute('data-section');
      await matches(`${id}-${theme}`, await section.screenshot({ animations: 'disabled' }));
    }
    if (!shotsOnly) await axe(theme);

    for (const open of ['dialog', 'alert']) {
      await page.goto(`${base}?theme=${theme}&open=${open}`);
      const popup = page.getByRole(open === 'alert' ? 'alertdialog' : 'dialog');
      await popup.waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(250);
      await matches(`${open}-open-${theme}`, await popup.screenshot({ animations: 'disabled' }));
      if (!shotsOnly) await axe(`${theme}, ${open} open`);
    }
  }

  // 3: the keyboard.
  if (shotsOnly) throw 'done';
  await page.goto(`${base}?theme=light`);
  const last = page.getByTestId('last');

  // Select: open with the keyboard, arrows move, a letter jumps, Enter picks,
  // Escape closes and gives focus back to the trigger.
  const fruit = page.getByRole('combobox', { name: 'Fruit' });
  await fruit.focus();
  await page.keyboard.press('ArrowDown');
  const listbox = page.getByRole('listbox');
  await listbox.waitFor();
  await page.keyboard.press('ArrowDown');
  await eventually(async () => (await page.locator('[role=option][data-highlighted]').textContent())?.includes('Cherry'));
  await page.keyboard.type('d');
  await eventually(async () => (await page.locator('[role=option][data-highlighted]').textContent())?.includes('Damson'));
  await page.keyboard.press('Enter');
  await eventually(async () => (await fruit.textContent())?.includes('Damson'));
  await fruit.focus();
  await page.keyboard.press('ArrowDown');
  await listbox.waitFor();
  await page.keyboard.press('Escape');
  await listbox.waitFor({ state: 'hidden' });
  assert(await fruit.evaluate((el) => el === document.activeElement), 'Select: Escape did not return focus to the trigger');

  // Checkbox and Switch: Space toggles.
  const unchecked = page.getByRole('checkbox', { name: 'Unchecked' });
  await unchecked.focus();
  await page.keyboard.press('Space');
  assert.equal(await unchecked.getAttribute('aria-checked'), 'true', 'Checkbox: Space did not check it');
  const off = page.getByRole('switch', { name: 'Off' });
  await off.focus();
  await page.keyboard.press('Space');
  assert.equal(await off.getAttribute('aria-checked'), 'true', 'Switch: Space did not turn it on');

  // A disabled Button: marked for the look, and a click does nothing.
  const disabled = page.getByRole('button', { name: 'Disabled' }).first();
  assert.notEqual(await disabled.getAttribute('data-disabled'), null, 'Button: disabled has no data-disabled');
  await disabled.click({ force: true });
  assert.equal(await last.textContent(), '', 'Button: a disabled button ran its click');

  // Dialog: opens with focus inside, Tab stays inside, Escape closes and
  // returns focus to the button that opened it.
  const opener = page.getByRole('button', { name: 'Open dialog' });
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Workspace settings' });
  await dialog.waitFor();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    // Base UI keeps focus in with guard elements on either side of the popup:
    // focus lands on a guard for a moment and is sent back in.
    const inside = async () => dialog.evaluate((d) => d.contains(document.activeElement));
    await eventually(inside).catch(async () => {
      const where = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 120));
      throw new Error(`Dialog: Tab ${i + 1} left the dialog, to ${where}`);
    });
  }
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert(await opener.evaluate((el) => el === document.activeElement), 'Dialog: focus did not return to the button that opened it');

  // AlertDialog, destructive: Cancel has focus, a click outside does not
  // close it, Escape does.
  const del = page.getByRole('button', { name: 'Delete…' });
  await del.focus();
  await page.keyboard.press('Enter');
  const alertDialog = page.getByRole('alertdialog', { name: 'Delete this page?' });
  await alertDialog.waitFor();
  await eventually(async () => (await page.evaluate(() => document.activeElement?.textContent)) === 'Cancel');
  await page.mouse.click(5, 5);
  await page.waitForTimeout(200);
  assert(await alertDialog.isVisible(), 'AlertDialog: a click outside closed it');
  await page.keyboard.press('Escape');
  await alertDialog.waitFor({ state: 'hidden' });
  assert.equal(await last.textContent(), '', 'AlertDialog: closing it confirmed it');
} catch (e) {
  if (e !== 'done') failures.push(e.stack || String(e));
} finally {
  await browser?.close();
  vite.kill();
}

// A changed section is a warning: it may be exactly what the pull request
// set out to change. In CI it goes to the job summary with the shots.
if (changes.length) {
  console.warn(`catalog: ${changes.length} section(s) look different from the reference\n` + changes.map((c) => '  ' + c).join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Component catalogue: ${changes.length} section(s) look different from main\n\n` +
        changes.map((c) => `- ${c.split(' (')[0]}`).join('\n') +
        '\n\nIf the pull request is meant to change them, this is expected. The shots are in the catalog-actual artifact.\n',
    );
    for (const c of changes) console.log(`::warning title=Component catalogue::${c.split(' (')[0]}`);
  }
}
if (failures.length) {
  console.error(`catalog: ${failures.length} problem(s)\n` + failures.map((f) => '  ' + f).join('\n'));
  process.exit(1);
}
console.log(
  update
    ? `catalog: reference shots written to ${baselines}`
    : shotsOnly
      ? 'catalog: shots taken'
      : `catalog: axe is clean and the keyboard works${changes.length ? '' : '; every section matches its reference (where one was drawn)'}`,
);
