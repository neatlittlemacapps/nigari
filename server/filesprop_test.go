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

// The file list learns the row as the file's carrier when the value is
// written, and the rebuild (filesVersion 4) finds values written before it
// knew them (plan D3). Without it the file list showed a row's upload as
// unreferenced, and the shared-page rule of PR 2 had no row to start from.
func TestFileIndexRecordsTheRowThatHoldsAFile(t *testing.T) {
	f := newFilesFixture(t)
	carrier := func() (page, ws string) {
		f.s.db.QueryRow(`SELECT COALESCE(page_id, ''), COALESCE(workspace_id, '') FROM files WHERE file_name = ?`, f.loose).Scan(&page, &ws)
		return
	}
	if p, _ := carrier(); p != "" {
		t.Fatalf("the loose upload starts with a carrier: %q", p)
	}
	if _, err := callTool(t, f.s, f.u, "set_properties", `{"page_id":"`+f.row+`","properties":{"media":`+filesValue(f.loose)+`}}`); err != nil {
		t.Fatal(err)
	}
	if p, ws := carrier(); p != f.row || ws != f.ws {
		t.Errorf("after the write the carrier is %q in %q, want the row %q in %q", p, ws, f.row, f.ws)
	}
	// The rebuild: forget everything and build again.
	f.s.db.Exec(`DELETE FROM files`)
	f.s.setSetting("files_version", "3")
	if err := f.s.migrateFileIndex(); err != nil {
		t.Fatal(err)
	}
	if p, _ := carrier(); p != f.row {
		t.Errorf("after the rebuild the carrier is %q, want the row %q", p, f.row)
	}
}

// A Files & media property is asked whether it holds files, nothing else
// (FR-006e): "is" or "contains" would compare the stored JSON as text.
func TestFilesFilterOnlyAsksEmptyOrNot(t *testing.T) {
	f := newFilesFixture(t)
	empty := s2row(t, f, "Empty")
	if _, err := callTool(t, f.s, f.u, "set_properties", `{"page_id":"`+f.row+`","properties":{"media":`+filesValue(f.own)+`}}`); err != nil {
		t.Fatal(err)
	}
	if _, err := callTool(t, f.s, f.u, "set_properties", `{"page_id":"`+empty+`","properties":{"media":[]}}`); err != nil {
		t.Fatal(err)
	}
	for op, want := range map[string]string{"is_not_empty": f.row, "is_empty": empty} {
		out, err := callTool(t, f.s, f.u, "query_rows", `{"page_id":"`+f.db+`","filter":[{"property":"media","op":"`+op+`"}]}`)
		if err != nil {
			t.Fatalf("%s: %v", op, err)
		}
		if !strings.Contains(out, want) {
			t.Errorf("%s did not return %s: %s", op, want, out)
		}
	}
	for _, op := range []string{"is", "contains", "gt"} {
		if _, err := callTool(t, f.s, f.u, "query_rows", `{"page_id":"`+f.db+`","filter":[{"property":"media","op":"`+op+`","value":"x"}]}`); err == nil {
			t.Errorf("query_rows accepted %s on a files property", op)
		}
		if _, err := callTool(t, f.s, f.u, "set_view", `{"page_id":"`+f.db+`","type":"table","name":"T","filters":[{"property":"media","op":"`+op+`","value":"x"}]}`); err == nil {
			t.Errorf("set_view accepted %s on a files property", op)
		}
	}
}

func s2row(t *testing.T, f *filesFixture, title string) string {
	t.Helper()
	return f.s.makeRow(t, f.ws, f.uid, f.db, title, `{}`)
}

// The Markdown export writes each file as a link named as it was uploaded
// (FR-006g); before, a list of objects came out as an empty cell.
func TestCollectionMarkdownWritesFilesAsLinks(t *testing.T) {
	f := newFilesFixture(t)
	v := `[{"url":"/files/` + f.own + `","name":"plan [v2].png"},{"url":"/files/` + f.loose + `","name":""}]`
	if _, err := callTool(t, f.s, f.u, "set_properties", `{"page_id":"`+f.row+`","properties":{"media":`+v+`}}`); err != nil {
		t.Fatal(err)
	}
	p, err := f.s.getPage(f.db)
	if err != nil {
		t.Fatal(err)
	}
	md, err := f.s.collectionMarkdown(p, f.uid)
	if err != nil {
		t.Fatal(err)
	}
	want := `[plan \[v2\].png](/files/` + f.own + `), [` + f.loose + `](/files/` + f.loose + `)`
	if !strings.Contains(md, want) {
		t.Errorf("export lacks %s:\n%s", want, md)
	}
}

