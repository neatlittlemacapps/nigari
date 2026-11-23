package server

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"math/rand/v2"
	"net/http/httptest"
	"os"
	"path/filepath"
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
// The budgets themselves live only in research P3, measured on the CI runner;
// a number repeated here would drift from the one the job is judged by.
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
// sidebar.
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
// rollup column computed.
func BenchmarkStorageQueryRows(b *testing.B) {
	for _, n := range rowSizes() {
		b.Run("rows="+sizeName(n), func(b *testing.B) {
			w := sharedBenchWorld(b, 0, n)
			filters := []rowFilter{{Prop: "stage", Op: "is", Value: "s2"}}
			var l latencies
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				l.time(func() {
					if _, _, err := w.s.collectionRowsQuery(context.Background(), w.member(), w.rowsDB, filters, nil, "amount:desc", 50, 0, benchDay); err != nil {
						b.Fatalf("query: %v", err)
					}
				})
			}
			l.report(b)
		})
	}
}

// query_rows sorted by a status (spec 016, R5): the same query as above, the
// sort an ORDER BY CASE over the status's options instead of the value's
// text. Budget: the rows query's (spec 002 research: 18 ms at 1k, 50 ms at
// 10k, p95). The world's stage is a select; for this benchmark it is made a
// status, grouped as the conversion would, and put back after, so the other
// benchmarks run on the world they always had.
func BenchmarkStorageQueryRowsStatusSort(b *testing.B) {
	for _, n := range rowSizes() {
		b.Run("rows="+sizeName(n), func(b *testing.B) {
			w := sharedBenchWorld(b, 0, n)
			schema, views, err := w.s.loadCollection(w.rowsDB)
			if err != nil {
				b.Fatal(err)
			}
			raw, _ := json.Marshal(schema)
			b.Cleanup(func() {
				var back []map[string]any
				json.Unmarshal(raw, &back)
				w.s.saveCollection(w.rowsDB, back, views)
			})
			for _, p := range schema {
				if p["id"] == "stage" {
					p["type"] = "status"
				}
			}
			if err := prepareStatusProps(schema, snapshotStatus(nil)); err != nil {
				b.Fatal(err)
			}
			if err := w.s.saveCollection(w.rowsDB, schema, views); err != nil {
				b.Fatal(err)
			}
			// About as narrow as BenchmarkStorageQueryRows' filter (one stage
			// of six there, amounts under 2000 of 10000 here), but on another
			// property, so the rows still hold every stage to sort. Measured on a broad filter
			// a plain sort and this one cost the same; the filter's width is
			// what the time follows, not the CASE.
			filters := []rowFilter{{Prop: "amount", Op: "lt", Value: "2000"}}
			var l latencies
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				l.time(func() {
					if _, _, err := w.s.collectionRowsQuery(context.Background(), w.member(), w.rowsDB, filters, nil, "stage:asc", 50, 0, benchDay); err != nil {
						b.Fatalf("query: %v", err)
					}
				})
			}
			l.report(b)
		})
	}
}

// query_rows filtered by a status's group (spec 016 SC-003): "open work",
// group_is_not complete, sorted by amount like BenchmarkStorageQueryRows. The
// condition becomes an is_not over the options in Complete per query (R3), so
// it costs what that filter costs. Budget: the rows query's (spec 002
// research: 18 ms at 1k, 50 ms at 10k, p95). The world's stage is made a
// status for the run and put back after, as in the status sort benchmark.
func BenchmarkStorageQueryRowsStatusGroup(b *testing.B) {
	for _, n := range rowSizes() {
		b.Run("rows="+sizeName(n), func(b *testing.B) {
			w := sharedBenchWorld(b, 0, n)
			benchStageAsStatus(b, w)
			filters := []rowFilter{{Prop: "stage", Op: "group_is_not", Values: []string{"complete"}}}
			var l latencies
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				l.time(func() {
					if _, _, err := w.s.collectionRowsQuery(context.Background(), w.member(), w.rowsDB, filters, nil, "amount:desc", 50, 0, benchDay); err != nil {
						b.Fatalf("query: %v", err)
					}
				})
			}
			l.report(b)
		})
	}
}

