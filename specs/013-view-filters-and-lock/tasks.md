---

description: "Tasks for a view's filters changed for oneself, quick filters, sub-groups, a views lock and view changes in the activity log"
---

# Tasks: A view's filters can be changed for oneself, offered as quick filters, sub-grouped, locked, and logged

**Input**: `specs/013-view-filters-and-lock/` (plan.md, spec.md, research.md R1–R12, data-model.md, contracts/rest.md, contracts/mcp.md, contracts/ui.md, quickstart.md)

**Tests**: required. Go tests for every door and refusal, the upgrade step with its fixture, parity pairs, two benchmarks; two pure checks; five new browser specs.

**Issues**: parent #477 (itself under epic #426); T001–T045 are #478–#522, in order. A parent of its own, because tasks-sync matches task IDs among one parent's sub-issues and spec 012's T001–T040 sit under #426.

**Delivery**: three pull requests (research R12), started after spec 012 PR 2 (the Settings menu) is merged. Phases 1–3 are **PR 1** (lock + log). Phases 4–5 are **PR 2** (personal changes). Phases 6–8 are **PR 3** (quick filters, lanes, polish).

**CodeGraph** (before writing these tasks; `codegraph status`: "Index is up to date"):

- `codegraph callers applyViewSpec` → `mcpCreateView`, `mcpUpdateView`; `mcpDeleteView` → `mcpCall` only. The lock and audit tasks cover all three MCP paths and `handlePutCollection`.
- `codegraph callers propsInView` → `handleCreatePage`, `handleRowFromTemplate`, `mcpCall` and **`mcpCreateFromTemplate`** (`server/mcp_templates.go:74`), a fourth caller the plan did not name. T022 passes the person through all four (agents pass none: they have no personal state).
- `codegraph callers ActivityModal` → `ActivityLogHost`, `UserMenu`: one component to label the new actions in (T012).
- `codegraph callers setGroupValue` → `CollectionView` only (T040).
- Not from the graph: `foreign_keys(1)` is on (`server/db.go:404`) and `collections` already cascades from `pages`. So `view_prefs` cascades from `pages` and `users`, and no task changes the delete paths. data-model.md and plan.md are corrected.

## Format: `[ID] [P?] [Story] [surface] Description`

---

## Phase 1: Setup (PR 1)

- [x] T001 [backend] Upgrade step 2 in `server/upgrade_steps.go`: `CREATE TABLE view_prefs` exactly as data-model.md ("primary key `(user_id, collection_id, scope)`", `user_id` "REFERENCES users(id) ON DELETE CASCADE", `collection_id` "REFERENCES pages(id) ON DELETE CASCADE", index `view_prefs_collection`), and `collections.views_locked_by`/`views_locked_at` "TEXT NOT NULL DEFAULT ''". Fixture `server/testdata/upgrade/step-1.db` written before the step; step 1 untouched (`TestUpgradeStepOneIsFrozen`, `check-upgrades.mjs`)
- [x] T002 [test] Upgrade test: a step-1 database gains the table and columns, keeps its data, and a second start changes nothing

---

## Phase 2: User Story 2, lock a database's views (P1) 🎯 PR 1

**Goal**: one check refuses every view change while locked, at every door.

**Independent Test**: quickstart §1.

