# Research: menu icons

Inventory taken 2026-11-02 on `main` (v2.0.10), by reading every element
that draws a menu: `className="menu …"`, `AnchoredMenu`, `role="menu"`, and
the editor's `SuggestionMenuController` and side menu. The full list of items
with their function and icon is in [data-model.md](data-model.md).

## R1. What counts as a menu, and which menus there are

**Decision**: a menu is a list of actions that opens from a button, a
right-click or a typed `/`. There are fifteen today:

| # | Menu | File | Items |
|---|------|------|-------|
| 1 | Sidebar **+** (add) | `Sidebar.tsx` (`add-menu`) | 2 |
| 2 | Page menu (sidebar row "…" / right-click) | `Sidebar.tsx` | 12 + workspace list |
| 3 | Template row menu (sidebar Templates) | `Sidebar.tsx` | 3 |
| 4 | Workspace switcher | `Sidebar.tsx` (`ws-menu`) | 3 + workspace list |
| 5 | Page overflow "…" | `Editor.tsx` (`overflow-menu`) | 13 |
| 6 | Account menu | `UserMenu.tsx` (`user-menu-popup`) | 14 |
| 7 | View tab right-click | `CollectionView.tsx` (`view-tab-menu`) | 4 |
| 8 | View options "…" | `CollectionView.tsx` (`view-tab-menu`) | 4 + **Open pages in** |
| 9 | Templates beside **New** | `CollectionView.tsx` (`dbt-menu`) | 1 + template list |
| 10 | One template's "…" | `CollectionView.tsx` (`dbt-row-menu`) | 3 |
| 11 | Board card menu | `CollectionView.tsx` (`card-move-menu`) | 3 + column list |
| 12 | Add view **+** | `CollectionView.tsx` (`view-add-menu`) | 8 view types |
| 13 | Editor `/` menu | `Editor.tsx` `getSlashItems` | 24 library + 12 own |
| 14 | Editor block menu (drag handle) | BlockNote default `DragHandleMenu` | 4 library |
| 15 | Database share popover | `CollectionView.tsx` | 1 (**Copy link**) |

**Not menus** (spec, Edge Cases): the tag colour picker (`tag-color-menu`),
the person and relation pickers (`relation-menu`), `select-menu`, the page
share popover (a form with one copy button), the `@` mention and `[[` link
suggestion lists (pages are values whose icon is content), the **Open pages
in** radio group, the view type list in menu 12 (each view type keeps the icon
its tab shows; they are values of one function, "add a view"), and the lists
inside menus 2, 4, 9 and 11 (workspaces, templates, board columns).

**Rationale**: the spec's line between actions and values, applied item by
item. Menu 12 is the borderline case: its items are both "the kind of view"
and the action. Treating them as values keeps the tab icon and the menu icon
the same, which is what a person learns.

**Alternatives considered**: counting the view types as functions. That puts
eight icons into the global pairing that are really a type's icon, and it
collides with the slash menu's table and chart items, which mean different
things (a block, not a view).

## R2. One pairing, read by every menu

**Decision**: one module, `web/src/menuIcons.ts`, maps each function to one
Lucide icon:

```ts
export const MENU_ICONS = { duplicate: CopyPlus, moveToTrash: Trash2, … } satisfies Record<string, LucideIcon>;
export type MenuFunction = keyof typeof MENU_ICONS;
```

A new design-system component, `ui/Menu.tsx`, on Base UI's `Menu` (owner's
answer B, R10), is the only way to draw a menu. Its `MenuItem` is the only
way to draw an item: `<MenuItem fn="duplicate" onClick={…}>{t('Duplicate')}</MenuItem>`.
It renders Base UI's `Menu.Item` (or `CheckboxItem` with `checked`), the icon
from the pairing (`aria-hidden`, one size), the label, an optional shortcut
chord, and `danger`/`disabled` states. Menus stop importing icons for their
items.

**Rationale**: FR-005 says one place every menu reads. With `fn` typed as
`MenuFunction`, a function cannot have two icons (FR-002) by construction, and
a misspelt function is a `tsc` error. The 15/16 px sizes mixed today become
one.

