import assert from 'node:assert/strict';
import { eventually, withFixture } from './fixture.mjs';

// The editor's menus are BlockNote's (Mantine), not ours. They read BlockNote's
// --bn-colors-* variables, and the tokens set those now (component tokens
// editor.*, spec 001 FR-011). What must hold: the slash menu is the token's
// panel colour in light and in dark, not Mantine's default, and when the token
// changes the menu follows. That last part is what lets a fork re-colour the
// whole interface, editor included, from one token file (SC-005).
await withFixture(async ({ page, api, base, workspace }) => {
  page.setDefaultTimeout(15000);
  const doc = await api('POST', '/api/pages', { title: 'Tokens', workspaceId: workspace.id });
  await api('PATCH', `/api/pages/${doc.id}`, { content: [{ id: 'intro', type: 'paragraph', props: {}, content: [], children: [] }] });

  // The colour a token resolves to, as the browser writes colours.
  const resolved = (token) =>
    page.evaluate((token) => {
      const probe = document.createElement('div');
      probe.style.background = `var(${token})`;
      document.body.append(probe);
      const colour = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return colour;
    }, token);
  const menuColour = () => page.locator('.bn-suggestion-menu').evaluate((m) => getComputedStyle(m).backgroundColor);

  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto(`${base}/p/${doc.id}`);
    await page.evaluate((t) => localStorage.setItem('nigari-theme', t), theme);
    await page.reload();
    await eventually(async () => (await page.evaluate(() => document.documentElement.dataset.theme)) === theme);
    await page.locator('[data-id="intro"] .bn-inline-content').click();
    await page.keyboard.type('/');
    await page.locator('.bn-suggestion-menu').waitFor();

    const glass = await resolved('--color-surface-glass');
    assert.equal(await menuColour(), glass, `${theme}: the slash menu is not the token's panel colour`);
    const selected = page.locator('.bn-suggestion-menu-item[aria-selected="true"]');
    assert.equal(
      await selected.evaluate((el) => getComputedStyle(el).backgroundColor),
      await resolved('--color-active'),
      `${theme}: the chosen entry is not the token's active colour`,
    );
    await page.keyboard.press('Escape');
  }

  // Change the token at runtime: the editor's menu follows it.
  await page.evaluate(() => document.documentElement.style.setProperty('--color-surface-glass', 'rgb(1, 2, 3)'));
  await page.locator('[data-id="intro"] .bn-inline-content').click();
  await page.keyboard.type('/');
  await page.locator('.bn-suggestion-menu').waitFor();
  assert.equal(await menuColour(), 'rgb(1, 2, 3)', 'the slash menu did not follow a change of its token');
});
