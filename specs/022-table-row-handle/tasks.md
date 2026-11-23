---

description: "Tasks for the table row handle, + and row menu, in two pull requests"
---

# Tasks: Every table row has a drag handle, a + and a row menu

**Input**: `specs/022-table-row-handle/` (spec.md Q1–Q2, plan.md, research.md R1–R9, contracts/place.md)

**Tests**: required.
- Go: `order_test.go` (new) for `placePage` through both doors, refusal paths included; the parity act pair; `credential_audit_test.go`.
- `check-rowdrag.mjs` (new); `check-content-actions.mjs` and `check-keys.mjs` extended.
- Playwright `row-handle.mjs` (new).
- Every new test is mutation-checked (it fails with its fix taken out).

**Issues**: parent #370; tasks T001–T035 are #871–#905

**Delivery**: two pull requests, each from its own branch off `main`.
- PR 1: server and agents (US6, and the server half of US1, US3 Duplicate, US4).
- PR 2: the interface (US1–US5). Starts after PR 1 merges (it calls PR 1's route), after the owner has seen the handle as a picture (R8) and answered the two open decisions (R4, R5).

**CodeGraph** (before writing these tasks; `codegraph status`: up to date): see plan.md's CodeGraph section. `handleCreatePage`, `handleDuplicatePage` and `handleReindexSiblings` have only their routes as callers; `mcpCall`'s `update_page` branch is where the MCP move goes; `CardMenu` has one user, `BoardView`; `TableView` one, `CollectionView`. The Playwright specs are not indexed: the ones that touch tables and cards (`board-*.mjs`, `column-drag.mjs`, `view-lock.mjs`) come from text search.

## Format: `[ID] [P?] [Story] [surface] Description`

---

## PR 1: People and agents can put a page before or after a sibling

### Phase 1: Foundational (the move)

- [x] T001 [backend] `server/order.go` (new): `placePage(u, actorType, id, anchorID, side, viewID)` (R1): gates, anchor check (`anchor_not_sibling`), neighbour read, midpoint, renumbering on a tie or a gap too small, no `updated_at` change, `audit(…, "reorder_page")`, `pagesChanged`, `rowChanged`, `fireWebhook`. The view id is checked (room for #870)
- [x] T002 [test] `server/order_test.go` (new): before and after, first and last place, a tie renumbered, a page next to itself writes nothing, `updated_at` unchanged, the audit entry; refused: trashed, foreign or missing anchor, no write access, a credential outside the workspace, a workspace closed to agents. Mutation-check the anchor check

**Checkpoint**: the move exists and is tested; no door calls it yet.

### Phase 2: The doors (US6, and the server half of US1, US3, US4)

- [x] T003 [US1] [backend] `POST /api/pages/{id}/place` in `server/server.go` behind `auth`; body as in contracts/place.md
- [x] T004 [P] [US4] [backend] `handleCreatePage` takes `after` / `before` and places the new row in the same request
- [x] T005 [P] [US3] [backend] `handleDuplicatePage`: a duplicated database row lands right after its source; `after` / `before` honoured
- [x] T006 [US6] [mcp] `update_page` (`after`, `before`, `view_id`; after `parent_id` when both) and `create_page` (`after`, `before`) through `placePage`, actor `agent`; descriptions as in contracts/place.md
- [x] T007 [US6] [test] `callTool` tests for both tools, read scope and a workspace closed to agents refused; `credential_audit_test.go` gets the new arguments
- [x] T008 [US6] [mcp] `capabilities.json`: `pages.order` `allowed`, its routes and `update_page`; `gapBudget` 10 → 9; the REST/MCP pair in `parityActs` (`parity_property_test.go`)
- [x] T009 [P] [i18n] `anchor_not_sibling` in `web/src/serverErrors.ts`, de/es/nl
- [x] T010 [perf] Benchmark a move in the seeded workspace's largest database (`bench_world_test.go`), against the write budget; `EXPLAIN QUERY PLAN` of the neighbour read. An index only if over budget (R9). Numbers in the PR

### Phase 3: PR 1 polish

- [x] T011 [wiki] `wiki/mcp-tools.md` (`update_page`, `create_page`), `wiki/pages.md` (ordering siblings), `docs/what-it-does.md`; `check-wiki.mjs` passes
- [x] T012 [test] Reviews: `/code-review` on the diff, `/security-review` (a new write door with a gate); `codegraph sync`, then `codegraph callers placePage` (the route, create, duplicate, `mcpCall`). `docs/decisions.md` entry (one order per database, by neighbour, #870 kept open). `scripts/agent-gate.sh` green

---

## PR 2: The handle, the +, the drag and the row menu in the table

### Phase 4: Before building

- [x] T013 [ui] A picture of the handle and + in a table row, light and dark, desktop and phone (R8), shown to the owner; the two decisions (R4 who loses the sort, R5 the handle on a phone) answered

### Phase 5: Foundational (pure parts)

- [x] T014 [ui] `web/src/rowDrag.ts` (new), pure part: from the pointer's y and the row boxes to one spot per gap; tree spots limited to siblings at the same depth under the same parent; the spot as `{anchor, side}` to send; nothing to send when the row would stay (R5)
- [x] T015 [P] [test] `web/scripts/check-rowdrag.mjs` (new), in `npm run check`: each gap gives one spot, the first and last place, a filtered view's spots name visible rows, tree limits, the no-op. Mutation-check it
- [x] T016 [ui] `web/src/actions/rowActions.ts` and `rowActionReasons.ts` (new): the row actions by place (`table`, `boardCard`) and group (R6); `menuIcons.ts`: `openIn`, `openInSidePeek`, `openInCenterPeek`, `addRowBelow` with icons of their own
- [x] T017 [P] [test] `check-content-actions.mjs` covers the row list and both menus; `check-menu-icons.mjs` passes

**Checkpoint**: the decisions exist and are checked; nothing draws them yet.

### Phase 6: User Story 1, drag a row (P1) 🎯 MVP

- [x] T018 [US1] [ui] `rowDrag.ts` hook: pointer events, 5px threshold, cached row boxes, the line (2px `--color-focus`), auto-scroll near the edges, Escape and a drop outside cancel; on drop `api.placePage` and the rows reload
- [x] T019 [US1] [ui] `components/RowHandle.tsx` (new): handle and + as `ui/Button`s in the title cell (sticky column), shown on hover and focus, hidden for readers; `TableView` renders it and uses the hook (no behaviour inline in `CollectionView.tsx`)
- [x] T020 [US1] [test] `web/tests/row-handle.mjs` (new), in the test script: a drag lands where the line showed and survives a reload; Escape cancels; a filtered view; a tree. Mutation-check it (send the wrong side)
- [x] T021 [US1] [perf] A drag step with the #810 probe on a 300-row table, Chromium: under 4 ms. Numbers in the PR (first 37 ms of script a step, the whole table drawn again per gap; after the line was painted on the rows directly, 0.5 ms script + 0.6 ms layout + 0.3 ms style)

### Phase 7: User Story 2, a drag in a sorted view removes the sort (P1)

- [x] T022 [US2] [ui] On drop in a sorted view: rows drawn in manual order from the drag's start, then `updateView({ sort: null })` (the personal path, or the owner's choice in T013); no drag where the person may not change a sorted view without a personal scope (FR-005), with the tooltip's reason
- [x] T023 [US2] [test] `row-handle.mjs`: sorted view, the bar's Reset brings the sort back and keeps the new place; a locked sorted view still drags. Mutation-check it

### Phase 8: User Story 3, the row menu (P1)

- [x] T024 [US3] [ui] The row menu from `rowActions.ts`: from the handle, a right-click on the row, and `mod+/` on a focused row (the shortcut lands with T029); Open, Open in ›, Edit property ›, Comment, favourites, Copy link, Duplicate (lands below), Move to trash; "Edited {time} by {name}" from `GET /api/audit?page=` when it opens
- [x] T025 [US3] [ui] The board's `CardMenu` drawn from the same list (keeps its Move to column, with its reason; leaves out Edit property, with its reason: a card edits no property in place)
- [x] T026 [US3] [test] `row-handle.mjs`: the menu from all three ways, each item once, focus back to the row on Escape; the board card menu offers the list's boardCard actions

### Phase 9: User Story 4, the + (P2)

- [x] T027 [US4] [ui] + adds a row below (above with Alt/Option) in one request with `after`/`before` and the view's filter values; title in edit mode; a sorted view keeps its sort
- [ ] T028 [US4] [test] `row-handle.mjs`: + below and Alt+ above, after a reload too; in a filtered view the row gets the filter's value

### Phase 10: User Story 5, keyboard and touch (P2)

- [x] T029 [US5] [ui] `keys.ts`: `mod+/` (row menu), `mod+shift+arrowup`/`arrowdown` (move one place); the shortcut sheet lists them; `check-keys.mjs` extended
- [x] T030 [US5] [ui] Touch: the handle as decided in T013; tap opens the menu, press-and-hold (300 ms) drags
- [x] T031 [US5] [test] `row-handle.mjs`: the keys; a touch emulation run (hold-to-drag, tap for the menu)

### Phase 11: PR 2 polish, release and Umbrel

- [x] T032 [P] [i18n] New strings in `de.json`, `es.json`, `nl.json` (a Sonnet helper may draft; reviewed)
- [x] T033 [wiki] `wiki/views.md` (table: handle, menu, manual order, sort), shortcut list; table screenshots retaken and looked at
- [x] T034 [test] Reviews: `/code-review` (fresh agent), `ux-ui-audit` light and dark, desktop and phone; `codegraph sync`, then `codegraph callers` on every exported symbol added or moved. `docs/decisions.md` entry. `scripts/agent-gate.sh` green
- [ ] T035 [backend] After PR 2 merges: check the release and its `umbrel-store` job, give the owner the store pull request on `neatlittlemacapps/yokogaki-umbrel` to merge (rule 32); then the handoff on #643

---

## Dependencies

- T001 → T002 → T003–T008. T009–T011 beside them.
- PR 2 starts after PR 1 merges and T013.
- T014 → T015, T018. T016 → T017, T024, T025. T018 + T019 → T020–T023. T024 → T026. T019 → T027. T018 + T024 → T029, T030.
- T035 comes last.

## Parallel work

- PR 1: T004 and T005 (different handlers), T009 beside the Go work.
- PR 2: T014/T015 beside T016/T017 (separate files). A Sonnet helper can take T032 and T033's screenshots; review its diff.

## Implementation strategy

- **MVP**: PR 1 then US1. Rows can be ordered by hand, by people and agents, before the menu and the extras.
- **Then** US2–US5 in PR 2.
