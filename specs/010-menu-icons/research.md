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

A new design-system component, `ui/MenuItem.tsx`, is the only way to draw a
menu item: `<MenuItem fn="duplicate" onClick={…}>{t('Duplicate')}</MenuItem>`.
It renders the button with `role="menuitem"` (or `menuitemcheckbox` with
`checked`), the icon from the pairing (`aria-hidden`, one size), the label,
an optional shortcut chord, and `danger`/`disabled` states. Menus stop
importing icons for their items.

**Rationale**: FR-005 says one place every menu reads. With `fn` typed as
`MenuFunction`, a function cannot have two icons (FR-002) by construction, and
a misspelt function is a `tsc` error. The 15/16 px sizes mixed today become
one.

**Alternatives considered**: (a) keep icons inline and have the check compare
import names per label. Labels differ for the same function ("Export
Markdown" / "Markdown (.md)"), so the check would need its own pairing anyway:
two lists. (b) a full `Menu` component that also owns the container and
positioning. Bigger than asked: positioning is `AnchoredMenu`'s job today and
works; a later change can fold containers in.

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
