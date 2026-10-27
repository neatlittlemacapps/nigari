---

description: "Tasks for every block an agent can see in Markdown, it can also write"
---

# Tasks: Every block an agent can see in Markdown, it can also write

**Input**: `specs/006-markdown-block-spellings/` (plan.md, spec.md, research.md, contracts/)

**Tests**: required (salt.md).

**Issues**: parent #160; T001–T015 are #161–#175, in order.

## Format: `[ID] [P?] [Story] [surface] Description`

---

## Phase 1: Setup

- [x] T001 [perf] Record `BenchmarkMarkdownLargePage` (5,000 blocks, both directions) on `main` before any change, for SC-004

---

## Phase 2: Foundational (blocks every story)

- [ ] T002 [backend] New `server/md_spellings.go`: the alert ↔ emoji table (research R3), the `[[toc]]` / `[[subpages]]` tokens, and the container scanner that cuts `<details>` and `:::` runs out of the lines, skipping fenced code and tracking nesting (R2)
- [ ] T003 [P] [test] `server/md_spellings_test.go`: scanner tests: nested containers, a container inside code, an unclosed `<details>`, `:::` inside a toggle

**Checkpoint**: the text can be cut into plain runs and containers.

---

## Phase 3: User Story 1: an agent writes the slash-menu blocks (P1) 🎯 MVP

**Goal**: each spelling becomes its block.

**Independent Test**: one `write_content` with every spelling; the page holds the real blocks.

- [ ] T004 [US1] [test] Import table in `server/md_spellings_test.go`: every row of contracts/spellings.md and every edge case of the spec (unknown alert type, old `> 💡` callouts, `---` under a paragraph, bare URL stays a link, `[[toc]]` in a sentence, columns 1 and 4+, widths that don't add up)
- [ ] T005 [US1] [backend] `mdToBlocks` in `server/mdimport.go`: dividers, `[[toc]]`, `[[subpages]]`, bookmarks (R6), callout alerts and old-style emoji quotes (R3)
- [ ] T006 [US1] [backend] `mdToBlocks`: containers through the T002 scanner: toggles and columns, parsed recursively (R2)
- [ ] T007 [US1] [test] Over MCP via `callTool`: `create_page` and `write_content` (replace and append) with every spelling make the blocks

**Checkpoint**: agents can write every block.

---

## Phase 4: User Story 2: a page survives Markdown and back (P1)

**Goal**: the export and `get_page` write what the importer reads.

**Independent Test**: a page with every block type, exported and imported, has identical blocks.

- [ ] T008 [US2] [backend] `renderBlocksMarked` in `server/export.go`: the spellings of contracts/spellings.md for callout, toggle, toc, subpages, bookmark and columns
- [ ] T009 [US2] [test] Round trip in `server/md_spellings_test.go`: a page with every block type, render → parse → render identical, and the same types and props (SC-002); `get_page` → `write_content` replace leaves the stored blocks unchanged (SC-003)
- [ ] T010 [US2] [backend] `notEditable` / `editableProps` in `server/cap_edits.go`: `toc`, `subpages` leave the refused list; `emoji`, `count`, `widths` join the props (R5)
- [ ] T011 [US2] [test] Find-and-replace edit inside a callout and in a paragraph beside a columns block: accepted, everything else kept (FR-006); the existing `cap_edits` and export tests pass unchanged (FR-005)

**Checkpoint**: a page goes out and comes back whole.

---

## Phase 5: User Story 3: agents are told the spellings (P2)

- [ ] T012 [US3] [mcp] `blockSpellingHint` beside `diagramHint` in `server/mcp.go`, in the `write_content`, `create_page` and `get_page` descriptions
- [ ] T013 [P] [US3] [wiki] `wiki/editor-blocks.md`: export table, "And back again" without the removed losses, a "Writing blocks as Markdown" list; `wiki/mcp-tools.md` § write_content; `docs/what-it-does.md` one line; retake screenshots `check-wiki.mjs` lists

---

## Phase 6: Polish

- [ ] T014 [perf] `BenchmarkMarkdownLargePage` after, against T001: within 10% both ways (SC-004), numbers in the pull request
- [ ] T015 [test] `scripts/agent-gate.sh`; mutation-check T004, T009 and T011 (each fails with its fix undone)

---

## Dependencies

- T001 first (the baseline must predate the change). T002 → T005, T006.
- US1 before US2 (the round trip needs the parser). US3 after US2 (the descriptions describe what round-trips).
