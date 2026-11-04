---

description: "Tasks for a database in a document having views of its own"
---

# Tasks: A database in a document has views of its own

**Input**: `specs/014-embed-own-views/` (plan.md, spec.md, research.md R1–R13, data-model.md, contracts/mcp.md, contracts/rest.md, contracts/ui.md, quickstart.md)

**Tests**: required. Go tests for every MCP door and refusal, the shared converter cases, a parity pair; one pure check; two new browser specs and one updated (`chart-builder.mjs`).

**Issues**: parent #371 (itself under epic #426); T001–T036 are #534–#569, in order. Under #371 rather than straight under #426, because tasks-sync matches task IDs among one parent's sub-issues and spec 012's T001–T040 sit under #426 (`docs/decisions.md`, 2026-11-04).

**Delivery**: three pull requests (research R13). Phase 1 is **PR 1** (#524), which can go now. Phases 2–4 are **PR 2** (model, server, agents) and Phases 5–8 are **PR 3** (interface), both started after spec 013's PR 2 is merged.

**CodeGraph** (before writing these tasks; `codegraph status`: "Index is up to date"):

- `codegraph callers viewOf` → `rowPinsForView`, `rowMatchesView`, **`mcpCreateRows`** (`server/mcp_schema.go:792`) and **`viewMatchNote`** (`server/viewpins.go:241`). `mcpCreateRows` reads the view itself, not only through `propsInView`, and the agent's "matches the view" note has its own path. T016 and T018 cover both.
- `codegraph callers rowMatchesView` → `handleCreatePage`, `handleRowFromTemplate`: the two REST doors that take `viewFilters` (T017).
- `codegraph callers pinsFromFilters` → `rowPinsForView`, `mcpCreateRows`, its test: the one function every new path ends in (T016).
- `codegraph callers propsInView` → `handleCreatePage`, `handleRowFromTemplate`, `mcpCreateFromTemplate`, `mcpCall` (create_page) (plan.md CodeGraph). T018 covers the two MCP ones.
- `codegraph callers mcpCreateView` / `mcpUpdateView` → `mcpCall` and the tests in `server/mcp_views_test.go`; `mcpDeleteView`, `mcpGetCollection` → `mcpCall` only. The embed branch goes in `mcpCall`'s `set_view`, `delete_view` and `get_collection` cases (T010, T011); the database functions are unchanged.
- `codegraph callers addChartView` → `pickForChart` (`blocks.tsx:374`) only, so after T030 it has no caller left in the app and is removed (T030).
- `codegraph callers parseEmbedLocal` → the block's render only; replaced by `embedViews.ts` (T024).
- `codegraph callers ViewSettingsMenu`, `AddViewMenu`, `SchemaEditor` → `CollectionView` only (T026, T029, T001 and T031).

## Format: `[ID] [P?] [Story] [surface] Description`

---

## Phase 1: Deleting a property asks first, everywhere (#524) 🎯 PR 1

**Goal**: no property is deleted without a confirmation that names it and the database (FR-013, US4 scenario 4).

**Independent Test**: on a database's own page, open Properties, click ✕ on a property: the confirmation names it and the database; Cancel keeps it; confirm, Save: it is gone.

- [x] T001 [US4] [ui] `removeProp` in `web/src/components/SchemaEditor.tsx` asks through `confirm` (danger): "Delete {property} from {database}? It will be removed from all views.", confirm button "Delete property"; for a relation with a back-relation, the second sentence "Its column in {other} is removed too." (contracts/ui.md). `SchemaEditor` takes the database's title from its caller in `CollectionView.tsx`
- [x] T002 [P] [US4] [i18n] The two new sentences in `web/src/locales/de.json`, `es.json`, `nl.json`, informal
- [x] T003 [US4] [test] New `web/tests/property-confirm.mjs`, registered in `web/tests/package.json`: delete asks, Cancel keeps the property, confirm removes it after Save, the relation sentence shows for a relation. Mutation-checked (the test fails with the `confirm` removed)
- [x] T004 [US4] [wiki] `wiki/collections.md` (or the page describing the Properties dialog): deleting a property asks first. Stale shots listed by `check-wiki.mjs` retaken

---

## Phase 2: Foundational — the embed's views, read in both shapes (PR 2)

**Purpose**: one reader and converter in each language, held level by shared cases (research R2, R10; data-model.md). Blocks every story.

- [ ] T005 [backend] New `server/testdata/embedviews/*.json`: one file per case with `databaseViews`, `local` (string), and `expect` (`viewId`, `views`). Cases: empty `local`; old shape with filters and sort on two views; old shape whose `viewId` is gone; a database with a form (left out); a database with only a form (default table); new shape; new shape with an empty `views`; malformed JSON; a view that is not an object, has no id, a duplicate id, an unknown type, type `form`
- [ ] T006 [backend] New `server/embedviews.go`: `readEmbedLocal(raw string, dbViews []map[string]any) (viewID string, views []map[string]any)` per data-model.md (old shape → copies keeping their ids with the embed's filters and sort on top; new shape → tolerant read; default table view); `encodeEmbedLocal(viewID, views) string` writing `{"v":2,…}`
- [ ] T007 [test] New `server/embedviews_test.go`: every case file through `readEmbedLocal`; a round trip through `encodeEmbedLocal` reads back equal. Mutation-checked
- [ ] T008 [P] [ui] New `web/src/embedViews.ts` (pure): `readEmbedLocal(raw, dbViews)` and `encodeEmbedLocal(viewId, views)`, the same rules; new `web/scripts/check-embedviews.mjs` running every `server/testdata/embedviews/*.json` case through it, added to `npm run check` in `web/package.json`

**Checkpoint**: Go and TypeScript agree on every case.

---

## Phase 3: User Story 6, agents see and change an embed's views (P2) PR 2

**Goal**: every embed view action over MCP, with the interface's rules (FR-015, FR-016, SC-005).

**Independent Test**: quickstart §9.

- [ ] T009 [US6] [backend] In `server/embedviews.go`: `embedViewOf(u *user, pageID, embedID string) (colID string, local string, err error)` reads `pages.content` by primary key, finds the `database` block by id at any depth (columns included), refuses an unknown embed ("page … has no embedded database with id …"), and checks `canRead` + `credentialMayEnter` on the database ("database not found"). `writeEmbedViews(u, pageID, embedID, viewID, views)` replaces only that block's `local` in the content JSON, then `snapshotRevision`, the content write with `bumpDocGen`, `resetYjsDoc`, `pagesChanged`, `fireWebhook("page.updated", pageID)`
- [ ] T010 [US6] [mcp] `set_view` and `delete_view` with `embed_id` (`server/mcp.go`, the cases at `set_view`/`delete_view`; `server/mcp_schema.go` helpers): create with optional `copy_of` (a database view's id, refused if not one or a form), update, delete; each view checked by `applyViewSpec` and `normalizeViews` against the database's schema; `type: "form"` refused; the last view refused ("an embed keeps at least one view"); an old-shape embed read through `readEmbedLocal` and written new. Argument descriptions and the tool description sentence from contracts/mcp.md
- [ ] T011 [US6] [mcp] `get_collection` with `embed_id`: the database's schema and the embed's views and open view (`server/mcp.go`); `get_page` on a document lists its embeds after the Markdown, inside the same `wrapUntrusted` (contracts/mcp.md), an unreadable database listed without title or views
- [ ] T012 [US6] [mcp] `embed_database` (`server/mcp_pages.go` `mcpEmbedDatabase`) writes the new shape: with `view_id` one copy of that view (new id), without one table view; the answer names `embed_id` (FR-002, FR-008)
- [ ] T013 [US6] [test] Go tests (`server/embedviews_mcp_test.go`): each action above, with the database's views JSON byte-for-byte unchanged after each (SC-001); refusals: read-scoped token, document read-only (viewer), database unreadable, other workspace, workspace closed to agents, unknown embed, unknown `copy_of`, form, last view. The outsider shapes added to `server/credential_audit_test.go`. Parity pair in `server/parity_property_test.go`: an embed view changed by `PATCH /api/pages/{id}` content and by `set_view` with `embed_id` read back equal through `get_collection`. Mutation-checked
- [ ] T014 [P] [US6] [mcp] `capabilities.json`: the notes of `get_page`, `get_collection`, `set_view`, `delete_view`, `embed_database`, `create_page`, `create_rows` mention embeds; no new entry, `gapBudget` stays 10 (`check-parity.mjs` passes)
- [ ] T015 [P] [US6] [wiki] `wiki/mcp-tools.md`: `embed_id`, `copy_of`, `embed`, `get_page`'s embed list, `embed_database`'s answer (`check-wiki.mjs` passes)

---

## Phase 4: New rows in an embed's view (FR-005) PR 2

**Goal**: a row made in an embed's view takes the values its filters pin, at both doors (research R5).

**Independent Test**: quickstart §4, and an agent's `create_rows` with `embed` gets the same values.

- [ ] T016 [backend] `server/viewpins.go`: `pinsForFilters(colID string, filters []rowFilter)` (schema load + `pinsFromFilters`) behind `rowPinsForView`; `rowMatchesFilters` used by a filter-based match; `viewMatchNote` takes filters as well as a view id
- [ ] T017 [backend] `POST /api/pages` (`handleCreatePage`, `server/pages.go`) and `POST /api/collections/{id}/from-template` (`handleRowFromTemplate`, `server/db_templates.go`) take `viewFilters` (contracts/rest.md): pins and `matchesView` from them; `viewId` and `viewFilters` together → 400 `view_not_in_database`
- [ ] T018 [mcp] `create_page` (`mcpCall`, through `propsInView`'s caller) and `create_rows` (`mcpCreateRows`, which calls `viewOf` itself) take `embed: {page_id, embed_id}` with `view_id` naming the embed's view, resolved by `embedViewOf` (gates on `embed.page_id`), then pinned by `pinsForFilters`; `mcpCreateFromTemplate` too. Unknown embed or view refused before anything is created
- [ ] T019 [test] Go tests: pins and `matchesView` from `viewFilters` on both REST doors; both fields refused; `embed` on `create_page`, `create_rows` and template creation; `embed.page_id` unreadable refused with nothing created. Mutation-checked
- [ ] T020 [P] [backend] `.specify/memory/surfaces.md`: the **Embedded views** row from plan.md (tag `ui`, Since the PR's date, introduced by spec 014)

**Checkpoint**: PR 2 complete. `scripts/agent-gate.sh` green, `/code-review`, `/security-review` (gates change), then the PR.

---

## Phase 5: User Story 1 and 5, an embed shows views of its own; old embeds keep what they show (P1) 🎯 PR 3

**Goal**: the embed's tabs and every view change act on the embed (FR-001–FR-004, FR-010, FR-014).

**Independent Test**: quickstart §1, §2, §7, §8.

- [ ] T021 [US1] [ui] New `web/src/viewSource.ts`: a view source with `views`, `viewId`, `saveViews(next, openId?)` and `canChange`, for a database (`config.views`, `saveConfig`) and for an embed (`EmbedState`, writing through the block). Pure parts (add, rename, move, remove keeping one, patch) as functions `check-embedviews.mjs` also asserts
- [ ] T022 [US1] [ui] `web/src/components/CollectionView.tsx`: `updateView`, `renameView`, `removeView`, `moveView`, `addView`, column order, widths, hiding, chart settings and the view tabs all through the view source; spec 012's `!embed` guards become `source.canChange`; in an embed, Remove is not offered on the only view
- [ ] T023 [US1] [ui] Rows and charts of an embed view: the rows query takes the embed view's filters and sort (as today's embed filters); `ChartView` for an embed view sends `groupBy`, `period`, `aggregate`, `aggregateProp`, `filters` with no `viewId` (research R6); a new row sends `viewFilters` (`web/src/api.ts` `createPage`, `rowFromTemplate`)
- [ ] T024 [US5] [ui] `web/src/blocks.tsx`: `parseEmbedLocal` replaced by `readEmbedLocal` with the database's views from the loaded collection; `EmbedState` carries the embed's views; `keep` writes `encodeEmbedLocal` on the first change only (opening writes nothing); a reader's changes stay in `unsaved`
- [ ] T025 [US1] [test] New `web/tests/embed-views.mjs`, registered: a new embed has one table; add, rename, filter, move, remove in the embed leave the database's page unchanged (its views JSON compared through `GET /api/collections/{id}`); two embeds of one database in one document stay apart; a reader filters without saving; an old-shape block (written by the fixture through `PATCH /api/pages/{id}`) of each view type shows the same view, rows and filter, and is written `"v":2` only after a change (SC-002). Mutation-checked

**Checkpoint**: US1 and US5 work; the embed is usable with type views only.

---

## Phase 6: User Story 2, start from one of the database's views (P1) PR 3

**Goal**: **New view** lists "Views on {database}" (FR-006, FR-007, SC-003).

**Independent Test**: quickstart §3.

- [ ] T026 [US2] [ui] `AddViewMenu` (`web/src/components/CollectionMenus.tsx`): view types without form in an embed; a second `MenuValues` group headed "Views on {name}" with the database's views (forms left out), each with its type's icon; picking one adds a copy with a new id and opens it (through the view source)
- [ ] T027 [P] [US2] [i18n] "Views on {name}" in `de.json`, `es.json`, `nl.json`
- [ ] T028 [US2] [test] `web/tests/embed-views.mjs`: copy a table, a board and a chart; each draws as on the database; changing the copy leaves the original unchanged and the other way round; two clicks from the ＋

---

## Phase 7: User Story 3 and 4, Settings in an embed; property changes from a document ask (P2) PR 3

**Goal**: spec 012's Settings act on the embed's view; Edit properties for those who may write the database, confirmed on Save (FR-009, FR-011, FR-012).

**Independent Test**: quickstart §5, §6.

- [ ] T029 [US3] [ui] `ViewSettingsMenu` shown in embeds for someone who may edit the document, acting through the view source; the timeline's Start/End and the table's Sub-items back in embeds; Edit properties only when the database's workspace role is not `viewer` (research R9) (`web/src/components/ViewSettingsMenu.tsx`, `CollectionView.tsx`)
- [ ] T030 [US3] [ui] A chart from the / menu (`pickForChart`, `web/src/blocks.tsx`) writes the embed with one chart view from `defaultChartView`, settings open, nothing added to the database (research R12); `addChartView` (`web/src/chartInsert.ts`), left without a caller, removed
- [ ] T031 [US4] [ui] `SchemaEditor` opened from a document: Save asks first ("Change the properties of {database}?" / "This changes the database and every view of it, everywhere." / "Change properties"); Cancel returns to the dialog with the edits kept (contracts/ui.md)
- [ ] T032 [P] [US4] [i18n] The Settings and confirmation strings of contracts/ui.md not yet translated, in `de.json`, `es.json`, `nl.json`
- [ ] T033 [US3] [test] `web/tests/embed-views.mjs`: every View settings item changes only the embed; a reader gets no changes; a document editor who may only read the database has no Edit properties. `web/tests/property-confirm.mjs`: from a document, Save asks, Cancel keeps the dialog, confirm saves. `web/tests/chart-builder.mjs` (the / menu chart) expects the chart in the embed and no new view on the database. Mutation-checked

---

## Phase 8: Polish (PR 3)

- [ ] T034 [wiki] `wiki/views.md` (or the page describing embeds): an embed's own views, Views on…, Settings in embeds, the Save confirmation, what is not built (no "save this view to the database"); `docs/what-it-does.md` one line. Stale shots retaken with `web/scripts/shoot-wiki.mjs`
- [ ] T035 [test] `ux-ui-audit` on an embed (tabs, ＋ menu, Settings, both confirmations), light and dark, desktop and phone width; findings fixed or filed
- [ ] T036 [perf] The converter on a 50-view database timed in `server/embedviews_test.go`; the figure measured and written in the PR; `codegraph sync`, then `codegraph callers` on `readEmbedLocal`, `embedViewOf`, `pinsForFilters`, `saveViews` compared with this file

---

## Dependencies

- Phase 1 (PR 1) depends on nothing and can merge first.
- Phase 2 blocks Phases 3–7. Phases 3 and 4 are PR 2; Phases 5–8 are PR 3 and need PR 2 merged (the interface reads with `embedViews.ts` and sends `viewFilters`).
- PR 2 and PR 3 start after spec 013's PR 2 is merged (shared files: `server/viewpins.go`, `server/mcp_schema.go`, `server/mcp.go`, `CollectionView.tsx`).
- Within PR 3: Phase 5 before Phases 6 and 7 (both act through the view source).

## Parallel opportunities

- T002 beside T001; T008 beside T006–T007; T014, T015 beside T013; T020 any time in PR 2; T027 beside T026; T032 beside T029–T031.
- Translations (T002, T027, T032) and wiki text (T004, T015, T034) can go to a Sonnet helper and are reviewed before commit.

## Implementation strategy

1. PR 1 (#524) at once: a small, separate fix.
2. PR 2: the model and every agent door, testable without the interface.
3. PR 3: Phase 5 is the MVP (own views, old embeds safe); then copying, Settings and the confirmation.
