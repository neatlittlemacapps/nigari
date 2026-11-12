package server

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

// Spec 014: an embed's views belong to the document. These tests hold the
// agent's doors to that (SC-005) and the database to its promise (SC-001):
// whatever is done to an embed's views, the database's views JSON is the
// same, byte for byte.

type embedFixture struct {
	s             *Server
	owner, cookie string
	ws            string
	u             *user
	col, doc      string
}

// A Tasks database with three views (a filtered table, a board and a form),
// and a document with the database embedded inside a column, in the old
// shape: the board open, with the embed's own filter on it.
func newEmbedFixture(t *testing.T) embedFixture {
	t.Helper()
	s := testServer(t)
	owner, cookie := signedIn(t, s, "embeds@example.test")
	ws := s.firstWorkspaceOf(t, owner)
	f := embedFixture{s: s, owner: owner, cookie: cookie, ws: ws, u: &user{ID: owner, Name: "Test"}}
	f.col = s.makeCollection(t, ws, owner, "Tasks", `[
		{"id":"status","name":"Status","type":"select","options":[{"id":"open","name":"Open"},{"id":"done","name":"Done"}]},
		{"id":"owner","name":"Owner","type":"text"}]`)
	if _, err := s.db.Exec(`UPDATE collections SET views = ? WHERE page_id = ?`, `[
		{"id":"all","name":"All","type":"table","filters":[{"property":"status","op":"is","value":"open"}]},
		{"id":"board","name":"By status","type":"board","groupBy":"status"},
		{"id":"signup","name":"Sign-up","type":"form"}]`, f.col); err != nil {
		t.Fatal(err)
	}
	f.doc = s.makePage(t, ws, owner, "", "Plan", `{}`)
	local, _ := json.Marshal(map[string]any{"viewId": "board",
		"views": map[string]any{"board": map[string]any{"filters": []any{map[string]any{"property": "owner", "op": "is", "value": "Ann"}}}}})
	f.setContent(t, f.doc, `[
		{"id":"p1","type":"paragraph","props":{},"content":[{"type":"text","text":"Intro","styles":{}}],"children":[]},
		{"id":"cols","type":"columnList","props":{},"content":[],"children":[
			{"id":"c1","type":"column","props":{},"content":[],"children":[
				{"id":"emb1","type":"database","props":{"collectionId":"`+f.col+`","local":`+jsonString(string(local))+`},"content":[],"children":[]}]}]}]`)
	return f
}

func jsonString(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}

func (f embedFixture) setContent(t *testing.T, page, content string) {
	t.Helper()
	if !json.Valid([]byte(content)) {
		t.Fatalf("fixture content is not JSON: %s", content)
	}
	if _, err := f.s.db.Exec(`UPDATE pages SET content = ? WHERE id = ?`, content, page); err != nil {
		t.Fatal(err)
	}
}

func (f embedFixture) dbViews(t *testing.T) string {
	t.Helper()
	var v string
	if err := f.s.db.QueryRow(`SELECT views FROM collections WHERE page_id = ?`, f.col).Scan(&v); err != nil {
		t.Fatal(err)
	}
	return v
}

// embedLocal reads the stored local of an embed, decoded.
func (f embedFixture) embedLocal(t *testing.T, page, embedID string) map[string]any {
	t.Helper()
	_, local, err := f.s.embedOf(page, embedID)
	if err != nil {
		t.Fatal(err)
	}
	var out map[string]any
	if err := json.Unmarshal([]byte(local), &out); err != nil {
		t.Fatalf("local is not JSON: %q", local)
	}
	return out
}

func (f embedFixture) embedViews(t *testing.T) []map[string]any {
	t.Helper()
	out, err := f.s.mcpGetEmbed(f.u, f.doc, "emb1")
	if err != nil {
		t.Fatal(err)
	}
	var got struct {
		Views    []map[string]any `json:"views"`
		OpenView string           `json:"open_view"`
	}
	_ = json.Unmarshal([]byte(out), &got)
	return got.Views
}