**Alternatives considered**: (a) keep icons inline and have the check compare
import names per label. Labels differ for the same function ("Export
Markdown" / "Markdown (.md)"), so the check would need its own pairing anyway:
two lists. (b) a full `Menu` component on Base UI's `Menu`, which also owns the
container, positioning and arrow-key navigation. That is spec 001's planned
batch 2 ("menus and popovers", `specs/001-design-system/tasks.md`), found
through CodeGraph (R9). **Chosen by the owner (B, 2026-11-02)**: see R10.

## R3. The check

**Decision**: `web/scripts/check-menu-icons.mjs`, in `npm run check`. It
parses `web/src/**/*.tsx` with the TypeScript compiler API (already
installed for `tsc`) and fails, with one sentence per problem, when:

1. **An item has no icon**: inside a menu container (an element whose
   `className` starts with `menu `, an `AnchoredMenu`, or `role="menu"`), a
   raw `<button>` that is not inside a value list. Message:
   `Sidebar.tsx:520: "Archive" is a menu item without an icon. Draw it with <MenuItem fn="…">, adding the function to web/src/menuIcons.ts if it is new.`
2. **Two functions share an icon**: two keys of `MENU_ICONS` with the same
   icon. Message names both functions and the icon, and says to pick one that
   is not taken.
3. **A value list is not declared**: a list of values inside a menu is wrapped
   in `<MenuValues reason="…">` (a plain wrapper that renders its children);
   the check skips buttons inside it and fails on one without a `reason`.
4. **The editor library has an item the pairing does not know** (R4).
5. **An `fn` is not a string literal** (or a conditional of two literals):
   the check must be able to read it.

A self-test at the top of the script runs rules 1–3 on three inline snippets
(an item without an icon, a shared icon, a value list without a reason) and
fails the check itself if any of them passes, so the rule cannot rot into a
check that finds nothing.

**Rationale**: FR-006 and User Story 3, and the "derive, do not remember"
principle. The TypeScript API reads JSX properly; a regex over JSX would
miss a button split over lines, which most of these are.

**Alternatives considered**: an ESLint rule (the repo has no ESLint); a
Playwright test only (it catches a missing icon on the menus it opens, not on
one nobody opens in a test, and runs after the build, not in it). A browser
test still runs for the screen-reader and dark-mode half (Tests).

## R4. The editor library's own items

**Decision**: the library's items get their icons from the pairing too.
`@blocknote/core/locales` exports the English dictionary, whose
`slash_menu` keys (24 in 0.51.4: `heading` … `divider`) and `drag_handle`
keys (4: delete, colours, header row, header column) name every built-in item.
`menuIcons.ts` holds `SLASH_FUNCTIONS: Record<slash key, MenuFunction>` and
`DRAG_HANDLE_FUNCTIONS`. `getSlashItems` replaces each default item's icon
with the pairing's (the library draws `react-icons`, a second icon set the
spec rules out, FR-009). The block menu is drawn by our own
`DragHandleMenu` children: the four default items rebuilt with
`DragHandleMenuItem` and the pairing's icons. The colours item keeps its
submenu.

The check imports the dictionary (bundled with esbuild, as
`check-anchoredmenu.mjs` does) and fails when a key has no function: an
upgrade that adds a block to the `/` menu fails the build until someone picks
its icon (FR-007, User Story 3 scenario 5).

**Rationale**: comparing the library's own icons with ours cannot work: they
come from another icon set, so "the same icon" has no meaning across the two.
Owning the icon for every key makes collisions impossible and turns a library
change into a named decision.

**Alternatives considered**: leaving the library's items alone and checking
only ours. The spec says they count ("2. count too").

## R5. Collisions today, and who keeps the icon

The scan found these. The function that keeps the icon is in bold; the full
pairing is in [data-model.md](data-model.md).

