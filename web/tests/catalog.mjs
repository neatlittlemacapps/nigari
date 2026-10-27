import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
//   1. Each section, in light and dark, matches its committed baseline in
//      catalog-baselines/. UPDATE_BASELINES=1 writes them instead.
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

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baselines = join(dirname(fileURLToPath(import.meta.url)), 'catalog-baselines');
const update = process.env.UPDATE_BASELINES === '1';
// Text is anti-aliased a little differently from one machine to the next. A
// real change (a colour, a size, a missing border) moves far more pixels than
// this; anti-aliasing moves fewer.
const MAX_DIFF = 0.02;

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
  async function diffRatio(a, b) {
    return page.evaluate(async ([a, b]) => {
      const load = (b64) =>
        new Promise((ok, fail) => {
          const img = new Image();
          img.onload = () => ok(img);
          img.onerror = fail;
          img.src = 'data:image/png;base64,' + b64;
        });
      const [x, y] = await Promise.all([load(a), load(b)]);
      if (x.width !== y.width || x.height !== y.height) return 1;
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
      let off = 0;
      for (let i = 0; i < p.length; i += 4) {
        if (Math.abs(p[i] - q[i]) > 40 || Math.abs(p[i + 1] - q[i + 1]) > 40 || Math.abs(p[i + 2] - q[i + 2]) > 40) off++;
      }
      return off / (p.length / 4);
    }, [a.toString('base64'), b.toString('base64')]);
  }

  async function matches(name, shot) {
    const file = join(baselines, `${name}.png`);
    if (update || !existsSync(file)) {
      if (!update) failures.push(`${name}: no baseline; run with UPDATE_BASELINES=1 and commit catalog-baselines/`);
      else writeFileSync(file, shot);
      return;
    }
    const ratio = await diffRatio(readFileSync(file), shot);
    if (ratio > MAX_DIFF) {
      // Outside the repository, so a failed run leaves nothing to commit by
      // mistake; CI uploads this directory.
      const actual = process.env.CATALOG_ACTUAL ?? join(tmpdir(), 'salt-catalog-actual');
      mkdirSync(actual, { recursive: true });
      writeFileSync(join(actual, `${name}.png`), shot);
      failures.push(`${name}: ${(ratio * 100).toFixed(1)}% of pixels differ from the baseline (this run's shot: ${join(actual, name)}.png)`);
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
    await axe(theme);

    for (const open of ['dialog', 'alert']) {
      await page.goto(`${base}?theme=${theme}&open=${open}`);
      const popup = page.getByRole(open === 'alert' ? 'alertdialog' : 'dialog');
      await popup.waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(250);
      await matches(`${open}-open-${theme}`, await popup.screenshot({ animations: 'disabled' }));
      await axe(`${theme}, ${open} open`);
    }
  }

  // 3: the keyboard.
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
  failures.push(e.stack || String(e));
} finally {
  await browser?.close();
  vite.kill();
}

if (failures.length) {
  console.error(`catalog: ${failures.length} problem(s)\n` + failures.map((f) => '  ' + f).join('\n'));
  process.exit(1);
}
console.log(update ? 'catalog: baselines written' : 'catalog: every section matches its baseline, axe is clean, the keyboard works');
