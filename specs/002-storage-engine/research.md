# Research: SQLite or DuckDB

Read 25 Oct 2026, against commit `04a9506` (branch `parity-manifest`).

## How salt.md uses SQLite today

- **Driver:** `modernc.org/sqlite` v1.34.5 — pure Go, no cgo. The current release is in the
  v1.6x line and embeds SQLite 3.54.x, so the pinned version is well behind.
- **One file, one connection:** `openDB` opens the file with WAL, foreign keys, a 5 s busy
  timeout and `synchronous=NORMAL`, then `SetMaxOpenConns(1)`. Several comments explain the
  consequence: a query inside an open cursor or transaction blocks the server.
- **Schema:** 35 `CREATE TABLE IF NOT EXISTS` statements in `db.go`; columns added with
  `ensureColumn`. No migration framework, and an existing instance starts on a new binary as is.
- **Search:** two FTS5 tables (`pages_fts`, `chunks_fts`) with salt.md's own folding and stemming,
  so `Verträge` finds `Vertrag` and compounds are reachable from their parts
  (`docs/what-it-does.md`). The tokenizer cannot change in place; `searchindex.go` rebuilds.
- **Databases (collections):** rows are pages with JSON properties. Filters are applied in SQL
  before `LIMIT` so paging stays honest; relations, rollups and formulas are computed server-side
  in Go (`derived.go`).
- **Realtime editing:** every Yjs update is one `INSERT` into `yjs_updates`.
- **Backup:** `VACUUM INTO` a temporary file for a consistent snapshot, plus the uploads folder.
- **Builds:** the release workflow cross-compiles from one Linux runner with `CGO_ENABLED=0`
  for linux/amd64, linux/arm64, darwin/amd64, darwin/arm64 and windows/amd64. The Docker image
  is built the same way.
- **Benchmarks:** none (`func Benchmark` appears nowhere).

## DuckDB, against salt.md's constraints

| Constraint | DuckDB | Consequence |
| --- | --- | --- |
| `CGO_ENABLED=0`, one static binary | The official Go client (`github.com/duckdb/duckdb-go/v2`) "uses cgo and requires a C compiler"; it statically links prebuilt libraries for macOS amd64/arm64, Linux amd64/arm64 and Windows amd64 | The release workflow would need a C cross-toolchain per target instead of one `go build` per target. The constitution's principle I is broken as written |
| Many small transactional writes | In-process, one read-write process; multiple writer threads via optimistic concurrency control, where two updates to the same row conflict and one fails and must be retried. The docs present this as suited to read-heavy analytical work | Realtime editing and agents updating the same rows are exactly the same-row case |
| Nothing phones home | Full-text search and the SQLite reader are extensions autoloaded "from the official extension repository" on first use | A self-hosted instance would download code at runtime unless extensions are built in, which needs a custom build |
| Full-text search | FTS index not updated on change unless created with `incremental = 1`; Snowball stemmers for 26 languages, English stopwords by default | salt.md's compound and accent handling would have to be rebuilt; no gain over FTS5 |
| Analytics | Columnar, vectorised; very fast scans and aggregates over large tables | The one real advantage — but salt.md's databases are team-sized |

## "Both" was considered too

- **DuckDB reading the SQLite file** (`ATTACH … (TYPE sqlite)`) for analytics only: still cgo,
  still a runtime extension, and SQLite's own locking applies to the attached file. It would add
  a second engine for a speed-up nobody has measured a need for.
- **A separate analytics sidecar process:** breaks "no other services to run".

## What would change the answer

The spec's revisit triggers. If salt.md one day targets organisations well beyond team scale,
the comparison worth making is SQLite against an optional PostgreSQL server mode, not DuckDB.

## Sources

