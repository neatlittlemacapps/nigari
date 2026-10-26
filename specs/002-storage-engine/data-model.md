# Data model: storage engine

No schema change from this feature itself. If a benchmark shows that an index is missing, the index is added through the `schema` constant in `server/db.go`, with `EXPLAIN QUERY PLAN` output in the PR.

## Benchmark workspace (test-only, `server/bench_world_test.go`)

| Field | Values |
|---|---|
| `seed` | `BENCH_SEED`, default 20261026 |
| `pages` | 1k, 20k (nested up to depth 4, 30% with 2–40 blocks of text in German and English, for full-text search) |
| `rows` | 1k, 10k, 100k (100k only with `BENCH_LARGE=1`) |
| `schema` | title, select (6 options), multi-select, date, number, person (5 accounts), relation → a 1k-row database, rollup (sum over the relation) |
| `members` | 5 accounts, one owner; 10% of rows private to someone else (so permission filtering is exercised) |

## Benchmark result (per operation and size)

`ns/op`, `p50-ns`, `p95-ns`, `allocs/op`, as `go test -bench` lines that benchstat reads. The budgets live in `research.md` P3.

## Errors

`query_timeout` (REST `503`, MCP tool error): "The query took longer than 5 seconds and was stopped. Narrow the filter or ask for fewer rows."
