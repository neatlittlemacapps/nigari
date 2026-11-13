---

description: "Tasks for a row's page managing its database's properties"
---

# Tasks: A row's page manages its database's properties

**Input**: `specs/015-row-page-properties/` (plan.md, spec.md, research.md R1–R10)

**Tests**: required. Go tests for the check on every door and its refusal, one parity pair; two pure checks; one new browser spec, one kept passing (`property-confirm.mjs`).

**Issues**: parent #582; T001–T029 are #605–#633, in order

**Delivery**: one pull request (research R10), in the phase order below.

**CodeGraph** (before writing these tasks; `codegraph status`: 445 files, 7,997 nodes, current):

- `codegraph callers normalizeSchema` → `mcpUpdateSchema` **and `mcpCreateDatabase`** (`server/mcp_db.go:248`): `create_database` takes a schema too, a third door the plan's table missed. T002 covers it.
- `codegraph callers mcpUpdateSchema` → `mcpCall` and tests; `handlePutCollection` → its two routes in `server.go`. T002.
- `codegraph callers putCollection` → `saveConfig` (`CollectionView.tsx:583`) and `RowProperties`'s option save: the row's page keeps a schema-only save (T011).
- `codegraph callers RowProperties` → `PageHeader` only (T011); `SchemaEditor` → `CollectionView` only (T007, T008).

## Format: `[ID] [P?] [Story] [surface] Description`

---

## Phase 1: Foundational — the visibility key, checked on every door

**Purpose**: the stored key and its one rule (R1, R2). Blocks US3 and US4.