func TestAnEmbedsViewsChangeOnlyTheDocument(t *testing.T) {
	f := newEmbedFixture(t)
	before := f.dbViews(t)
	call := func(args string) string {
		t.Helper()
		out, err := callTool(t, f.s, f.u, "set_view", args)
		if err != nil {
			t.Fatalf("set_view %s: %v", args, err)
		}
		if after := f.dbViews(t); after != before {
			t.Fatalf("set_view %s changed the database's views:\n%s\n%s", args, before, after)
		}
		return out
	}

	// Read: an old embed is the database's views it can show, the form left
	// out, with its own filter on the board, and the board open.
	out, err := callTool(t, f.s, f.u, "get_collection", `{"page_id":"`+f.doc+`","embed_id":"emb1"}`)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out, "UNTRUSTED") || !strings.Contains(out, `"open_view":"board"`) || strings.Contains(out, "signup") || !strings.Contains(out, `"Ann"`) {
		t.Errorf("get_collection with embed_id: %s", out)
	}
	if _, has := f.embedLocal(t, f.doc, "emb1")["v"]; has {
		t.Error("reading an old embed wrote it")
	}

	// Create, copy, update.
	call(`{"page_id":"` + f.doc + `","embed_id":"emb1","type":"list","name":"Mine","filters":[{"property":"owner","op":"is","value":"Ben"}]}`)
	copied := call(`{"page_id":"` + f.doc + `","embed_id":"emb1","copy_of":"all","name":"Open copy"}`)
	if !strings.Contains(copied, "Only this embed changed") {
		t.Errorf("answer does not say only the embed changed: %s", copied)
	}
	local := f.embedLocal(t, f.doc, "emb1")
	if local["v"] != float64(2) {
		t.Fatalf("the first change did not write the new shape: %v", local)
	}
	views := f.embedViews(t)
	if len(views) != 4 {
		t.Fatalf("want all, board, Mine and the copy: %v", views)
	}
	cp := views[3]
	if cp["id"] == "all" || cp["name"] != "Open copy" || cp["type"] != "table" || cp["filters"] == nil {
		t.Errorf("the copy: %v", cp)
	}
	call(`{"page_id":"` + f.doc + `","embed_id":"emb1","view_id":"` + cp["id"].(string) + `","sort":"owner:asc"}`)
	if v := f.embedViews(t)[3]; v["sort"] == nil {
		t.Errorf("update did not reach the embed's view: %v", v)
	}

	// Delete, down to the last view.
	for _, v := range f.embedViews(t)[1:] {
		if _, err := callTool(t, f.s, f.u, "delete_view", `{"page_id":"`+f.doc+`","embed_id":"emb1","view_id":"`+v["id"].(string)+`"}`); err != nil {
			t.Fatalf("delete %v: %v", v["id"], err)
		}
	}
	if _, err := callTool(t, f.s, f.u, "delete_view", `{"page_id":"`+f.doc+`","embed_id":"emb1","view_id":"all"}`); err == nil || !strings.Contains(err.Error(), "at least one view") {
		t.Errorf("the last view was deleted: %v", err)
	}
	if after := f.dbViews(t); after != before {
		t.Errorf("deleting the embed's views changed the database's:\n%s\n%s", before, after)
	}
	// The document's other blocks are where they were.
	var content string
	f.s.db.QueryRow(`SELECT content FROM pages WHERE id = ?`, f.doc).Scan(&content)
	if !strings.Contains(content, `"Intro"`) || !strings.Contains(content, `"columnList"`) {
		t.Errorf("the document lost blocks: %s", content)
	}
}

