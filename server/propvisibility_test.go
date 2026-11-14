package server

import (
	"strings"
	"testing"
	"testing/fstest"
)

// A property's visibility on a row's page (spec 015, research R1, R2): every
// door that writes a schema stores "hide_empty" and "hide", turns "show" into
// no key at all (absent is shown), and refuses anything else without storing
// it. The REST route used to store a schema as sent without looking inside,
// so a script could have stored a value no row's page knows how to draw.
func TestEveryDoorChecksARowPagesPropertyVisibility(t *testing.T) {
	s := testServer(t)
	uid, cookie := signedIn(t, s, "visibility@example.test")
	u := &user{ID: uid, Name: "Test"}

	out, err := callTool(t, s, u, "create_database", `{"title":"Tasks","schema":[
		{"id":"due","name":"Due","type":"date","pageVisibility":"hide_empty"},
		{"id":"notes","name":"Notes","type":"text","pageVisibility":"hide"},
		{"id":"owner","name":"Owner","type":"text","pageVisibility":"show"}]}`)
	if err != nil {
		t.Fatalf("create_database: %v", err)
	}
	db := idFromToolAnswer(t, out)
	visibility := func() map[string]any {
		schema, _, err := s.loadCollection(db)
		if err != nil {
			t.Fatal(err)
		}
		got := map[string]any{}
		for _, p := range schema {
			id, _ := p["id"].(string)
			if v, ok := p[pageVisibilityKey]; ok {
				got[id] = v
			}
		}
		return got
	}
	if got := visibility(); got["due"] != "hide_empty" || got["notes"] != "hide" || len(got) != 2 {
		t.Fatalf("create_database stored %#v, want due hide_empty, notes hide, owner without the key", got)
	}

	// update_schema merges: "show" puts a property back by removing the key.
	if _, err := callTool(t, s, u, "update_schema", `{"page_id":"`+db+`","properties":[{"id":"notes","pageVisibility":"show"},{"id":"owner","pageVisibility":"hide"}]}`); err != nil {
		t.Fatalf("update_schema: %v", err)
	}
	if got := visibility(); got["notes"] != nil || got["owner"] != "hide" || got["due"] != "hide_empty" {
		t.Fatalf("after update_schema: %#v", got)
	}

	// REST: the schema as the interface sends it, every other key kept.
	put := `[{"id":"due","name":"Due","type":"date","pageVisibility":"hide"},{"id":"notes","name":"Notes","type":"text","pageVisibility":"show"},{"id":"owner","name":"Owner","type":"text"}]`
	if rec := requestAs(t, s, cookie, "PUT", "/api/collections/"+db, `{"schema":`+put+`}`); rec.Code != 200 {
		t.Fatalf("PUT: %d %s", rec.Code, rec.Body.String())
	}
	if got := visibility(); got["due"] != "hide" || len(got) != 1 {
		t.Fatalf("after PUT: %#v, want only due hide", got)
	}
	schema, _, _ := s.loadCollection(db)
	if name, _ := schema[0]["name"].(string); name != "Due" || len(schema) != 3 {
		t.Fatalf("PUT lost something else: %#v", schema)
	}

	// Anything else is refused on all three doors, and nothing is stored.
	for _, bad := range []string{`"hidden"`, `"HIDE"`, `true`, `3`} {
		rec := requestAs(t, s, cookie, "PUT", "/api/collections/"+db, `{"schema":[{"id":"due","name":"Due","type":"date","pageVisibility":`+bad+`}]}`)
		if rec.Code != 400 || !strings.Contains(rec.Body.String(), "invalid_property_visibility") {
			t.Errorf("PUT %s: %d %s, want 400 invalid_property_visibility", bad, rec.Code, rec.Body.String())
		}
		if _, err := callTool(t, s, u, "update_schema", `{"page_id":"`+db+`","properties":[{"id":"due","pageVisibility":`+bad+`}]}`); err == nil || !strings.Contains(err.Error(), "hide_empty") {
			t.Errorf("update_schema %s: %v, want a refusal naming the values", bad, err)
		}
		if _, err := callTool(t, s, u, "create_database", `{"title":"Refused","schema":[{"name":"X","type":"text","pageVisibility":`+bad+`}]}`); err == nil {
			t.Errorf("create_database %s: accepted", bad)
		}
		if got := visibility(); got["due"] != "hide" || len(got) != 1 {
			t.Errorf("after refused %s: %#v changed", bad, got)
		}
	}
}

