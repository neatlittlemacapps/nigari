package server

import (
	"encoding/json"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"
)

// viewTestAgent is the account the tests that call the MCP view functions
// directly name as the actor (auditViewChanges needs one).
var viewTestAgent = &user{ID: "test-agent", Name: "Test"}

// lockFixture is a Tasks database with two views, its owner's cookie, a
// write token of the owner, and a reader (a viewer of the workspace).
type lockFixture struct {
	s                    *Server
	owner, cookie, col   string
	ws                   string
	token                string
	reader, readerCookie string
	agent                *user
}

func newLockFixture(t *testing.T) lockFixture {
	t.Helper()
	s := testServer(t)
	owner, cookie := signedIn(t, s, "lock@example.test")
	ws := s.firstWorkspaceOf(t, owner)
	col := tasksCollection(t, s, ws, owner)
	if _, err := s.db.Exec(`UPDATE collections SET views = ? WHERE page_id = ?`,
		`[{"id":"t","name":"Table","type":"table"},{"id":"b","name":"Board","type":"board","groupBy":"status"}]`, col); err != nil {
		t.Fatal(err)
	}
	tok := "lock-token"
	if _, err := s.db.Exec(`INSERT INTO api_tokens (id, user_id, name, token_hash, scope, workspace_scope, created_at)
		VALUES (?, ?, 'agent', ?, 'write', '', ?)`, newID(), owner, tokenHash(tok), now()); err != nil {
		t.Fatal(err)
	}
	reader, readerCookie := signedIn(t, s, "lock-reader@example.test")
	if _, err := s.db.Exec(`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, 'viewer')`, ws, reader); err != nil {
		t.Fatal(err)
	}
	return lockFixture{s: s, owner: owner, cookie: cookie, col: col, ws: ws, token: tok,
		reader: reader, readerCookie: readerCookie,
		agent: &user{ID: owner, Name: "Agent", TokenKind: tokenKindAPI, TokenScope: "write"}}
}

func (f lockFixture) bearer(method, path, body string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+f.token)
	req.Header.Set("Content-Type", "application/json")
	f.s.ServeHTTP(rec, req)
	return rec
}

func (f lockFixture) lock(t *testing.T) {
	t.Helper()
	if rec := requestAs(t, f.s, f.cookie, "PUT", "/api/collections/"+f.col+"/lock", ""); rec.Code != 200 {
		t.Fatalf("lock: %d %s", rec.Code, rec.Body.String())
	}
}

func (f lockFixture) storedViews(t *testing.T) string {
	t.Helper()
	var v string
	if err := f.s.db.QueryRow(`SELECT views FROM collections WHERE page_id = ?`, f.col).Scan(&v); err != nil {
		t.Fatal(err)
	}
	return v
}

// SC-003: while the views are locked, every door that writes a database's
// views refuses, with views_locked and the views untouched. The doors are
// listed by calling them: REST PUT with changed views, and MCP set_view
// (create and update) and delete_view. Each is one call to
// checkViewsUnlocked; a door that forgot it would store its change here.
func TestEveryViewDoorIsRefusedWhileLocked(t *testing.T) {
	f := newLockFixture(t)
	f.lock(t)
	before := f.storedViews(t)

	rec := requestAs(t, f.s, f.cookie, "PUT", "/api/collections/"+f.col,
		`{"views":[{"id":"t","name":"Renamed","type":"table"},{"id":"b","name":"Board","type":"board","groupBy":"status"}]}`)
	if rec.Code != 409 || !strings.Contains(rec.Body.String(), `"views_locked"`) ||
		!strings.Contains(rec.Body.String(), "this database's views are locked; unlock them to change a view") {
		t.Errorf("REST PUT: %d %s, want 409 views_locked", rec.Code, rec.Body.String())
	}
	// Column widths, order and hidden columns are view changes too (FR-008).
	rec = requestAs(t, f.s, f.cookie, "PUT", "/api/collections/"+f.col,
		`{"views":[{"id":"t","name":"Table","type":"table","colWidths":{"__title":300}},{"id":"b","name":"Board","type":"board","groupBy":"status"}]}`)
	if rec.Code != 409 {
		t.Errorf("REST PUT of a column width: %d, want 409", rec.Code)
	}

	for _, c := range []struct{ tool, args string }{
		{"set_view", `{"page_id":"` + f.col + `","name":"New","type":"table"}`},
		{"set_view", `{"page_id":"` + f.col + `","view_id":"t","name":"Renamed"}`},
		{"set_view", `{"page_id":"` + f.col + `","view_id":"t","filters":[{"property":"status","op":"is","value":"open"}]}`},
		{"delete_view", `{"page_id":"` + f.col + `","view_id":"b"}`},
	} {
		_, err := callTool(t, f.s, f.agent, c.tool, c.args)
		if err == nil || !errors.Is(err, errViewsLocked) ||
			!strings.Contains(err.Error(), "a person can unlock them in the interface") {
			t.Errorf("%s %s: %v, want the views lock refusal", c.tool, c.args, err)
		}
	}
	if after := f.storedViews(t); after != before {
		t.Errorf("a refused door changed the views:\nbefore %s\nafter  %s", before, after)
	}
	var n int
	f.s.db.QueryRow(`SELECT COUNT(*) FROM audit_log WHERE action LIKE 'view.%'`).Scan(&n)
	if n != 0 {
		t.Errorf("%d view entries logged for refused changes", n)
	}

	// Unlocked, the same changes go through (US2 scenario 5).
	if rec := requestAs(t, f.s, f.cookie, "DELETE", "/api/collections/"+f.col+"/lock", ""); rec.Code != 200 || !strings.Contains(rec.Body.String(), `"viewsLocked":null`) {
		t.Fatalf("unlock: %d %s", rec.Code, rec.Body.String())
	}
	if _, err := callTool(t, f.s, f.agent, "set_view", `{"page_id":"`+f.col+`","view_id":"t","name":"Renamed"}`); err != nil {
		t.Errorf("set_view after unlock: %v", err)
	}
	if _, err := callTool(t, f.s, f.agent, "delete_view", `{"page_id":"`+f.col+`","view_id":"b"}`); err != nil {
		t.Errorf("delete_view after unlock: %v", err)
	}
}

