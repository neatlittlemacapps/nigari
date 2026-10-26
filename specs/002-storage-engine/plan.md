# Implementation Plan: Storage engine — keep SQLite, measure it, and know when to revisit

**Branch**: `002-storage-engine` | **Date**: 2026-10-26 | **Spec**: [spec.md](spec.md) | **Issue**: none yet (created by `/speckit-github-taskstoissues`)

**Input**: Feature specification from `/specs/002-storage-engine/spec.md`

## Summary

We keep SQLite. The plan has four parts:
1. Upgrade the pure-Go driver to v1.60.1 (SQLite 3.53.4). A trial already showed that all five release targets build with `CGO_ENABLED=0` and that the tests pass.
2. Add the missing storage benchmarks, reporting p50 and p95 on a seeded workspace.
3. Compare benchmarks in CI with `benchstat`.
4. Bound analytical reads with a 5 s limit, so one query cannot hold the single connection.

A second, read-only connection is measured, not built.

This feature introduces a concept later features must respect, so it adds **Storage budgets** to the surfaces registry: a new hot-path query is benchmarked against its budget.

## Technical Context

**Language/Version**: Go 1.27 (server, one package `server/`), TypeScript 5.6 + React 18 (`web/src/`)

**Primary Dependencies**: Go standard library and pure-Go SQLite; Mantine, BlockNote and Yjs in the frontend. New dependencies: none. The driver moves v1.34.5 → v1.60.1, which brings its `modernc.org/libc`, `memory` and `mathutil` along. `benchstat` runs in CI through `go run` and is not a module dependency.

**Storage**: One SQLite file, one connection (`SetMaxOpenConns(1)`), WAL, `busy_timeout(5000)`, schema in `server/db.go`. Schema change: none, unless a benchmark exposes a missing index (then one `CREATE INDEX IF NOT EXISTS`, with the query plan in the PR).

**Testing**: `go test ./...`; new `server/storage_bench_test.go` and `server/bench_world_test.go`; a timeout test; a CI `bench` job.

**Target Platform**: One static binary (`CGO_ENABLED=0`), Linux/macOS/Windows; browser, desktop shell, MCP clients.

**Performance Goals**: the budgets in research P3 (provisional until the first baseline).

**Constraints**: No external services. English source strings as translation keys. Agent parity except the closed list in `server/mcp_workspace.go`.

**Scale/Scope**: up to 100k rows per database and 20k pages per instance (spec assumption, checked by the benchmarks).

## Constitution Check

- I. One binary, no external services: ✅ this feature defends it; the driver stays pure Go.
- II. Agent parity: ✅ the time limit applies to REST and MCP through the same function.
- III. Gates are one function: ✅ no access decision changes. Benchmarks exercise permission-filtered reads.
- IV. Derive from code: ✅ budgets live in research P3 and are compared by CI, not remembered.
- V. English source: ✅ one new error sentence, translated through `serverErrors.ts` and `de.json`.
- VI. Every surface, every time: ✅ see the table below.
- VII. Measured, not assumed: ✅ the point of the feature.

Re-checked after Phase 1 design: unchanged.

## Surfaces

| Surface | Changes | Owner |
|---------|---------|-------|
| Domain logic and gates (`canRead`/`canWrite`, `credentialMayEnter`, validation, `audit`, `fireWebhook`) | Row queries and rollups take a context with a 5 s deadline. One helper in a new `server/cap_limits.go` is used by `mcpQueryRows` (`server/mcp_db.go`), `handleCollectionRows`, and rollup computation. Gates unchanged | backend |
| Schema and queries (`server/db.go`, indexes, `ensureColumn`) | Driver upgrade (`go.mod`, `go.sum` through `go get`). Indexes only if a benchmark shows a full scan | backend |
| REST routes (`server/server.go`, middleware) | No new route. `GET /api/collections/{id}/rows` can answer `503 query_timeout` | backend |
| MCP tools (`server/mcp*.go`, descriptions, `wrapUntrusted`, read-scope refusal) | `query_rows` can return the timeout error. One sentence added to its description | mcp |
| Closed-to-agents list (`not_available_via_mcp`) | No change | mcp |
| UI components (`web/src/…`, light + dark, keyboard) | No component change. A timed-out board shows the translated error through the existing error path | ui |
| Translations (`t()`, `de.json` required, `es.json`) | The `query_timeout` sentence in `de.json` (es reported) | i18n |
| Server error codes (`web/src/serverErrors.ts`) | Add `query_timeout` | i18n |
| Wiki (`wiki/*.md`, `mcp-tools.md`, stale screenshots) | The 5 s limit in the Limits table of `wiki/mcp-tools.md` and `wiki/api.md`. No screenshots | wiki |
| Tests (Go incl. refusal paths, Playwright spec, check scripts) | Benchmarks (research P2). `QueryTimeout` test: a slow query is stopped and a concurrent write completes. Full suite before and after the driver bump | test |
| Performance (query plans, payload size, per-request work) | The CI `bench` job with benchstat (research P4). Baseline committed in research P3 | perf |
| Manifest | No change: no route or tool | mcp |
| Design system | No change: no new screen or component; the timeout message uses the existing error path | ui |
| Storage budgets | This feature creates it: the seeded workspace, percentile benchmarks, p95 budgets and the read time limit. It enters the registry (`.specify/memory/surfaces.md`) with this plan | perf |

**Parity statement**: there is no new capability. The time limit is the same for REST and MCP because both call the same helper.

## Project Structure

### Documentation (this feature)

```text
specs/002-storage-engine/
├── spec.md, research.md (incl. plan-time decisions P1–P6)
├── plan.md, data-model.md, quickstart.md
├── contracts/limits.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

**Files touched**:
- **Driver:** `go.mod` and `go.sum` (through `go get`).
- **Time limit:** `server/cap_limits.go` (new), `server/mcp_db.go`, the collection rows handler, the rollup code, and `server/mcp.go` (the `query_rows` description).
- **Tests and benchmarks:** `server/bench_world_test.go`, `server/storage_bench_test.go`, `server/cap_limits_test.go` (all new).
- **Errors and translations:** `web/src/serverErrors.ts`, `web/src/locales/de.json`, `es.json`.
- **Docs:** `wiki/mcp-tools.md`, `wiki/api.md`, and the spec's `research.md` (the baseline).
- **CI:** `.github/workflows/ci.yml`.

The driver bump goes in its own PR, as FR-002 requires.

## Complexity Tracking

None.