// A workspace archive is a door too (review finding, spec 015): a value no
// row page can draw is dropped on import, so that property shows, and the
// database stays changeable. Stored as it came, it would make every later
// save of the database refused, update_schema's and the interface's alike,
// since both check the whole schema they write. A good value and "show" are
// imported the way the other doors store them.
func TestAnArchiveImportKeepsOnlyRowPageVisibilityItCanDraw(t *testing.T) {
	s := testServer(t)
	uid, _ := signedIn(t, s, "importer@example.test")
	u := &user{ID: uid, Name: "Test", IsAdmin: true}
	archive := fstest.MapFS{
		manifestFile: {Data: []byte(`{"format":1,"workspace":{"name":"Imported"}}`)},
		"pages.json": {Data: []byte(`[{"id":"db","title":"Tasks","type":"collection","schema":[
			{"id":"a","name":"A","type":"text","pageVisibility":"sideways"},
			{"id":"b","name":"B","type":"text","pageVisibility":"hide"},
			{"id":"c","name":"C","type":"text","pageVisibility":"show"},
			{"id":"d","name":"D","type":"text"}],"views":[]}]`)},
	}
	if _, err := s.importWorkspaceFS(u, archive, importOptions{}); err != nil {
		t.Fatalf("import: %v", err)
	}
	var db string
	if err := s.db.QueryRow(`SELECT id FROM pages WHERE title = 'Tasks' AND type = 'collection'`).Scan(&db); err != nil {
		t.Fatalf("the imported database: %v", err)
	}
	schema, _, _ := s.loadCollection(db)
	got := map[string]any{}
	for _, p := range schema {
		id, _ := p["id"].(string)
		got[id] = p[pageVisibilityKey]
	}
	if got["a"] != nil || got["b"] != "hide" || got["c"] != nil || got["d"] != nil || len(schema) != 4 {
		t.Fatalf("imported %#v, want only b hide", got)
	}
	// And the database can still be changed.
	if _, err := callTool(t, s, u, "update_schema", `{"page_id":"`+db+`","properties":[{"id":"d","name":"Dee"}]}`); err != nil {
		t.Errorf("update_schema after the import: %v", err)
	}
}

// A schema sent over REST that is valid JSON but not a list of properties
// used to be stored as sent; the visibility check has to read it, so it is
// refused now (review finding: stated in the pull request).
func TestAPutSchemaThatIsNotAListIsRefused(t *testing.T) {
	s := testServer(t)
	uid, cookie := signedIn(t, s, "notalist@example.test")
	u := &user{ID: uid, Name: "Test"}
	out, err := callTool(t, s, u, "create_database", `{"title":"Tasks"}`)
	if err != nil {
		t.Fatal(err)
	}
	db := idFromToolAnswer(t, out)
	before, _, _ := s.loadCollection(db)
	for _, body := range []string{`{"schema":{"id":"x"}}`, `{"schema":"text"}`, `{"schema":[1,2]}`} {
		if rec := requestAs(t, s, cookie, "PUT", "/api/collections/"+db, body); rec.Code != 400 {
			t.Errorf("%s: %d, want 400", body, rec.Code)
		}
	}
	if after, _, _ := s.loadCollection(db); len(after) != len(before) {
		t.Errorf("a refused schema changed the stored one")
	}
}
