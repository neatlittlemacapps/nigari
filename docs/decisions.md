# Decisions

Decisions about how this fork is built and worked on, with the reasoning and the
options turned down. A decision explained only in a chat is lost when the chat is.
Newest first. A decision that changes gets a new entry pointing at the old one;
entries are not edited away.

---

## 2026-10-25 — Find-and-replace edits reload open editors; live delivery comes later

**Context**: spec 003 (#13), FR-008. An agent's edit has to reach people who have the
page open.

**Decision**: option C. This feature reloads open editors, as every outside write does
today (unsaved keystrokes go into the page history, `docgen.go`). Delivering the edit
live into running sessions is follow-up #26.

**Rejected**: A, live delivery now. The server only relays Yjs updates (`collab.go`); it
would have to build and send them itself, which is a feature of its own. B alone. It
leaves the interruption in place with no plan to remove it.

## 2026-10-25 — Spec Kit for specs, a GitHub Projects board for tracking

**Decision**: features go through Spec Kit (github/spec-kit, pinned 1.2.3). `tasks.md`
is the source of truth. Issues on the board mirror it and are created by
`/speckit-github-taskstoissues`.

**Why**: the owner chose it. Specs keep the reasoning; the board keeps the status.

## 2026-10-25 — `AGENTS.md` is the shared instruction file; `CLAUDE.md` stays local

**Decision**: project instructions live in `AGENTS.md` and `.claude/rules/`. `CLAUDE.md`
remains gitignored.

**Why**: `.gitignore` excludes `CLAUDE.md` on purpose, because a committed one once
carried deployment details into the public repository.

**Rejected**: committing `CLAUDE.md`.

## 2026-10-25 — Agent parity is enforced by a manifest, a check and a property test

**Decision**: `capabilities.json` names every route and MCP tool. `check-parity.mjs`
(in `npm run check`) fails on anything the manifest does not know.
`parity_property_test.go` checks that REST and MCP give the same access verdicts. Gaps
are counted in `gapBudget`, which may only go down.

**Why**: checks used to be added on one door and found missing on the other.

**Rejected**: a generic code knowledge graph. Grep and a language server are enough at
about 70k lines, and the manifest is the graph that matters. In the Codebase-Memory
paper a graph used about 10× fewer tokens but answered correctly 83% of the time,
against 92% without one.

## 2026-10-25 — Shared capability code goes in `server/cap_*.go`

**Decision**: functions that REST and MCP both call live in `server/cap_*.go`.

**Why**: `server/ops.go` already exists (operational hardening), so `ops_*.go` would
mislead.

## 2026-10-25 — Workspace membership: no MCP tool; an admin's read-write token may manage members (#1, option B)

**Decision**: there is no MCP tool for membership. A workspace admin's read-write REST
token may manage members, as `wiki/workspaces.md` already documents. The README and
`whoami` say so. In `capabilities.json`, `workspaces.membership` is `tokenReachable`
with `"accepted": true`.

**Why**: what the wiki documented and what the code did disagreed. The owner chose to
keep the documented behaviour.

**Rejected**: A, closing the routes to tokens.

## 2026-10-25 — Keep SQLite (spec 002)

**Decision**: stay on SQLite (`modernc.org/sqlite`). Upgrade the driver and measure with
benchmarks.

**Rejected**: DuckDB. It needs cgo, which breaks `CGO_ENABLED=0` release builds. It
downloads extensions at runtime. Its optimistic concurrency produces conflicts when two
writers touch the same row.

## 2026-10-25 — Design system: DTCG tokens and a Base UI component layer (spec 001)

**Decision**: W3C/DTCG 2025.10 tokens, plus a component layer in `web/src/ui/` built on
Base UI (headless). BlockNote keeps `@blocknote/mantine` for now.

**Rejected**: Mantine as the app's component library. It is styled, and those styles
would be overridden everywhere. shadcn/ui, because it requires Tailwind.

## 2026-10-25 — Feature branches folded into the working branch

**Decision**: the four `feat/*` branches (full width, column presets, picker
descriptions, database templates) were merged into `parity-manifest`.

**Why**: the owner asked for the functionality to be in one place.

## 2026-10-25 — No agent teams yet

**Decision**: one agent at a time on this codebase for now.

**Why**: agent teams are experimental. Parallel agents would collide in the hotspot
files (`server/server.go`, `web/src/styles.css`) until those are split.
