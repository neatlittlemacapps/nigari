# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link] | **Issue**: [#N or none yet]

**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This is salt.md's own plan template (`.specify/templates/overrides/`). It is
filled in by `/speckit-plan`. The Surfaces section is required: a plan without it is
not ready for `/speckit-tasks`.

## Summary

[Extract from feature spec: primary requirement + technical approach from research]

## Technical Context

<!--
  salt.md's stack is fixed (see AGENTS.md). Change these lines only where this
  feature adds something, and say why in Complexity Tracking.
-->

**Language/Version**: Go 1.27 (server, one package `server/`), TypeScript 5.6 + React 18 (`web/src/`)

**Primary Dependencies**: Go standard library + pure-Go SQLite; Mantine, BlockNote, Yjs in the frontend. New dependencies: [none, or name + reason]

**Storage**: One SQLite file, one connection (`SetMaxOpenConns(1)`), schema in `server/db.go`. Schema change: [none, or tables/columns/indexes + how an existing instance gets them]

**Testing**: `go test ./...` (`testServer`, `callTool`, scope fixtures), `npm run check` (tsc + check scripts), Playwright in `web/tests/`

**Target Platform**: One static binary (`CGO_ENABLED=0`), Linux/macOS/Windows; browser, desktop shell, MCP clients

**Performance Goals**: [what this feature must not slow down, e.g. page load, search, query_rows on 10k rows, or N/A]

**Constraints**: No external services. English source strings as translation keys. Agent parity except the closed list in `server/mcp_workspace.go`.

**Scale/Scope**: [workspaces, pages, rows this feature must handle]

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Check the plan against each principle in `.specify/memory/constitution.md` and mark it
✅, or ❌ with the reason in Complexity Tracking:

- I. One binary, no external services
- II. Agent parity
- III. Gates are one function
- IV. Derive from code
- V. English source
- VI. Every surface, every time
- VII. Measured, not assumed

## Surfaces

<!--
  REQUIRED. One row per surface in .specify/memory/surfaces.md (the registry):
  copy the rows below and add any the registry has gained since this template
  was last updated. "Changes" names files and functions; "No change" says WHY
  it does not apply. check-surfaces.mjs fails on a missing, empty or TBD row.
-->

| Surface | Changes | Owner |
|---------|---------|-------|
| Domain logic and gates (`canRead`/`canWrite`, `credentialMayEnter`, validation, `audit`, `fireWebhook`) | [files/functions, or "No change: …"] | backend |
| Schema and queries (`server/db.go`, indexes, `ensureColumn`) | | backend |
| REST routes (`server/server.go`, middleware) | | backend |
| MCP tools (`server/mcp*.go`, descriptions, `wrapUntrusted`, read-scope refusal) | | mcp |
| Closed-to-agents list (`not_available_via_mcp`) | | mcp |
| UI components (`web/src/…`, light + dark, keyboard) | | ui |
| Translations (`t()`, `de.json` required, `es.json`) | | i18n |
| Server error codes (`web/src/serverErrors.ts`) | | i18n |
| Wiki (`wiki/*.md`, `mcp-tools.md`, stale screenshots) | | wiki |
| Tests (Go incl. refusal paths, Playwright spec, check scripts) | | test |
| Performance (query plans, payload size, per-request work) | | perf |
| Manifest (`capabilities.json`, `gapBudget`, parity acts) | | mcp |
| Design system (`web/src/ui/`, tokens, `check-tokens.mjs` budgets, catalogue) | | ui |
| Storage budgets (benchmarks on the seeded workspace, p95 budgets, read time limit) | | perf |

**New concepts**: [Does this feature introduce something every LATER feature must
respect — a design system, a budget, a new kind of credential, an event? If so, add
it to `.specify/memory/surfaces.md` in this pull request, with what later features
check against it, and add its row above. If not: "None".]

**Parity statement**: [Either "Agents can do this over MCP via <tool>, with the same
checks as <route>", or "Closed to agents because …, added to not_available_via_mcp".]

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output: REST routes and MCP tool schemas
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

<!--
  List only the files this feature touches. salt.md's layout is fixed:
-->

```text
server/            # Go: routes (server.go), domain files, mcp*.go, *_test.go
web/src/           # React: components/, i18n.ts, format.ts, keys.ts, nav.ts
web/src/locales/   # de.json, es.json
web/scripts/       # check-*.mjs (the build gate)
web/tests/         # Playwright regressions
wiki/              # user docs, screenshots.json
```

**Files touched**: [list]

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