| Icon | Functions today | Resolution |
|------|-----------------|------------|
| `Trash2` | **Move to trash**, Remove view | Remove view → *delete* (`CircleMinus`): a view has no trash, so removing it is not undone the same way |
| `History` | **Version history**, Activity log | Activity log → `ScrollText` |
| `LayoutTemplate` | **Save as template** (both labels), Remove template flag | Remove template flag → `SquareDashed` |
| `Pencil` | Rename view, **Edit** / Edit the template itself | Rename → `TextCursorInput`; *edit* keeps `Pencil` |
| `FileText` | Sidebar **+** Page, Export as Markdown (page menu), Empty row | *new page* → `FilePlus` (Page, Empty row: both make a blank page); *export Markdown* → `FileDown` |
| `Download` / `FileText` | Export Markdown has two icons (sidebar vs page "…") | one function, `FileDown` |
| `SquareArrowOutUpRight` / `ExternalLink` | Open in new tab has two icons (sidebar vs card); `SquareArrowOutUpRight` also on card **Open** and the account setting **Open rows in new tab** | *open in new tab* → `ExternalLink`; *open* → `Maximize2`; the setting → `AppWindow` |
| `MessageSquare` | To the comments, Show/Hide comments | jump to comments → `MessagesSquare`; *comments panel* (toggle) keeps `MessageSquare` |
| `Columns2` | Notes mode (account), **Columns** (`/` menu) | Notes mode → `NotebookText` |
| `Settings2` / `Settings` | Workspace settings, Instance settings: two gears, near-identical | instance settings → `Server` |
| `Lock` / `LockOpen` | one visibility toggle, two icons | `Lock` both ways; the label says the state (FR-004) |
| `Table2` | **New collection**, (embed a collection used ▦) | *embed a collection* → `TableProperties`; the `/` menu table block → `Grid3x3` |
| emoji 💡 🔖 📑 📄 ▦ | five own `/` items drew emoji | `Lightbulb`, `Bookmark`, `ListTree`, `FolderTree`, `TableProperties` (FR-009: the icon set, not emoji) |
| `Copy` | Duplicate; Copy link (share) | *duplicate* → `CopyPlus`; *copy link* → `Link` |

**Rationale**: the verb decides (Clarifications). The function used more
often, or whose icon reads as the verb most directly, keeps the icon.

## R6. Toggle headings

**Decision**: the three toggle headings (`toggle_heading`, `_2`, `_3`) get
their own small composite icon in `menuIcons.ts`: the heading's Lucide glyph
with Lucide's `ChevronRight` set before it at a smaller size, drawn as one
component. They are three functions, distinct from the plain headings.

**Rationale**: Lucide has no toggle-heading glyph, and the spec forbids a
duplicate. A composite built from the same set stays within FR-009.

**Alternatives considered**: `ListCollapse` for all three (one icon, three
functions: breaks FR-003); hiding toggle headings from the `/` menu (removes
a feature to satisfy a rule).

## R7. Size, colour, accessibility