// What an embed refuses, each with nothing written.
func TestAnEmbedRefusesWhatItCannotShow(t *testing.T) {
	f := newEmbedFixture(t)
	beforeDoc := ""
	f.s.db.QueryRow(`SELECT content FROM pages WHERE id = ?`, f.doc).Scan(&beforeDoc)
	for name, args := range map[string]string{
		"a form":                         `{"page_id":"` + f.doc + `","embed_id":"emb1","type":"form"}`,
		"a copy of a form":               `{"page_id":"` + f.doc + `","embed_id":"emb1","copy_of":"signup"}`,
		"an unknown copy_of":             `{"page_id":"` + f.doc + `","embed_id":"emb1","copy_of":"nope"}`,
		"an unknown embed":               `{"page_id":"` + f.doc + `","embed_id":"nope","type":"table"}`,
		"a board without group_by":       `{"page_id":"` + f.doc + `","embed_id":"emb1","type":"board"}`,
		"a property that is not there":   `{"page_id":"` + f.doc + `","embed_id":"emb1","type":"table","sort":"nope:asc"}`,
		"copy_of without embed_id":       `{"page_id":"` + f.col + `","copy_of":"all"}`,
		"a view the embed does not have": `{"page_id":"` + f.doc + `","embed_id":"emb1","view_id":"nope","name":"x"}`,
	} {
		if _, err := callTool(t, f.s, f.u, "set_view", args); err == nil {
			t.Errorf("%s: accepted", name)
		}
	}
	var after string
	f.s.db.QueryRow(`SELECT content FROM pages WHERE id = ?`, f.doc).Scan(&after)
	if after != beforeDoc {
		t.Errorf("a refused call wrote the document")
	}
	if _, err := callTool(t, f.s, f.u, "get_collection", `{"page_id":"`+f.doc+`","embed_id":"nope"}`); err == nil || !strings.Contains(err.Error(), "has no embedded database") {
		t.Errorf("unknown embed: %v", err)
	}
}

// The gates: the document (canWrite through mcpCall), the database (canRead
// and the credential, through embedViewOf), and read scope.
func TestEmbedViewChangesPassEveryGate(t *testing.T) {
	f := newEmbedFixture(t)
	create := `{"page_id":"` + f.doc + `","embed_id":"emb1","type":"table"}`

	readTok := &user{ID: f.owner, Name: "Test", TokenKind: tokenKindAPI, TokenScope: "read"}
	if _, err := callTool(t, f.s, readTok, "set_view", create); err == nil {
		t.Error("a read-only token changed an embed's views")
	}
	if _, err := callTool(t, f.s, readTok, "get_collection", `{"page_id":"`+f.doc+`","embed_id":"emb1"}`); err != nil {
		t.Errorf("a read-only token may read an embed: %v", err)
	}

	// A viewer of the workspace reads the document and may not change it.
	viewer, _ := signedIn(t, f.s, "embed-viewer@example.test")
	f.s.addMember(t, f.ws, viewer, "viewer")
	if _, err := callTool(t, f.s, &user{ID: viewer, Name: "V"}, "set_view", create); err == nil {
		t.Error("a viewer of the document changed an embed's views")
	}

	// A document the caller may write, embedding a database they may not
	// read: the embed's views are refused, and get_page lists it without
	// its name.
	stranger, _ := signedIn(t, f.s, "embed-stranger@example.test")
	sws := makeWorkspace(t, f.s, stranger)
	secret := f.s.makeCollection(t, sws, stranger, "Salaries", `[]`)
	f.setContent(t, f.doc, `[{"id":"emb2","type":"database","props":{"collectionId":"`+secret+`","local":""},"content":[],"children":[]}]`)
	member := &user{ID: viewer, Name: "V"}
	if _, err := f.s.db.Exec(`UPDATE workspace_members SET role = 'member' WHERE workspace_id = ? AND user_id = ?`, f.ws, viewer); err != nil {
		t.Fatal(err)
	}
	if _, err := callTool(t, f.s, member, "set_view", `{"page_id":"`+f.doc+`","embed_id":"emb2","type":"table"}`); err == nil || !strings.Contains(err.Error(), "database not found") {
		t.Errorf("an embed of an unreadable database: %v", err)
	}
	out, err := callTool(t, f.s, member, "get_page", `{"page_id":"`+f.doc+`"}`)
	if err != nil || strings.Contains(out, "Salaries") || !strings.Contains(out, "emb2: a database you cannot read") {
		t.Errorf("get_page listed an unreadable embed's database: %v %s", err, out)
	}
}

func TestGetPageListsADocumentsEmbeds(t *testing.T) {
	f := newEmbedFixture(t)
	out, err := callTool(t, f.s, f.u, "get_page", `{"page_id":"`+f.doc+`"}`)
	if err != nil {
		t.Fatal(err)
	}
	end := strings.Index(out, "END UNTRUSTED")
	list := strings.Index(out, "embed_id emb1")
	if list < 0 || end < 0 || list > end {
		t.Fatalf("the embed list is missing or outside the untrusted wrapper: %s", out)
	}
	if !strings.Contains(out, `database "Tasks"`) || !strings.Contains(out, `"By status" (board, id board, open)`) || strings.Contains(out, "Sign-up") {
		t.Errorf("embed list: %s", out)
	}
}

