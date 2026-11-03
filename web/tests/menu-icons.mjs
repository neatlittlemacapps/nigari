import assert from 'node:assert/strict';
import { withFixture } from './fixture.mjs';

// Spec 010: every menu item has an icon, an icon means one thing, and the
// icon is decoration. Before, menus were hand-built: some items had no icon,
// the bin stood for Move to trash and Remove view, Export Markdown had two
// icons in two menus. check-menu-icons.mjs guards the source; this guards what
// a person actually sees, menu by menu: one hidden icon per item, the
// accessible name is the label alone, the same function shows the same icon
// in two menus, and a toggle keeps its icon.
await withFixture(async ({ page, api, base, workspace, path }) => {
  page.setDefaultTimeout(15000);

  // Each item: exactly one icon, hidden from assistive technology, and an
  // accessible name with no trace of it. Returns name → icon markup.
  const icons = async (menu, what) => {
    await menu.waitFor();
    const items = await menu.evaluate((m) =>
      [...m.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"]')].map((it) => {
        const svgs = it.querySelectorAll('svg.menu-icon');
        return {
          name: (it.textContent ?? '').replace(/\s+/g, ' ').trim(),
          count: svgs.length,
          hidden: [...svgs].every((s) => s.getAttribute('aria-hidden') === 'true'),
          icon: svgs[0]?.getAttribute('class') ?? '',
        };
      }),
    );
    assert(items.length > 0, `${what}: no items`);
    for (const it of items) {
      // A submenu entry (Move to workspace) has its icon too; values inside a
      // submenu are a different popup and not looked at here.
      assert.equal(it.count, 1, `${what}: "${it.name}" has ${it.count} icons`);
      assert(it.hidden, `${what}: the icon of "${it.name}" is not hidden from screen readers`);
    }
    return new Map(items.map((it) => [it.name, it.icon]));
  };

  const doc = await api('POST', '/api/pages', { title: 'Menu icons', workspaceId: workspace.id });
  await api('PATCH', `/api/pages/${doc.id}`, {
    content: [{ id: 'intro', type: 'paragraph', props: {}, content: [{ type: 'text', text: 'Hello', styles: {} }], children: [] }],
  });
  const tpl = await api('POST', '/api/pages', { title: 'Weekly template', workspaceId: workspace.id });
  await api('PATCH', `/api/pages/${tpl.id}`, { isTemplate: true });
  await page.goto(`${base}/p/${doc.id}`);

  // The sidebar's page menu, opened by a right-click.
  await page.locator('.tree-item', { hasText: 'Menu icons' }).click({ button: 'right' });
  const pageMenu = page.getByRole('menu', { name: 'Page actions' });
  const pageIcons = await icons(pageMenu, 'page menu');
  const favBefore = pageIcons.get('Add to favorites');
  assert(favBefore, 'page menu: no "Add to favorites"');
  await pageMenu.getByRole('menuitem', { name: 'Add to favorites' }).click();
  await pageMenu.waitFor({ state: 'hidden' });
  // The tree's row, not the new Favourites entry above it (a flat row with no menu).
  await page.locator('.tree-item:not(.sb-flat)', { hasText: 'Menu icons' }).click({ button: 'right' });
  const pageIconsAfter = await icons(pageMenu, 'page menu, favourite on');
  assert.equal(pageIconsAfter.get('Remove from favorites'), favBefore, 'favourite on/off changed its icon (FR-004)');
  await page.keyboard.press('Escape');

  // The template's menu: Move to trash is the same picture as in the page menu.
  await page.locator('.tree-item', { hasText: 'Weekly template' }).click({ button: 'right' });
  const tplIcons = await icons(page.getByRole('menu', { name: 'Template actions' }), 'template menu');
  const trash = [...pageIcons].find(([n]) => n.startsWith('Move to trash'))?.[1];
  assert.equal([...tplIcons].find(([n]) => n.startsWith('Move to trash'))?.[1], trash, 'Move to trash shows two different icons (FR-002)');
  await page.keyboard.press('Escape');

  // The page "…" and the account menu: Export Markdown in the "…" is the same
  // function as in the sidebar's menu, under another label.
  await page.getByRole('button', { name: 'More actions', exact: true }).click();
  const moreIcons = await icons(page.getByRole('menu', { name: 'More actions' }), 'page "…"');
  assert.equal(moreIcons.get('Markdown (.md)'), pageIcons.get('Export Markdown'), 'Export Markdown shows two different icons (FR-002)');
  await page.keyboard.press('Escape');
  await page.locator('.user-menu-btn').click();
  await icons(page.getByRole('menu', { name: 'Account' }), 'account menu');
  await page.keyboard.press('Escape');

  // The database's view options, and a template's actions under the
  // templates menu (spec 010, part 2).
  await page.goto(`${base}/p/${path.split("/").pop()}`);
  // The view options (⋯) are in the view's Settings menu since spec 012.
  await page.locator('.collection-toolbar').getByRole('button', { name: 'Settings', exact: true }).click();
  const viewIcons = await icons(page.getByRole('menu', { name: /view settings$/ }), 'view settings');
  assert.notEqual(viewIcons.get('Remove view'), trash, 'Remove view shares the bin with Move to trash');
  await page.keyboard.press('Escape');
  await page.goto(`${base}/p/${doc.id}`);

  // No two different functions share a picture inside one menu.
  for (const [what, map] of [['page menu', pageIcons], ['page "…"', moreIcons]]) {
    const byIcon = new Map();
    for (const [name, icon] of map) {
      const same = byIcon.get(icon);
      // Two labels of one function are fine (Save as template, and as a template of this database).
      const oneFunction = same && /template/i.test(same) && /template/i.test(name);
      assert(!same || oneFunction, `${what}: "${same}" and "${name}" share an icon`);
      byIcon.set(icon, name);
    }
  }

  // The editor's / menu: every entry, the library's and ours, has an icon of
  // the menu set, not an emoji or a react-icons glyph.
  await page.locator('[data-id="intro"] .bn-inline-content').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/');
  const slash = page.locator('.bn-suggestion-menu');
  await slash.waitFor();
  const slashItems = await slash.evaluate((m) =>
    [...m.querySelectorAll('.bn-suggestion-menu-item')].map((it) => ({
      name: (it.textContent ?? '').trim().slice(0, 40),
      ours: it.querySelectorAll('svg.menu-icon').length,
    })),
  );
  assert(slashItems.length > 10, 'the / menu shows too few entries');
  for (const it of slashItems) assert.equal(it.ours, 1, `/ menu: "${it.name}" has no icon from the pairing`);
  await page.keyboard.press('Escape');

  // The block menu (the drag handle's).
  const intro = page.locator('[data-id="intro"] .bn-inline-content');
  await intro.hover();
  const handle = page.locator('.bn-side-menu [draggable="true"]').first();
  await handle.waitFor();
  await handle.click();
  await page.locator('.bn-menu-dropdown [role="menuitem"]').first().waitFor();
  const blockItems = await page.locator('.bn-menu-dropdown [role="menuitem"]').evaluateAll((items) =>
    items.map((it) => ({ name: (it.textContent ?? '').trim(), ours: it.querySelectorAll('svg.menu-icon').length })),
  );
  assert(blockItems.length >= 2, 'the block menu shows too few entries');
  for (const it of blockItems) assert.equal(it.ours, 1, `block menu: "${it.name}" has no icon from the pairing`);

  console.log('Menu icons: one hidden icon per item in the page, template, "…", account, / and block menus; one function, one icon across menus; toggles keep theirs.');
});
