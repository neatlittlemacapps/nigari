package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

// The 5 s read limit (spec 002, contracts/limits.md), checked on the path
// where it matters: a read that runs too long. The pool holds one connection,
// so a read without a limit stops every request behind it; these tests make
// sure a long read gives the connection back, says why, and returns nothing
// half-done.
//
// The limit is shortened to a millisecond. A sorted query over 20k rows takes
// tens of milliseconds on any machine (spec 002 benchmarks), so it always runs
// out.

// slowReadFixture builds a database of 20k rows, sortable on a number property
// stored inside the JSON props, so the sort cannot use an index.
func slowReadFixture(t *testing.T) (s *Server, u *user, cookie, col, firstRow string) {
	t.Helper()
	s = testServer(t)
	uid, cookie := signedIn(t, s, "limits@example.test")
	u = &user{ID: uid, Name: "Test"}
	ws := s.firstWorkspaceOf(t, uid)
	col = newID()
	if _, err := s.db.Exec(`INSERT INTO pages (id, parent_id, workspace_id, owner_id, title, type, props, created_at, updated_at)
		VALUES (?, NULL, ?, ?, 'Big', 'collection', '{}', ?, ?)`, col, ws, uid, now(), now()); err != nil {
		t.Fatal(err)
	}
	if _, err := s.db.Exec(`INSERT INTO collections (page_id, schema, views) VALUES (?, ?, '[]')`,
		col, `[{"id":"n","name":"N","type":"number"}]`); err != nil {
		t.Fatal(err)
	}
	tx, err := s.db.Begin()
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 20000; i++ {
		id := newID()
		if i == 0 {
			firstRow = id
		}
		if _, err := tx.Exec(`INSERT INTO pages (id, parent_id, workspace_id, owner_id, title, type, props, position, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, 'row', ?, ?, ?, ?)`,
			id, col, ws, uid, fmt.Sprintf("Row %d", i), fmt.Sprintf(`{"n":%d}`, (i*7919)%20000), i, now(), now()); err != nil {
			t.Fatal(err)
		}
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	return s, u, cookie, col, firstRow
}

// shortReadLimit sets readLimit for one test and puts it back afterwards.
func shortReadLimit(t *testing.T, d time.Duration) {
	t.Helper()
	old := readLimit
	readLimit = d
	t.Cleanup(func() { readLimit = old })
}

func TestQueryTimeoutStopsTheReadAndReturnsNothingPartial(t *testing.T) {
	s, u, _, col, _ := slowReadFixture(t)
	shortReadLimit(t, time.Millisecond)

	list, total, err := s.collectionRowsQuery(context.Background(), u, col, nil, nil, "n:desc", 500, 0, time.Time{})
	if !errors.Is(err, errQueryTimeout) {
		t.Fatalf("err = %v, want errQueryTimeout", err)
	}
	if list != nil || total != 0 {
		t.Fatalf("a stopped read returned %d rows (total %d); it must return nothing", len(list), total)
	}
}

// The point of the limit: the one connection comes back. A write issued while
// the read runs must complete, and soon after the limit, not after the read.
func TestQueryTimeoutLetsAConcurrentWriteThrough(t *testing.T) {
	s, u, _, col, firstRow := slowReadFixture(t)
	shortReadLimit(t, 10*time.Millisecond)

	var wg sync.WaitGroup
	wg.Add(1)
	var readErrV error
	go func() {
		defer wg.Done()
		_, _, readErrV = s.collectionRowsQuery(context.Background(), u, col, nil, nil, "n:desc", 500, 0, time.Time{})
	}()
	time.Sleep(2 * time.Millisecond) // let the read take the connection first
	start := time.Now()
	if _, err := s.db.Exec(`UPDATE pages SET title = 'Written' WHERE id = ?`, firstRow); err != nil {
		t.Fatalf("write during a long read: %v", err)
	}
	if waited := time.Since(start); waited > 2*time.Second {
		t.Fatalf("the write waited %v; the limit did not give the connection back", waited)
	}
	wg.Wait()
	if !errors.Is(readErrV, errQueryTimeout) {
		t.Fatalf("read err = %v, want errQueryTimeout", readErrV)
	}
	var title string
	s.db.QueryRow(`SELECT title FROM pages WHERE id = ?`, firstRow).Scan(&title)
	if title != "Written" {
		t.Fatalf("title = %q; the write was lost", title)
	}
}

// REST answers 503 with the code the browser translates, not a 500.
func TestQueryTimeoutOverRESTIs503WithItsCode(t *testing.T) {
	s, _, cookie, col, _ := slowReadFixture(t)
	shortReadLimit(t, time.Millisecond)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/api/collections/"+col+"/rows?sort=n:desc&limit=500", nil)
	req.Header.Set("Cookie", cookie)
	s.ServeHTTP(rec, req)
	if rec.Code != 503 {
		t.Fatalf("status = %d, want 503; body %s", rec.Code, rec.Body.String())
	}
	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("body: %v", err)
	}
	if body["code"] != "query_timeout" || body["error"] != errQueryTimeout.Error() {
		t.Fatalf("body = %v, want code query_timeout and the contract sentence", body)
	}
}

// MCP gets the same refusal through the same code path: a tool error carrying
// the same sentence, and no rows.
func TestQueryTimeoutOverMCPIsAToolErrorWithTheSameSentence(t *testing.T) {
	s, u, _, col, _ := slowReadFixture(t)
	shortReadLimit(t, time.Millisecond)

	out, err := callTool(t, s, u, "query_rows", `{"page_id":"`+col+`","sort":"n:desc","limit":500}`)
	if err == nil {
		t.Fatalf("query_rows succeeded past the limit: %.200s", out)
	}
	if !strings.Contains(err.Error(), errQueryTimeout.Error()) {
		t.Fatalf("err = %v, want the contract sentence", err)
	}
}

// And with the real limit the same read simply works: the limit must not cost
// an ordinary query anything.
func TestReadLimitLeavesAnOrdinaryReadAlone(t *testing.T) {
	s, u, _, col, _ := slowReadFixture(t)
	list, total, err := s.collectionRowsQuery(context.Background(), u, col, nil, nil, "n:desc", 50, 0, time.Time{})
	if err != nil {
		t.Fatalf("read under the 5 s limit: %v", err)
	}
	if total != 20000 || len(list) != 50 {
		t.Fatalf("got %d rows of %d, want 50 of 20000", len(list), total)
	}
}