**Decision**: `MenuItem` draws every icon at 16 px (the size most menus use;
`Editor.tsx`'s 15 px goes) in `--muted`, as `.menu-item svg` already does;
a `danger` item's icon takes the item's colour. Lucide React sets
`aria-hidden="true"` on an icon without a label; `MenuItem` sets it
explicitly so nothing depends on the library default. The screen reader reads
the button's text (FR-010). The size is a component token, `menu.icon-size`,
not a literal.

## R8. What a later feature inherits

**Decision**: the rule goes into `web/src/ui/README.md` (the `MenuItem` entry)
and into the surfaces registry as **Menu icons**: "A new menu item is drawn
with `ui/MenuItem` and a function from `web/src/menuIcons.ts`; a new function
gets an icon no other function has; a new list of values inside a menu is a
`MenuValues` with its reason; `check-menu-icons.mjs` enforces it." The open
backlog item #370 (a row menu for table rows) will be the first to answer it.

## R9. What CodeGraph added (2026-11-02, checked after the first draft)

The first draft of this research was written from text search alone. Then
`codegraph explore` / `impact` / `callers` were run over the menu code
(index up to date). They found:

- **The inventory holds.** `AnchoredMenu` has three render sites, all in
  `Sidebar.tsx` (`AddMenu`, `PageMenu`, and the templates row through
  `TreeItem`/`RowActions`); `ViewOpenMenu` has one, in `CollectionView`.
  None was missing from R1.
- **No test reaches any menu.** `AnchoredMenu`, `menuStyleFor` (2 callers)
  and `useMenuDismiss` (7 callers in `Sidebar.tsx` and `Editor.tsx`) have no
  test within three caller hops. `web/tests/menu-icons.mjs` is the first test
  that opens them, so it also covers opening and dismissing the menus.
- **Spec 001 already plans menus.** `ViewOpenMenu.tsx` says the menus are "not
  in web/src/ui yet (spec 001 batch 2)". Spec 001 chose Base UI, which has a
  `Menu`, and batch 2 (menus and popovers) has no tasks yet. Either this spec
  builds `MenuItem` as a plain button whose props a Base UI version can keep
  later, or it does batch 2's menus now. The owner chose the second (B).
- **The raw-button ratchet.** `check-tokens.mjs` counts `<button` outside
  `web/src/ui/` against `rawButtons` in `web/tokens/budgets.json` (332). The
  count may only go down, and the check fails when the count falls below the
  budget until the budget is lowered. Moving the menu items into
  `ui/MenuItem` lowers it, so the same pull request lowers the budget to the
  measured count.

## R10. Menus on Base UI (owner: B)

Graph queries for this section: `codegraph callers useMenuDismiss` (7:
`Sidebar`, `TreeItem`, `RowActions` in `Sidebar.tsx`; `TagChip`, `PageHeader`
in `Editor.tsx`), `codegraph callers menuStyleFor` (2, `CollectionView`),
`codegraph impact AnchoredMenu` (`AddMenu`, `PageMenu`, `TreeItem`,
`RowActions`, `Sidebar`), `codegraph explore` on `ui/Popover` and `ui/Select`
(the Base UI pattern already in `web/src/ui/`).

**Decision**: `web/src/ui/Menu.tsx` wraps `@base-ui/react/menu` (1.9.0,
already a dependency; `context-menu` dropped in R13) the way
`ui/Popover.tsx` wraps its popover: Root, Trigger (`render` = the existing
button), Portal, Positioner (`collisionPadding` 8, layer `layer.dropdown`),
Popup. Parts exported:

| Part | Base UI | Used for |
|------|---------|----------|
| `Menu` (`trigger`, `label`, `side`, `align`, optional `open`/`onOpenChange`) | `Menu.Root` … `Popup` | every button-opened menu |
| ~~`ContextMenu`~~ | dropped in R13: a right-click opens the same `Menu` at the pointer (`anchorPoint`) | right-click on a sidebar row, a view tab, a template, a board card (FR-013) |
| `MenuItem` (`fn`, …) | `Menu.Item` | every action |
| `MenuCheckboxItem` (`fn`, `checked`) | `Menu.CheckboxItem` | Full width, Notes mode, nigari fonts, Open rows in new tab |
| `MenuSubmenu` (`fn`, `label`) | `Menu.SubmenuRoot/SubmenuTrigger` | Move to workspace (today an inline `menu-sub` list) |
| `MenuValues` (`reason`) + `MenuValueItem` | `Menu.Group` + `Menu.Item` | the workspace, template and column lists |
| `MenuRadioGroup` + `MenuRadioItem` | `Menu.RadioGroup/RadioItem` | **Open pages in** (replaces `ViewOpenMenu`'s native radios, as its own comment expected) |
| `MenuLabel`, `MenuSeparator` | `Menu.GroupLabel`, `Menu.Separator` | headings and lines |

What goes away (corrected in R13: `anchoredMenu.ts` and its check stay):
`AnchoredMenu.tsx` and `menuStyleFor`.
The Positioner places every menu in a portal, on screen, which is what both
were written to do (#21 and the phone toolbar). `check-anchoredmenu.mjs`
asserted `anchoredMenu.ts`'s placement, so it goes with the module. The
behaviour it protected stays tested in the browser: `database-toolbar-menus.mjs`
checks the menu is on screen and takes a tap at its centre, and
`menus-and-arrows.mjs` covers #21. Deleting a check is a decision for a person,
so the pull request names it for the owner. `useMenuDismiss` stays for its two
callers that are not menus (`TagChip`'s colour picker and `PageHeader`'s share
panel); its other five calls go.

**Focus and dialogs**: a menu item that opens a dialog (rename, workspace
settings, profile) closes the menu first. Base UI returns focus to the
trigger, and the dialog's `returnFocus` (spec 001, `ui/Dialog`) points at the
same trigger, so focus lands back on the button that started it (User Story 4,
scenario 4). Escape inside a menu inside a dialog is stopped by Base UI at the
menu (FR-014; `dialog-escape.mjs` keeps checking it).

**The editor's menus** (`/` and the block menu) stay BlockNote's Mantine
menus. They belong to the library and already work from the keyboard, and
replacing them would mean forking its suggestion and side-menu logic. They get
only the icons (R4).

**Rationale**: one component for every menu gives the keyboard behaviour
(FR-012) in one place, and every menu migrates once instead of twice. The Base
UI pattern is already in `web/src/ui/` (Popover, Select, Dialog) and the
dependency is installed, so nothing new comes in.

**Alternatives considered**: keeping `AnchoredMenu` and putting only Base UI
items inside it (Base UI's item keyboard handling needs its own Root and
Popup); a filterable menu (`Menu.FilterRoot`, new in 1.9) for the long
workspace list (not asked; a later change can add it).

## R11. What the browser tests must change

Text search over `web/tests/` (strings, so it is the right tool here) finds
eight specs that open menus. Four lookups use
`getByRole('button', { name: 'Remove view' })` and the like. Items become
`role="menuitem"`, so those become `getByRole('menuitem', …)`. Class selectors
(`.overflow-menu`, `.dbt-menu`, `.view-tab-menu`, `.card-move-menu`) become the
popup's accessible name (`getByRole('menu', { name: … })`). What each spec
asserts stays the same: they guard real bugs (#20, #21, #24, the phone
toolbar, the user menu's dialogs returning focus). A new `menu-keyboard.mjs`
covers User Story 4 on each menu.

## R12. Two pull requests

1. **Foundation, plus the sidebar and account menus**: `menuIcons.ts`,
   `ui/Menu.tsx` + css + catalogue, `check-menu-icons.mjs` (rules 2, 4 and 5
   fail; rules 1 and 3 report the menus not moved yet, with their count), menus
   1–6 (Sidebar, the page "…", UserMenu), `AnchoredMenu` removed, icons for the
   editor's `/` and block menus, and the tests for those menus.
2. **The database menus and the switch**: menus 7–12 and 15 in
   `CollectionView.tsx`, `ViewOpenMenu` as a radio group, `anchoredMenu.ts`
   and `check-anchoredmenu.mjs` removed, rules 1 and 3 switched to failing,
   `rawButtons` lowered, the registry row, screenshots, the remaining tests.

**Rationale**: each pull request leaves `main` working and releasable, and the
second can start as soon as the first's component is merged. The sidebar goes
first: it has the most menus, and the most bugs were fixed there before (#20,
#21), so it teaches the most.

## R13. Three more graph rounds before tasks (2026-11-02)

Run at the owner's request, on the riskiest parts of option B. Each one
changed the plan.

**1. The database menus.** `codegraph explore` over `CollectionView`'s menu
state, then `codegraph callers anchoredMenuStyle`: 3 callers, `menuStyleFor`,
**`ColumnsControl`** and `check-anchoredmenu.mjs`. Reading `anchoredMenu.ts`
then showed what the graph pointed at: at or below 640 px
(`SHEET_MAX_WIDTH`) a toolbar menu is **a sheet along the bottom edge**, full
width, where the thumb reaches it. Base UI's positioner would have dropped
that on phones, where the owner works. So:
- `ui/Menu` keeps the rule: at or below `SHEET_MAX_WIDTH`, a menu opened
  with `narrow="sheet"` (the toolbar menus 8, 9, 10, 12) is drawn as that
  bottom sheet. The width comes from `anchoredMenu.ts`, so the rule stays in
  one place.
- `anchoredMenu.ts` **stays**: `ColumnsControl` (a panel of checkboxes, not
  a menu; spec 001's popover batch) still uses `anchoredMenuStyle`. Only
  `menuStyleFor` goes.
- `check-anchoredmenu.mjs` **stays** and keeps checking the sheet rule. No check
  is deleted any more, so the Complexity Tracking entry goes.

**2. Dialogs opened from menu items.** `codegraph explore` over
`promptText`, `useExclusiveModal` and the menu handlers that open dialogs
(`renameView`, `WorkspaceSettings`, the account menu's modals). Reading
`modal.ts`: a dialog returns focus to `focusBefore()`, the element focused
when it opened. If that element is gone, it falls back to the most recent
connected element outside a modal (`recentFocus`). With Base UI, the element
focused when the dialog opens is the menu item, inside a portal that unmounts
as the menu closes. So `focusBefore()` skips it and finds the trigger, which
is what User Story 4 scenario 4 wants. But Base UI also moves focus to the
trigger as the menu closes, and the dialog's autofocus runs at the same time.
Decision: `MenuItem` that opens a dialog closes the menu first and opens the
dialog on the next frame (`onSelect` → close → `requestAnimationFrame`), so
the two never race; `dialog-escape.mjs` (account menu dialogs) and the new
`menu-keyboard.mjs` (Rename view, Workspace settings) check where focus lands.
`.claude/rules/frontend.md` says "Not in the layer yet: menus" and is
updated when `ui/Menu` ships.

**3. Right-click.** `codegraph explore` over the `onContextMenu` handlers,
then reading the six sites: `Sidebar.tsx` 223 (search results), 690 (tree
row), 1555 (template row); `CollectionView.tsx` 846 (view tab), 2285 (board
card), 882 (the tab menu's backdrop). They found:
- The sidebar's right-click and its ⋯ button open **the same menu**, held in
  one shared state (`TreeCtx.setMenuFor`, which also closes the add menu), so
  only one menu is open in the tree at a time. A separate Base UI
  `ContextMenu` would duplicate the item list and the open state. Decision:
  no `ContextMenu` part. `Menu` takes `open`/`onOpenChange` and an optional
  `anchorPoint` ({x, y}); a right-click sets both, and the ⋯ button opens the
  same menu under itself. One list of items per menu, as today.
- The view tab's right-click is refused inside an embedded collection
  (`if (embed) return`) and stores the tab it was made on (#24). Both are kept:
  the guard stays in the handler, and the menu's state stays per tab.
- The board card has a right-click too (menu 11), which R1 had not listed as
  one. Same treatment.

## R14. What building pull request 1 found

Found while building and testing pull request 1. Each one is now in the code
and has a test.

- **The app's arrow keys took over menus.** `nav.ts`'s `useNavEntry` moves
  focus into a region when ↓ is pressed from "nowhere", and an item in a portal
  counts as nowhere. The popups carry `data-nav-skip`, the attribute that
  `useNavEntry` already respects for widgets that own their arrows.
- **Single-letter shortcuts fired inside an open menu.** Typing "m" to reach
  "Move to…" toggled Notes mode, and "f" favourited the page. `keys.ts`'s
  `isTypingTarget` now counts focus inside `[role="menu"]` as typing, with
  two cases in `check-keys.mjs`.
- **Focus after a dialog.** `requestAnimationFrame` (R13) was not enough: the
  menu animates out, and during that time its item still has focus, so
  `modal.ts` remembered the item as the place to return focus to.
  `MenuItem opensDialog` now waits for Base UI's `onOpenChangeComplete`.
  `dialog-escape.mjs` caught this.
- **A hidden trigger.** A row's ⋯ is shown only on hover. Its CSS kept it
  visible while `.menu` was inside the row, but the menu now lives in a
  portal, so Escape had nowhere to put focus. The rule is now
  `:has([data-popup-open])`.
- **Old placement CSS.** `.user-menu-popup` and `.ws-menu` positioned the
  hand-built popups (`left`, `bottom`). Applied to the new popup, they pushed
  the account menu off a phone screen (`menu-keyboard.mjs`). Removed.
- **Not menus.** The tag colour picker, the share panel and the two pickers
  in `PropertyValue.tsx` keep the menu's look until spec 001's popover batch.
  Each says so with `data-menu-exempt="<why>"`, which the check reads and
  which needs a reason.
- **Lucide's `Menu`.** The hamburger icon in `Editor.tsx` has the same name
  as `ui/Menu`. The check identifies ui/Menu by its import, and the icon is
  imported as `MenuGlyph`.
- **`rawButtons` 332 → 291** after pull request 1. Two more literal budgets
  went down with the removed CSS: `fontSize` 377 → 376, `radius` 256 → 255.