- [x] T003 [US2] [backend] New `server/viewlock.go`: `viewsLock(colID)`, `errViewsLocked`, and `checkViewsUnlocked(colID, before, after []byte)`: refused when locked and the views JSON differs, byte-equal passes (research R3). The sentence and code `views_locked` come from contracts/rest.md
- [x] T004 [US2] [backend] `handlePutCollection` (`server/collections.go`) calls `checkViewsUnlocked` when the views half is sent and answers 409 `views_locked`. `GET /api/collections/{id}` returns `viewsLocked` (`{by, byName, at}` or null)
- [x] T005 [US2] [mcp] `mcpCreateView`, `mcpUpdateView`, `mcpDeleteView` (`server/mcp_schema.go`) call `checkViewsUnlocked` before saving. `get_collection` returns `views_locked`. The descriptions of `set_view` and `delete_view` add the sentence from contracts/mcp.md
- [x] T006 [US2] [backend] Routes `PUT` and `DELETE /api/collections/{id}/lock` in `server/server.go` behind `auth` + `sessionOnly`, handlers in `server/viewlock.go` with `canWriteReq`
- [x] T007 [US2] [mcp] Closed list (`server/mcp_workspace.go` `not_available_via_mcp`): "locking and unlocking a database's views (an agent sees the lock and is refused by it)". `capabilities.json`: the lock routes named, a gap with its note, `gapBudget` 10 → 11. `wiki/agent-access.md` lists it
- [x] T008 [US2] [test] Go tests: every view-writing door refused while locked (REST PUT with changed views; MCP create, update, delete), each mutation-checked; byte-equal views and schema-only saves pass; a reader and a token refused on the lock routes; parity pair "change a view while locked" in `server/parity_property_test.go`
- [x] T009 [P] [US2] [i18n] `views_locked` in `web/src/serverErrors.ts`; the lock strings of contracts/ui.md in `de.json`, `es.json`, `nl.json`
- [x] T010 [US2] [ui] Interface: Lock views / Unlock views (functions `lockViews` `Lock`, `unlockViews` `LockOpen` in `web/src/menuIcons.ts`) in Settings › Database settings; the lock marker beside the view tabs with its tooltip; while locked, nothing that changes a view is offered (Settings' view items, add view, the tab menu, header Move/Hide, column drag and resize, board grouping); a `views_locked` answer shows its sentence and reloads the views (`web/src/components/CollectionView.tsx`, `TableColumnHead.tsx`)
- [x] T011 [US2] [test] New `web/tests/view-lock.mjs`, registered: lock, every control gone, a second account refused, an agent refused, rows still editable, unlock. Mutation-checked

---

## Phase 3: User Story 5, view changes in the activity log (P3) PR 1

**Goal**: one entry per meaningful view change, people and agents told apart.

**Independent Test**: quickstart §2.

- [x] T012 [US5] [backend] New `server/viewaudit.go`: `auditViewChanges(actorType, u, colID, ws, before, after)`, diffing by view id into `view.create`, `view.delete`, `view.rename`, `view.update`, with the keys and exclusions of data-model.md "Audit actions" and before/after in `changes`. Called by `handlePutCollection` ("user") and the three MCP view tools ("agent"); the lock routes log `views.lock`/`views.unlock`
- [x] T013 [US5] [test] Go tests: each kind once, by REST and MCP with the right actor type; one save changing two views makes two entries; widths, order, hidden, open-in and chart style make none. Mutation-checked
- [x] T014 [US5] [ui] `ActivityModal` (`web/src/components/UserMenu.tsx`): labels for the five actions, naming the view, and their de/es/nl strings
- [x] T015 [US5] [test] New `web/tests/activity-views.mjs`, registered: rename, re-filter, delete, lock appear; a column resize does not
- [x] T016 [P] [US2] [wiki] `wiki/views.md` and `wiki/collections.md` (the lock), the page describing the activity log (view entries), `wiki/mcp-tools.md` (refusals, `views_locked`), `docs/what-it-does.md`
- [x] T017 [US2] [backend] `.specify/memory/surfaces.md`: the **View lock** row of research R11, Since the merge date
- [ ] T018 [test] Before PR 1 is offered: gate green; `codegraph sync` and `codegraph callers` on `checkViewsUnlocked`, `auditViewChanges`; `/code-review`; `/security-review` (a new gate and session-only routes); `ux-ui-audit` on the lock in light and dark at desktop and phone width; findings fixed or filed

---

## Phase 4: User Story 1, change a view for yourself (P1) PR 2

**Goal**: personal filter and sort on the account, Reset and Save for everyone.

**Independent Test**: quickstart §3 and §4.

- [ ] T019 [US1] [backend] New `server/viewprefs.go`: `GET /api/collections/{id}/personal`, `PUT` and `DELETE /api/collections/{id}/personal/{scope}`, behind `auth` + `sessionOnly` + `canReadReq`, the caller's rows only; state checked as data-model.md says ("At most 32 KB; filters checked like a view's (`checkViewFilter`), unknown properties dropped. An empty state deletes the row"); a scope naming no view of the database, or an embed in a page the caller cannot read, is 404. Routes in `server/server.go`
- [ ] T020 [US1] [backend] On every views save (REST and MCP), delete `view_prefs` rows whose view id is gone
- [ ] T021 [US1] [backend] `mergeViewState(shared, personal)` in Go, research R5 (personal filters replace shared, quick picks added, personal sort replaces)
- [ ] T022 [US1] [backend] `rowPinsForView(colID, viewID, userID)` and `propsInView` (`server/viewpins.go`) use the merged filters for the person; all four callers pass the person (`handleCreatePage`, `handleRowFromTemplate`) or none (`mcpCall`, `mcpCreateFromTemplate`: agents have no personal state)
- [ ] T023 [US1] [mcp] Closed list entry "personal view changes (an agent's view change is always for everyone)"; `capabilities.json`: personal routes named, a gap with its note, `gapBudget` 11 → 12; `wiki/agent-access.md`
- [ ] T024 [US1] [test] Go tests: owner-only reads and writes (another account gets nothing); a reader may write their own; a token refused; cleanup on view delete, and by cascade on database delete and account delete; pins with personal filters; a parity check that `mergeViewState` and the browser's merge agree (shared fixture with `check-viewstate.mjs`)
- [ ] T025 [P] [US1] [perf] Benchmarks in `server/bench_world_test.go`: the personal-state lookup and `rowPinsForView` with personal filters, within spec 002's read budget
- [ ] T026 [US1] [ui] New `web/src/viewState.ts` (pure merge, research R5) and `web/scripts/check-viewstate.mjs`, in `npm run check`
- [ ] T027 [US1] [ui] `web/src/api.ts` personal routes; `CollectionView.tsx` loads the states once per database in parallel with the rows, sends the merged filters and sort to the rows query, makes filter and sort edits personal (database views and embeds, keyed by scope), debounced PUT
- [ ] T028 [US1] [ui] New `web/src/components/ViewChangeBar.tsx`: "Only you see these changes", **Reset** (`resetView` `RotateCcw`), **Save for everyone** (`saveViewForEveryone` `Users`, only for someone who can edit and, for a database view, while not locked). Save writes through the normal save (REST PUT, or `embed.onView` for an embed), then deletes the personal state (research R4)
- [ ] T029 [P] [US1] [i18n] The bar's strings in `de.json`, `es.json`, `nl.json`
- [ ] T030 [US1] [test] New `web/tests/personal-view.mjs`, registered: two accounts, two contexts of one account as two devices; scenarios 1–7 of US1, the embed case and a reader. Mutation-checked

---

## Phase 5: Closing PR 2

- [ ] T031 [P] [US1] [wiki] `wiki/views.md`: personal changes, the bar, embeds; `docs/what-it-does.md`
- [ ] T032 [test] Before PR 2 is offered: gate green; `codegraph sync` and `codegraph callers` on `mergeViewState`, `rowPinsForView`, `propsInView`; `/code-review`; `/security-review` (owner-only rows); `ux-ui-audit` on the bar in light and dark at desktop and phone width; findings fixed or filed

---

## Phase 6: User Story 3, quick filters (P2) PR 3

**Goal**: chips a view offers; each viewer's pick is theirs.

**Independent Test**: quickstart §5.

- [ ] T033 [US3] [backend] `checkViewQuickFilters` in `server/viewopen.go`, data-model.md verbatim ("array of property ids of a filterable type; repeats dropped; at most 8; `invalid_view_quick_filters` otherwise"), called from `normalizeViews` and `applyViewSpec`
- [ ] T034 [US3] [mcp] `set_view` `quick_filters` (`server/mcp.go`, `viewSpec`); an unknown id refused, as `hidden` does; description
- [ ] T035 [US3] [test] Go tests on both doors and the parity pair "set quick filters"
- [ ] T036 [US3] [ui] Settings › Quick filters (`quickFilters` `Zap`); `web/src/components/QuickFilters.tsx` chips, a `ui/` chip component if `web/src/ui/` has none (catalogue section, README entry); a pick stored as `quickPicks` in personal state; Save for everyone turns picks into filters
- [ ] T037 [P] [US3] [i18n] Strings and `invalid_view_quick_filters` in `serverErrors.ts`, de/es/nl
- [ ] T038 [US3] [test] New `web/tests/quick-filters.mjs`, registered. Mutation-checked

---

## Phase 7: User Story 4, board lanes (P2) PR 3

**Goal**: a second grouping drawn as lanes; a drag sets both values.

**Independent Test**: quickstart §6.

- [ ] T039 [US4] [backend] `checkViewSubGroup` (data-model.md: board only, "a groupable property id, not `groupBy`; `invalid_view_sub_group` otherwise"), both doors; `set_view` `sub_group_by` [mcp work in the same task: `server/mcp.go`], with Go tests and the parity pair "set a sub-group"
- [ ] T040 [US4] [ui] New `web/src/boardLanes.ts` (pure cells and values) and `web/scripts/check-boardlanes.mjs`; `BoardView` draws lanes with a "No value" lane, fold buttons (`foldLane` `ChevronsDownUp`, folded lanes in personal state), a drop writes both values in one `propsPatch` beside `setGroupValue`, spec 012's marker in the cell, no drop between lanes of an unwritable property; Settings › Sub-group (`subGroup` `Rows2`)
- [ ] T041 [P] [US4] [i18n] Strings and `invalid_view_sub_group`, de/es/nl
- [ ] T042 [US4] [test] New `web/tests/board-lanes.mjs`, registered: ten cell drags land with both values (SC-005); fold; formula lane. Mutation-checked

---

## Phase 8: Polish (PR 3)

- [ ] T043 [P] [wiki] `wiki/views.md` (quick filters, lanes), `wiki/mcp-tools.md` (`quick_filters`, `sub_group_by`), `docs/what-it-does.md`; stale shots retaken with `shoot-wiki.mjs`
- [ ] T044 [ui] Budgets: `rawButtons` and `fontSize` lowered to measured counts if they went down; bundle measured against the cap
- [ ] T045 [test] Before PR 3 is offered: gate green; `codegraph sync` and `codegraph callers` on the new exported symbols; `/code-review`; `ux-ui-audit` on chips and lanes in light and dark at desktop and phone width; findings fixed or filed

---

## Dependencies

- Spec 012 PR 2 merged → T010, T028, T036, T040 (they add to its Settings menu).
- T001 → T003, T019. T003 → T004, T005 → T008. T012 after T004/T005 (same call sites).
- PR 2 after PR 1 (Save for everyone respects the lock). T021 → T022, T026 → T027 → T028.
- PR 3 after PR 2 (quick picks and folded lanes live in personal state).

## Parallel opportunities

- T009, T016 beside the server tasks of PR 1; T025, T029, T031 in PR 2; T037, T041, T043 in PR 3.
- Within one stream these are commits, not people (steward skill: at most two streams).

## Implementation strategy

MVP = PR 1: views can be protected, and every change to them is on record. PR 2 stops one person's look at the data from changing everyone's. PR 3 adds the conveniences. Each PR leaves `main` releasable.
