# Implementation Plan: Every menu item has an icon, and an icon means one thing

**Branch**: `claude/010-menu-icons` | **Date**: 2026-11-02 | **Spec**: [spec.md](spec.md) | **Issue**: to be filed with the tasks

**Input**: Feature specification from `/specs/010-menu-icons/spec.md`

## Summary

One module, `web/src/menuIcons.ts`, pairs every menu function with one Lucide
icon (R2). A new design-system component, `ui/MenuItem`, is the only way to
draw a menu item, and takes its icon from that pairing by function name, so
a function cannot show two icons. Lists of values inside menus are wrapped
in `ui/MenuValues` with a stated reason. The editor's `/` menu and block menu
take their icons from the same pairing, keyed by BlockNote's own item keys
(R4). A new check, `check-menu-icons.mjs`, fails the build on a menu item
without an icon, two functions with one icon, an undeclared value list, or a
library item the pairing does not know (R3). The collisions found today are
resolved in [data-model.md](data-model.md) (R5). Front end only: no server,
MCP, schema or route change.

## Technical Context

**Language/Version**: TypeScript 5.6 + React 18 (`web/src/`); Go 1.27 untouched

**Primary Dependencies**: `lucide-react` 1.25 (the existing icon set), `@blocknote/react` 0.51.4 (`DragHandleMenu`, `DragHandleMenuItem`, `SuggestionMenuController`), `typescript` compiler API and `esbuild` (already installed) for the check. New dependencies: none

**Storage**: none

**Testing**: `npm run check` (new `check-menu-icons.mjs` with its self-test), Playwright `web/tests/menu-icons.mjs` (new), catalogue (`web/catalog/`) for `MenuItem`

**Target Platform**: browser, desktop and phone widths; desktop shell (same frontend)

**Performance Goals**: no request or query; bundle stays under the `check-bundle.mjs` gzip cap (about 25 more Lucide icons, tree-shaken; BlockNote still ships `react-icons` for its toolbar)

**Constraints**: English source; design system (no new literal: icon size becomes token `menu.icon-size`); `CGO_ENABLED=0` unaffected

**Scale/Scope**: 15 menus, 85 functions ([data-model.md](data-model.md))

## Constitution Check

- I. One binary, no external services: ✅ no dependency, no server change
- II. Agent parity: ✅ not affected. No agent action changes and no tool describes icons (spec). No new gap
- III. Gates are one function: ✅ no gate touched
- IV. Derive from code: ✅ the rule has its check (`check-menu-icons.mjs`), including the library's keys
- V. English source: ✅ no new labels expected. Any new one goes through `t()` with `de`/`es`/`nl`
- VI. Every surface, every time: ✅ table below, plus a new registry row, **Menu icons**
- VII. Measured, not assumed: ✅ bundle size measured in the PR; no query

Re-checked after Phase 1 design: unchanged.

## Surfaces

