package server

// i18n-ok-file: the generated page text is German on purpose; full-text search must fold it.

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"math/rand/v2"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"sync"
	"testing"
	"testing/fstest"
	"time"
)

// The seeded workspace the storage benchmarks run against (spec 002, research
// P2 and data-model.md).
//
// Why a generator and not a fixture file: the question spec 002 answers ("is
// SQLite enough at team scale?") is about sizes — 20k pages, 100k rows — and
// a checked-in database of that size would be a binary blob nobody can read in
// a diff. A seed reproduces the same workspace on every machine, so two runs
// of benchstat compare the code, not the data.
//
// Rows are inserted with plain SQL inside one transaction, the way the tests'
// makePage does, because going through the HTTP handlers would take minutes
// at 100k rows. What the server derives from a page (the search index, the
// passage chunks, the link table) is then built by the server's own
// reindexPage, so search runs against exactly what production would have.

const benchDefaultSeed = 20261026

func benchSeed() uint64 {
	if v, err := strconv.ParseUint(os.Getenv("BENCH_SEED"), 10, 64); err == nil {
		return v
	}
	return benchDefaultSeed
}

// benchLarge turns on the 100k-row sizes. They take a while to build, and
// `go test ./...` has to stay fast.
func benchLarge() bool { return os.Getenv("BENCH_LARGE") == "1" }

type benchWorld struct {
	s   *Server
	dir string
	ws  string
	// accounts[0] is the owner. Benchmarks run as accounts[1], a plain member,
	// so permission filtering is part of what they measure.
	accounts []*user
	cookies  []string

	pages     []string // ordinary pages, in creation order
	projects  string   // the 1k-row database the rows relate to
	rowsDB    string   // the database under test
	rows      []string
	private   map[string]bool // rows private to someone other than accounts[1]
	searchFor string          // a word the generated text contains
}

func (w *benchWorld) member() *user        { return w.accounts[1] }
func (w *benchWorld) memberCookie() string { return w.cookies[1] }

// Words for page text. German is there for the folding and the plural
// ("Verträge" stored, "vertrag" searched), English beside it because real
// workspaces mix both.
var benchWords = strings.Fields(`Vertrag Verträge Angebot Rechnung Lieferung Kunde Kunden
	Projekt Projekte Besprechung Übersicht Planung Prüfung Änderung Zahlung Frist Bericht
	contract invoice delivery customer project meeting overview planning review change
	payment deadline report budget roadmap release feature migration backup search`)

var benchStages = []string{"s1", "s2", "s3", "s4", "s5", "s6"}
var benchTags = []string{"t1", "t2", "t3", "t4"}

