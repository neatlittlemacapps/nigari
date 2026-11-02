---

description: "Tasks for every menu item has an icon, and an icon means one thing"
---

# Tasks: Every menu item has an icon, and an icon means one thing

**Input**: `specs/010-menu-icons/` (plan.md, spec.md, research.md R1–R13, data-model.md, contracts/ui.md, quickstart.md)

**Tests**: required. The check (`check-menu-icons.mjs`) and its self-test, two new browser specs, and the eight existing specs that open menus kept green.

**Issues**: none yet

**Delivery**: two pull requests (research R12). Phases 1–5 are **PR 1** (foundation; sidebar, page "…" and account menus; the editor's two menus). Phases 6–7 are **PR 2** (database menus, the check switched to failing, polish). The stories cut across both PRs: every task carries the story it serves.

**CodeGraph** (before writing these tasks, `codegraph status` up to date): `codegraph callers PageMenu` → `TreeItem`, `RowActions` (the sidebar tree's ⋯ and right-click, including `DbRows`' right-click at `Sidebar.tsx:223`, which opens the same menu); `codegraph callers getSlashItems` → `BlockContent` only; `codegraph callers useMenuDismiss`, `menuStyleFor`, `anchoredMenuStyle` and `codegraph impact AnchoredMenu` as listed in the plan's CodeGraph section. Every caller that has to change has a task below.

## Format: `[ID] [P?] [Story] [surface] Description`

---

## Phase 1: Setup

- [ ] T001 [ui] Component token `menu.icon-size` (16px) in `web/tokens/component.tokens.json`, with a `$description` saying it is the one size of every menu icon (research R7); rebuild `web/src/tokens.css` with `node scripts/build-tokens.mjs`

---

## Phase 2: Foundational (blocks every story)

- [ ] T002 [US2] [ui] New `web/src/menuIcons.ts`: `MENU_ICONS` with every function and icon in `data-model.md` (85 functions), `MenuFunction`, `SLASH_FUNCTIONS` (the 24 BlockNote `slash_menu` keys + the 12 own items), `DRAG_HANDLE_FUNCTIONS` (the 4 `drag_handle` keys), `MenuIcon` (`aria-hidden`, `menu.icon-size`, `filled`), and the three toggle-heading composites (research R6). Comments say why: one function, one icon, and the bin shared by Move to trash and Remove view that started it
- [ ] T003 [US4] [ui] New `web/src/ui/Menu.tsx` + `Menu.css` on `@base-ui/react/menu` (contracts/ui.md): `Menu` (`trigger`, `label`, `side`/`align`, `open`/`onOpenChange`, `anchorPoint`, `narrow="sheet"` at or below `SHEET_MAX_WIDTH` from `web/src/anchoredMenu.ts`), `MenuItem` (`fn`, `danger`, `disabled`, `filled`, `chord`, `opensDialog` = close, then run on the next frame, research R13), `MenuCheckboxItem`, `MenuSubmenu`, `MenuValues` (required `reason`), `MenuValueItem`, `MenuRadioGroup`, `MenuRadioItem`, `MenuLabel`, `MenuSeparator`. Popup on `layer.dropdown`; styles move from `.menu`, `.menu button`, `.menu-item svg`, `.menu-sep`, `.menu-label` in `web/src/styles.css` into `Menu.css` with token names (depends on T001, T002)
- [ ] T004 [P] [US4] [ui] `web/src/ui/README.md`: the `Menu` entry (which part for what, the icon rule, value lists, right-click via `anchorPoint`, phone sheets) and `.claude/rules/frontend.md`: menus are in the layer now (depends on T003)
- [ ] T005 [P] [US4] [ui] Catalogue section for `Menu` in `web/catalog/main.tsx`: button menu, right-click menu, danger, disabled, checkbox, submenu, value list, radio group, chord, phone sheet; light and dark (depends on T003)
- [ ] T006 [P] [US4] [test] Keyboard cases for `Menu` in `web/tests/catalog.mjs`: Enter/Space/↓ open on the first item, ↑/↓/Home/End move, typeahead, →/← submenu, Escape returns focus to the trigger (depends on T005)
- [ ] T007 [US3] [test] New `web/scripts/check-menu-icons.mjs` (research R3, contracts/ui.md messages): rules 1–5 with the TypeScript compiler API, rule 4 reading `@blocknote/core/locales` through esbuild as `check-anchoredmenu.mjs` does, a self-test of rules 1–3 on inline snippets, and a `REPORT_ONLY` switch that makes rules 1 and 3 print a count instead of failing while menus remain to move. Added to `npm run check` in `web/package.json` (depends on T002)

---

## Phase 3: User Stories 1, 2 and 4 in the sidebar, page and account menus (P1) 🎯 PR 1

**Goal**: menus 1–6 show the pairing's icons and work from the keyboard.

**Independent Test**: quickstart §3 and §4 on the sidebar **+**, a page's ⋯ and right-click, a template's right-click, the workspace switcher, the page "…" and the account menu.

- [ ] T008 [US1] [ui] `Sidebar.tsx` `AddMenu`: `ui/Menu` with `newPage`, `newCollection` (menu 1)
- [ ] T009 [US1] [ui] `Sidebar.tsx` `PageMenu` through `RowActions` and `TreeItem`: one `ui/Menu` per row, opened by ⋯ and by a right-click at the pointer (`anchorPoint`), keeping the shared `TreeCtx.setMenuFor` state so one menu is open at a time and the add menu closes (research R13). Includes `DbRows`' right-click (`Sidebar.tsx:223`). Items: `openInNewTab`, `favorite`, `duplicate`, `newCollection`, `moveToTopLevel`, `MenuSubmenu fn="moveTo"` over `MenuValues` of workspaces, `showFiles`, `saveAsTemplate` (both labels), `exportMarkdown`, `moveToTrash` with its chord (menu 2)
- [ ] T010 [US1] [ui] `Sidebar.tsx` template row menu (right-click, `Sidebar.tsx:1555`): `edit`, `removeTemplateFlag`, `moveToTrash` (menu 3)
- [ ] T011 [US1] [ui] `Sidebar.tsx` workspace switcher: `MenuValues` of workspaces (with the current one ticked), `workspaceSettings` (`opensDialog`), `newWorkspace`, `unattendedWorkspaces` (menu 4); remove its `useMenuDismiss`
- [ ] T012 [US1] [ui] Remove `web/src/components/AnchoredMenu.tsx` and the `useMenuDismiss` calls of `Sidebar`, `TreeItem`, `RowActions` (depends on T008–T011)
- [ ] T013 [US1] [ui] `Editor.tsx` `PageHeader` page "…": `description`, `toComments`, `versionHistory`, `commentsPanel`, `visibility` (one icon), `shareToWeb`, `import`, `MenuCheckboxItem fn="fullWidth"`, `exportMarkdown`, `exportHtml`, `print`, `moveToTrash` (menu 5); its `useMenuDismiss` stays only for the share panel. Works in the full page and the side peek (Page containers)
- [ ] T014 [US1] [ui] `UserMenu.tsx`: `connectAgent`, `profile`, `apiTokens`, `activityLog`, `subscribeCalendar`, `twoFactor`, `languageAndTime`, `shortcuts` (chord), checkboxes `notesMode`, `fonts`, `openRowsInNewTab`, then `manageUsers`, `instanceSettings`, `signOut` (menu 6); every item that opens a modal uses `opensDialog`
- [ ] T015 [P] [US1] [i18n] Accessible names for the menu popups added in T008–T014 ("Page actions", "Workspaces", "Account", …) in `web/src/locales/de.json`, `es.json`, `nl.json` (depends on T008–T014)
- [ ] T016 [P] [US2] [ui] `Editor.tsx` `getSlashItems`: every item's icon from `SLASH_FUNCTIONS`; the own items' emoji (💡 🔖 ▦ 📑 📄) become their Lucide icons; the chart items read the pairing (menu 13). New logic goes in a small module the big file imports (`web/src/slashIcons.ts`), per the frontend rule
- [ ] T017 [P] [US2] [ui] `Editor.tsx`: `SideMenuController` with a `DragHandleMenu` of the four default items rebuilt with `DragHandleMenuItem` and `DRAG_HANDLE_FUNCTIONS` icons; the colours submenu kept (menu 14)
- [ ] T018 [US1] [test] Update `web/tests/menus-and-arrows.mjs`, `dialog-escape.mjs`, `design-system-dialog.mjs`, `editor-tokens.mjs` to roles (`menuitem`, `menu` by name), keeping every assertion (#20, #21, #24, focus back after the account menu's dialogs) (research R11)
- [ ] T019 [US1] [test] New `web/tests/menu-icons.mjs`, registered in `web/tests/package.json`: in menus 2, 5, 6, 13, 14 every `[role=menuitem]` has exactly one `svg[aria-hidden="true"]` and an accessible name equal to its label (FR-010); Duplicate shows the same icon in the page and template menus; favourite on/off keeps its icon; dark mode legible

---

## Phase 4: User Story 4, keyboard and focus in PR 1's menus (P2)

**Goal**: every menu from Phase 3 works without a mouse, and focus comes back where it started.

**Independent Test**: quickstart §4 on menus 1–6.

- [ ] T020 [US4] [test] New `web/tests/menu-keyboard.mjs`, registered in `web/tests/package.json`: for menus 1–6 open from the keyboard, move, typeahead, Escape, focus on the trigger; → / ← on "Move to workspace"; Workspace settings from the switcher and Profile from the account menu return focus to their trigger on close; the page "…" from inside a side peek draws over it; at phone width the menus are wholly on screen
- [ ] T021 [US4] [ui] Fix what T020 finds in `ui/Menu.tsx` or the menus of Phase 3 (Base UI focus return vs. `modal.ts` `focusBefore()`, research R13)

---

## Phase 5: User Story 3 in PR 1 (P1)

**Goal**: the build already refuses a shared icon, an unread `fn` and an unknown library item; the menus still to move are reported.

**Independent Test**: quickstart §2 rows 2–5.

- [ ] T022 [US3] [test] Run `node web/scripts/check-menu-icons.mjs`: rules 2, 4, 5 green; rules 1 and 3 report only the menus of PR 2 (`CollectionView.tsx`, `ViewOpenMenu.tsx`); record the count in the PR
- [ ] T023 [US3] [ui] `rawButtons` in `web/tokens/budgets.json` lowered to the count `check-tokens.mjs` measures after PR 1; bundle gzip measured against `check-bundle.mjs` and written in the PR

---

## Phase 6: User Stories 1, 2, 3 and 4 in the database menus (P1) PR 2

**Goal**: menus 7–12 and 15 move to `ui/Menu`; no hand-built menu is left; the check fails on any.

**Independent Test**: quickstart §2–§4 on the view tab right-click, view options, templates beside New, a template's ⋯, a board card's menu (button and right-click), add view, the database share popover.

- [ ] T024 [US1] [ui] `CollectionView.tsx` view tab right-click (`CollectionView.tsx:846`) and view options "…": one `ui/Menu` per tab opened at the pointer, keeping the `embed` guard and the per-tab state (#24); items `rename` (`opensDialog`), `moveLeft`, `moveRight`, `delete`; view options holds **Open pages in** (menus 7, 8)
- [ ] T025 [US4] [ui] `ViewOpenMenu.tsx` as `MenuRadioGroup`/`MenuRadioItem` inside the view options menu, hidden for forms as today
- [ ] T026 [US1] [ui] `CollectionView.tsx` templates beside **New** and one template's ⋯: `newPage` (Empty row), `MenuValues` of templates (each with its own page icon), and `edit`, `duplicate`, `moveToTrash` (menus 9, 10); `narrow="sheet"`
- [ ] T027 [US1] [ui] `CollectionView.tsx` board card menu, by its button and its right-click (`CollectionView.tsx:2285`): `open`, `openInNewTab`, `MenuValues` of columns under "Move to", `moveToTrash` (menu 11)
- [ ] T028 [US1] [ui] `CollectionView.tsx` add view **+**: `MenuValues` of the eight view types with their tab icons (research R1) (menu 12); `narrow="sheet"`
- [ ] T029 [US1] [ui] `CollectionView.tsx` database share popover: **Copy link** gets `copyLink` (menu 15)
- [ ] T030 [US1] [ui] Remove `menuStyleFor` from `web/src/anchoredMenu.ts` and its import; `anchoredMenuStyle`, `SHEET_MAX_WIDTH` and `check-anchoredmenu.mjs` stay for `ColumnsControl` and the sheet rule (research R13) (depends on T024–T028)
- [ ] T031 [P] [US1] [i18n] Accessible names for the menus of T024–T029 in `de.json`, `es.json`, `nl.json`
- [ ] T032 [US3] [test] `check-menu-icons.mjs`: switch `REPORT_ONLY` off, so rules 1 and 3 fail; `npm run check` green (depends on T024–T030)
- [ ] T033 [US1] [test] Update `web/tests/database-toolbar-menus.mjs` and the `chart-*.mjs` specs to roles, keeping the phone assertions (wholly on screen, takes a tap at its centre; now as a sheet at phone width)
- [ ] T034 [US4] [test] Extend `web/tests/menu-keyboard.mjs` and `menu-icons.mjs` to menus 7–12: keyboard, Rename view returning focus to the tab, the radio group, the board card's right-click

---

## Phase 7: Polish and cross-cutting (PR 2)

- [ ] T035 [ui] `rawButtons` in `web/tokens/budgets.json` lowered to the count measured after PR 2; bundle gzip measured
- [ ] T036 [P] [wiki] Retake the screenshots `check-wiki.mjs` lists as stale with `node web/scripts/shoot-wiki.mjs <id>`; if the wiki lists keys per control, add the menu keys
- [ ] T037 [P] [ui] `.specify/memory/surfaces.md` **Menu icons** row checked against what shipped (wording only if it differs)
- [ ] T038 [test] SC-004 by hand (quickstart §5) and `ux-ui-audit` in light and dark at desktop and phone width on the page, row and view menus; findings fixed or filed
- [ ] T039 [test] `/code-review` on each PR's diff before it is offered; findings fixed or filed

---

## Dependencies

- T001 → T003; T002 → T003, T007; T003 → T004, T005 → T006.
- Phase 3 needs Phase 2. T008–T011 → T012. T016, T017 are independent of T008–T014.
- Phase 4 needs Phase 3. Phase 5 closes PR 1.
- Phase 6 starts after PR 1 is merged (it builds on `ui/Menu`). T024–T028 → T030 → T032.
- Phase 7 closes PR 2.

## Parallel opportunities

- T004, T005 (then T006) beside T007.
- T016 and T017 (editor menus) beside T008–T014 (different parts of different files; `Editor.tsx` T013 and T016/T017 touch different functions, so one person, two commits).
- T015 and T031 (translations) once their labels exist.
- T036, T037 in Phase 7.

## Implementation strategy

MVP = PR 1: the component, the pairing, the check with its strict rules, and the menus people use most (sidebar, page, account, editor). PR 2 finishes the database menus and turns the last two rules on. Each PR leaves `main` releasable.
