package server

import (
	"testing"
)

// #75: reindexPage deleted a page's search entries by an UNINDEXED column, so
// every save read the whole index. It now deletes by the rowid it recorded.
// What must hold: a reindex replaces exactly the page's own entries, never
// another page's, and the one-time rebuild leaves every page findable again.

func ftsCount(t *testing.T, s *Server, q string, args ...any) int {
	t.Helper()
	var n int
	if err := s.db.QueryRow(q, args...).Scan(&n); err != nil {
		t.Fatalf("%s: %v", q, err)
	}
	return n
}

func TestReindexReplacesOnlyThePagesOwnEntries(t *testing.T) {
	s := testServer(t)
	uid, _ := signedIn(t, s, "fts@example.test")
	ws := s.firstWorkspaceOf(t, uid)

	a := s.makePage(t, ws, uid, "", "Alpha", `{}`)
	b := s.makePage(t, ws, uid, "", "Beta", `{}`)
	setText := func(id, text string) {
		t.Helper()
		content := `[` + para("p1", text) + `,` + para("p2", text+" again") + `]`
		if _, err := s.db.Exec(`UPDATE pages SET content = ? WHERE id = ?`, content, id); err != nil {
			t.Fatal(err)
		}
		if err := s.reindexPage(id); err != nil {
			t.Fatalf("reindex: %v", err)
		}
	}
	setText(a, "quartz harbour")
	setText(b, "copper meadow")
	setText(a, "violet canyon") // the second reindex must replace, not add

	if n := ftsCount(t, s, `SELECT COUNT(*) FROM pages_fts WHERE id = ?`, a); n != 1 {
		t.Errorf("page A has %d entries in pages_fts, want 1", n)
	}
	// Short paragraphs are joined into one passage, so the count to match is
	// page_chunks', not the number of paragraphs.
	want := ftsCount(t, s, `SELECT COUNT(*) FROM page_chunks WHERE page_id = ?`, a)
	if n := ftsCount(t, s, `SELECT COUNT(*) FROM chunks_fts WHERE chunk_id IN (SELECT id FROM page_chunks WHERE page_id = ?)`, a); want == 0 || n != want {
		t.Errorf("page A has %d passages in chunks_fts for %d in page_chunks", n, want)
	}
	// Nothing left behind under ids that no longer exist.
	if n := ftsCount(t, s, `SELECT COUNT(*) FROM chunks_fts WHERE chunk_id NOT IN (SELECT id FROM page_chunks)`); n != 0 {
		t.Errorf("%d passages in chunks_fts belong to no page_chunks row", n)
	}
	if n := ftsCount(t, s, `SELECT COUNT(*) FROM pages_fts WHERE pages_fts MATCH 'quartz'`); n != 0 {
		t.Error("the old text of page A is still found")
	}
	if n := ftsCount(t, s, `SELECT COUNT(*) FROM pages_fts WHERE pages_fts MATCH 'violet'`); n != 1 {
		t.Error("the new text of page A is not found")
	}
	if n := ftsCount(t, s, `SELECT COUNT(*) FROM chunks_fts WHERE chunks_fts MATCH 'copper'`); n != 1 {
		t.Error("reindexing page A removed page B's passage")
	}
}

// A rowid FTS5 hands out again must not let one page's reindex delete
// another's entry: the id check beside the rowid is what stops it.
func TestReindexIgnoresARowidThatIsNoLongerThePages(t *testing.T) {
	s := testServer(t)
	uid, _ := signedIn(t, s, "reuse@example.test")
	ws := s.firstWorkspaceOf(t, uid)
	a := s.makePage(t, ws, uid, "", "Amber", `{}`)
	b := s.makePage(t, ws, uid, "", "Basalt", `{}`)
	s.reindexPage(a)
	s.reindexPage(b)
	// Point A's record at B's entry, as a reused rowid would.
	if _, err := s.db.Exec(`UPDATE pages SET fts_rowid = (SELECT fts_rowid FROM pages WHERE id = ?) WHERE id = ?`, b, a); err != nil {
		t.Fatal(err)
	}
	s.reindexPage(a)
	if n := ftsCount(t, s, `SELECT COUNT(*) FROM pages_fts WHERE id = ?`, b); n != 1 {
		t.Errorf("page B has %d entries after A's reindex, want 1", n)
	}
}

// Instances indexed by an older build have no rowids recorded. The version
// bump rebuilds the index once, and afterwards every page has its entry and
// its rowid.
func TestSearchIndexRebuildRecordsEveryRowid(t *testing.T) {
	s := testServer(t)
	uid, _ := signedIn(t, s, "rebuild@example.test")
	ws := s.firstWorkspaceOf(t, uid)
	for _, title := range []string{"One", "Two", "Three"} {
		s.reindexPage(s.makePage(t, ws, uid, "", title, `{}`))
	}
	// As an old build left it: no rowids, an older version.
	s.db.Exec(`UPDATE pages SET fts_rowid = NULL`)
	s.db.Exec(`UPDATE page_chunks SET fts_rowid = NULL`)
	s.setSetting("fts_version", "3")
	if err := s.migrateSearchIndex(); err != nil {
		t.Fatalf("rebuild: %v", err)
	}
	live := ftsCount(t, s, `SELECT COUNT(*) FROM pages WHERE trashed_at IS NULL`)
	if n := ftsCount(t, s, `SELECT COUNT(*) FROM pages WHERE trashed_at IS NULL AND fts_rowid IS NULL`); n != 0 {
		t.Errorf("%d of %d pages have no rowid after the rebuild", n, live)
	}
	if n := ftsCount(t, s, `SELECT COUNT(*) FROM pages_fts`); n != live {
		t.Errorf("pages_fts has %d entries for %d pages", n, live)
	}
	if n := ftsCount(t, s, `SELECT COUNT(*) FROM page_chunks WHERE fts_rowid IS NULL`); n != 0 {
		t.Errorf("%d passages have no rowid after the rebuild", n)
	}
}