// buildBenchWorld builds a workspace with the given number of pages and rows.
// pages and rows may be 0. The data directory is the caller's to remove.
func buildBenchWorld(tb testing.TB, dir string, seed uint64, pages, rows int) *benchWorld {
	tb.Helper()
	rng := rand.New(rand.NewPCG(seed, seed^0x9e3779b97f4a7c15))
	id := func() string { return fmt.Sprintf("%016x%016x", rng.Uint64(), rng.Uint64()) }

	dist := fstest.MapFS{"index.html": {Data: []byte("<html></html>")}}
	s, err := New(dir, dist)
	if err != nil {
		tb.Fatalf("New: %v", err)
	}
	w := &benchWorld{s: s, dir: dir, ws: id(), private: map[string]bool{}, searchFor: "vertrag"}

	tx, err := s.db.Begin()
	if err != nil {
		tb.Fatalf("begin: %v", err)
	}
	exec := func(q string, args ...any) {
		if _, err := tx.Exec(q, args...); err != nil {
			tb.Fatalf("%s: %v", strings.Fields(q)[0:3], err)
		}
	}
	ts := "2026-10-26T00:00:00Z"
	exec(`INSERT INTO workspaces (id, name, created_at) VALUES (?, 'Bench', ?)`, w.ws, ts)
	for i := 0; i < 5; i++ {
		uid := id()
		role := "member"
		if i == 0 {
			role = "owner"
		}
		exec(`INSERT INTO users (id, email, name, color, password_hash, is_admin, created_at)
			VALUES (?, ?, ?, '#2f7d4f', 'x', ?, ?)`, uid, fmt.Sprintf("bench%d@example.test", i),
			fmt.Sprintf("Bench %d", i), i == 0, ts)
		exec(`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)`, w.ws, uid, role)
		w.accounts = append(w.accounts, &user{ID: uid, Name: fmt.Sprintf("Bench %d", i)})
	}
	page := func(pid, parent, title, content, props, owner, visibility, typ string) {
		var p any
		if parent != "" {
			p = parent
		}
		exec(`INSERT INTO pages (id, parent_id, title, icon, content, props, position, created_at, updated_at,
			workspace_id, owner_id, visibility, type) VALUES (?, ?, ?, '', ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
			pid, p, title, content, props, ts, ts, w.ws, owner, visibility, typ)
	}

	// Pages: a tree up to depth 4 (a root is depth 1), 30% with 2–40 blocks of
	// text.
	type node struct {
		id    string
		depth int
	}
	var tree []node
	for i := 0; i < pages; i++ {
		pid, parent, depth := id(), "", 1
		if len(tree) > 0 && rng.IntN(10) < 8 {
			n := tree[rng.IntN(len(tree))]
			if n.depth < 4 {
				parent, depth = n.id, n.depth+1
			}
		}
		content := "[]"
		if rng.IntN(10) < 3 {
			content = benchContent(rng, 2+rng.IntN(39))
		}
		page(pid, parent, fmt.Sprintf("Page %d %s", i, benchWords[rng.IntN(len(benchWords))]),
			content, "{}", w.accounts[rng.IntN(5)].ID, "workspace", "doc")
		tree = append(tree, node{pid, depth})
		w.pages = append(w.pages, pid)
	}

	// Databases: 1k projects with a budget, and the rows under test, each
	// related to one project and rolling up its budget.
	if rows > 0 {
		w.projects = id()
		page(w.projects, "", "Projects", "[]", "{}", w.accounts[0].ID, "workspace", "collection")
		exec(`INSERT INTO collections (page_id, schema, views) VALUES (?, ?, '[]')`, w.projects,
			`[{"id":"budget","name":"Budget","type":"number"}]`)
		projectRows := make([]string, 1000)
		for i := range projectRows {
			projectRows[i] = id()
			page(projectRows[i], w.projects, fmt.Sprintf("Project %d", i), "[]",
				fmt.Sprintf(`{"budget":%d}`, 1000+rng.IntN(99000)), w.accounts[0].ID, "workspace", "doc")
		}

		w.rowsDB = id()
		page(w.rowsDB, "", "Tasks", "[]", "{}", w.accounts[0].ID, "workspace", "collection")
		opts := func(ids []string) string {
			var o []string
			for _, v := range ids {
				o = append(o, fmt.Sprintf(`{"id":%q,"name":%q}`, v, strings.ToUpper(v)))
			}
			return "[" + strings.Join(o, ",") + "]"
		}
		exec(`INSERT INTO collections (page_id, schema, views) VALUES (?, ?, '[]')`, w.rowsDB, `[
			{"id":"stage","name":"Stage","type":"select","options":`+opts(benchStages)+`},
			{"id":"tags","name":"Tags","type":"multiselect","options":`+opts(benchTags)+`},
			{"id":"due","name":"Due","type":"date"},
			{"id":"amount","name":"Amount","type":"number"},
			{"id":"assignee","name":"Assignee","type":"person"},
			{"id":"project","name":"Project","type":"relation","relationCollection":"`+w.projects+`"},
			{"id":"budget","name":"Budget","type":"rollup","rollupRelation":"project","rollupTarget":"budget","rollupAgg":"sum"}]`)
		for i := 0; i < rows; i++ {
			rid := id()
			props, _ := json.Marshal(map[string]any{
				"stage":    benchStages[rng.IntN(len(benchStages))],
				"tags":     []string{benchTags[rng.IntN(len(benchTags))]},
				"due":      fmt.Sprintf("2026-%02d-%02d", 1+rng.IntN(12), 1+rng.IntN(28)),
				"amount":   rng.IntN(10000),
				"assignee": []string{w.accounts[rng.IntN(5)].ID},
				"project":  []string{projectRows[rng.IntN(len(projectRows))]},
			})
			owner, visibility := w.accounts[rng.IntN(5)].ID, "workspace"
			// 10% private to someone else: never the member the benchmarks run
			// as, so every one of them must be filtered out.
			if rng.IntN(10) == 0 {
				others := []*user{w.accounts[0], w.accounts[2], w.accounts[3], w.accounts[4]}
				owner, visibility = others[rng.IntN(len(others))].ID, "private"
				w.private[rid] = true
			}
			page(rid, w.rowsDB, fmt.Sprintf("Task %d", i), "[]", string(props), owner, visibility, "doc")
			w.rows = append(w.rows, rid)
		}
	}
	if err := tx.Commit(); err != nil {
		tb.Fatalf("commit: %v", err)
	}

	// The search index and passages, built by the server itself. Outside the
	// transaction: reindexPage runs its own statements on the one connection.
	for _, pid := range w.pages {
		if err := s.reindexPage(pid); err != nil {
			tb.Fatalf("reindex: %v", err)
		}
	}
	for _, a := range w.accounts {
		tok, err := s.createSession(a.ID)
		if err != nil {
			tb.Fatalf("session: %v", err)
		}
		w.cookies = append(w.cookies, sessionCookie+"="+tok)
	}
	return w
}

func benchContent(rng *rand.Rand, blocks int) string {
	out := make([]string, blocks)
	for i := range out {
		words := make([]string, 6+rng.IntN(20))
		for j := range words {
			words[j] = benchWords[rng.IntN(len(benchWords))]
		}
		out[i] = fmt.Sprintf(`{"id":"b%d","type":"paragraph","props":{},"content":[{"type":"text","text":%q,"styles":{}}],"children":[]}`,
			i, strings.Join(words, " ")+".")
	}
	return "[" + strings.Join(out, ",") + "]"
}

// fingerprint describes the generated workspace's pages, so two builds from
// one seed can be compared. Only the bench workspace: New() creates a starter
// workspace of its own, with random ids.
func (w *benchWorld) fingerprint(tb testing.TB) string {
	tb.Helper()
	rows, err := w.s.db.Query(`SELECT id, COALESCE(parent_id, ''), title, content, props, owner_id, visibility
		FROM pages WHERE workspace_id = ? ORDER BY id`, w.ws)
	if err != nil {
		tb.Fatalf("fingerprint: %v", err)
	}
	defer rows.Close()
	var b strings.Builder
	for rows.Next() {
		var f [7]sql.NullString
		if err := rows.Scan(&f[0], &f[1], &f[2], &f[3], &f[4], &f[5], &f[6]); err != nil {
			tb.Fatalf("scan: %v", err)
		}
		for _, v := range f {
			b.WriteString(v.String)
			b.WriteByte('\t')
		}
		b.WriteByte('\n')
	}
	return b.String()
}

// Worlds are expensive to build (seconds at 20k pages, longer at 100k rows),
// and Go calls a benchmark function several times while it sizes b.N. They are
// built once per size and process, and removed in TestMain.
var (
	benchWorldsMu sync.Mutex
	benchWorlds   = map[string]*benchWorld{}
)

func sharedBenchWorld(b *testing.B, pages, rows int) *benchWorld {
	b.Helper()
	benchWorldsMu.Lock()
	defer benchWorldsMu.Unlock()
	key := fmt.Sprintf("%d/%d/%d", benchSeed(), pages, rows)
	if w, ok := benchWorlds[key]; ok {
		return w
	}
	dir, err := os.MkdirTemp("", "salt-bench-")
	if err != nil {
		b.Fatalf("temp dir: %v", err)
	}
	w := buildBenchWorld(b, dir, benchSeed(), pages, rows)
	benchWorlds[key] = w
	return w
}

func TestMain(m *testing.M) {
	code := m.Run()
	for _, w := range benchWorlds {
		w.s.Close()
		os.RemoveAll(w.dir)
	}
	os.Exit(code)
}

// The benchmarks compare runs across commits, so the workspace must be the
// same every time: a generator that drifted would show up as a regression in
// code nobody touched.
func TestBenchWorldIsReproducible(t *testing.T) {
	a := buildBenchWorld(t, t.TempDir(), 7, 60, 300)
	defer a.s.Close()
	b := buildBenchWorld(t, t.TempDir(), 7, 60, 300)
	defer b.s.Close()
	if a.fingerprint(t) != b.fingerprint(t) {
		t.Fatal("two builds from seed 7 differ")
	}
	c := buildBenchWorld(t, t.TempDir(), 8, 60, 300)
	defer c.s.Close()
	if a.fingerprint(t) == c.fingerprint(t) {
		t.Fatal("seeds 7 and 8 built the same workspace; the seed is not used")
	}
}

// The benchmarks claim to measure permission filtering. That only holds if the
// member really is refused the private rows of others, and sees the rest.
func TestBenchWorldMemberSeesExactlyTheRowsNotPrivateToOthers(t *testing.T) {
	w := buildBenchWorld(t, t.TempDir(), benchDefaultSeed, 40, 400)
	defer w.s.Close()
	if len(w.private) == 0 {
		t.Fatal("no private rows were generated; the filter would go unmeasured")
	}
	list, total, err := w.s.collectionRowsQuery(w.member(), w.rowsDB, nil, nil, "", 500, 0, benchDay)
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	if want := len(w.rows) - len(w.private); total != want || len(list) != want {
		t.Errorf("member sees %d rows (total %d), want %d", len(list), total, want)
	}
	for _, r := range list {
		if id, _ := r["id"].(string); w.private[id] {
			t.Errorf("member sees row %s, private to someone else", id)
		}
	}
	// And the search index the search benchmark relies on exists: the folded
	// word finds pages for the member.
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/api/search?q="+w.searchFor, nil)
	req.Header.Set("Cookie", w.memberCookie())
	w.s.ServeHTTP(rec, req)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"id"`) {
		t.Errorf("search for %q found nothing: %d %s", w.searchFor, rec.Code, rec.Body.String())
	}
}

// Nearest rank: the p95 of 1..20 is 19, of 1..200 is 190, and a single sample
// is every percentile.
func TestPercentileIsNearestRank(t *testing.T) {
	seq := func(n int) []time.Duration {
		d := make([]time.Duration, n)
		for i := range d {
			d[i] = time.Duration(i + 1)
		}
		return d
	}
	for _, c := range []struct {
		n    int
		p    float64
		want time.Duration
	}{{20, 95, 19}, {200, 95, 190}, {200, 50, 100}, {1, 95, 1}} {
		if got := percentile(seq(c.n), c.p); got != c.want {
			t.Errorf("p%v of 1..%d = %d, want %d", c.p, c.n, got, c.want)
		}
	}
}
