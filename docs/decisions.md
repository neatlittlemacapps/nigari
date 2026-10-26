# Decisions

Decisions about how this fork is built and worked on, with the reasoning and the
options turned down. A decision explained only in a chat is lost when the chat is.
Newest first. A decision that changes gets a new entry pointing at the old one;
entries are not edited away.

---

## 2026-10-26 — Test branches in GitHub Codespaces

**Decision**: a dev container (`.devcontainer/`) builds the branch a codespace
is opened on and runs it on port 8420 with the wiki's invented content. The
owner tests from a phone browser, including pull requests before they merge.

**Why**: the owner works mostly from a phone and asked for a remote way to try
what has been built. A codespace needs nothing installed, keeps its address
private to the owner's GitHub account, and costs nothing within the monthly
allowance.

**Rejected**: a permanent hosted demo (a server to pay for and keep safe, and
a public address for an unreleased build). An `:edge` image to run locally:
useful, but not remote; it can follow later.

## 2026-10-26 — The board derives its columns; nobody moves cards

**Decision**: `board-sync.yml` sets every issue's Status from GitHub's own state: closed,
an open PR that closes it, the `in-progress` and `spec` labels, and whether it is a
feature's task. A task ticked in `tasks.md` on `main` closes its issue. A nightly run
catches anything no event reports.

**Why**: spec 003 merged with its twenty task issues still open, and no card had moved.
A feature PR's `Closes #13` does not close sub-issues, and moving cards was a step people
and agents had to remember. A cloud agent cannot reach the board at all, but it can set a
label.

**Rejected**: moving cards by hand, or by the agent (no board access from cloud
sessions). GitHub's built-in project workflows alone: they cover "closed → Done" and
"PR merged → Done", but not In review, In progress or a feature's progress through its
tasks.

## 2026-10-26 — The list of surfaces is a registry that grows with new concepts

**Context**: the owner's standing instruction is that every feature request is
thought through against every aspect of the code. When a request introduces a new
concept, such as the design system, that concept joins the list every later feature
is checked against.

**Decision**: `.specify/memory/surfaces.md` is the one list of surfaces, each with what
a feature checks and the date it was added. Every plan's Surfaces table has a row per
entry, and `check-surfaces.mjs` (in `npm run check` and the gate) fails a plan that
skips one or leaves it empty. A feature that introduces a concept adds it to the
registry in the same pull request. The first two added this way are the design
system (spec 001) and storage budgets (spec 002), along with the manifest, which had
been a loose line in each plan. Constitution VI now points at the registry (v1.1.0).

**Rejected**: keeping the list in the plan template only. A surface added later reached
the next plan only if its writer remembered, which is the failure the constitution
exists to prevent. Also rejected: asking older plans to answer surfaces that did not
exist when they were written, because a plan records what was considered at the time.

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
