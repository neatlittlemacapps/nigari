package server

import (
	"fmt"
	"math"
	"math/rand/v2"
	"net/http/httptest"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"
)

// Storage benchmarks for spec 002: one per operation in research P3, on the
// seeded workspace from bench_world_test.go.
//
//   go test ./server -run '^$' -bench Storage -benchtime 200x
//   BENCH_LARGE=1 go test ./server -run '^$' -bench Storage -benchtime 200x   # adds 100k rows
//
// Each reports p50-ns and p95-ns beside Go's ns/op. The spec asks for
// percentiles because the budgets are p95: a mean hides exactly the slow tail
// a person waiting on a board notices, and one slow query in twenty is what a
// single SQLite connection turns into a queue.
//
// Every operation runs as a plain member, not the owner, so the private-row
// rule and canRead are part of the cost, as they are for real users.

// latencies times operations one by one and reports their percentiles.
type latencies struct {
	mu sync.Mutex
	d  []time.Duration
}

func (l *latencies) time(op func()) {
	start := time.Now()
	op()
	elapsed := time.Since(start)
	l.mu.Lock()
	l.d = append(l.d, elapsed)
	l.mu.Unlock()
}

// percentile uses the nearest-rank method: p95 of 200 samples is the 190th,
// a value that was actually measured.
func percentile(sorted []time.Duration, p float64) time.Duration {
	if len(sorted) == 0 {
		return 0
	}
	rank := int(math.Ceil(p / 100 * float64(len(sorted))))
	if rank < 1 {
		rank = 1
	}
	return sorted[rank-1]
}

func (l *latencies) report(b *testing.B) {
	b.Helper()
	sort.Slice(l.d, func(i, j int) bool { return l.d[i] < l.d[j] })
	b.ReportMetric(float64(percentile(l.d, 50).Nanoseconds()), "p50-ns")
	b.ReportMetric(float64(percentile(l.d, 95).Nanoseconds()), "p95-ns")
}

// benchDay pins "today" so date filters resolve the same on every run.
var benchDay = time.Date(2026, 10, 26, 0, 0, 0, 0, time.UTC)

func (w *benchWorld) get(b *testing.B, path, cookie string) {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", path, nil)
	req.Header.Set("Cookie", cookie)
	w.s.ServeHTTP(rec, req)
	if rec.Code != 200 {
		b.Fatalf("GET %s: %d %s", path, rec.Code, rec.Body.String())
	}
}

func rowSizes() []int {
	if benchLarge() {
		return []int{1000, 10000, 100000}
	}
	return []int{1000, 10000}
}

func sizeName(n int) string {
	if n >= 1000 {
		return fmt.Sprintf("%dk", n/1000)
	}
	return fmt.Sprint(n)
}

// Opening a page: GET /api/pages/{id}, the request behind every click in the
// sidebar. Budget: 20 ms p95 at 20k pages.
func BenchmarkStorageOpenPage(b *testing.B) {
	for _, n := range []int{1000, 20000} {
		b.Run("pages="+sizeName(n), func(b *testing.B) {
			w := sharedBenchWorld(b, n, 0)
			rng := rand.New(rand.NewPCG(benchSeed(), 1))
			var l latencies
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				id := w.pages[rng.IntN(len(w.pages))]
				l.time(func() { w.get(b, "/api/pages/"+id, w.memberCookie()) })
			}
			l.report(b)
		})
	}
}

// query_rows and the board: a filter and a sort, one page of 50, with the
// rollup column computed. Budgets: 50 ms p95 at 10k, 300 ms at 100k.
func BenchmarkStorageQueryRows(b *testing.B) {
	for _, n := range rowSizes() {
		b.Run("rows="+sizeName(n), func(b *testing.B) {
			w := sharedBenchWorld(b, 0, n)
			filters := []rowFilter{{Prop: "stage", Op: "is", Value: "s2"}}
			var l latencies
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				l.time(func() {
					if _, _, err := w.s.collectionRowsQuery(w.member(), w.rowsDB, filters, nil, "amount:desc", 50, 0, benchDay); err != nil {
						b.Fatalf("query: %v", err)
					}
				})
			}
			l.report(b)
		})
	}
}

// A rollup over a relation, on its own: computeDerived for one page of 100
// rows, each summing the budget of its related project. Budget: 100 ms p95
// at 10k.
func BenchmarkStorageRollup(b *testing.B) {
	w := sharedBenchWorld(b, 0, 10000)
	var schemaJSON string
	if err := w.s.db.QueryRow(`SELECT schema FROM collections WHERE page_id = ?`, w.rowsDB).Scan(&schemaJSON); err != nil {
		b.Fatalf("schema: %v", err)
	}
	schema := parseSchema(schemaJSON)
	rows, _, err := w.s.collectionRowsQuery(w.member(), w.rowsDB, nil, nil, "", 100, 0, benchDay)
	if err != nil || len(rows) == 0 {
		b.Fatalf("rows: %d, %v", len(rows), err)
	}
	var l latencies
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		l.time(func() { w.s.computeDerived(w.member(), schema, rows) })
	}
	l.report(b)
}

// Full-text search: GET /api/search for "vertrag", which the generated text
// holds both as is and as its German plural with an umlaut, so the folding is part of
// the cost; common enough to fill a result page. Budget: 50 ms p95 at 20k pages.
func BenchmarkStorageSearch(b *testing.B) {
	for _, n := range []int{1000, 20000} {
		b.Run("pages="+sizeName(n), func(b *testing.B) {
			w := sharedBenchWorld(b, n, 0)
			var l latencies
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				l.time(func() { w.get(b, "/api/search?q="+w.searchFor, w.memberCookie()) })
			}
			l.report(b)
		})
	}
}

// Five agents writing properties at once: each PATCHes propsPatch on rows it
// may edit. Every write waits for the one connection, so the p95 is the cost
// of the queue as much as of the write. Budget: 20 ms per write at 10k.
func BenchmarkStoragePropertyWriteBurst(b *testing.B) {
	w := sharedBenchWorld(b, 0, 10000)
	var writable []string
	for _, id := range w.rows {
		if !w.private[id] {
			writable = append(writable, id)
		}
	}
	const agents = 5
	var l latencies
	b.ResetTimer()
	var wg sync.WaitGroup
	for a := 0; a < agents; a++ {
		wg.Add(1)
		go func(a int) {
			defer wg.Done()
			rng := rand.New(rand.NewPCG(benchSeed(), uint64(a)))
			for i := a; i < b.N; i += agents {
				id := writable[rng.IntN(len(writable))]
				body := fmt.Sprintf(`{"propsPatch":{"amount":%d}}`, rng.IntN(10000))
				l.time(func() {
					rec := httptest.NewRecorder()
					req := httptest.NewRequest("PATCH", "/api/pages/"+id, strings.NewReader(body))
					req.Header.Set("Content-Type", "application/json")
					req.Header.Set("Cookie", w.cookies[a])
					w.s.ServeHTTP(rec, req)
					if rec.Code != 200 {
						b.Errorf("PATCH as agent %d: %d %s", a, rec.Code, rec.Body.String())
					}
				})
			}
		}(a)
	}
	wg.Wait()
	l.report(b)
}
