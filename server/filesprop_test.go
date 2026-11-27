package server

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Spec 028: a Files & media value holds this workspace's uploads and nothing
// else, on every door that stores one. The doors are tested one by one because
// the history of this repository is a check added on one door and missing on
// the next (the REST side checked, the MCP side did not).

type filesFixture struct {
	s       *Server
	uid     string
	cookie  string
	u       *user
	ws      string
	db      string
	row     string
	own     string // an upload of this workspace, indexed with a row
	loose   string // an upload with no index entry (upload_file without page_id)
	foreign string // an upload indexed in another person's workspace
}

func newFilesFixture(t *testing.T) *filesFixture {
	t.Helper()
	s := testServer(t)
	uid, cookie := signedIn(t, s, "files@example.test")
	ws := s.firstWorkspaceOf(t, uid)
	db := s.makeCollection(t, ws, uid, "Assets",
		`[{"id":"name","name":"Name","type":"text"},{"id":"media","name":"Media","type":"files"},{"id":"note","name":"Note","type":"text"}]`)
	row := s.makeRow(t, ws, uid, db, "First", `{}`)

	otherUID, _ := signedIn(t, s, "other@example.test")
	// The second person only needs a workspace id that is not ours: the check
	// compares the index entry with the row's workspace.
	otherWS := "other-" + newID()
	otherPage := s.makePage(t, otherWS, otherUID, "", "Theirs", `{}`)

	f := &filesFixture{s: s, uid: uid, cookie: cookie, u: &user{ID: uid, Name: "Test"}, ws: ws, db: db, row: row}
	f.own = f.upload(t, "own.png", row)
	f.loose = f.upload(t, "loose.pdf", "")
	f.foreign = f.upload(t, "theirs.png", otherPage)
	// The loose one has no index entry at all, as before the index knew it.
	s.db.Exec(`DELETE FROM files WHERE file_name = ?`, f.loose)
	return f
}