// What the lock lets through (FR-009, research R3): a save whose views come
// out as they are (the browser sends them back beside a schema change, in its
// own key order), a schema-only save, and row edits.
func TestTheLockLetsUnchangedViewsSchemaAndRowsThrough(t *testing.T) {
	f := newLockFixture(t)
	f.lock(t)
	// Same views, keys in another order and with whitespace.
	rec := requestAs(t, f.s, f.cookie, "PUT", "/api/collections/"+f.col,
		`{"schema":[{"id":"status","name":"Status","type":"select","options":[{"id":"open","name":"Open"}]},{"id":"extra","name":"Extra","type":"text"}],
		  "views":[{"type":"table","name":"Table","id":"t"}, {"groupBy":"status","type":"board","id":"b","name":"Board"}]}`)
	if rec.Code != 200 {
		t.Errorf("unchanged views beside a schema change: %d %s", rec.Code, rec.Body.String())
	}
	if rec := requestAs(t, f.s, f.cookie, "PUT", "/api/collections/"+f.col, `{"schema":[{"id":"status","name":"Status","type":"select"}]}`); rec.Code != 200 {
		t.Errorf("schema-only save: %d %s", rec.Code, rec.Body.String())
	}
	if _, err := callTool(t, f.s, f.agent, "update_schema", `{"page_id":"`+f.col+`","properties":[{"name":"Owner","type":"text"}]}`); err != nil {
		t.Errorf("update_schema while locked: %v", err)
	}
	if _, err := callTool(t, f.s, f.agent, "create_rows", `{"page_id":"`+f.col+`","rows":[{"title":"Still works"}]}`); err != nil {
		t.Errorf("a new row while locked: %v", err)
	}
	// A set_view that changes nothing is not a change.
	if _, err := callTool(t, f.s, f.agent, "set_view", `{"page_id":"`+f.col+`","view_id":"t","name":"Table"}`); err != nil {
		t.Errorf("a set_view that changes nothing: %v", err)
	}
}

