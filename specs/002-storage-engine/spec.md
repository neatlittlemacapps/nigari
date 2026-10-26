# Feature Specification: Storage engine — keep SQLite, measure it, and know when to revisit

**Feature Branch**: `002-storage-engine`

**Created**: 2026-10-25

**Status**: Draft — decision proposed: **keep SQLite**

**Input**: User description: "SQLite vs DuckDB (should we keep SQLite?)"

Evidence and sources: [research.md](research.md).

## Decision

**Keep SQLite as salt.md's only database.** Do not adopt DuckDB, neither as a replacement nor
as a second engine beside it. Instead: upgrade the SQLite driver, add the benchmarks that are
missing, serve the coming analytical features (#20 charts and dashboards, #25 SQL across
databases) from SQLite, and write down the measurements that would reopen the question.

Why, in one paragraph: salt.md's workload is many small, permission-checked reads and writes
from people and agents editing the same pages — transactional work, which is what SQLite is
built for and what DuckDB's documentation positions it away from. DuckDB's Go driver requires
cgo, which ends the `CGO_ENABLED=0` static, cross-compiled single binary. Its full-text search
and SQLite reader are extensions fetched from DuckDB's repository on first use, which conflicts
with an instance that never phones home. What DuckDB is good at — scanning millions of rows for
aggregates — is not a need salt.md has at team scale, and SQLite can answer the aggregates
salt.md does need.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A self-hoster keeps one file and one binary (Priority: P1)

Someone running salt.md on a small Linux server, a Raspberry Pi or a Mac upgrades by swapping
the binary and backs up by copying one database file and the uploads folder.

**Why this priority**: it is the product's first promise (README: "One binary, on your own
server"; constitution principle I). A storage choice that breaks it is wrong however fast it is.

**Independent Test**: build with `CGO_ENABLED=0` for every platform the release workflow
targets; back up with `VACUUM INTO`; restore by copying.

**Acceptance Scenarios**:

1. **Given** the release workflow, **When** it cross-compiles for Linux and macOS on amd64 and arm64 and Windows on amd64, **Then** every build succeeds with `CGO_ENABLED=0`.
2. **Given** a running instance, **When** an admin downloads a backup, **Then** it is one consistent SQLite snapshot plus the uploads, as today.

---

### User Story 2 - Pages and databases stay fast as a team's workspace grows (Priority: P1)

A team with tens of thousands of pages and databases of tens of thousands of rows filters a
board, searches, and edits with colleagues and agents at the same time, without waiting.

**Why this priority**: "is SQLite enough" is a question about numbers, and today there are none:
the repository has no benchmarks.

**Independent Test**: the benchmark suite runs against generated workspaces of fixed sizes and
reports latency per operation.

**Acceptance Scenarios**:

1. **Given** a generated workspace, **When** `go test -bench` runs the storage benchmarks, **Then** it reports p50 and p95 for: `query_rows` with a filter and sort on 10k and 100k rows; a rollup over a relation; full-text search; opening a page; a burst of property writes from several agents.
2. **Given** a pull request that touches `server/`, **When** CI runs the benchmarks against `main`, **Then** a regression beyond the threshold set in the plan is reported.

---

### User Story 3 - Charts and cross-database questions work without a second engine (Priority: P2)

A person adds a chart view (#20) — open tasks per person, grouped by week — and an agent asks
a question across databases (#25), and both are answered from SQLite with the same permission
rules as every other read.

**Why this priority**: these are the features that would make DuckDB tempting. If SQLite serves
them within the latency budget, the question is closed for now.

**Independent Test**: implement the chart view's aggregation as SQL over the rows the caller may
read, and benchmark it at the sizes in Story 2.

**Acceptance Scenarios**:

1. **Given** a database the caller can only partly read (private rows), **When** a chart aggregates it, **Then** private rows of others are excluded exactly as `query_rows` excludes them.
2. **Given** 100k rows, **When** a grouped count runs, **Then** it stays within the latency budget set in the plan.

### Edge Cases

- **One connection** (`SetMaxOpenConns(1)`): a long analytical query blocks every other request. Aggregations need a time limit, or a separate read-only connection in WAL mode (to be measured; WAL allows concurrent readers with one writer).
- **Full-text search across languages**: salt.md's own folding and stemming (German compounds, accents) runs on SQLite FTS5 and must not regress.
- **Realtime editing**: every Yjs update from an open editor is persisted as its own small `INSERT` (`persistUpdate` in `server/collab.go`), so typing produces a steady stream of tiny writes.
- **Large instances** beyond "a team" are out of scope for this decision and named as a revisit trigger.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: salt.md MUST keep SQLite (pure Go, `modernc.org/sqlite`) as its only database engine, with one file and `CGO_ENABLED=0` builds.
- **FR-002**: The driver MUST be upgraded from `modernc.org/sqlite` v1.34.5 to the current release (embedding SQLite 3.54.x), in its own pull request with the full test suite and benchmarks before and after.
- **FR-003**: A storage benchmark suite MUST exist in `server/` (`*_bench_test.go`) with a deterministic workspace generator at fixed sizes (1k / 10k / 100k rows; 1k / 20k pages), covering the operations in Story 2.
- **FR-004**: CI MUST run the benchmarks on pull requests touching `server/` and compare with `main` (`benchstat`), reporting regressions above the plan's threshold.
- **FR-005**: Aggregations for chart views (#20) MUST be computed in SQL over the permission-filtered row set, never by loading all rows into Go.
- **FR-006**: Long-running reads MUST be bounded by a time limit so one query cannot hold the single connection; the plan measures whether a separate read-only WAL connection is needed.
- **FR-007**: `research.md` MUST record the revisit triggers below, and the benchmarks MUST report the numbers they refer to.
- **FR-008**: The decision MUST be recorded on a decisions page in the salt.md workspace (AGENTS.md: decisions with the options rejected).

### Revisit triggers

Reopen the question only if a measurement — not an impression — shows one of these:

1. A chart or cross-database query at 100k rows exceeds its latency budget after indexing and SQL aggregation.
2. The benchmarks show write contention from realtime editing that the single writer cannot absorb.
3. A product decision to serve organisations far beyond team scale (then the comparison is with PostgreSQL as an optional server, not with DuckDB).

### Key Entities

- **Benchmark workspace**: a generated, reproducible workspace of a stated size.
- **Latency budget**: a p95 per operation, set in the plan from the first baseline.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every release build stays `CGO_ENABLED=0` on all five targets.
- **SC-002**: A storage baseline exists: p50/p95 for each Story 2 operation at each size, committed in `research.md` after the first run.
- **SC-003**: The driver upgrade lands with no test failures and no benchmark regression above threshold.
- **SC-004**: Chart aggregation at 100k rows meets its budget without a second engine.

## Assumptions

- Team scale means up to roughly 100k database rows and tens of thousands of pages per instance; the benchmarks will confirm or correct this.
- Analytical needs stay interactive (a chart, a question), not data-warehouse workloads.

## Out of Scope

- Supporting PostgreSQL or another server database.
- Exporting to analytical formats (Parquet) for outside tools; possible later as an export.