- [ ] T001 [backend] New `server/propvisibility.go`: `checkPropertyVisibility(schema []map[string]any) error` — `pageVisibility` absent, `"hide_empty"` or `"hide"`; anything else is an error naming the property and the two values. A comment says why absent means shown (R1)
- [ ] T002 [backend] Call it from `handlePutCollection` when a schema is sent (`400 invalid_property_visibility`, nothing stored), from `mcpUpdateSchema` on the merged schema, and from `mcpCreateDatabase` (found by `codegraph callers normalizeSchema`); the MCP error is the same sentence
- [ ] T003 [test] New `server/propvisibility_test.go`: both values stored and read back over REST and through `update_schema` and `create_database`; absent stays absent; a bad value refused on all three doors with nothing stored; a schema save without the key keeps other keys. Mutation-checked (each door's call removed in turn)
- [ ] T004 [P] [mcp] `update_schema` and `create_database` descriptions and property shapes in `server/mcp.go` name `pageVisibility`; `capabilities.json` note on `update_schema`; a parity pair "set a property's row-page visibility" in `server/parity_property_test.go` (REST `PUT` vs `update_schema`, read back with `get_collection`) (R9)
- [ ] T005 [P] [i18n] `invalid_property_visibility` in `web/src/serverErrors.ts` with its sentence; de/es/nl
- [ ] T006 [P] [ui] `PropDef.pageVisibility?: 'hide_empty' | 'hide'` in `web/src/types.ts`

**Checkpoint**: `go test ./server` green; the key round-trips on every door.

---

## Phase 2: Foundational — shared parts out of the Edit properties dialog (no visible change)

**Purpose**: one implementation of a property's fields and of deleting a property (R4, R6). Blocks US1.

- [ ] T007 [ui] New `web/src/components/PropertyFields.tsx`: the per-property name + type row, `renderConfig` (number display, relation, rollup with its condition, backrelation, formula), the options editor with its popover and colours, `PersonConfig`, `WhereValue`, moved out of `SchemaEditor.tsx`; `SchemaEditor` renders them per row. Raw button count does not rise
- [ ] T008 [ui] New `web/src/propertyDelete.ts` (pure): `deletePropertyMessage(prop, databaseName, otherDatabaseName)` (#524's sentences) and `tidyViewsAfterSchema(schema, views)` (what `SchemaEditor.save()` does today: board and calendar regroup, filters, sort and hidden lists drop removed properties). `SchemaEditor` calls both
- [ ] T009 [P] [test] New `web/scripts/check-propertydelete.mjs` for T008 (each tidying case, the relation sentence), added to `npm run check` in `web/package.json`
- [ ] T010 [test] Regression: `web/tests/property-confirm.mjs`, `database-toolbar-menus.mjs`, `view-settings.mjs` pass unchanged after T007–T008

**Checkpoint**: the dialog looks and behaves as before.

---

## Phase 3: User Story 1 — change a property from the row (P1) 🎯 MVP

**Goal**: Rename, Edit property, Duplicate, Delete from the property's name (FR-001–FR-005).

**Independent Test**: on a row's page, rename a property and change its type from its menu; the database's table shows both.

- [ ] T011 [US1] [ui] Move `RowProperties` out of `web/src/components/Editor.tsx` into `web/src/components/RowProperties.tsx` (same props, same caller `PageHeader`)
- [ ] T012 [US1] [ui] New `web/src/rowProperties.ts` (pure): `applyPropertyChange(schema, id, patch)`, `duplicateProperty(schema, id, copyName)` (new unique id, inserted after, settings copied, no values), `addProperty(schema, type, name)` (unique id and name as the dialog makes them) (R5)
- [ ] T013 [P] [US1] [test] New `web/scripts/check-rowproperties.mjs` for T012 (and T020's placement), added to `npm run check`
- [ ] T026 [US1] [ui] New `web/src/actions/propertyActions.ts`: every action on a property (function, label, group, who may use it, where it applies: `rowPage`, `view`), with the reason for each place that leaves one out (R11); groups become submenus (R12)
- [ ] T027 [P] [US1] [test] New `web/scripts/check-content-actions.mjs`, added to `npm run check`: every menu item in `RowProperties.tsx` and `TableColumnHead.tsx` comes from the property list; every action the list gives a place is in that place's menu; no first level over 7 entries (a submenu counts as one)
- [ ] T014 [US1] [ui] Two menu functions in `web/src/menuIcons.ts`: `editProperty` (SlidersHorizontal), `rowPageVisibility` (EyeDashed); `check-menu-icons.mjs` passes (R3)
- [ ] T015 [US1] [ui] In `RowProperties.tsx`, for a writer: each name is a `Button` opening a controlled `ui/Menu` (click, right-click, keyboard; focus returns to the name) with Rename (`rename`, inline field: Enter saves, Escape cancels, empty not saved), Edit property (`editProperty`), Duplicate property (`duplicate`, "Copy of {name}"), Delete property (`delete`, T008's message, danger). Every action fetches the config, applies its change (T012) and saves the schema alone; delete also sends `tidyViewsAfterSchema` views unless the views are locked; a refusal shows the server's sentence and reloads the config (R5, R6, R8). A reader sees plain labels
- [ ] T028 [US1] [ui] `ColHead` (`web/src/components/TableColumnHead.tsx`) builds its menu from the property list: Rename, Edit property (the T016 panel), Duplicate property, Delete property for a writer of the database, plus Move ▸ (left, right) and Hide in view for the view; `CollectionView` passes the schema actions (the same fetch-apply-save as T015). The title column keeps no menu
- [ ] T016 [US1] [ui] Edit property panel: `ui/Popover` anchored to the name, holding `PropertyFields` for that property; saved when it closes, a type change saved at once; Delete property at its foot (R4)
- [ ] T017 [P] [US1] [i18n] The US1 strings (Edit property, Duplicate property, Delete property where new, Rename field label) in de/es/nl, informal

**Checkpoint**: US1 works on a full page and in a side peek.

---

## Phase 4: User Story 2 — add a property from the row (P1)

- [ ] T018 [US2] [ui] **+ Add a property** (`Button variant="ghost"`) under the list for a writer: pick a type, type a name; `addProperty` (T012) saved, the new value field focused on this row
- [ ] T019 [P] [US2] [i18n] "Add a property" and its type picker's label in de/es/nl

---

## Phase 5: User Story 3 — hide properties on a row's page (P1)

**Goal**: three visibility values and the fold (FR-007, FR-008, FR-010).

**Independent Test**: one property *Always hide*, one *Hide when empty*; open a row where the second is empty and one where it is filled; unfold and fold.

- [ ] T020 [US3] [ui] `visibleOnRowPage(schema, props, stickyHidden)` in `web/src/rowProperties.ts`: shown vs folded; *Hide when empty* uses the cells' emptiness rule (#269); the sticky set is taken when the page opens (R7). Cases in `check-rowproperties.mjs`
- [ ] T021 [US3] [ui] Property visibility submenu (`rowPageVisibility`, three `MenuValues`, the current one ticked), saved through T012; the fold line "N more properties" / "Hide N properties" (`plural()`), not stored, closed on page change; unfolded hidden properties carry a muted EyeDashed mark with the label "Hidden on row pages"; a reader can unfold too
- [ ] T022 [P] [US3] [i18n] Property visibility, Always show, Hide when empty, Always hide, the two plural fold lines, "Hidden on row pages" in de/es/nl

---

## Phase 6: User Story 4 — agents (P2)

Covered by T001–T004: the key over `update_schema` and `create_database`, the parity pair. No task of its own.

---

## Phase 7: Polish & cross-cutting

- [ ] T023 [test] New `web/tests/row-properties.mjs`, registered in `web/tests/package.json`: menu by click and by keyboard; the column heading offers the same property actions and Move ▸; rename; edit (type change, an option added); duplicate (name and position); delete with its confirmation; add; each visibility value and the fold; a reader sees no menu and can unfold; the same in a side peek. Mutation-checked
- [x] T029 [ui] Guidelines (done with the spec, so later plans answer the row at once): the **Content actions** row in `.specify/memory/surfaces.md` (text in plan.md, Registry); a **Menus** paragraph in `.claude/rules/frontend.md` (one list per content type in `web/src/actions/`, first level at most 7, related actions in a submenu); an entry in `docs/decisions.md` with the options turned down (research R11, R12)
- [ ] T024 [wiki] `wiki/collections.md` "Rows are pages": the menu, the panel, visibility and the fold; `wiki/mcp-tools.md`: `pageVisibility` on `update_schema` and `create_database`; `docs/what-it-does.md`: one line. Stale shots from `check-wiki.mjs` retaken
- [ ] T025 [test] Before the PR: `codegraph sync`, then `codegraph callers` on `RowProperties`, `PropertyFields`, `tidyViewsAfterSchema`, `deletePropertyMessage`, `checkPropertyVisibility`, compared with the plan; `scripts/agent-gate.sh` green; `/code-review`, `ux-ui-audit` (light, dark, desktop, phone) and the PR names what each found

---

## Dependencies

- Phase 1 and Phase 2 are independent of each other; both before Phase 3.
- T026 before T015 and T028 (both menus read the list); T027 after both.
- US1 (Phase 3) before US2 and US3: they live in the component T011 moves and use T012.
- US2 and US3 are independent of each other.
- Phase 7 last.

## Parallel examples

- T004, T005, T006 alongside T001–T003.
- T009 alongside T007; T013 alongside T014–T016.
- Every [i18n] task alongside its phase's [ui] work, once the strings are fixed.

## Implementation strategy

MVP is Phase 1 + 2 + 3 (change a property from its row). US2 and US3 complete #582; all ship in the one PR (R10). Mechanical tasks (T005, T017, T019, T022 translations; T024 wiki text; T023 test runs) may go to a Sonnet helper and are reviewed before commit.
