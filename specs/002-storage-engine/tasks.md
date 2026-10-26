---

description: "Tasks for the storage engine: keep SQLite, measure it, bound long reads"
---

# Tasks: Storage engine — keep SQLite, measure it, and know when to revisit

**Input**: `specs/002-storage-engine/`: plan.md, spec.md, research.md (P1–P6), data-model.md, contracts/limits.md, quickstart.md

**Tests**: required (salt.md). The time limit gets a refusal-path test over REST and MCP.

**Issues**: none yet. They are created by `/speckit-github-taskstoissues`.

**Pull requests**: three. (1) Benchmarks, Phase 2. (2) The driver bump, Phase 3, on its own as FR-002 requires. (3) The CI comparison and the time limit, Phases 4–5.

## Format: `[ID] [P?] [Story] [surface] Description`

---

## Phase 1: Setup

No setup: no new module dependency (`benchstat` runs through `go run` in CI) and no schema change (plan, Technical Context).

---

## Phase 2: Foundational (blocks every story)

The benchmarks come first: the driver bump (US1) must be measured before and after it lands, and the CI job (US2) compares them.

- [ ] T001 [P] [test] Seeded workspace generator in new `server/bench_world_test.go`, per data-model.md: `seed` from `BENCH_SEED` (default 20261026); pages 1k and 20k, "nested up to depth 4, 30% with 2–40 blocks of text in German and English"; rows 1k, 10k and 100k ("100k only with `BENCH_LARGE=1`"); schema "title, select (6 options), multi-select, date, number, person (5 accounts), relation → a 1k-row database, rollup (sum over the relation)"; members "5 accounts, one owner; 10% of rows private to someone else". Build through the same insert paths the server uses, not raw SQL that skips the FTS index
- [ ] T002 [P] [test] Percentile helper in new `server/storage_bench_test.go`: time each operation individually and report `p50-ns` and `p95-ns` with `b.ReportMetric`, beside `ns/op` and `allocs/op` (research P2)
- [ ] T003 [perf] Storage benchmarks in `server/storage_bench_test.go`, one per research P3 row, run as a member (not the owner) so permission filtering is exercised: open a page (20k pages); `collectionRowsQuery` with a filter and sort (10k; 100k under `BENCH_LARGE=1`); rollup through `computeDerived` (10k); full-text search (20k pages); a property write during a 5-agent burst (10k). Names start with `BenchmarkStorage` so `-bench Storage` selects them (depends on T001, T002)
- [ ] T004 [test] Generator sanity test in `server/bench_world_test.go`: the same seed builds the same workspace twice, and a non-owner's `collectionRowsQuery` excludes exactly the 10% private rows

**Checkpoint**: `go test ./server -run '^$' -bench Storage -benchtime 200x` prints p50 and p95 for every operation (quickstart step 2), and `go test ./...` stays fast.

---

## Phase 3: User Story 1 — one file and one binary (P1) 🎯 MVP

**Goal**: the driver moves to v1.60.1 (SQLite 3.53.4), and every release target still builds with `CGO_ENABLED=0`.

**Independent Test**: the five cross-builds succeed, `go test ./...` passes, and a backup restores as one consistent file.

- [ ] T005 [US1] [perf] On `main`, run `go test ./server -run '^$' -bench Storage -count=6` and keep the output as `old.txt` in a scratch directory, not in the repository (depends on T003)
- [ ] T006 [US1] [backend] `go get modernc.org/sqlite@v1.60.1 && go mod tidy`. `go.mod` and `go.sum` change through the Go tool only: `go.sum` is protected from hand edits. Not v1.61.0: released 2026-10-21, too new to pin (research P1)
- [ ] T007 [P] [US1] [test] Backup test in new `server/backup_test.go`: write pages while `Backup` runs, then open the snapshot from the archive and check it holds every committed page, passes `PRAGMA integrity_check`, and has no `-wal` sidecar (acceptance scenario 2; no test covers `Backup` today)
- [ ] T008 [US1] [test] Run the five cross-builds from `.github/workflows/release.yml` (`linux/amd64`, `linux/arm64`, `darwin/amd64`, `darwin/arm64`, `windows/amd64`) with `CGO_ENABLED=0`, then `go test ./...`, including the search folding and stemming tests (spec edge case: FTS5 must not regress)
- [ ] T009 [US1] [perf] Run T005 again on the branch → `new.txt`; `benchstat old.txt new.txt`; no `p95-ns` regression above +15%. Put the benchstat table in the PR body (SC-003)

**Checkpoint**: driver PR ready: `go list -m modernc.org/sqlite` prints v1.60.1 (quickstart step 1).

---

## Phase 4: User Story 2 — stay fast as the workspace grows (P1)

**Goal**: every pull request that touches `server/` is measured against `main`.

**Independent Test**: a PR that slows a benchmark shows the regression in the job summary; above +50% the job fails.

- [ ] T010 [P] [US2] [perf] New `scripts/bench-compare.sh`: run `benchstat` (`go run golang.org/x/perf/cmd/benchstat@v0.0.0-20261009192801-be2c69fb417e`) on two result files. Write the table to `$GITHUB_STEP_SUMMARY`. Emit a `::warning::` for a significant (p < 0.05) `p95-ns` change above +15%. Exit non-zero above +50% (research P4)
- [ ] T011 [US2] [perf] `bench` job in `.github/workflows/ci.yml`, on pull requests whose paths include `server/**`: check out the base and the head, run `-bench Storage -count=6` on each, then call T010. It is not a required check: shared runners are noisy (research P4) (depends on T010)
- [ ] T012 [US2] [perf] After the first green `bench` run on `main`: replace each provisional budget in research P3 with the measured p95 × 1.5, rounded up, and commit the baseline table (SC-002, quickstart step 5)

