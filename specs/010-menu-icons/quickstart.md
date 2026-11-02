# Quickstart: check menu icons end to end

## Prerequisites

```sh
cd web && npm ci
```

## 1. The check passes on the finished feature

```sh
cd web && node scripts/check-menu-icons.mjs
# menu icons: 15 menus, N items, M functions, all distinct
npm run check        # includes it
```

## 2. The check catches each mistake (User Story 3)

Make each change, run the check, see the line from
[contracts/ui.md](contracts/ui.md), then undo it:

| Change | Expected |
|--------|----------|
| In `Sidebar.tsx`'s page menu, add `<button onClick={() => {}}>{t('Archive')}</button>` | fails: "… is a menu item without an icon" |
| Add `archive: Trash2` to `MENU_ICONS` and `<MenuItem fn="archive">` | fails: "archive and moveToTrash both use Trash2" |
| Put `<MenuItem fn="duplicate">` into the account menu | passes (scenario 3: an existing function in a new menu) |
| Change `duplicate`'s icon to `Copy` in `MENU_ICONS` | passes, and every Duplicate in every menu changes with it (scenario 4 can't happen: a function has one entry) |
| Delete the `quote` line from `SLASH_FUNCTIONS` | fails: "@blocknote/core slash_menu has "quote", which SLASH_FUNCTIONS does not map" (scenario 5) |

The script's built-in self-test does the first three on inline snippets every
run.

## 3. In the browser (User Stories 1 and 2)

```sh
make build && NIGARI_DATA=/tmp/nigari-010 NIGARI_ADDR=:8420 ./nigari
```

Open `http://localhost:8420`, sign in, and open each menu in
[research.md](research.md) R1 (page "…" in the sidebar and in the top bar, a
view tab's right-click and "…", templates beside **New**, a board card's
menu, the account menu, the workspace switcher, `/` in a page, the block
handle's menu). In each, check that:

- every item has an icon before its label, and no two items in it share one;
- Duplicate, Move to trash, Open in new tab and Export Markdown look the same
  in every menu they appear in;
- favourite on/off keeps the star, visibility keeps the lock;
- in dark mode (account menu → theme) the icons read as well as in light.

Automated: `npm test --prefix web/tests` runs `menu-icons.mjs` (every
`[role=menuitem]` in the opened menus has one `svg[aria-hidden="true"]`, and
the accessible name equals the label).

## 4. SC-004 by hand

On the page, row and view menus, find **Duplicate**, **Move to trash** and
**Rename view** by icon alone, before the pull request is offered.
