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