func TestEmbedDatabaseGivesTheEmbedViewsOfItsOwn(t *testing.T) {
	f := newEmbedFixture(t)
	before := f.dbViews(t)
	doc := f.s.makePage(t, f.ws, f.owner, "", "Report", `{}`)
	out, err := callTool(t, f.s, f.u, "embed_database", `{"page_id":"`+doc+`","database_id":"`+f.col+`","view_id":"board"}`)
	if err != nil || !strings.Contains(out, "embed_id ") {
		t.Fatalf("embed_database: %v %s", err, out)
	}
	embedID := strings.Fields(out[strings.Index(out, "embed_id ")+len("embed_id "):])[0]
	embedID = strings.TrimRight(embedID, ").")
	local := f.embedLocal(t, doc, embedID)
	views, _ := local["views"].([]any)
	if local["v"] != float64(2) || len(views) != 1 {
		t.Fatalf("with view_id: %v", local)
	}
	if v := views[0].(map[string]any); v["type"] != "board" || v["id"] == "board" || v["groupBy"] != "status" || local["viewId"] != v["id"] {
		t.Errorf("the copy of the board: %v", local)
	}
	out, err = callTool(t, f.s, f.u, "embed_database", `{"page_id":"`+doc+`","database_id":"`+f.col+`"}`)
	if err != nil {
		t.Fatal(err)
	}
	embedID = strings.TrimRight(strings.Fields(out[strings.Index(out, "embed_id ")+len("embed_id "):])[0], ").")
	local = f.embedLocal(t, doc, embedID)
	if views, _ := local["views"].([]any); len(views) != 1 || views[0].(map[string]any)["type"] != "table" {
		t.Errorf("without view_id: %v", local)
	}
	if _, err := callTool(t, f.s, f.u, "embed_database", `{"page_id":"`+doc+`","database_id":"`+f.col+`","view_id":"signup"}`); err == nil {
		t.Error("a form was embedded")
	}
	if f.dbViews(t) != before {
		t.Error("embed_database changed the database's views")
	}
}