| Surface | Changes | Owner |
|---------|---------|-------|
| Domain logic and gates (`canRead`/`canWrite`, `credentialMayEnter`, validation, `audit`, `fireWebhook`) | No change: presentation only. Every menu item keeps its handler and the gates behind it | backend |
| Schema and queries (`server/db.go`, indexes, `ensureColumn`) | No change: nothing stored | backend |
| REST routes (`server/server.go`, middleware) | No change: no route added or altered | backend |
| MCP tools (`server/mcp*.go`, descriptions, `wrapUntrusted`, read-scope refusal) | No change: no tool describes menus or icons (spec, "Agent parity") | mcp |
| Closed-to-agents list (`not_available_via_mcp`) | No change: no capability added | mcp |
| UI components (`web/src/…`, light + dark, keyboard) | New `menuIcons.ts` (R2, R4, R6). Every menu item in `Sidebar.tsx` (menus 1–4), `Editor.tsx` (5), `UserMenu.tsx` (6), `CollectionView.tsx` (7–12, 15) becomes a `MenuItem`. Value lists become `MenuValues`. `Editor.tsx`: `getSlashItems` sets each item's icon from `SLASH_FUNCTIONS`, and the own items move from emoji to Lucide; `SideMenuController` with a `DragHandleMenu` of the four rebuilt items. Keyboard unchanged: items stay buttons in the same order; `role="menuitem"` now on every item (several lack it today). Light and dark checked (R7) | ui |
| Translations (`t()`, `de.json`/`es.json`/`nl.json`) | No new string planned: labels unchanged. `Import (.md / .zip)` and `Markdown (.md)` stay untranslated: file-format names, out of scope. Any string added during the build gets German, Spanish and Dutch | i18n |
| Server error codes (`web/src/serverErrors.ts`) | No change: no server error added | i18n |
| Wiki (`wiki/*.md`, `mcp-tools.md`, stale screenshots, `docs/what-it-does.md`) | Screenshots that show an open menu and that `check-wiki.mjs` lists as stale after the change are retaken with `shoot-wiki.mjs`. `mcp-tools.md` and `what-it-does.md`: no change, no capability changes. The rule itself is written in `web/src/ui/README.md`, not the user wiki: it is for contributors | wiki |
| Tests (Go incl. refusal paths, Playwright spec, check scripts) | `check-menu-icons.mjs` with a self-test of rules 1–3 (R3). Playwright `web/tests/menu-icons.mjs`: opens menus 2, 5, 6, 8, 11, 13, 14 and checks that every `[role=menuitem]` has exactly one `svg[aria-hidden="true"]`, that its accessible name equals its label (FR-010), that Duplicate shows the same icon in the page and template menus, and that the favourite toggle keeps its icon. No Go test: no server change | test |
| Performance (query plans, payload size, per-request work) | No query or request. Bundle gzip measured against the `check-bundle.mjs` cap | perf |
| Manifest (`capabilities.json`, `gapBudget`, `parity_property_test.go`) | No change: no route or tool; `gapBudget` unchanged | mcp |
| Design system (`web/src/ui/`, tokens, `check-tokens.mjs` budgets) | New `ui/MenuItem.tsx` + `MenuItem.css` (styles move from `.menu button` / `.menu-item svg` in `styles.css`) and `ui/MenuValues.tsx`: README entries, catalogue section (default, danger, disabled, checked, with chord, light and dark). New component token `menu.icon-size` (16px). No new colour; budgets only go down | ui |
| Storage budgets (`bench_world_test.go`, p95 in spec 002 research) | No change: no query | perf |
| Page containers (full page, side peek, centre peek) | The page "…" menu (5) is drawn by the shared `Editor` in every container, so it changes in all of them at once. No new control | ui |
| Aggregation (`server/aggregate.go`) | No change: no property type | backend |
| Stored data (`server/upgrade_steps.go`) | No change: nothing stored | backend |
| Outside names (env vars, cookies, storage keys, …) | No change: no outside name. CSS class `menu-item` is internal | backend |
| Menu icons (new registry row, R8) | Added to `.specify/memory/surfaces.md` by this plan. This feature is the first to meet it: every menu, the editor's included | ui |

**Parity statement**: not applicable. Icons are presentation. No agent action
is added, changed or removed, and no MCP tool returns menu structure.

**Manifest**: unchanged routes and tools; no new gap; `gapBudget` unchanged.

**Registry**: new row *Menu icons* (tag `ui`, Since 2026-11-03, introduced by
spec 010): "A new menu item is drawn with `ui/MenuItem` and a function from
`web/src/menuIcons.ts`; a new function gets an icon no other function has; a
list of values inside a menu is a `ui/MenuValues` with its reason;
`check-menu-icons.mjs` enforces it, the editor library's items included." Since
is the day after this plan, as spec 007 did, so plans already written are not
asked about it.

## Project Structure

### Documentation (this feature)

```text
specs/010-menu-icons/
├── spec.md
├── plan.md
├── research.md
├── data-model.md        # the pairing, function by function
├── quickstart.md
├── contracts/ui.md      # MenuItem, MenuValues, menuIcons.ts, check messages
├── checklists/
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
web/src/
├── menuIcons.ts                 # new: MENU_ICONS, MenuFunction, SLASH_FUNCTIONS, DRAG_HANDLE_FUNCTIONS, MenuIcon, toggle-heading composites
├── ui/MenuItem.tsx, MenuItem.css, MenuValues.tsx, README.md   # new components
├── styles.css                   # .menu button / .menu-item svg rules move to MenuItem.css
├── components/Sidebar.tsx       # menus 1–4
├── components/Editor.tsx        # menu 5, getSlashItems, own slash items, DragHandleMenu
├── components/UserMenu.tsx      # menu 6
└── components/CollectionView.tsx  # menus 7–12, 15
web/tokens/component.tokens.json # menu.icon-size
web/catalog/main.tsx             # MenuItem section
web/scripts/check-menu-icons.mjs # new, added to npm run check
web/package.json                 # check script list
web/tests/menu-icons.mjs, web/tests/package.json   # new spec
wiki/img/…                       # stale shots retaken by shoot-wiki.mjs only
.specify/memory/surfaces.md      # Menu icons
docs/decisions.md                # verb-alone pairing, library icons owned by us, view types as values
```

**Structure Decision**: one pairing module, two small design-system
components and one check. The four big components only swap their item markup.
Menu containers and positioning (`AnchoredMenu`, `menuStyleFor`) stay as they
are (R2, alternative b).

**Order of work** (one pull request, or two if the diff is large): pairing +
components + check in report-only mode → menus 1–12, 15 → editor menus 13–14
→ check switched to failing → catalogue, README, registry, decisions,
screenshots, Playwright spec.

## Complexity Tracking

None. No principle is bent.
