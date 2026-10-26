# Quickstart: validate the storage work

1. **Driver** — `go list -m modernc.org/sqlite` prints v1.60.1. The five cross-builds from release.yml succeed with `CGO_ENABLED=0`, and `go test ./...` is green.
2. **Benchmarks** — `go test ./server -run '^$' -bench Storage -benchtime 200x`, then again with `BENCH_LARGE=1` for 100k. Every operation in research P3 prints `p50-ns` and `p95-ns`.
3. **Before and after** — run step 2 on `main` and on the branch with `-count=6`, then `benchstat old.txt new.txt`. There is no regression above +15% in `p95-ns`.
4. **Time limit** — `go test ./server -run QueryTimeout` passes: a deliberately slow query is stopped with `query_timeout`, and a write issued meanwhile completes.
5. **Baseline** — the measured p95 × 1.5 is committed into research P3 (SC-002).
6. **Gate** — `scripts/agent-gate.sh --all` is green.
