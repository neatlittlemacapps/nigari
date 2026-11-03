import assert from 'node:assert/strict';
import { eventually, withFixture } from './fixture.mjs';

// Spec 010, User Story 4: every menu works from the keyboard and gives focus
// back. The hand-built menus had none of it: Tab walked the items, the arrows
// did nothing, and a dialog opened from a menu item could leave focus on
// nothing when it closed. Now every menu is ui/Menu (Base UI). This opens the
// sidebar's ＋ and ⋯, the workspace switcher, the page "…" and the account
// menu without a mouse; follows a dialog opened from a menu back to its
// button; and checks that at phone width a menu stays wholly on screen.
await withFixture(async ({ page, api, base, workspace, path }) => {
  page.setDefaultTimeout(15000);
  const focused = () => page.evaluate(() => (document.activeElement?.textContent ?? '').replace(/\s+/g, ' ').trim());
  const isFocused = (loc) => loc.evaluate((el) => el === document.activeElement);

  await api('POST', '/api/workspaces', { name: 'Second space' });
  const doc = await api('POST', '/api/pages', { title: 'Keyboard page', workspaceId: workspace.id });
  await page.goto(`${base}/p/${doc.id}`);
  const row = page.locator('.tree-item:not(.sb-flat)', { hasText: 'Keyboard page' });
  await row.waitFor();

  // The ⋯ of a row: Enter opens it on its first item, ↓ moves, a letter jumps,
  // → opens "Move to workspace" and ← closes it, Escape gives focus back.
  // The row's ＋ and ⋯ show on hover (and on the selected row), as before.
  await row.hover();
  const more = row.getByRole('button', { name: 'More', exact: true });
  await more.focus();
  await page.keyboard.press('Enter');
  const pageMenu = page.getByRole('menu', { name: 'Page actions' });
  await pageMenu.waitFor();
  await eventually(async () => (await focused()) === 'Open in new tab').catch(() => assert.fail('page menu: Enter did not land on the first item'));
  // The keyboard's item has a focus ring: the row tint alone is 1.16:1 against
  // the popup (spec 010 audit), too faint to follow.
  const ring = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  assert.equal(ring, 'solid', 'page menu: the focused item has no focus ring');
  await page.keyboard.press('ArrowDown');
  await eventually(async () => (await focused()) === 'Add to favorites').catch(async () => assert.fail('page menu: ↓ did not move, focus: ' + (await focused())));
  await page.keyboard.press('d');
  await eventually(async () => (await focused()) === 'Duplicate').catch(() => assert.fail('page menu: typing "d" did not jump to Duplicate'));
  // Typeahead collects letters for about a second ("du" → Duplicate); a pause
  // starts a new word, as a person reaching for the next item would.
  await page.waitForTimeout(1100);
  await page.keyboard.press('m');
  await eventually(async () => (await focused()).startsWith('Move to')).catch(async () => assert.fail('page menu: typing "m" did not jump, focus: ' + (await focused())));
  // "Move to top level" is not there (no parent), so "m" lands on the submenu.
  await page.keyboard.press('ArrowRight');
  const target = page.getByRole('menuitem', { name: 'Second space' });
  await target.waitFor();
  await eventually(async () => (await focused()) === 'Second space').catch(() => assert.fail('page menu: → did not open the submenu on its first entry'));
  await page.keyboard.press('ArrowLeft');
  await target.waitFor({ state: 'hidden' });
  await page.keyboard.press('Escape');
  await pageMenu.waitFor({ state: 'hidden' });
  await eventually(() => isFocused(more)).catch(() => assert.fail('page menu: Escape did not give focus back to the ⋯'));

  // From the row itself: Shift+F10 opens the same menu, and Escape gives focus
  // back to the row, not to the ⋯ (which hides again without the pointer on
  // the row, and a hidden button cannot take focus).
  await page.mouse.move(0, 0);
  await row.focus();
  await page.keyboard.press('Shift+F10');
  await pageMenu.waitFor();
  await page.keyboard.press('Escape');
  await pageMenu.waitFor({ state: 'hidden' });
  await eventually(() => isFocused(row)).catch(() => assert.fail('page menu: after Shift+F10 and Escape, focus did not return to the row'));

  // The ＋ beside it, the same way.
  await row.hover();
  const add = row.getByRole('button', { name: 'Add inside', exact: true });
  await add.focus();
  await page.keyboard.press('Enter');
  const addMenu = page.getByRole('menu', { name: 'Add inside' });
  await addMenu.waitFor();
  await eventually(async () => (await focused()) === 'Page').catch(() => assert.fail('＋ menu: Enter did not land on "Page"'));
  await page.keyboard.press('Escape');
  await addMenu.waitFor({ state: 'hidden' });
  await eventually(() => isFocused(add)).catch(() => assert.fail('＋ menu: Escape did not give focus back'));

  // The workspace switcher: Workspace settings opens a dialog; when it closes,
  // focus is back on the switcher (research R13: the dialog waits until the
  // menu has closed, so it returns focus to the button, not to a vanished item).
  const switcher = page.locator('.ws-btn');
  await switcher.focus();
  await page.keyboard.press('Enter');
  const wsMenu = page.getByRole('menu', { name: 'Workspaces' });
  await wsMenu.waitFor();
  const settings = wsMenu.getByRole('menuitem', { name: 'Workspace settings' });
  if (await settings.count()) {
    await settings.focus();
    await page.keyboard.press('Enter');
    const overlay = page.locator('.modal-overlay').last();
    await overlay.waitFor();
    await page.keyboard.press('Escape');
    await overlay.waitFor({ state: 'detached' });
    await eventually(() => isFocused(switcher)).catch(() => assert.fail('Workspace settings: focus did not return to the switcher'));
  } else {
    await page.keyboard.press('Escape');
  }

  // The page "…" in the top bar.
  const pageMore = page.getByRole('button', { name: 'More actions', exact: true });
  await pageMore.focus();
  await page.keyboard.press('Enter');
  const moreMenu = page.getByRole('menu', { name: 'More actions' });
  await moreMenu.waitFor();
  await page.keyboard.press('End');
  await eventually(async () => (await focused()) === 'Move to trash').catch(() => assert.fail('page "…": End did not reach the last item'));
  await page.keyboard.press('Home');
  await eventually(async () => (await focused()) !== 'Move to trash').catch(() => assert.fail('page "…": Home did not move up'));
  await page.keyboard.press('Escape');
  await moreMenu.waitFor({ state: 'hidden' });
  await eventually(() => isFocused(pageMore)).catch(() => assert.fail('page "…": Escape did not give focus back'));

  // The database's menus (spec 010, part 2). A tab's right-click opens its
  // actions; Rename view opens a dialog; when it closes, focus is back on the
  // tab (#24 made the tab the subject of that menu). The view options ⋯ opens
  // from the keyboard and holds the "Open pages in" radio group.
  await page.goto(`${base}/p/${path.split("/").pop()}`);
  const tab = page.locator('.view-tab').first();
  await tab.waitFor();
  await tab.click({ button: 'right' });
  const viewActions = page.getByRole('menu', { name: 'View actions' });
  await viewActions.waitFor();
  await viewActions.getByRole('menuitem', { name: 'Rename view' }).click();
  const renameDialog = page.locator('.modal-overlay').last();
  await renameDialog.waitFor();
  await page.keyboard.press('Escape');
  await renameDialog.waitFor({ state: 'detached' });
  await eventually(() => isFocused(tab)).catch(async () => assert.fail('Rename view: focus did not return to the tab, it is on: ' + (await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 120)))));
  // The view options (⋯) are the view's Settings menu since spec 012; how
  // rows open is its "Open rows in" submenu, reached with → from the keyboard.
  const viewOptions = page.locator('.collection-toolbar').getByRole('button', { name: 'Settings', exact: true });
  await viewOptions.focus();
  await page.keyboard.press('Enter');
  const optionsMenu = page.getByRole('menu', { name: /view settings$/ });
  await optionsMenu.waitFor();
  await eventually(async () => (await focused()) === 'Rename view').catch(() => assert.fail('view settings: Enter did not land on Rename view'));
  for (let i = 0; i < 6 && !/^Open rows in/.test(await focused()); i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  const openRows = page.getByRole('menu').filter({ has: page.getByRole('menuitemradio', { name: 'Side peek' }) });
  await openRows.waitFor();
  assert((await openRows.getByRole('menuitemradio').count()) >= 2, 'view settings: no "Open rows in" radio items');
  await page.keyboard.press('Escape'); // the submenu
  await page.keyboard.press('Escape'); // the menu
  await optionsMenu.waitFor({ state: 'hidden' });
  await eventually(() => isFocused(viewOptions)).catch(() => assert.fail('view settings: Escape did not give focus back'));

  // A board card's ⋯ from the keyboard, without hovering first: the plain
  // button is swapped for the menu's trigger on focus, and focus must stay on
  // it (code review of part 2), so Enter opens the card's menu.
  await page.locator('.view-tab', { hasText: 'Board' }).click();
  const cardMore = page.locator('.board-card .card-move-btn').first();
  await cardMore.waitFor({ state: 'attached' });
  await page.mouse.move(0, 0);
  await cardMore.focus();
  await eventually(() => page.evaluate(() => document.activeElement?.classList.contains('card-move-btn'))).catch(() =>
    assert.fail('card ⋯: focus did not stay on the button when it became the menu trigger'),
  );
  await page.keyboard.press('Enter');
  const cardMenu = page.getByRole('menu', { name: 'Row actions' });
  await cardMenu.waitFor();
  await page.keyboard.press('Escape');
  await cardMenu.waitFor({ state: 'hidden' });

  // At phone width the account menu opens wholly on screen.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/p/${doc.id}`);
  // On a phone the sidebar is a drawer, opened from the page's ☰.
  await page.locator('.topbar-menu').click();
  const accountButton = page.locator('.user-menu-btn');
  await accountButton.waitFor();
  await page.waitForTimeout(400); // the drawer slides in
  await accountButton.click();
  const account = page.getByRole('menu', { name: 'Account' });
  await account.waitFor();
  const box = await account.boundingBox();
  assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 391 && box.y + box.height <= 845, `account menu leaves a phone screen: ${JSON.stringify(box)}`);
  await page.keyboard.press('Escape');

  console.log('Menu keyboard: ⋯ and ＋ open, move, jump, open a submenu and give focus back; a dialog from the switcher returns focus to it; Home/End in the page "…"; whole on a phone.');
});