// The lock routes: a person who can edit locks and unlocks; a reader cannot
// (US2 scenario 6) but sees the lock; a token cannot, whatever its scope
// (session only, FR-011); get_collection shows it to an agent and GET to
// the interface; both acts are in the activity log.
func TestLockRoutesAreForPeopleWhoCanEdit(t *testing.T) {
	f := newLockFixture(t)
	path := "/api/collections/" + f.col + "/lock"

	if rec := requestAs(t, f.s, f.readerCookie, "PUT", path, ""); rec.Code != 404 {
		t.Errorf("a reader locked: %d %s", rec.Code, rec.Body.String())
	}
	for _, m := range []string{"PUT", "DELETE"} {
		if rec := f.bearer(m, path, ""); rec.Code != 403 || !strings.Contains(rec.Body.String(), "session_required") {
			t.Errorf("a token %s the lock: %d %s", m, rec.Code, rec.Body.String())
		}
	}
	if l := f.s.viewsLock(f.col); l != nil {
		t.Fatalf("locked by a refused call: %+v", l)
	}

	rec := requestAs(t, f.s, f.cookie, "PUT", path, "")
	var got struct {
		ViewsLocked *viewsLockInfo `json:"viewsLocked"`
	}
	if rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &got) != nil || got.ViewsLocked == nil ||
		got.ViewsLocked.By != f.owner || got.ViewsLocked.ByName != "Test" || got.ViewsLocked.At == "" {
		t.Fatalf("lock: %d %s", rec.Code, rec.Body.String())
	}
	// The reader sees it.
	rec = requestAs(t, f.s, f.readerCookie, "GET", "/api/collections/"+f.col, "")
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"viewsLocked":{"by":"`+f.owner+`"`) {
		t.Errorf("GET for a reader: %d %s", rec.Code, rec.Body.String())
	}
	// An agent sees it, without the person's name.
	out, err := callTool(t, f.s, f.agent, "get_collection", `{"page_id":"`+f.col+`"}`)
	if err != nil || !strings.Contains(out, `"views_locked":{"at":"`) || !strings.Contains(out, `"by":"`+f.owner+`"`) {
		t.Errorf("get_collection: %v %s", err, out)
	}
	if rec := requestAs(t, f.s, f.readerCookie, "DELETE", path, ""); rec.Code != 404 {
		t.Errorf("a reader unlocked: %d", rec.Code)
	}
	if rec := requestAs(t, f.s, f.cookie, "DELETE", path, ""); rec.Code != 200 {
		t.Errorf("unlock: %d %s", rec.Code, rec.Body.String())
	}
	out, _ = callTool(t, f.s, f.agent, "get_collection", `{"page_id":"`+f.col+`"}`)
	if !strings.Contains(out, `"views_locked":null`) {
		t.Errorf("get_collection after unlock: %s", out)
	}
	rows, _ := f.s.db.Query(`SELECT action, actor_type FROM audit_log WHERE action LIKE 'views.%' ORDER BY id`)
	var log []string
	for rows.Next() {
		var a, at string
		rows.Scan(&a, &at)
		log = append(log, a+"/"+at)
	}
	rows.Close()
	if strings.Join(log, " ") != "views.lock/human views.unlock/human" {
		t.Errorf("activity log: %v, want a lock and an unlock by a person", log)
	}
	// A page that is not a database has no views to lock.
	page := f.s.makePage(t, f.ws, f.owner, "", "Plain", `{}`)
	if rec := requestAs(t, f.s, f.cookie, "PUT", "/api/collections/"+page+"/lock", ""); rec.Code != 404 {
		t.Errorf("locking a plain page: %d", rec.Code)
	}
}

// Code review findings, each a test so it cannot come back.
//
// A save over REST with a token is an agent's, in the log as in
// edit_content: "Only what agents did" must find a script that re-filtered a
// view. A chart's hidden groups are logged (set_view no longer writes its
// generic entry, so a key left out would leave nothing). A lock that cannot
// be read refuses rather than lets the save through.
func TestViewLockReviewFindings(t *testing.T) {
	f := newLockFixture(t)
	rec := f.bearer("PUT", "/api/collections/"+f.col,
		`{"views":[{"id":"t","name":"Table","type":"table","sort":{"property":"due","dir":"asc"}},{"id":"b","name":"Board","type":"board","groupBy":"status"}]}`)
	if rec.Code != 200 {
		t.Fatalf("token PUT: %d %s", rec.Code, rec.Body.String())
	}
	got := viewLog(t, f.s, f.col, 0)
	if actionsOf(got) != "view.update/agent" {
		t.Errorf("a token's view change logged as %q, want view.update/agent", actionsOf(got))
	}

	mark := lastAuditID(t, f.s)
	if _, err := callTool(t, f.s, f.agent, "set_view", `{"page_id":"`+f.col+`","type":"chart","name":"Chart","group_by":"status"}`); err != nil {
		t.Fatal(err)
	}
	_, views, _ := f.s.loadCollection(f.col)
	chart, _ := views[len(views)-1]["id"].(string)
	mark = lastAuditID(t, f.s)
	if _, err := callTool(t, f.s, f.agent, "set_view", `{"page_id":"`+f.col+`","view_id":"`+chart+`","hidden_groups":["done"]}`); err != nil {
		t.Fatal(err)
	}
	if got := viewLog(t, f.s, f.col, mark); actionsOf(got) != "view.update/agent" || !strings.Contains(got[0].changes, "hiddenGroups") {
		t.Errorf("hiding a chart's group logged %q", actionsOf(got))
	}

	// The lock column gone: the read fails, and the save is refused.
	if _, err := f.s.db.Exec(`ALTER TABLE collections RENAME COLUMN views_locked_by TO gone`); err != nil {
		t.Fatal(err)
	}
	if err := f.s.checkViewsUnlocked(f.col, []byte(`[]`), []byte(`[{"id":"x"}]`)); !errors.Is(err, errViewsLocked) {
		t.Errorf("an unreadable lock let a change through: %v", err)
	}
}
