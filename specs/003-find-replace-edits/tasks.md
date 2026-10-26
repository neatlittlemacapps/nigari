---

description: "Tasks for edit page content by find-and-replace"
---

# Tasks: Edit page content by find-and-replace

**Input**: `specs/003-find-replace-edits/` — plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: required (salt.md). Refusal paths for every gate.

**Issues**: parent #13; T001–T020 are #27–#46, in order.

## Format: `[ID] [P?] [Story] [surface] Description`

---

## Phase 1: Setup

No setup: no dependency, no schema change (plan, Technical Context).

---

## Phase 2: Foundational (blocks every story)

- [x] T001 [backend] Add a span-recording renderer beside `renderBlocks` in `server/export.go`: render the body like `blocksToMarkdown` and return, per top-level block, its `[start,end)` in the text and whether it may be edited (not `columnList`, `column`, `toc`, `subpages`, and stable under render → `mdToBlocks` → render) — research R1, R2
- [x] T002 [P] [backend] Add a forced "before" snapshot to `server/history.go` (`snapshotRevisionNow`), bypassing `revisionThrottle` but keeping the prune — research R6
- [x] T003 [P] [test] Unit tests in `server/cap_edits_test.go` for T001: spans cover the text exactly, numbered lists keep their numbering, layout blocks are marked not editable

**Checkpoint**: the page can be rendered with spans and snapshotted on demand.

---

## Phase 3: User Story 1 — correct one passage (P1) 🎯 MVP

**Goal**: one or several edits change only the quoted passages.

**Independent Test**: edit a page with known text; read it back; only the passage differs; history has the earlier state, attributed to the caller.

- [x] T004 [US1] [test] Tests in `server/cap_edits_test.go`: single edit; several edits applied in order; untouched blocks byte-identical in `pages.content`; edited paragraph keeps its block id (R3); revision before the edit exists and names the caller; `page.updated` webhook fired; search finds the new text
- [x] T005 [US1] [backend] `editPageContent(u, pageID, req)` in new `server/cap_edits.go`: read `content` + `doc_gen`, apply edits in memory over the spans (prefix + replacement + suffix → `mdToBlocks`), carry block ids over (R3), forced snapshot, `UPDATE … content, updated_at, bumpDocGen WHERE id = ? AND doc_gen = ? AND trashed_at IS NULL`, then `resetYjsDoc`, `reindexPage`, `pagesChanged`, `fireWebhook("page.updated")`; returns counts per edit
- [x] T006 [US1] [backend] `POST /api/pages/{id}/edits` → `handleEditPage` in `server/cap_edits.go`, registered in `server/server.go` behind `auth`; `canWriteReq`, trash refusal as in `PATCH`, audit (`human` for sessions, `agent` for tokens) — contracts/rest.md (do not gofmt `server.go`)
- [x] T007 [P] [US1] [mcp] `write_content` mode `edit`: `edits` and `allow_removals` in the schema and description in `server/mcp.go`, args parsed and routed in `mcpWriteContent` (`server/mcp_merged.go`) — contracts/mcp.md
- [x] T008 [US1] [test] MCP tests via `callTool` in `server/cap_edits_test.go`: the same scenarios as T004 over `write_content`, and `markdown` + mode `edit` refused
- [x] T009 [P] [US1] [backend] `capabilities.json`: add `POST /api/pages/{id}/edits` to `pages.update.rest`; `gapBudget` unchanged

**Checkpoint**: MVP — agents and scripts can fix one passage.

---

## Phase 4: User Story 2 — refuse ambiguous or stale edits (P1)

**Goal**: anything the server would have to guess is refused, with nothing written.

**Independent Test**: requests matching 0 and 2 times leave the page byte-identical and name the count.

- [x] T010 [US2] [test] Refusal tests in `server/cap_edits_test.go`, each asserting the page row is unchanged: 0 matches, 2 matches, `all` with 3, removal of a page mention and of a database block (refused, then allowed with `allow_removals`), edit touching a column layout, empty quote, 101 edits, second of three edits failing (none applied), stale generation (`edit_stale`)
- [x] T011 [US2] [backend] Refusals in `server/cap_edits.go` with `httpErrorCode` codes from data-model.md; removal check via `extractLinks` and `database` blocks; titles only where the caller `canRead`; messages quote at most 80 characters of the passage
- [x] T012 [P] [US2] [mcp] Same refusals as tool errors with the remedy sentence, through the shared function (no MCP-only checks)
- [x] T013 [US2] [test] Gates in `server/cap_edits_test.go`: trashed page, read-scoped token (REST and MCP), credential outside the workspace, another person's private page; add the route and mode to `server/credential_audit_test.go`

**Checkpoint**: an edit never guesses.

---

## Phase 5: User Story 3 — people editing are not lost (P2)

**Goal**: per FR-008 (decision C), open editors reload and nobody's text is lost.

**Independent Test**: an editor typing while an edit lands; the edit is in the page and the typed text in the page or its history.

- [x] T014 [US3] [test] Playwright `web/tests/find-replace-reload.mjs`, registered in `web/tests/package.json`: type in paragraph 1, apply an edit to paragraph 5 over REST, assert reload, the edit present, the typed text in the page or the history

---

## Phase 6: User Story 4 — the same over REST (P3)

**Goal**: REST and MCP agree on every verdict.

- [x] T015 [US4] [test] Add act `edit` (`POST /api/pages/%s/edits` ↔ `write_content` mode `edit`) to `parityActs` in `server/parity_property_test.go`; run with `PARITY_CASES=2000`

---

## Phase 7: Polish

- [x] T016 [P] [wiki] `wiki/mcp-tools.md` § write_content: mode `edit`, arguments, refusals, "prefer edit over replace"
- [x] T017 [P] [wiki] `wiki/api.md`: `POST /api/pages/{id}/edits`, body, answers
- [x] T018 [P] [perf] `BenchmarkEditLargePage` in `server/cap_edits_test.go` on 5,000 blocks; record the number in the PR (target < 50 ms)
- [x] T019 [wiki] `docs/what-it-does.md`: mention find-and-replace edits for agents where content writes are described
- [x] T020 [test] Run `quickstart.md` and `scripts/agent-gate.sh --all`

---

## Dependencies & Execution Order

- T001, T002 before everything in Phase 3+. T003 with T001.
- US1 (T004–T009) before US2 (refusals live in the same function) and before US3, US4.
- T007 and T009 may run beside T006 (different files).
- Polish after US1–US4.

## Parallel Example: User Story 1

```text
After T005: T006 (server.go + cap_edits.go route), T007 (mcp.go, mcp_merged.go), T009 (capabilities.json)
```

## Implementation Strategy

MVP is Phase 2 + US1 (T001–T009), but US2 is P1 too and ships in the same pull request:
an edit that can guess is not safe to release. US3 adds only a test (behaviour exists),
US4 the parity act.
