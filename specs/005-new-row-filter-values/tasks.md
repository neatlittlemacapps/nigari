---

description: "Tasks for a new row takes the values its view's filters pin down"
---

# Tasks: A new row takes the values its view's filters pin down

**Input**: `specs/005-new-row-filter-values/` (plan.md, spec.md, research.md, data-model.md, contracts/)

**Tests**: required (salt.md). Refusal paths for every gate.

**Issues**: parent #139; T001–T019 are #140–#158, in order.

## Format: `[ID] [P?] [Story] [surface] Description`

---

## Phase 1: Setup

No setup: no dependency, no schema change (plan, Technical Context).

---

## Phase 2: Foundational (blocks every story)

- [x] T001 [backend] Add `pinsFromFilters(schema, filters, now)` to new `server/viewpins.go`: armed `is` with one value, on a writable property, in the stored form per research R1; two filters disagreeing on one property pin nothing; relative days resolved with `resolveSmartDate`
- [x] T002 [P] [test] Table test in `server/viewpins_test.go` for T001: every row of research R1, plus unarmed filter, `is_empty`, several values, a vanished select option, a number that does not parse, two agreeing and two disagreeing filters, a formula property, the title
- [x] T003 [backend] Add `(s) rowPinsForView(colID, viewID)` and `(s) rowMatchesView(rowID, colID, viewID)` to `server/viewpins.go`: load the view with `loadCollection`, refuse a view of another database (`view_not_in_database`); match through `resolveSmartDates`, `typeFilters` and `rowFilter.where()` on the writer (research R3)

**Checkpoint**: given a view, the server knows the pins and can tell whether a row matches.

---

## Phase 3: User Story 1: a row made in a filtered view stays in it (P1) 🎯 MVP

**Goal**: **New** in a filtered view makes a row that shows in it.

**Independent Test**: a view filtered to one value of a select; **New**; the row is in the view with that value.

- [x] T004 [US1] [test] Tests in `server/viewpins_test.go` for `POST /api/pages` with `viewId`: pins stored; explicit `props` win; no `viewId` is unchanged; a view of another database is refused with nothing created; no write access is refused (existing gate)
- [x] T005 [US1] [backend] `handleCreatePage` in `server/pages.go`: optional `viewId` (only with a database parent), pins merged under `props` and normalised by `normalizePropValues`, `matchesView` in the answer
- [x] T006 [US1] [backend] `rowFromTemplate` and its handler in `server/db_templates.go`: optional `viewId`; template, then pins, then props, in one `mcpSetProperties` call (research R5), with a test that a pin beats the template's value
- [x] T007 [US1] [ui] `web/src/api.ts` and `CollectionView.tsx`: `addRow` and `addRowFromTemplate` pass the active view's id (not a form view); a board column's value stays explicit
- [x] T008 [US1] [test] Playwright `web/tests/new-row-filters.mjs`: a view filtered to *Status is To do*; **New**; the row shows with that status; added to `web/tests/package.json`

**Checkpoint**: US1 works in the interface.

---

## Phase 4: User Story 2: a row that still can't show says so (P2)

**Goal**: a row that leaves the view is announced, with a way to open it.

**Independent Test**: a view filtered to *Estimate > 3*; **New**; a notice with **Open**.

- [x] T009 [US2] [ui] `web/src/toast.ts` and its host: an optional action (`ui/Button`, reachable by Tab, light and dark); a toast with an action stays longer
- [x] T010 [US2] [ui] `CollectionView.tsx`: on `matchesView === false`, toast "The new row doesn't match this view's filters, so it isn't shown here." with **Open**
- [x] T011 [P] [US2] [i18n] German (required) and Spanish for the new string; `view_not_in_database` in `web/src/serverErrors.ts`
- [x] T012 [US2] [test] Extend `web/tests/new-row-filters.mjs`: *Estimate > 3*, **New**, the notice appears and **Open** opens the row; no notice in an unfiltered view

**Checkpoint**: US1 and US2 work in the interface.

---

## Phase 5: User Story 3: an agent creating a row "as seen in" a view (P2)

**Goal**: agents name a view and get the same values and answer.

**Independent Test**: `create_page` with `view_id`; the row has the pinned value and the answer says `matches_view`.

- [x] T013 [US3] [mcp] `create_page` in `server/mcp.go`: `view_id` in the schema and description (contracts/mcp.md), with and without `template_id`; answer adds `matches_view` and the sentence when false
- [x] T014 [US3] [mcp] `create_rows` (`mcpCreateRows` in `server/mcp_schema.go`): `view_id`, the view loaded once, explicit properties win, `not_matching` in the answer
- [x] T015 [US3] [test] Tests via `callTool`: both tools with `view_id`; explicit beats pin; a view of another database refused with nothing created; read-only token refused; `credential_audit_test.go` outsider shape with a foreign view id
- [x] T016 [US3] [test] SC-003: one test creates a row over REST and one over MCP in the same view and compares the stored props; a pair of acts in `parity_property_test.go`

**Checkpoint**: every story works through every door.

---

## Phase 6: Polish and cross-cutting

- [x] T017 [P] [wiki] `wiki/collections.md` § Rows are pages, `wiki/mcp-tools.md` §§ create_page and create_rows, `wiki/api.md` the `viewId` field, `docs/what-it-does.md` one line; retake any screenshot `check-wiki.mjs` lists
- [ ] T018 [P] [perf] `BenchmarkCreateRowWithView` beside a plain create on the seeded workspace; `EXPLAIN QUERY PLAN` of the match check recorded in the pull request
- [ ] T019 [test] Run `scripts/agent-gate.sh`; mutation-check T002, T004 and T012 (each fails with its fix undone)

---

## Dependencies

- T001 → T002, T003 → every story.
- US1 (T004–T008) is the MVP. US2 needs T005 (the `matchesView` answer). US3 needs T003 only.
- T017 and T018 can run once the doors are in.