**Checkpoint**: regressions are visible on every server PR; the budgets are measured, not guessed.

---

## Phase 5: User Story 3 — charts and cross-database questions without a second engine (P2)

**Goal**: long reads cannot hold the single connection, and a grouped count at 100k rows is shown to fit its budget in SQL.

**Independent Test**: a deliberately slow read stops with `query_timeout` while a concurrent write completes; the grouped-count benchmark at 100k stays within its p95 budget and counts only rows the caller may read.

- [ ] T013 [US3] [test] New `server/cap_limits_test.go`, `TestQueryTimeout…`: a slow read through the limit helper stops after the limit (shortened in the test) and returns nothing partial; a write issued meanwhile completes; REST answers `503` with `"code": "query_timeout"`; MCP `query_rows` through `callTool` returns a tool error with the same sentence (contracts/limits.md). Write it first; it fails until T014–T017 land
- [ ] T014 [US3] [backend] New `server/cap_limits.go`: `readLimit = 5 * time.Second`, a helper that runs a read under `context.WithTimeout`, and the error sentence verbatim: "The query took longer than 5 seconds and was stopped. Narrow the filter or ask for fewer rows." The comment says why: one connection (`SetMaxOpenConns(1)` in `server/db.go`), so a long read blocks every request
- [ ] T015 [US3] [backend] `collectionRowsQuery` in `server/collections.go` runs its queries with `QueryContext` under the T014 helper; `handleCollectionRows` maps the timeout to `httpErrorCode(w, 503, "query_timeout", …)`. Writes stay unbounded (`busy_timeout(5000)` covers them)
- [ ] T016 [US3] [backend] Rollup reads in `server/derived.go` (`computeDerived` → `relatedRows`, `backrelationIDs`) run under the same deadline as the request that triggered them
- [ ] T017 [P] [US3] [mcp] `mcpQueryRows` in `server/mcp_db.go` returns the timeout as a tool error through the shared helper (no MCP-only check). Add one sentence on the 5 s limit to the `query_rows` description in `server/mcp.go`
- [ ] T018 [P] [US3] [i18n] `query_timeout` in `web/src/serverErrors.ts`; the German sentence in `web/src/locales/de.json`; `es.json` (reported, not required)
- [ ] T019 [P] [US3] [wiki] The 5 s read limit in the Limits tables of `wiki/mcp-tools.md` and `wiki/api.md`, with the `503 query_timeout` answer
- [ ] T020 [US3] [perf] `BenchmarkStorageGroupedCount` in `server/storage_bench_test.go` (100k, `BENCH_LARGE=1`): a `GROUP BY` over `json_extract` of a select property, in SQL, over the same permission-filtered row set `collectionRowsQuery` uses. A test beside it asserts that the group counts equal what `query_rows` returns per value for a non-owner, so private rows of others are excluded exactly as `query_rows` excludes them (acceptance scenario 1; FR-005)
- [ ] T021 [US3] [perf] Read-only connection measurement (research P5): a benchmark variant that opens `mode=ro` beside the writer and runs the burst-write benchmark during a 100k-row query, compared with the single connection. Record the result in research P5. Build the second connection only if single-connection write p95 during a long read exceeds its budget; otherwise write down that it was not needed

**Checkpoint**: SC-004 measured; FR-005 and FR-006 are met for the read paths that exist today. #20 builds its chart aggregation on T020's query.

---

## Phase 6: Polish & cross-cutting

- [ ] T022 [P] [test] `server/credential_audit_test.go` and `parity_property_test.go`: confirm nothing changes (no new route or tool, `capabilities.json` untouched). If the time limit changes an existing pair of acts, update the pair
- [ ] T023 Run quickstart.md steps 1–6 and `scripts/agent-gate.sh --all`; tick the checkboxes here in the same PR as the work

---

## Dependencies & execution order

- **Phase 2** blocks everything: US1 needs the before/after numbers, US2 compares them, US3 benchmarks with them.
- **US1** (driver PR) after Phase 2. It is its own PR (FR-002), so it merges before the Phase 4–5 PR is opened from the new `main`.
- **US2** after Phase 2. T012 waits for the first `bench` run on `main`.
- **US3** after Phase 2; independent of US1 and US2. T013 before T014–T017; T017–T019 in parallel after T014.

## Parallel opportunities

- T001 ∥ T002.
- T007 ∥ T006 (a different file).
- T010 ∥ any US3 task.
- T017 ∥ T018 ∥ T019 once T014 exists.

## Implementation strategy

1. Phase 2 → PR "Storage benchmarks report p50 and p95 on a seeded workspace".
2. US1 → PR "The SQLite driver moves to v1.60.1 (SQLite 3.53.4)", with the benchstat table.
3. US2 + US3 → PR "Analytical reads stop after 5 seconds, and CI compares storage benchmarks".
4. T012 after the first `bench` run on `main`, as a small follow-up commit.