// upload puts a file on disk and indexes it with page (none when "").
func (f *filesFixture) upload(t *testing.T, display, page string) string {
	t.Helper()
	name := newID() + filepath.Ext(display)
	if err := os.WriteFile(filepath.Join(f.s.dataDir, "files", name), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	f.s.recordFile(name, page, display)
	return name
}

func filesValue(names ...string) string {
	items := make([]filesItem, len(names))
	for i, n := range names {
		items[i] = filesItem{URL: "/files/" + n, Name: n}
	}
	b, _ := json.Marshal(items)
	return string(b)
}

func (f *filesFixture) stored(t *testing.T) string {
	t.Helper()
	var props string
	f.s.db.QueryRow(`SELECT props FROM pages WHERE id = ?`, f.row).Scan(&props)
	var m map[string]json.RawMessage
	json.Unmarshal([]byte(props), &m)
	return string(m["media"])
}

// The values every door must refuse, each with the reason it exists.
func badFilesValues(f *filesFixture) map[string]string {
	return map[string]string{
		"another workspace's upload": filesValue(f.foreign),
		"a file that does not exist": filesValue("nothere.png"),
		"an outside link":            `[{"url":"https://example.com/a.png","name":"a.png"}]`,
		"a path out of files/":       `[{"url":"/files/../nigari.db","name":"db"}]`,
		"a nested path":              `[{"url":"/files/a/b.png","name":"b"}]`,
		"not a list":                 `"/files/` + f.own + `"`,
		"a list of strings":          `["/files/` + f.own + `"]`,
		"an unknown key":             `[{"url":"/files/` + f.own + `","name":"x","size":1}]`,
	}
}

func TestCheckFilesValue(t *testing.T) {
	f := newFilesFixture(t)
	for _, ok := range []string{"null", "[]", filesValue(f.own), filesValue(f.loose), filesValue(f.own, f.loose)} {
		if err := f.s.checkFilesValue(f.ws, json.RawMessage(ok)); err != nil {
			t.Errorf("%s refused: %v", ok, err)
		}
	}
	for why, bad := range badFilesValues(f) {
		err := f.s.checkFilesValue(f.ws, json.RawMessage(bad))
		if err == nil {
			t.Errorf("%s accepted", why)
			continue
		}
		if ce, ok := err.(*codedError); !ok || ce.code != "invalid_files_value" {
			t.Errorf("%s: error without the code invalid_files_value: %v", why, err)
		}
	}
	many := make([]string, maxFilesPerValue+1)
	for i := range many {
		many[i] = f.own
	}
	if err := f.s.checkFilesValue(f.ws, json.RawMessage(filesValue(many...))); err == nil {
		t.Errorf("a value of %d files accepted", len(many))
	}
}

func TestFilesValueRefusedOnEveryDoor(t *testing.T) {
	f := newFilesFixture(t)
	for why, bad := range badFilesValues(f) {
		before := f.stored(t)

		// REST propsPatch, the browser's own write.
		rec := requestAs(t, f.s, f.cookie, "PATCH", "/api/pages/"+f.row, `{"propsPatch":{"media":`+bad+`}}`)
		if rec.Code != 400 || !strings.Contains(rec.Body.String(), "invalid_files_value") {
			t.Errorf("REST propsPatch, %s: %d %s", why, rec.Code, rec.Body.String())
		}
		// REST whole props.
		rec = requestAs(t, f.s, f.cookie, "PATCH", "/api/pages/"+f.row, `{"props":{"media":`+bad+`}}`)
		if rec.Code != 400 {
			t.Errorf("REST props, %s: %d %s", why, rec.Code, rec.Body.String())
		}
		// REST create, which the signed-in form uses.
		rec = requestAs(t, f.s, f.cookie, "POST", "/api/pages", `{"parentId":"`+f.db+`","title":"New","props":{"media":`+bad+`}}`)
		if rec.Code != 400 {
			t.Errorf("REST create, %s: %d %s", why, rec.Code, rec.Body.String())
		}
		// MCP set_properties.
		if _, err := callTool(t, f.s, f.u, "set_properties", `{"page_id":"`+f.row+`","properties":{"media":`+bad+`}}`); err == nil {
			t.Errorf("MCP set_properties, %s: accepted", why)
		}
		if got := f.stored(t); got != before {
			t.Fatalf("%s: the value changed to %s although every door refused", why, got)
		}
	}
}

// create_rows checks all rows first: a refused file in row 2 makes no row 1.
func TestCreateRowsRefusesFilesBeforeMakingAnyRow(t *testing.T) {
	f := newFilesFixture(t)
	count := func() int {
		var n int
		f.s.db.QueryRow(`SELECT COUNT(*) FROM pages WHERE parent_id = ?`, f.db).Scan(&n)
		return n
	}
	before := count()
	_, err := callTool(t, f.s, f.u, "create_rows", `{"page_id":"`+f.db+`","rows":[`+
		`{"title":"Good","properties":{"media":`+filesValue(f.own)+`}},`+
		`{"title":"Bad","properties":{"media":`+filesValue(f.foreign)+`}}]}`)
	if err == nil || !strings.Contains(err.Error(), "another workspace") {
		t.Fatalf("create_rows should refuse row 2's file as another workspace's, got %v", err)
	}
	if n := count(); n != before {
		t.Errorf("create_rows left %d row(s) behind", n-before)
	}
}

func TestFilesValueAcceptedAndStoredAsSent(t *testing.T) {
	f := newFilesFixture(t)
	v := filesValue(f.own, f.loose)
	rec := requestAs(t, f.s, f.cookie, "PATCH", "/api/pages/"+f.row, `{"propsPatch":{"media":`+v+`}}`)
	if rec.Code != 200 {
		t.Fatalf("REST: %d %s", rec.Code, rec.Body.String())
	}
	if got := f.stored(t); got != v {
		t.Errorf("stored %s, want %s", got, v)
	}
	if _, err := callTool(t, f.s, f.u, "set_properties", `{"page_id":"`+f.row+`","properties":{"media":[]}}`); err != nil {
		t.Errorf("MCP clearing to []: %v", err)
	}
	if _, err := callTool(t, f.s, f.u, "set_properties", `{"page_id":"`+f.row+`","properties":{"media":`+v+`}}`); err != nil {
		t.Errorf("MCP: %v", err)
	}
	// Another property's text is not a files value, however it looks.
	if _, err := callTool(t, f.s, f.u, "set_properties", `{"page_id":"`+f.row+`","properties":{"note":"/files/nothere.png"}}`); err != nil {
		t.Errorf("a text property was checked as files: %v", err)
	}
}

func TestFilesValueRefusedForAReadToken(t *testing.T) {
	f := newFilesFixture(t)
	read := &user{ID: f.uid, Name: "Test", TokenKind: tokenKindAPI, TokenScope: "read"}
	if _, err := callTool(t, f.s, read, "set_properties", `{"page_id":"`+f.row+`","properties":{"media":`+filesValue(f.own)+`}}`); err == nil {
		t.Error("a read-scoped token set a files value")
	}
}

func TestUpdateSchemaAcceptsFilesType(t *testing.T) {
	f := newFilesFixture(t)
	if _, err := callTool(t, f.s, f.u, "update_schema", `{"page_id":"`+f.db+`","properties":[`+
		`{"id":"media","name":"Media","type":"files"},{"name":"Scans","type":"files"}]}`); err != nil {
		t.Fatalf("update_schema with files: %v", err)
	}
	if ids := f.s.filesPropIDs(f.db); len(ids) != 2 {
		t.Errorf("want 2 files properties after the update, got %v", ids)
	}
	if _, err := callTool(t, f.s, f.u, "create_database", `{"title":"Scans","schema":[{"name":"Scan","type":"files"}]}`); err != nil {
		t.Errorf("create_database with files: %v", err)
	}
}