// New rows in an embed's view take what its filters pin (FR-005), at every
// door: create_page, create_rows and a database template over MCP, and
// viewFilters over REST.
func TestARowMadeInAnEmbedViewTakesItsPins(t *testing.T) {
	f := newEmbedFixture(t)
	// The board's own filter in the old embed pins Owner = Ann.
	embed := `"embed":{"page_id":"` + f.doc + `","embed_id":"emb1"},"view_id":"board"`
	out, err := callTool(t, f.s, f.u, "create_page", `{"title":"From the embed","parent_id":"`+f.col+`",`+embed+`}`)
	if err != nil || !strings.Contains(out, "matches_view: true") {
		t.Fatalf("create_page with embed: %v %s", err, out)
	}
	var id string
	f.s.db.QueryRow(`SELECT id FROM pages WHERE title = 'From the embed'`).Scan(&id)
	if f.s.propsOf(t, id)["owner"] != "Ann" {
		t.Errorf("create_page: %v", f.s.propsOf(t, id))
	}
	out, err = callTool(t, f.s, f.u, "create_rows", `{"page_id":"`+f.col+`","rows":[{"title":"R1"},{"title":"R2","properties":{"owner":"Ben"}}],`+embed+`}`)
	if err != nil || !strings.Contains(out, `"not_matching":["`) {
		t.Fatalf("create_rows with embed: %v %s", err, out)
	}
	f.s.db.QueryRow(`SELECT id FROM pages WHERE title = 'R1'`).Scan(&id)
	if f.s.propsOf(t, id)["owner"] != "Ann" {
		t.Errorf("create_rows: %v", f.s.propsOf(t, id))
	}

	// A database template, through create_page's template path.
	if _, err := f.s.mcpDatabaseTemplates(f.u, "add", f.col, "", "Ticket", ""); err != nil {
		t.Fatal(err)
	}
	var tpl string
	f.s.db.QueryRow(`SELECT id FROM pages WHERE template_of = ?`, f.col).Scan(&tpl)
	if _, err := callTool(t, f.s, f.u, "create_page", `{"title":"From template","template_id":"`+tpl+`",`+embed+`}`); err != nil {
		t.Fatal(err)
	}
	f.s.db.QueryRow(`SELECT id FROM pages WHERE title = 'From template' AND parent_id = ?`, f.col).Scan(&id)
	if id == "" || f.s.propsOf(t, id)["owner"] != "Ann" {
		t.Errorf("template row: %q", id)
	}

	// Refused before anything is created: a view the embed does not have, an
	// embed of another database, a document the caller may not read.
	count := func() int {
		var n int
		f.s.db.QueryRow(`SELECT COUNT(*) FROM pages WHERE parent_id = ?`, f.col).Scan(&n)
		return n
	}
	n := count()
	other := f.s.makeCollection(t, f.ws, f.owner, "Other", `[]`)
	stranger, _ := signedIn(t, f.s, "rows-stranger@example.test")
	sws := makeWorkspace(t, f.s, stranger)
	hidden := f.s.makePage(t, sws, stranger, "", "Hidden", `{}`)
	f.setContent(t, hidden, `[{"id":"embh","type":"database","props":{"collectionId":"`+f.col+`","local":""},"content":[],"children":[]}]`)
	for name, args := range map[string][2]string{
		"unknown view":        {"create_page", `{"title":"x","parent_id":"` + f.col + `","embed":{"page_id":"` + f.doc + `","embed_id":"emb1"},"view_id":"nope"}`},
		"no view_id":          {"create_rows", `{"page_id":"` + f.col + `","rows":[{"title":"x"}],"embed":{"page_id":"` + f.doc + `","embed_id":"emb1"}}`},
		"another database":    {"create_rows", `{"page_id":"` + other + `","rows":[{"title":"x"}],` + embed + `}`},
		"unreadable document": {"create_page", `{"title":"x","parent_id":"` + f.col + `","embed":{"page_id":"` + hidden + `","embed_id":"embh"},"view_id":"all"}`},
		"unknown embed":       {"create_rows", `{"page_id":"` + f.col + `","rows":[{"title":"x"}],"embed":{"page_id":"` + f.doc + `","embed_id":"nope"},"view_id":"all"}`},
	} {
		if _, err := callTool(t, f.s, f.u, args[0], args[1]); err == nil {
			t.Errorf("%s: accepted", name)
		}
	}
	if count() != n {
		t.Errorf("a refused call created rows: %d → %d", n, count())
	}
}