// A duplicated row keeps the same files, not copies (plan D11): duplicating a
// row with a large video must not double the storage.
func TestDuplicatedRowKeepsTheSameFiles(t *testing.T) {
	f := newFilesFixture(t)
	v := filesValue(f.own)
	if _, err := callTool(t, f.s, f.u, "set_properties", `{"page_id":"`+f.row+`","properties":{"media":`+v+`}}`); err != nil {
		t.Fatal(err)
	}
	if _, err := callTool(t, f.s, f.u, "duplicate_page", `{"page_id":"`+f.row+`"}`); err != nil {
		t.Fatal(err)
	}
	var copyID, props string
	f.s.db.QueryRow(`SELECT id, props FROM pages WHERE parent_id = ? AND id != ? ORDER BY created_at DESC LIMIT 1`, f.db, f.row).Scan(&copyID, &props)
	var m map[string]json.RawMessage
	json.Unmarshal([]byte(props), &m)
	if string(m["media"]) != v {
		t.Errorf("the copy holds %s, want %s", m["media"], v)
	}
	entries, _ := os.ReadDir(filepath.Join(f.s.dataDir, "files"))
	if len(entries) != 3 {
		t.Errorf("duplicating made files: %d on disk, want the fixture's 3", len(entries))
	}
}

// A chart and a board refuse to group by a Files & media property: a column
// or a bar per list of files would be one per row.
func TestChartAndBoardRefuseToGroupByFiles(t *testing.T) {
	f := newFilesFixture(t)
	for _, view := range []string{"chart", "board"} {
		_, err := callTool(t, f.s, f.u, "set_view", `{"page_id":"`+f.db+`","type":"`+view+`","name":"V","group_by":"media"}`)
		if err == nil || !strings.Contains(err.Error(), "files") {
			t.Errorf("%s grouped by a files property: %v", view, err)
		}
	}
}

// Code review, PR 1: the ways past the check, each closed.

// A template of a database has no parent (template_of names the database),
// and its files are copied into every row made from it.
func TestTemplateFilesAreChecked(t *testing.T) {
	f := newFilesFixture(t)
	tpl := f.s.makePage(t, f.ws, f.uid, "", "Visit template", `{}`)
	f.s.db.Exec(`UPDATE pages SET is_template = 1, template_of = ? WHERE id = ?`, f.db, tpl)
	rec := requestAs(t, f.s, f.cookie, "PATCH", "/api/pages/"+tpl, `{"propsPatch":{"media":`+filesValue(f.foreign)+`}}`)
	if rec.Code != 400 || !strings.Contains(rec.Body.String(), "invalid_files_value") {
		t.Errorf("a template took another workspace's file: %d %s", rec.Code, rec.Body.String())
	}
}

// A PATCH that moves a row and writes its props is judged by the database it
// moves to: the old one may have no Files & media property at all.
func TestMoveAndWriteIsCheckedByTheNewDatabase(t *testing.T) {
	f := newFilesFixture(t)
	plain := f.s.makeCollection(t, f.ws, f.uid, "Plain", `[{"id":"name","name":"Name","type":"text"}]`)
	row := f.s.makeRow(t, f.ws, f.uid, plain, "Elsewhere", `{}`)
	rec := requestAs(t, f.s, f.cookie, "PATCH", "/api/pages/"+row, `{"parentId":"`+f.db+`","propsPatch":{"media":`+filesValue(f.foreign)+`}}`)
	if rec.Code != 400 || !strings.Contains(rec.Body.String(), "invalid_files_value") {
		t.Errorf("a move into the files database carried another workspace's file in: %d %s", rec.Code, rec.Body.String())
	}
}