// benchStageAsStatus makes the shared world's stage a status for one
// benchmark (the conversion's guess places its options, every empty group
// gets a default) and puts the select back when it ends.
func benchStageAsStatus(b *testing.B, w *benchWorld) {
	b.Helper()
	schema, views, err := w.s.loadCollection(w.rowsDB)
	if err != nil {
		b.Fatal(err)
	}
	raw, _ := json.Marshal(schema)
	b.Cleanup(func() {
		var back []map[string]any
		json.Unmarshal(raw, &back)
		w.s.saveCollection(w.rowsDB, back, views)
	})
	// Two of the six seeded stages per group, so "open work" keeps two
	// thirds of the rows, as a working database does; by name alone all six
	// (s1..s6) would be guessed To-do and Complete would hold nothing.
	groupOf := map[string]string{"s1": "todo", "s2": "todo", "s3": "in_progress", "s4": "in_progress", "s5": "complete", "s6": "complete"}
	for _, p := range schema {
		if p["id"] != "stage" {
			continue
		}
		p["type"] = "status"
		list, _ := p["options"].([]any)
		for _, o := range list {
			if m, ok := o.(map[string]any); ok {
				id, _ := m["id"].(string)
				m["group"] = groupOf[id]
			}
		}
	}
	if err := prepareStatusProps(schema, snapshotStatus(nil)); err != nil {
		b.Fatal(err)
	}
	if err := w.s.saveCollection(w.rowsDB, schema, views); err != nil {
		b.Fatal(err)
	}
}

// A grouped count, the aggregation behind a chart: rows per stage, in one
// GROUP BY over the rows the member may see (groupCounts). 1k and 10k run on
// every pull request; the 100k size its budget is written for needs
// BENCH_LARGE=1.
func BenchmarkStorageGroupedCount(b *testing.B) {
	for _, n := range rowSizes() {
		b.Run("rows="+sizeName(n), func(b *testing.B) {
			w := sharedBenchWorld(b, 0, n)
			var l latencies
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				l.time(func() {
					if _, err := w.s.groupCounts(context.Background(), w.member(), w.rowsDB, "stage"); err != nil {
						b.Fatalf("group: %v", err)
					}
				})
			}
			l.report(b)
		})
	}
}

// A chart's aggregate (spec 004): the sum of a number per select, a count per
// month (gap filling included), the sum of a rollup, which only Go can
// compute (aggregateDerived reads the rows in pages and folds them), and Each
// row. All over
// the rows the member may see. Budgets are this benchmark's CI p95 × 1.5, in
// specs/002-storage-engine/research.md.
func BenchmarkStorageAggregate(b *testing.B) {
	cases := []struct {
		name string
		spec aggSpec
	}{
		{"sum-by-select", aggSpec{GroupBy: "stage", Agg: "sum", AggProp: "amount"}},
		{"count-by-month", aggSpec{GroupBy: "due", Period: "month"}},
		{"rollup-sum-by-select", aggSpec{GroupBy: "stage", Agg: "sum", AggProp: "budget"}},
		// Each row (FR-030): one group per row, so the cost is the answer's
		// size and the title lookup (labelRows), not the GROUP BY.
		{"each-row-sum", aggSpec{GroupBy: rowGroupKey, Agg: "sum", AggProp: "amount"}},
	}
	for _, n := range rowSizes() {
		for _, c := range cases {
			b.Run(c.name+"/rows="+sizeName(n), func(b *testing.B) {
				w := sharedBenchWorld(b, 0, n)
				var l latencies
				b.ResetTimer()
				for i := 0; i < b.N; i++ {
					l.time(func() {
						if _, err := w.s.aggregateRows(context.Background(), w.member(), w.rowsDB, c.spec, nil, nil, benchDay); err != nil {
							b.Fatalf("aggregate: %v", err)
						}
					})
				}
				l.report(b)
			})
		}
	}
}

// A rollup over a relation, on its own: computeDerived for one page of 100
// rows, each summing the budget of its related project.
func BenchmarkStorageRollup(b *testing.B) {
	w := sharedBenchWorld(b, 0, 10000)
	var schemaJSON string
	if err := w.s.db.QueryRow(`SELECT schema FROM collections WHERE page_id = ?`, w.rowsDB).Scan(&schemaJSON); err != nil {
		b.Fatalf("schema: %v", err)
	}
	schema := parseSchema(schemaJSON)
	rows, _, err := w.s.collectionRowsQuery(context.Background(), w.member(), w.rowsDB, nil, nil, "", 100, 0, benchDay)
	if err != nil || len(rows) == 0 {
		b.Fatalf("rows: %d, %v", len(rows), err)
	}
	var l latencies
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		l.time(func() { w.s.computeDerived(context.Background(), w.member(), schema, rows) })
	}
	l.report(b)
}

// Full-text search: GET /api/search for "vertrag", which the generated text
// holds both as is and as its German plural with an umlaut, so the folding is part of
// the cost; common enough to fill a result page.
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
// of the queue as much as of the write.
func BenchmarkStoragePropertyWriteBurst(b *testing.B) {
	w := sharedBenchWorld(b, 0, 10000)
	var l latencies
	b.ResetTimer()
	writeBurst(b, w, &l)
	l.report(b)
}

// writeBurst runs b.N property writes from five agents at once, timing each.
func writeBurst(b *testing.B, w *benchWorld, l *latencies) {
	var writable []string
	for _, id := range w.rows {
		if !w.private[id] {
			writable = append(writable, id)
		}
	}
	const agents = 5
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
}

