# Implementation Plan: Every menu item has an icon, and an icon means one thing

**Branch**: `claude/010-menu-icons` | **Date**: 2026-11-02 | **Spec**: [spec.md](spec.md) | **Issue**: to be filed with the tasks

**Input**: Feature specification from `/specs/010-menu-icons/spec.md`

## Summary

One module, `web/src/menuIcons.ts`, pairs every menu function with one Lucide
icon (R2). A new design-system component, `ui/Menu`, built on Base UI's `Menu`
(owner's answer B, R10), opened by a button or a right-click at the pointer (R13), becomes the only way to draw a
menu. Its `MenuItem` takes its icon from the pairing by function name, so a
function cannot show two icons, and every menu gains arrow keys, type-to-jump,
Escape and focus return in one place. Lists of values inside menus are
`MenuValues` with a stated reason. The editor's `/` menu and block menu stay
BlockNote's but take their icons from the same pairing, keyed by BlockNote's
own item keys (R4). A new check, `check-menu-icons.mjs`, fails the build on a
hand-built menu, an item without an icon, two functions with one icon, an
undeclared value list, or a library item the pairing does not know (R3).
`AnchoredMenu` and `menuStyleFor` go: the Base UI positioner does their job.
On a phone the toolbar menus stay bottom sheets, by the rule in
`anchoredMenu.ts`, which stays with its check (R13). The collisions found today are resolved in
[data-model.md](data-model.md) (R5). Front end only. Two pull requests (R12).

## Technical Context

**Language/Version**: TypeScript 5.6 + React 18 (`web/src/`); Go 1.27 untouched

**Primary Dependencies**: `@base-ui/react` 1.9.0 (`menu`; already used by `ui/Popover`, `ui/Select`, `ui/Dialog`), `lucide-react` 1.25 (the existing icon set), `@blocknote/react` 0.51.4 (`DragHandleMenu`, `DragHandleMenuItem`, `SuggestionMenuController`), the `typescript` compiler API and `esbuild` (already installed) for the check. New dependencies: none

**Storage**: none

**Testing**: `npm run check` (new `check-menu-icons.mjs` with its self-test; `check-anchoredmenu.mjs` kept), Playwright: new `menu-icons.mjs` and `menu-keyboard.mjs`, and the eight existing specs that open menus updated (R11). Catalogue (`web/catalog/`) for `ui/Menu`

**Target Platform**: browser, desktop and phone widths; desktop shell (same frontend)

**Performance Goals**: no request or query. Bundle stays under the `check-bundle.mjs` gzip cap: Base UI's menu adds to a library already in the bundle, plus about 25 tree-shaken Lucide icons; `AnchoredMenu` and `menuStyleFor` come out. Measured in each PR

**Constraints**: English source; design system (icon size becomes token `menu.icon-size`; menu layer `layer.dropdown`); `CGO_ENABLED=0` unaffected

**Scale/Scope**: 15 menus (13 ours, 2 the editor library's), 85 functions ([data-model.md](data-model.md))

## CodeGraph

Index checked with `codegraph status` (up to date) before each round.

- `codegraph explore "components that render menus: AnchoredMenu, menu-item buttons, role=menu, DragHandleMenu, SuggestionMenuController; callers of AnchoredMenu and ViewOpenMenu"`: `AnchoredMenu` is rendered by `Sidebar`, `AddMenu`, `PageMenu`; `ViewOpenMenu` by `CollectionView`. The inventory in R1 holds. `ViewOpenMenu`'s comment points at spec 001's unplanned menu batch, which became the owner's question (B).
- `codegraph impact AnchoredMenu`: `AddMenu`, `PageMenu`, `TreeItem`, `RowActions`, `Sidebar`. All in `Sidebar.tsx`, all migrate in PR 1.
- `codegraph callers useMenuDismiss`: 7 calls (`Sidebar`, `TreeItem`, `RowActions`, `TagChip`, `PageHeader`). Five go with the menus. `TagChip`'s colour picker and `PageHeader`'s share panel are not menus and keep it (R10).
- `codegraph callers menuStyleFor`: 2 calls, both in `CollectionView`. Both go in PR 2, and `anchoredMenu.ts` with them.
- `codegraph explore "ui Popover and Select built on @base-ui/react"`: `ui/Popover` is the pattern `ui/Menu` copies (Root, Trigger `render`, Portal, Positioner, Popup). `Portal` has 35 callers; untouched.
- No test reaches `AnchoredMenu`, `menuStyleFor` or `useMenuDismiss` within three caller hops (graph). The browser specs that open menus were found by text search in `web/tests/` (R11).
- Second round, before tasks (R13): `codegraph callers anchoredMenuStyle` (3: `menuStyleFor`, **`ColumnsControl`**, `check-anchoredmenu.mjs`) showed the phone bottom-sheet rule and a second user of `anchoredMenu.ts`. The module and its check stay, and `ui/Menu` keeps the sheet. `codegraph explore` over `promptText`/`useExclusiveModal`/`renameView` led to `modal.ts`'s `focusBefore()`, and to the rule that a menu item closes the menu before its dialog opens. `codegraph explore` over the `onContextMenu` handlers showed that the sidebar's right-click and ⋯ share one menu state (`TreeCtx.setMenuFor`), so a right-click opens the same `Menu` at the pointer instead of a separate `ContextMenu`; it also showed the board card's right-click and the embedded-collection guard.
- Not from the graph: the raw-button budget (`check-tokens.mjs`, found while reading `ViewOpenMenu`'s comment) and BlockNote's item keys (read from `@blocknote/core/locales`).

## Constitution Check

- I. One binary, no external services: ✅ no dependency added, no server change
- II. Agent parity: ✅ not affected. No agent action changes and no tool describes menus (spec). No new gap
- III. Gates are one function: ✅ no gate touched; each menu item keeps its handler
- IV. Derive from code: ✅ the rule has its check (`check-menu-icons.mjs`), including the library's keys. `check-anchoredmenu.mjs` stays and keeps checking the phone sheet rule (R13)
- V. English source: ✅ new strings (menu names for screen readers, e.g. "Page actions") through `t()` with `de`/`es`/`nl`
- VI. Every surface, every time: ✅ table below, plus a new registry row, **Menu icons**
- VII. Measured, not assumed: ✅ bundle measured in each PR; no query

Re-checked after Phase 1 design: unchanged.

## Surfaces

| Surface | Changes | Owner |
|---------|---------|-------|
| Domain logic and gates (`canRead`/`canWrite`, `credentialMayEnter`, validation, `audit`, `fireWebhook`) | No change: presentation only. Every menu item keeps its handler and the gates behind it | backend |
| Schema and queries (`server/db.go`, indexes, `ensureColumn`) | No change: nothing stored | backend |
| REST routes (`server/server.go`, middleware) | No change: no route added or altered | backend |
| MCP tools (`server/mcp*.go`, descriptions, `wrapUntrusted`, read-scope refusal) | No change: no tool describes menus or icons (spec, "Agent parity") | mcp |
| Closed-to-agents list (`not_available_via_mcp`) | No change: no capability added | mcp |
| UI components (`web/src/…`, light + dark, keyboard) | New `menuIcons.ts`. Every menu becomes a `ui/Menu`; a right-click opens the same menu at the pointer (`anchorPoint`, R13): `Sidebar.tsx` (menus 1–4: add, page menu as button and right-click, template row, workspace switcher), `Editor.tsx` (5), `UserMenu.tsx` (6) in PR 1; `CollectionView.tsx` (7–12, 15) and `ViewOpenMenu.tsx` (radio group) in PR 2. "Move to workspace" becomes a submenu. Toolbar menus (8, 9, 10, 12) stay bottom sheets at phone width (`narrow="sheet"`, R13). A menu item that opens a dialog closes the menu first (R13). The embedded-collection guard on the tab's right-click and the per-tab menu state (#24) are kept. `Editor.tsx`: `getSlashItems` sets every item's icon from `SLASH_FUNCTIONS`; own items move from emoji to Lucide; `SideMenuController` with a `DragHandleMenu` of the four rebuilt items. Keyboard: Base UI's menu keys everywhere (User Story 4); focus back on the trigger, also after a dialog an item opened. Light and dark checked | ui |
| Translations (`t()`, `de.json`/`es.json`/`nl.json`) | Labels unchanged. New: an accessible name per menu popup where none exists (e.g. "Page actions", "View actions", "Account"), with German, Spanish and Dutch. `Import (.md / .zip)` and `Markdown (.md)` stay untranslated: file-format names, out of scope | i18n |
| Server error codes (`web/src/serverErrors.ts`) | No change: no server error added | i18n |
| Wiki (`wiki/*.md`, `mcp-tools.md`, stale screenshots, `docs/what-it-does.md`) | Screenshots that show an open menu and that `check-wiki.mjs` lists as stale are retaken with `shoot-wiki.mjs`. The wiki page that lists keyboard keys gains the menu keys, if it lists keys per control. `mcp-tools.md`, `what-it-does.md`: no change, no capability changes. The rule itself goes in `web/src/ui/README.md` (for contributors) | wiki |
| Tests (Go incl. refusal paths, Playwright spec, check scripts) | `check-menu-icons.mjs` with a self-test of rules 1–3 (R3). New Playwright `menu-icons.mjs` (every `[role=menuitem]` has one `svg[aria-hidden="true"]`, the accessible name equals the label, Duplicate has the same icon in two menus, the favourite toggle keeps its icon) and `menu-keyboard.mjs` (User Story 4 on each of menus 1–12). The eight specs that open menus are updated to roles, keeping their assertions (R11). `check-anchoredmenu.mjs` kept. No Go test: no server change | test |
| Performance (query plans, payload size, per-request work) | No query or request. Bundle gzip measured against the `check-bundle.mjs` cap in both PRs | perf |
| Manifest (`capabilities.json`, `gapBudget`, `parity_property_test.go`) | No change: no route or tool; `gapBudget` unchanged | mcp |
| Design system (`web/src/ui/`, tokens, `check-tokens.mjs` budgets) | New `ui/Menu.tsx` + `Menu.css` (the parts in R10; styles move from `.menu`, `.menu button`, `.menu-item svg`, `.menu-sep`, `.menu-label` in `styles.css`): README entry, catalogue section (button and right-click menus; default, danger, disabled, checkbox, submenu, value list, radio group, chord; light and dark; keyboard cases in `web/tests/catalog.mjs`). New component token `menu.icon-size` (16px); the popup sits on `layer.dropdown`. `.claude/rules/frontend.md`'s "not in the layer yet: menus" is updated. Spec 001's batch 2 is done here for menus; popovers stay for that batch. `rawButtons` in `web/tokens/budgets.json` (332 today) is lowered to the count measured after each PR. No new colour; budgets only go down | ui |
| Storage budgets (`bench_world_test.go`, p95 in spec 002 research) | No change: no query | perf |
| Page containers (full page, side peek, centre peek) | The page "…" menu (5) is drawn by the shared `Editor` in every container and changes in all of them at once. A menu opened from inside the side peek must draw over it: `layer.dropdown` (200) is above `side-panel.layer` (90), as that token's description already requires. Checked in `menu-keyboard.mjs` from a peek | ui |
| Aggregation (`server/aggregate.go`) | No change: no property type | backend |
| Stored data (`server/upgrade_steps.go`) | No change: nothing stored | backend |
| Outside names (env vars, cookies, storage keys, …) | No change: no outside name. CSS classes `menu`, `menu-item` are internal | backend |
| Menu icons (new registry row, R8) | Added to `.specify/memory/surfaces.md` with this plan. This feature is the first to meet it: every menu, the editor's included | ui |

**Parity statement**: not applicable. Icons and menus are presentation. No
agent action is added, changed or removed, and no MCP tool returns menu
structure.

**Manifest**: unchanged routes and tools; no new gap; `gapBudget` unchanged.

**Registry**: new row *Menu icons* (tag `ui`, Since 2026-11-03, introduced by
spec 010), worded in `.specify/memory/surfaces.md`. Since is the day after this
plan, as spec 007 did, so plans already written are not asked about it.

## Project Structure

### Documentation (this feature)

```text
specs/010-menu-icons/
├── spec.md              # Clarifications 2026-11-02 (B), User Story 4, FR-012–014, SC-005
├── plan.md
├── research.md          # R1–R12
├── data-model.md        # the pairing, function by function
├── quickstart.md
├── contracts/ui.md      # ui/Menu parts, menuIcons.ts, check messages
├── checklists/
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
web/src/
├── menuIcons.ts                     # new: MENU_ICONS, MenuFunction, SLASH_FUNCTIONS, DRAG_HANDLE_FUNCTIONS, MenuIcon, toggle-heading composites
├── ui/Menu.tsx, ui/Menu.css, ui/README.md   # new: Menu, MenuItem, MenuCheckboxItem, MenuSubmenu, MenuValues, MenuValueItem, MenuRadioGroup, MenuRadioItem, MenuLabel, MenuSeparator
├── styles.css                       # .menu* rules move to ui/Menu.css
├── modal.ts                         # useMenuDismiss keeps 2 callers
├── components/Sidebar.tsx           # PR 1: menus 1–4
├── components/AnchoredMenu.tsx      # PR 1: removed
├── components/Editor.tsx            # PR 1: menu 5, getSlashItems, own slash items, DragHandleMenu
├── components/UserMenu.tsx          # PR 1: menu 6
├── components/CollectionView.tsx    # PR 2: menus 7–12, 15
├── components/ViewOpenMenu.tsx      # PR 2: MenuRadioGroup
├── anchoredMenu.ts                  # PR 2: menuStyleFor removed; anchoredMenuStyle and SHEET_MAX_WIDTH stay (ColumnsControl, ui/Menu's sheet)
└── locales/de.json, es.json, nl.json  # menu names
web/tokens/component.tokens.json     # menu.icon-size
web/tokens/budgets.json              # rawButtons lowered to the measured count
web/catalog/main.tsx                 # Menu section
web/scripts/check-menu-icons.mjs     # new, in npm run check
web/package.json                     # check script list
web/tests/menu-icons.mjs, menu-keyboard.mjs, package.json   # new specs
web/tests/menus-and-arrows.mjs, database-toolbar-menus.mjs, dialog-escape.mjs, design-system-dialog.mjs, chart-*.mjs, editor-tokens.mjs, catalog.mjs   # roles instead of classes
wiki/img/…                           # stale shots retaken by shoot-wiki.mjs only
.specify/memory/surfaces.md          # Menu icons
docs/decisions.md                    # B: menus on Base UI here
.claude/rules/frontend.md            # menus are in the layer now
```

**Structure Decision**: one pairing module, one design-system menu component,
one check. The four big components swap their menu markup for `ui/Menu`, and
`AnchoredMenu` and `menuStyleFor` go.

**Order of work** (R12): PR 1 = pairing, `ui/Menu`, the check (rules 2, 4, 5
failing; 1 and 3 reporting), menus 1–6, the editor's two menus' icons,
`AnchoredMenu` out, their tests. PR 2 = menus 7–12 and 15, radio group,
`menuStyleFor` out, rules 1 and 3 failing, budget, screenshots,
the remaining tests.

## Complexity Tracking

None. No principle is bent. (The earlier entry, deleting `check-anchoredmenu.mjs`,
was withdrawn after R13: the module it checks stays.)