// A value written as text, then the property turned into Files & media: the
// row must not take over the other workspace's file in the index.
func TestTypeChangeDoesNotTakeOverAnotherWorkspacesFile(t *testing.T) {
	f := newFilesFixture(t)
	var before string
	f.s.db.QueryRow(`SELECT workspace_id FROM files WHERE file_name = ?`, f.foreign).Scan(&before)
	if _, err := callTool(t, f.s, f.u, "set_properties", `{"page_id":"`+f.row+`","properties":{"note":`+filesValue(f.foreign)+`}}`); err != nil {
		t.Fatal(err)
	}
	if _, err := callTool(t, f.s, f.u, "update_schema", `{"page_id":"`+f.db+`","properties":[{"id":"media","name":"Media","type":"files"},{"id":"note","name":"Note","type":"files"}]}`); err != nil {
		t.Fatal(err)
	}
	f.s.reindexPage(f.row)
	var after, page string
	f.s.db.QueryRow(`SELECT workspace_id, COALESCE(page_id, '') FROM files WHERE file_name = ?`, f.foreign).Scan(&after, &page)
	if after != before || page == f.row {
		t.Errorf("the file's entry moved: workspace %q → %q, carrier %q", before, after, page)
	}
}

// A personal view keeps saving when a condition went stale with a type
// change, and the rows query ignores such a condition rather than compare
// the list as text. A shared view's save over REST refuses a new one, as
// set_view does.
func TestStaleFilesConditionDoesNotBlockOrFilter(t *testing.T) {
	f := newFilesFixture(t)
	if _, err := callTool(t, f.s, f.u, "set_properties", `{"page_id":"`+f.row+`","properties":{"media":`+filesValue(f.own)+`}}`); err != nil {
		t.Fatal(err)
	}
	f.s.db.Exec(`UPDATE collections SET views = ? WHERE page_id = ?`, `[{"id":"t","name":"T","type":"table"}]`, f.db)
	rec := requestAs(t, f.s, f.cookie, "PUT", "/api/collections/"+f.db+"/personal/t", `{"filters":[{"property":"media","op":"contains","value":"x"}],"sort":null}`)
	if rec.Code != 200 {
		t.Errorf("a personal view with a stale files condition was refused: %d %s", rec.Code, rec.Body.String())
	}
	typed := f.s.typeFilters(f.db, []rowFilter{{Prop: "media", Op: "contains", Value: "nothing-matches"}, {Prop: "media", Op: "is_empty"}})
	if cond, _ := typed[0].where(); cond != "" {
		t.Errorf("a stale contains on a files property still filters: %s", cond)
	}
	if cond, _ := typed[1].where(); cond == "" {
		t.Error("is_empty on a files property no longer filters")
	}
	rec = requestAs(t, f.s, f.cookie, "PUT", "/api/collections/"+f.db, `{"views":[{"id":"t","name":"T","type":"table","filters":[{"property":"media","op":"contains","value":"x"}]}]}`)
	if rec.Code != 400 {
		t.Errorf("REST saved a new contains on a files property: %d %s", rec.Code, rec.Body.String())
	}
	if _, err := callTool(t, f.s, f.u, "query_rows", `{"page_id":"`+f.db+`","filter":[{"property":"media","value":"x"}]}`); err == nil {
		t.Error("query_rows accepted a value with no op (an is) on a files property")
	}
}

func TestFileNamesAreBounded(t *testing.T) {
	f := newFilesFixture(t)
	for why, name := range map[string]string{
		"a line break": "a\nb.png",
		"a tab":        "a\tb.png",
		"256 letters":  strings.Repeat("a", 256),
	} {
		v := `[{"url":"/files/` + f.own + `","name":` + jsonString(name) + `}]`
		if err := f.s.checkFilesValue(f.ws, json.RawMessage(v)); err == nil {
			t.Errorf("a name with %s was accepted", why)
		}
	}
	ok := `[{"url":"/files/` + f.own + `","name":` + jsonString(strings.Repeat("é", 255)) + `}]`
	if err := f.s.checkFilesValue(f.ws, json.RawMessage(ok)); err != nil {
		t.Errorf("a name of 255 letters was refused: %v", err)
	}
}