// The measurement behind research P5 and #82: what a long read costs the
// writes queued behind it. 100k rows, BENCH_LARGE=1 only.
//
//   - conn=writer: the long read runs on the writer's one connection, as every
//     read did before #82. Writes wait for it.
//   - conn=readpool: the same read through collectionRowsQuery, which runs on
//     the read-only pool (openReadDB). Writes should not notice it.
//
// The reader loops until the writes are done, so every write meets a read in
// progress, as it would behind a chart or an agent paging a large database.
func BenchmarkStorageWriteDuringLongRead(b *testing.B) {
	if !benchLarge() {
		b.Skip("needs BENCH_LARGE=1: the long read is a 100k-row query")
	}
	w := sharedBenchWorld(b, 0, 100000)
	const longRead = `SELECT id, props FROM pages WHERE parent_id = ? AND trashed_at IS NULL
		ORDER BY json_extract(props, '$.amount') DESC LIMIT 500`
	read := map[string]func() error{
		"writer": func() error {
			rows, err := w.s.db.Query(longRead, w.rowsDB)
			if err != nil {
				return err
			}
			for rows.Next() {
			}
			return rows.Close()
		},
		"readpool": func() error {
			_, _, err := w.s.collectionRowsQuery(context.Background(), w.member(), w.rowsDB, nil, nil, "amount:desc", 500, 0, benchDay)
			return err
		},
	}
	for _, mode := range []string{"writer", "readpool"} {
		b.Run("conn="+mode, func(b *testing.B) {
			stop := make(chan struct{})
			done := make(chan struct{})
			reads := 0
			go func() {
				defer close(done)
				for {
					select {
					case <-stop:
						return
					default:
					}
					if err := read[mode](); err != nil {
						b.Errorf("long read: %v", err)
						return
					}
					reads++
				}
			}()
			time.Sleep(20 * time.Millisecond) // the first read is under way
			var l latencies
			b.ResetTimer()
			writeBurst(b, w, &l)
			b.StopTimer()
			close(stop)
			<-done
			l.report(b)
			b.ReportMetric(float64(reads), "reads")
		})
	}
}

// Starting on a database that is already at the newest step: what every
// restart pays once spec 008 is in (SC-002: within 5 ms of what it was). The
// "before" case is what openDB did on every start until then: the whole schema
// and every ensureColumn on the writer, now step 1 run directly. The copy of
// step-0.db stands in for a small instance; the cost is per start, not per
// page, so the seeded world adds nothing here.
func BenchmarkStorageStart(b *testing.B) {
	src, err := os.ReadFile(filepath.Join("testdata", "upgrade", "step-0.db"))
	if err != nil {
		b.Fatal(err)
	}
	path := filepath.Join(b.TempDir(), DBFile)
	if err := os.WriteFile(path, src, 0o644); err != nil {
		b.Fatal(err)
	}
	if _, err := upgradeDB(path); err != nil {
		b.Fatal(err)
	}
	b.Run("upgrade-nothing-pending", func(b *testing.B) {
		var l latencies
		for i := 0; i < b.N; i++ {
			l.time(func() {
				if _, err := upgradeDB(path); err != nil {
					b.Fatal(err)
				}
				db, err := openDB(path)
				if err != nil {
					b.Fatal(err)
				}
				db.Close()
			})
		}
		l.report(b)
	})
	b.Run("before-spec-008", func(b *testing.B) {
		var l latencies
		for i := 0; i < b.N; i++ {
			l.time(func() {
				db, err := openDB(path)
				if err != nil {
					b.Fatal(err)
				}
				tx, err := db.Begin()
				if err != nil {
					b.Fatal(err)
				}
				if err := baseSchema(context.Background(), tx); err != nil {
					b.Fatal(err)
				}
				if err := tx.Commit(); err != nil {
					b.Fatal(err)
				}
				db.Close()
			})
		}
		l.report(b)
	})
}

// Moving a row in a 10k-row database (spec 022, research R9): POST
// /api/pages/{id}/place after another row, by the member, one at a time. The
// move reads the database's rows in order to find the neighbour and writes one
// row; this says whether that needs an index on (parent_id, position).
func BenchmarkStoragePlaceRow(b *testing.B) {
	w := sharedBenchWorld(b, 0, 10000)
	var writable []string
	for _, id := range w.rows {
		if !w.private[id] {
			writable = append(writable, id)
		}
	}
	rng := rand.New(rand.NewPCG(benchSeed(), 22))
	var l latencies
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		id, anchor := writable[rng.IntN(len(writable))], writable[rng.IntN(len(writable))]
		body := `{"after":"` + anchor + `"}`
		l.time(func() {
			rec := httptest.NewRecorder()
			req := httptest.NewRequest("POST", "/api/pages/"+id+"/place", strings.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Cookie", w.memberCookie())
			w.s.ServeHTTP(rec, req)
			if rec.Code != 200 {
				b.Errorf("place: %d %s", rec.Code, rec.Body.String())
			}
		})
	}
	l.report(b)
}