- [DuckDB Go client](https://duckdb.org/docs/2.0/clients/go/overview)
- [DuckDB concurrency](https://duckdb.org/docs/2.0/connect/concurrency.html)
- [DuckDB SQLite extension](https://duckdb.org/docs/2.0/core_extensions/sqlite.html)
- [DuckDB full-text search](https://duckdb.org/docs/2.0/core_extensions/full_text_search)
- [modernc.org/sqlite](https://pkg.go.dev/modernc.org/sqlite)
- [marcboeker/go-duckdb (earlier driver)](https://pkg.go.dev/github.com/marcboeker/go-duckdb)

## Plan-time decisions (2026-10-26)

### P1. Driver: `modernc.org/sqlite` v1.60.1 (SQLite 3.53.4)

- **Decision**: upgrade from v1.34.5 (SQLite 3.46.0) to v1.60.1 (released 2026-09-29). It pulls `modernc.org/libc`, `memory` and `mathutil` along.
- **Evidence (trial in a scratch copy, 2026-10-26)**: `CGO_ENABLED=0 go build ./server` succeeds for linux/amd64, linux/arm64, darwin/amd64, darwin/arm64 and windows/amd64. `go test ./server` passes unchanged on the new driver.
- **Rejected**: v1.61.0 (2026-10-21). Too new to pin: the repository waits two weeks before taking a release. It is the next upgrade.
- The spec said "3.54.x". The pinnable release embeds 3.53.4, and the spec is amended to match.

### P2. Benchmarks report percentiles, not just means

- **Decision**: each storage benchmark times its operations individually and reports `p50-ns` and `p95-ns` through `b.ReportMetric`, alongside `ns/op`. The spec asks for p50/p95, and Go's default output is a mean.
- The workspace generator (`server/bench_world_test.go`) is seeded (`BENCH_SEED`, default 20261026) and builds 1k/20k pages and 1k/10k/100k-row databases with select, date, number, person and relation properties. The 100k size runs only with `-bench` plus `BENCH_LARGE=1`, so `go test ./...` stays fast.

### P3. Latency budgets

Measured on the CI runner (`ubuntu-latest`, 4 cores, Go 1.27.3), `-bench Storage -count=6`, PR #81 run 40365065291, driver v1.34.5. Each budget is the measured p95 × 1.5, rounded up to the next whole millisecond (SC-002). The first column is the guess the spec started from. Rows marked #85 were re-measured on the same runner in PR #85, run 40452540193, after the fixes for #79 and #78 (driver v1.60.1, read pool); their budgets were lowered in that PR, as the rule below requires.

| Operation | Size | Provisional | CI p95 | p95 budget |
|---|---|---|---|---|
| Open a page (`GET /api/pages/{id}`) | 1k pages | — | 0.42 ms | 1 ms |
| Open a page (`GET /api/pages/{id}`) | 20k pages | 20 ms | 0.44 ms | 1 ms |
| `query_rows`, filter and sort | 1k rows | — | 11.7 ms (#85) | 18 ms |
| `query_rows`, filter and sort | 10k rows | 50 ms | 33.1 ms (#85) | 50 ms |
| `query_rows`, filter and sort | 100k rows | 300 ms | not run in CI | 300 ms, provisional |
| Rollup over a relation | 10k rows | 100 ms | 23.8 ms | 36 ms |
| Full-text search | 1k pages | — | 10.6 ms (#85) | 16 ms |
| Full-text search | 20k pages | 50 ms | 122.8 ms (#85) | 185 ms (#78) |
| Grouped count (chart) | 1k rows | — | 2.1 ms (#85) | 4 ms |
| Grouped count (chart) | 10k rows | — | 19.5 ms (#85) | 30 ms |
| Grouped count (chart) | 100k rows | 250 ms | not run in CI; 139 ms on a 4-core dev machine (T020) | 250 ms, provisional |
| Chart: sum of a number per select (spec 004) | 1k rows | — | 4.06 ms (#264) | 7 ms |
| Chart: sum of a number per select (spec 004) | 10k rows | — | 38.8 ms (#264) | 59 ms |
| Chart: count per month, gaps filled (spec 004) | 1k rows | — | 2.68 ms (#264) | 5 ms |
| Chart: count per month, gaps filled (spec 004) | 10k rows | — | 25.2 ms (#264) | 38 ms |
| Chart: sum of a rollup per select (spec 004) | 1k rows | — | 92.2 ms (#264) | 139 ms |
| Chart: sum of a rollup per select (spec 004) | 10k rows | — | 963 ms (#264) | 1,445 ms |
| Property write during a 5-agent burst | 10k rows | 20 ms per write | 5.3 ms | 8 ms per write |

- **One budget is still looser than the guess.** `query_rows` at 10k rows started at 113 ms and is now 50 ms, which meets the guess (#79, PR #85). Search at 20k pages went from 301 to 185 ms; the 50 ms target stays with #78, where the measurement says why a faster join cannot reach it (ranking 24k hits alone costs most of it).
- **The driver bump (#80) lowers most of these** (−11% to −44% p95 on a 4-core dev machine). Measured before it, these budgets have that much headroom until the next re-baseline.
- **The 100k sizes stay provisional:** `BENCH_LARGE=1` takes too long for every PR. The grouped count also runs at 1k and 10k (`StorageGroupedCount`), so CI tracks its trend; those two sizes got their budgets from the #85 run.

- **Chart rows (#264)** were measured on the same runner in PR #264, run 40704990150 (`-count=6`, the p95 benchstat reports). The grouped count beside them did not move against its base (19.41 → 19.35 ms p95 at 10k). A rollup sum is slow by nature: rollups exist only in Go (`computeDerived`), so every row is read and computed (spec 004, research R3). At 10k rows it takes about a second; at 100k it would reach the 5-second limit and answer with the time-limit sentence, which is the documented behaviour, not a hang.

A budget may only be raised in a PR that says why.

### P4. CI comparison

- **Decision**: a `bench` job in `.github/workflows/ci.yml` runs on PRs that touch `server/**`. It runs the storage benchmarks on the base and on the head (`-count=6`) and compares them with `benchstat` (`go run golang.org/x/perf/cmd/benchstat@v0.0.0-20261009192801-be2c69fb417e`, pinned; a CI tool, not a module dependency).
- **Threshold**: a significant change (p < 0.05) of more than **+15%** in `p95-ns` is reported in the job summary and as a warning. It does not fail the job: shared runners are noisy, and a red build that is wrong half the time gets ignored. A regression above **+50%** fails the job.

### P5. Bounded reads, and a read-only pool beside the writer

- **Decision**: analytical reads (`query_rows`, rollups, the coming chart aggregation) run with `QueryContext` under a 5 s limit. They answer `query_timeout` instead of holding the single connection.
- A second, read-only WAL connection is **measured, not built**: a benchmark variant opens `mode=ro` beside the writer and runs the burst-write test with a concurrent 100k-row query. It is built only if the single-connection p95 for writes during a long read exceeds its budget (spec revisit trigger 2 is about this).
- **Rejected**: two connections from the start. The one-connection rule exists because a query inside an open cursor deadlocks (`.claude/rules/go-server.md`). A second pool reopens that class of bug, so it needs a measured reason first.

**Measured** (T021, 2026-10-26; `BenchmarkStorageWriteDuringLongRead`, `BENCH_LARGE=1 -benchtime 200x -count=3`, 4-core dev machine, driver v1.60.1). Five agents write properties while a 100k-row sorted read (`LIMIT 500`) runs back to back:

| Writes | p50 | p95 |
|---|---|---|
| No read running (`StoragePropertyWriteBurst`) | 2.2–2.8 ms | 3.4–4.6 ms |
| Long reads on the one connection | 1.7–1.9 s | 2.6–2.8 s |
| Long reads on a separate `mode=ro` connection | 2.8–2.9 ms | 4.0–4.8 ms |

- **The trigger is met.** With one connection, write p95 during long reads is about 2.7 s against an 8 ms budget. A read-only connection beside the writer brings it back to the no-read figure: WAL lets the reader and the writer run at once.
- **Worse than one read's length.** A single sorted 100k read takes ~100 ms here, but writes waited for seconds. `database/sql` does not hand a freed connection to the longest waiter (its queue is a map), so a reader that asks again at once can win repeatedly. Back-to-back reads are the worst case, but an agent paging a large database looks like that.
- **Built in #82** (owner's call, 2026-10-26). `s.rdb`, a `mode=ro` pool of `readPoolSize` (4) connections opened by `openReadDB`, carries the rows, rollup, backrelation and grouped-count reads. With it, `conn=readpool` in the same benchmark gives write p95 **4.6–5.9 ms** during back-to-back 100k reads (`conn=writer`, the old path: 2.6–3.0 s). Writes, transactions and short lookups stay on the writer; `.claude/rules/go-server.md` says which goes where.

### P6. The decision is recorded in the repository

FR-008 named the salt.md workspace. The owner chose the repository for decisions (2026-10-25), and `docs/decisions.md` already carries "Keep SQLite". The spec is amended to match.