func TestRESTRowsTakeTheEmbedViewsFilters(t *testing.T) {
	f := newEmbedFixture(t)
	filters := `[{"property":"status","op":"is","value":"done"},{"property":"owner","op":"contains","value":"A"}]`
	rec := requestAs(t, f.s, f.cookie, "POST", "/api/pages", `{"title":"Done one","parentId":"`+f.col+`","viewFilters":`+filters+`}`)
	if rec.Code != 200 {
		t.Fatalf("POST /api/pages with viewFilters: %d %s", rec.Code, rec.Body.String())
	}
	var p struct {
		ID          string `json:"id"`
		MatchesView *bool  `json:"matchesView"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &p)
	if f.s.propsOf(t, p.ID)["status"] != "done" || p.MatchesView == nil || *p.MatchesView {
		// "contains A" pins nothing, so the row does not match: the answer
		// must say so, or the interface shows no "not shown here" notice.
		t.Errorf("pins %v, matchesView %v", f.s.propsOf(t, p.ID), p.MatchesView)
	}
	both := func(path, body string) *httptest.ResponseRecorder {
		return requestAs(t, f.s, f.cookie, "POST", path, body)
	}
	if rec := both("/api/pages", `{"title":"x","parentId":"`+f.col+`","viewId":"all","viewFilters":[]}`); rec.Code != 400 || !strings.Contains(rec.Body.String(), "view_not_in_database") {
		t.Errorf("viewId and viewFilters together: %d %s", rec.Code, rec.Body.String())
	}
	if rec := both("/api/pages", `{"title":"x","viewFilters":[]}`); rec.Code != 400 {
		t.Errorf("viewFilters without a database: %d", rec.Code)
	}

	// The template route.
	if _, err := f.s.mcpDatabaseTemplates(f.u, "add", f.col, "", "Ticket", ""); err != nil {
		t.Fatal(err)
	}
	var tpl string
	f.s.db.QueryRow(`SELECT id FROM pages WHERE template_of = ?`, f.col).Scan(&tpl)
	rec = both("/api/collections/"+f.col+"/from-template", `{"templateId":"`+tpl+`","title":"T","viewFilters":[{"property":"status","op":"is","value":"done"}]}`)
	_ = json.Unmarshal(rec.Body.Bytes(), &p)
	if rec.Code != 200 || f.s.propsOf(t, p.ID)["status"] != "done" || p.MatchesView == nil || !*p.MatchesView {
		t.Errorf("from-template with viewFilters: %d %s", rec.Code, rec.Body.String())
	}
	if rec := both("/api/collections/"+f.col+"/from-template", `{"templateId":"`+tpl+`","viewId":"all","viewFilters":[]}`); rec.Code != 400 {
		t.Errorf("from-template with both: %d", rec.Code)
	}
}

// An agent's change to an embed is recorded in the activity log as an agent's,
// like any other write from outside the editor (go-server rule): set_view and
// delete_view audit themselves for a database's views, and an embed's are the
// document's, so the generic entry must stand for them.
func TestAnAgentsEmbedViewChangeIsInTheActivityLog(t *testing.T) {
	f := newEmbedFixture(t)
	for _, c := range []struct{ tool, args string }{
		{"set_view", `{"page_id":"` + f.doc + `","embed_id":"emb1","type":"list"}`},
		{"delete_view", `{"page_id":"` + f.doc + `","embed_id":"emb1","view_id":"all"}`},
	} {
		var before int
		f.s.db.QueryRow(`SELECT COUNT(*) FROM audit_log WHERE actor_type = 'agent' AND page_id = ? AND action = ?`, f.doc, c.tool).Scan(&before)
		if _, err := callTool(t, f.s, f.u, c.tool, c.args); err != nil {
			t.Fatalf("%s: %v", c.tool, err)
		}
		var after int
		f.s.db.QueryRow(`SELECT COUNT(*) FROM audit_log WHERE actor_type = 'agent' AND page_id = ? AND action = ?`, f.doc, c.tool).Scan(&after)
		if after != before+1 {
			t.Errorf("%s on an embed left %d agent entries, want %d", c.tool, after, before+1)
		}
	}
}

// The views lock is the database's. An embed's views are the document's, so a
// locked database does not stop an agent changing them (and the database's own
// views stay refused).
func TestAnEmbedsViewsIgnoreTheDatabasesLock(t *testing.T) {
	f := newEmbedFixture(t)
	if _, err := f.s.db.Exec(`UPDATE collections SET views_locked_by = ?, views_locked_at = ? WHERE page_id = ?`, f.owner, now(), f.col); err != nil {
		t.Fatal(err)
	}
	if _, err := callTool(t, f.s, f.u, "set_view", `{"page_id":"`+f.col+`","type":"table","name":"On the database"}`); err == nil {
		t.Fatal("the lock no longer refuses a database view, so this test proves nothing")
	}
	if _, err := callTool(t, f.s, f.u, "set_view", `{"page_id":"`+f.doc+`","embed_id":"emb1","type":"table"}`); err != nil {
		t.Errorf("a locked database stopped a change to an embed's own views: %v", err)
	}
}

// Two changes to one embed, the second made from a read taken before the
// first: the second must not write back a list that lacks the first's view.
func TestTwoChangesToOneEmbedBothSurvive(t *testing.T) {
	f := newEmbedFixture(t)
	stale, err := f.s.loadEmbed(f.u, f.doc, "emb1") // read before the other change
	if err != nil {
		t.Fatal(err)
	}
	if _, err := callTool(t, f.s, f.u, "set_view", `{"page_id":"`+f.doc+`","embed_id":"emb1","type":"list","name":"First"}`); err != nil {
		t.Fatal(err)
	}
	if _, err := f.s.changeEmbedViews(f.u, f.doc, "emb1", stale, func(open string, views []map[string]any) (string, []map[string]any, string, error) {
		return open, append(views, map[string]any{"id": "second", "name": "Second", "type": "table"}), "ok", nil
	}); err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, v := range f.embedViews(t) {
		names = append(names, v["name"].(string))
	}
	if got := strings.Join(names, ","); !strings.Contains(got, "First") || !strings.Contains(got, "Second") {
		t.Errorf("a change was lost: %s", got)
	}
}
