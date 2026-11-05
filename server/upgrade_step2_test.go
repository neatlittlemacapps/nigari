package server

import (
	"database/sql"
	"strings"
	"testing"
)

// Step 2 (spec 013) on a database written by the code just before it
// (step-1.db): the personal view state table and the views lock columns
// appear, nothing stored before is lost or changed, and a second start finds
// nothing to do. A step that ran twice, or rewrote the collections it added
// columns to, would fail here before it reached anyone's instance.
func TestUpgradeStepTwoAddsViewPrefsAndLock(t *testing.T) {
	path := copyFixture(t, "step-1.db")
	if got := stepOf(t, path); got != 1 {
		t.Fatalf("step-1.db is at step %d, want 1", got)
	}
	read := func(q string, args ...any) []string {
		t.Helper()
		db, err := sql.Open("sqlite", "file:"+path+"?mode=ro")
		if err != nil {
			t.Fatal(err)
		}
		defer db.Close()
		rows, err := db.Query(q, args...)
		if err != nil {
			t.Fatal(err)
		}
		defer rows.Close()
		var out []string
		for rows.Next() {
			var s string
			if err := rows.Scan(&s); err != nil {
				t.Fatal(err)
			}
			out = append(out, s)
		}
		return out
	}
	collectionsBefore := read(`SELECT page_id || '|' || schema || '|' || views FROM collections ORDER BY page_id`)
	pagesBefore := read(`SELECT id || '|' || title || '|' || props FROM pages ORDER BY id`)
	if len(collectionsBefore) == 0 {
		t.Fatal("step-1.db has no database to carry through the step")
	}

	ran, err := upgradeDB(path)
	if err != nil {
		t.Fatalf("upgrade: %v", err)
	}
	if len(ran) != 1 || ran[0] != 2 {
		t.Fatalf("steps run: %v, want [2]", ran)
	}
	shape := dbShape(t, path)
	for _, want := range []string{
		"table view_prefs: CREATE TABLE view_prefs ( user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, collection_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE, scope TEXT NOT NULL, state TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, collection_id, scope) )",
		"index view_prefs_collection: CREATE INDEX view_prefs_collection ON view_prefs(collection_id)",
		"column collections.views_locked_by TEXT notnull=1 default=''",
		"column collections.views_locked_at TEXT notnull=1 default=''",
	} {
		if !strings.Contains(shape, want) {
			t.Errorf("after step 2 the database lacks %q", want)
		}
	}
	if got := read(`SELECT page_id || '|' || schema || '|' || views FROM collections ORDER BY page_id`); strings.Join(got, "\n") != strings.Join(collectionsBefore, "\n") {
		t.Errorf("step 2 changed the databases' schema or views:\nbefore %v\nafter  %v", collectionsBefore, got)
	}
	if got := read(`SELECT page_id FROM collections WHERE views_locked_by <> '' OR views_locked_at <> ''`); len(got) != 0 {
		t.Errorf("databases came out of step 2 locked: %v", got)
	}
	if got := read(`SELECT id || '|' || title || '|' || props FROM pages ORDER BY id`); strings.Join(got, "\n") != strings.Join(pagesBefore, "\n") {
		t.Errorf("step 2 changed the pages")
	}

	// A second start: no step pending, the shape exactly as the first left it.
	ran, err = upgradeDB(path)
	if err != nil {
		t.Fatalf("second start: %v", err)
	}
	if len(ran) != 0 {
		t.Errorf("a second start ran steps %v, want none", ran)
	}
	if again := dbShape(t, path); again != shape {
		t.Errorf("a second start changed the database:\n%s", lineDiff(shape, again))
	}
}

// The foreign keys of view_prefs are what clean it up (data-model.md): a
// person's rows go with the account, a database's with its page. Without
// them a deleted account would leave its view state behind for good, since no
// delete path has cleanup code for the table.
func TestViewPrefsGoWithAccountAndDatabase(t *testing.T) {
	s := testServer(t)
	a, _ := signedIn(t, s, "prefs-a@example.test")
	b, _ := signedIn(t, s, "prefs-b@example.test")
	col1, col2 := newID(), newID()
	for _, id := range []string{col1, col2} {
		if _, err := s.db.Exec(`INSERT INTO pages (id, title, content, created_at, updated_at, type) VALUES (?, 'db', '', ?, ?, 'collection')`, id, now(), now()); err != nil {
			t.Fatal(err)
		}
	}
	put := func(uid, col string) {
		t.Helper()
		if _, err := s.db.Exec(`INSERT INTO view_prefs (user_id, collection_id, scope, state, updated_at) VALUES (?, ?, 'table', '{}', ?)`, uid, col, now()); err != nil {
			t.Fatal(err)
		}
	}
	put(a, col1)
	put(a, col2)
	put(b, col1)
	count := func(q string, args ...any) int {
		t.Helper()
		var n int
		if err := s.db.QueryRow(q, args...).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	if _, err := s.db.Exec(`DELETE FROM pages WHERE id = ?`, col1); err != nil {
		t.Fatal(err)
	}
	if n := count(`SELECT COUNT(*) FROM view_prefs WHERE collection_id = ?`, col1); n != 0 {
		t.Errorf("%d view_prefs rows outlived their database", n)
	}
	if _, err := s.db.Exec(`DELETE FROM users WHERE id = ?`, a); err != nil {
		t.Fatal(err)
	}
	if n := count(`SELECT COUNT(*) FROM view_prefs WHERE user_id = ?`, a); n != 0 {
		t.Errorf("%d view_prefs rows outlived their account", n)
	}
	if n := count(`SELECT COUNT(*) FROM view_prefs`); n != 0 {
		t.Errorf("%d rows left, want 0 (b's row went with col1)", n)
	}
}
