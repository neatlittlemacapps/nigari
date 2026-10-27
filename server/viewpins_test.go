package server

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// pinsFromFilters decides what a new row made in a filtered view stores (spec
// 005). Each case is one line of the rule in research R1 or one edge case of
// the spec. A wrong pin is data nobody chose, so the "pins nothing" cases
// matter as much as the ones that pin.
func TestPinsFromFiltersStoresTheSingleAnswerInItsOwnForm(t *testing.T) {
	schema := []map[string]any{
		{"id": "status", "type": "select", "options": []any{map[string]any{"id": "todo", "name": "To do"}, map[string]any{"id": "done", "name": "Done"}}},
		{"id": "tags", "type": "multiselect", "options": []any{map[string]any{"id": "red", "name": "Red"}}},
		{"id": "est", "type": "number"},
		{"id": "ok", "type": "checkbox"},
		{"id": "due", "type": "date"},
		{"id": "note", "type": "text"},
		{"id": "owner", "type": "person"},
		{"id": "crew", "type": "person", "personMultiple": true},
		{"id": "rel", "type": "relation"},
		{"id": "calc", "type": "formula"},
		{"id": "sum", "type": "rollup"},
		{"id": "seen", "type": "lastActivity"},
	}
	now := time.Date(2026, 10, 27, 15, 0, 0, 0, time.UTC)
	cases := []struct {
		name    string
		filters []rowFilter
		want    string // the pins as JSON
	}{
		{"a select option", []rowFilter{{Prop: "status", Op: "is", Value: "todo"}}, `{"status":"todo"}`},
		{"no op and a value means is", []rowFilter{{Prop: "status", Value: "todo"}}, `{"status":"todo"}`},
		{"a set of one is one answer", []rowFilter{{Prop: "status", Op: "is", Values: []string{"todo"}}}, `{"status":"todo"}`},
		{"a multiselect holds the one option", []rowFilter{{Prop: "tags", Op: "is", Value: "red"}}, `{"tags":["red"]}`},
		{"a number is stored as a number", []rowFilter{{Prop: "est", Op: "is", Value: "5"}}, `{"est":5}`},
		{"a ticked box", []rowFilter{{Prop: "ok", Op: "is", Value: "true"}}, `{"ok":true}`},
		{"an unticked box", []rowFilter{{Prop: "ok", Op: "is", Value: "false"}}, `{"ok":false}`},
		{"a relative day is the day it means", []rowFilter{{Prop: "due", Op: "is", Value: "today"}}, `{"due":"2026-10-27"}`},
		{"tomorrow", []rowFilter{{Prop: "due", Op: "is", Value: "tomorrow"}}, `{"due":"2026-10-28"}`},
		{"a plain date", []rowFilter{{Prop: "due", Op: "is", Value: "2026-12-24"}}, `{"due":"2026-12-24"}`},
		{"text", []rowFilter{{Prop: "note", Op: "is", Value: "call back"}}, `{"note":"call back"}`},
		{"one person", []rowFilter{{Prop: "owner", Op: "is", Value: "u1"}}, `{"owner":"u1"}`},
		{"a person property taking several", []rowFilter{{Prop: "crew", Op: "is", Value: "u1"}}, `{"crew":["u1"]}`},
		{"a relation", []rowFilter{{Prop: "rel", Op: "is", Value: "p1"}}, `{"rel":["p1"]}`},
		{"two properties", []rowFilter{{Prop: "status", Op: "is", Value: "todo"}, {Prop: "owner", Op: "is", Value: "u1"}}, `{"owner":"u1","status":"todo"}`},
		{"two filters that agree", []rowFilter{{Prop: "status", Op: "is", Value: "todo"}, {Prop: "status", Op: "is", Values: []string{"todo"}}}, `{"status":"todo"}`},

		{"two filters that disagree pin nothing", []rowFilter{{Prop: "status", Op: "is", Value: "todo"}, {Prop: "status", Op: "is", Value: "done"}}, `{}`},
		{"several values are no single answer", []rowFilter{{Prop: "status", Op: "is", Values: []string{"todo", "done"}}}, `{}`},
		{"an unarmed filter", []rowFilter{{Prop: "status", Op: "is"}}, `{}`},
		{"is_empty needs nothing", []rowFilter{{Prop: "status", Op: "is_empty"}}, `{}`},
		{"is_not", []rowFilter{{Prop: "status", Op: "is_not", Value: "done"}}, `{}`},
		{"contains", []rowFilter{{Prop: "note", Op: "contains", Value: "bug"}}, `{}`},
		{"a range", []rowFilter{{Prop: "est", Op: "gt", Value: "3"}}, `{}`},
		{"between", []rowFilter{{Prop: "due", Op: "between", Value: "2026-10-01", Value2: "2026-10-31"}}, `{}`},
		{"no op and no value is is_not_empty", []rowFilter{{Prop: "note"}}, `{}`},
		{"an option that is gone", []rowFilter{{Prop: "status", Op: "is", Value: "archived"}}, `{}`},
		{"a number that does not parse", []rowFilter{{Prop: "est", Op: "is", Value: "five"}}, `{}`},
		{"a box that is neither", []rowFilter{{Prop: "ok", Op: "is", Value: "yes"}}, `{}`},
		{"a word that names no day", []rowFilter{{Prop: "due", Op: "is", Value: "soon"}}, `{}`},
		{"a half-typed relative day", []rowFilter{{Prop: "due", Op: "is", Value: "today-"}}, `{}`},
		{"a formula", []rowFilter{{Prop: "calc", Op: "is", Value: "1"}}, `{}`},
		{"a rollup", []rowFilter{{Prop: "sum", Op: "is", Value: "1"}}, `{}`},
		{"last activity", []rowFilter{{Prop: "seen", Op: "is", Value: "today"}}, `{}`},
		// The title is not a property; a new row has no title of its own.
		{"the title", []rowFilter{{Prop: "title", Op: "is", Value: "Bug"}}, `{}`},
	}
	for _, c := range cases {
		got, _ := json.Marshal(pinsFromFilters(schema, c.filters, now))
		if string(got) != c.want {
			t.Errorf("%s: pinned %s, want %s", c.name, got, c.want)
		}
	}
}

// viewFixture is a task database with two views: "To do" pins a status,
// "Big" asks for an estimate over 3 and pins nothing. A second database has
// a view of its own, for the refusal.
func viewFixture(t *testing.T) (s *Server, cookie, col, other string) {
	t.Helper()
	s = testServer(t)
	uid, cookie := signedIn(t, s, "pins@example.test")
	ws := s.firstWorkspaceOf(t, uid)
	schema := `[{"id":"status","name":"Status","type":"select","options":[{"id":"todo","name":"To do"},{"id":"doing","name":"Doing"},{"id":"done","name":"Done"}]},{"id":"est","name":"Estimate","type":"number"}]`
	col = s.makeCollection(t, ws, uid, "Tasks", schema)
	views := `[{"id":"v-todo","name":"To do","type":"table","filters":[{"property":"status","op":"is","value":"todo"}]},` +
		`{"id":"v-big","name":"Big","type":"table","filters":[{"property":"est","op":"gt","value":"3"}]}]`
	if _, err := s.db.Exec(`UPDATE collections SET views = ? WHERE page_id = ?`, views, col); err != nil {
		t.Fatal(err)
	}
	other = s.makeCollection(t, ws, uid, "Other", `[]`)
	if _, err := s.db.Exec(`UPDATE collections SET views = '[{"id":"v-other","name":"Other","type":"table"}]' WHERE page_id = ?`, other); err != nil {
		t.Fatal(err)
	}
	return s, cookie, col, other
}

func postJSON(t *testing.T, s *Server, cookie, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest("POST", path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Cookie", cookie)
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, req)
	return rec
}

func (s *Server) rowCount(t *testing.T, col string) (n int) {
	t.Helper()
	s.db.QueryRow(`SELECT COUNT(*) FROM pages WHERE parent_id = ?`, col).Scan(&n)
	return n
}

// POST /api/pages with a view id (US1): the row stores the view's single
// answers, explicit props win, and the answer says whether the row shows.
func TestNewRowInAViewTakesItsFilterValues(t *testing.T) {
	s, cookie, col, other := viewFixture(t)
	create := func(body string) (map[string]any, int) {
		rec := postJSON(t, s, cookie, "/api/pages", body)
		var out map[string]any
		_ = json.Unmarshal(rec.Body.Bytes(), &out)
		return out, rec.Code
	}

	got, code := create(`{"parentId":"` + col + `","title":"","viewId":"v-todo"}`)
	if code != 200 {
		t.Fatalf("create in view: %d %v", code, got)
	}
	id, _ := got["id"].(string)
	if p := s.propsOf(t, id); p["status"] != "todo" {
		t.Errorf("the row stored %v, want status todo", p)
	}
	if got["matchesView"] != true {
		t.Errorf("matchesView = %v, want true", got["matchesView"])
	}

	// A board column, a form or an agent's own value wins over the pin; the
	// row then leaves the view, and the answer says so.
	got, _ = create(`{"parentId":"` + col + `","title":"","viewId":"v-todo","props":{"status":"doing"}}`)
	id, _ = got["id"].(string)
	if p := s.propsOf(t, id); p["status"] != "doing" {
		t.Errorf("explicit props lost: %v", p)
	}
	if got["matchesView"] != false {
		t.Errorf("matchesView = %v for a row outside the view, want false", got["matchesView"])
	}

	// A view that pins nothing: the row is created as before and does not show.
	got, _ = create(`{"parentId":"` + col + `","title":"","viewId":"v-big"}`)
	if got["matchesView"] != false {
		t.Errorf("Estimate > 3 with no estimate: matchesView = %v, want false", got["matchesView"])
	}

	// No view: exactly as before, no matchesView in the answer.
	got, _ = create(`{"parentId":"` + col + `","title":""}`)
	if _, has := got["matchesView"]; has {
		t.Errorf("a create without a view answered matchesView")
	}

	// A view of another database, or a view without a database: refused, and
	// nothing is created.
	before := s.rowCount(t, col)
	if rec := postJSON(t, s, cookie, "/api/pages", `{"parentId":"`+col+`","title":"","viewId":"v-other"}`); rec.Code != 400 || !strings.Contains(rec.Body.String(), "view_not_in_database") {
		t.Errorf("a foreign view: %d %s, want 400 view_not_in_database", rec.Code, rec.Body.String())
	}
	if rec := postJSON(t, s, cookie, "/api/pages", `{"title":"Loose","viewId":"v-todo"}`); rec.Code != 400 {
		t.Errorf("a view without a database parent: %d, want 400", rec.Code)
	}
	if n := s.rowCount(t, col); n != before {
		t.Errorf("a refused create left %d row(s) behind", n-before)
	}
	_ = other
}

// Naming a view grants nothing: somebody who cannot write the database is
// refused before the view is even read.
func TestAViewIdDoesNotOpenADatabase(t *testing.T) {
	s, _, col, _ := viewFixture(t)
	_, stranger := signedIn(t, s, "stranger@example.test")
	before := s.rowCount(t, col)
	if rec := postJSON(t, s, stranger, "/api/pages", `{"parentId":"`+col+`","title":"","viewId":"v-todo"}`); rec.Code == 200 {
		t.Fatalf("a stranger created a row through a view id: %s", rec.Body.String())
	}
	if n := s.rowCount(t, col); n != before {
		t.Errorf("the stranger left %d row(s) behind", n-before)
	}
}

// Template, then pins, then props (research R5): the view the person is
// looking at beats the template's own value.
func TestAViewBeatsATemplateAndPropsBeatTheView(t *testing.T) {
	s, cookie, col, _ := viewFixture(t)
	rec := postJSON(t, s, cookie, "/api/collections/"+col+"/templates", `{"title":"Done task"}`)
	if rec.Code != 200 {
		t.Fatalf("add template: %d %s", rec.Code, rec.Body.String())
	}
	var tpl map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &tpl)
	tplID, _ := tpl["id"].(string)
	if _, err := s.db.Exec(`UPDATE pages SET props = '{"status":"done","est":8}' WHERE id = ?`, tplID); err != nil {
		t.Fatal(err)
	}

	rec = postJSON(t, s, cookie, "/api/collections/"+col+"/from-template", `{"templateId":"`+tplID+`","viewId":"v-todo"}`)
	var got map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	id, _ := got["id"].(string)
	p := s.propsOf(t, id)
	if p["status"] != "todo" || p["est"] != float64(8) {
		t.Errorf("from template in a view: %v, want status todo (the view) and est 8 (the template)", p)
	}
	if got["matchesView"] != true {
		t.Errorf("matchesView = %v, want true", got["matchesView"])
	}

	rec = postJSON(t, s, cookie, "/api/collections/"+col+"/from-template", `{"templateId":"`+tplID+`","viewId":"v-todo","props":{"status":"doing"}}`)
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	id, _ = got["id"].(string)
	if p := s.propsOf(t, id); p["status"] != "doing" {
		t.Errorf("explicit props under a template and a view: %v, want status doing", p)
	}

	if rec := postJSON(t, s, cookie, "/api/collections/"+col+"/from-template", `{"templateId":"`+tplID+`","viewId":"nope"}`); rec.Code != 400 {
		t.Errorf("unknown view on the template route: %d, want 400", rec.Code)
	}
}

// create_page and create_rows with view_id (US3): the same pins, the same
// precedence and the same refusals as the interface's door.
func TestAnAgentMakingARowInAViewGetsTheSameValues(t *testing.T) {
	s, _, col, other := viewFixture(t)
	var uid string
	s.db.QueryRow(`SELECT id FROM users WHERE email = 'pins@example.test'`).Scan(&uid)
	agent := &user{ID: uid, Name: "Agent", TokenKind: tokenKindAPI, TokenScope: "write"}

	out, err := callTool(t, s, agent, "create_page", `{"parent_id":"`+col+`","title":"Agent task","view_id":"v-todo"}`)
	if err != nil || !strings.Contains(out, "matches_view: true") {
		t.Fatalf("create_page in a view: %v %s", err, out)
	}
	var id string
	s.db.QueryRow(`SELECT id FROM pages WHERE parent_id = ? AND title = 'Agent task'`, col).Scan(&id)
	if p := s.propsOf(t, id); p["status"] != "todo" {
		t.Errorf("create_page stored %v, want status todo", p)
	}

	// The agent's own value wins, and the answer says the row will not show.
	out, err = callTool(t, s, agent, "create_page", `{"parent_id":"`+col+`","title":"Doing task","view_id":"v-todo","properties":{"status":"Doing"}}`)
	if err != nil || !strings.Contains(out, "matches_view: false") || !strings.Contains(out, "will not show") {
		t.Errorf("explicit value in a view: %v %s", err, out)
	}
	s.db.QueryRow(`SELECT id FROM pages WHERE parent_id = ? AND title = 'Doing task'`, col).Scan(&id)
	if p := s.propsOf(t, id); p["status"] != "doing" {
		t.Errorf("explicit value lost: %v", p)
	}

	// Many rows, one view: pins under each row's own properties; the rows that
	// leave the view are named.
	out, err = callTool(t, s, agent, "create_rows", `{"page_id":"`+col+`","view_id":"v-todo","rows":[{"title":"R1"},{"title":"R2","properties":{"status":"done"}}]}`)
	if err != nil {
		t.Fatalf("create_rows in a view: %v", err)
	}
	var rows struct {
		IDs         []string `json:"ids"`
		NotMatching []string `json:"not_matching"`
	}
	if err := json.Unmarshal([]byte(out), &rows); err != nil || len(rows.IDs) != 2 {
		t.Fatalf("create_rows answer: %s", out)
	}
	if p := s.propsOf(t, rows.IDs[0]); p["status"] != "todo" {
		t.Errorf("R1 stored %v, want status todo", p)
	}
	if len(rows.NotMatching) != 1 || rows.NotMatching[0] != rows.IDs[1] {
		t.Errorf("not_matching = %v, want just R2 (%s)", rows.NotMatching, rows.IDs[1])
	}

	// Refusals, each before anything is created.
	before := s.rowCount(t, col)
	for _, c := range []struct{ name, tool, args string }{
		{"a view of another database", "create_page", `{"parent_id":"` + col + `","title":"X","view_id":"v-other"}`},
		{"a view and no database", "create_page", `{"title":"X","view_id":"v-todo"}`},
		{"create_rows, a view of another database", "create_rows", `{"page_id":"` + col + `","view_id":"v-other","rows":[{"title":"X"}]}`},
	} {
		if _, err := callTool(t, s, agent, c.tool, c.args); err == nil {
			t.Errorf("%s: accepted", c.name)
		}
	}
	reader := &user{ID: uid, Name: "Reader", TokenKind: tokenKindAPI, TokenScope: "read"}
	if _, err := callTool(t, s, reader, "create_page", `{"parent_id":"`+col+`","title":"X","view_id":"v-todo"}`); err == nil || !strings.Contains(err.Error(), "read-only") {
		t.Errorf("a read-only token: %v, want read-only", err)
	}
	outsider, _ := signedIn(t, s, "outsider@example.test")
	stranger := &user{ID: outsider, Name: "Outsider", TokenKind: tokenKindAPI, TokenScope: "write"}
	if _, err := callTool(t, s, stranger, "create_page", `{"parent_id":"`+col+`","title":"X","view_id":"v-todo"}`); err == nil {
		t.Errorf("an outsider created a row through a view id")
	}
	if n := s.rowCount(t, col); n != before {
		t.Errorf("refused calls left %d row(s) behind", n-before)
	}
	_ = other
}

// SC-003: a person and an agent making a row in the same view store the same
// values. One function decides for both (constitution III); this holds them
// to it.
func TestAPersonAndAnAgentInTheSameViewStoreTheSameRow(t *testing.T) {
	s, cookie, col, _ := viewFixture(t)
	// A second view pinning two properties, a select and a number.
	if _, err := s.db.Exec(`UPDATE collections SET views = json_insert(views, '$[#]', json('{"id":"v-two","name":"Two","type":"table","filters":[{"property":"status","op":"is","value":"doing"},{"property":"est","op":"is","value":"2"}]}')) WHERE page_id = ?`, col); err != nil {
		t.Fatal(err)
	}
	var uid string
	s.db.QueryRow(`SELECT id FROM users WHERE email = 'pins@example.test'`).Scan(&uid)
	rec := postJSON(t, s, cookie, "/api/pages", `{"parentId":"`+col+`","title":"By hand","viewId":"v-two"}`)
	var person map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &person)
	personID, _ := person["id"].(string)
	if _, err := callTool(t, s, &user{ID: uid, Name: "Agent", TokenKind: tokenKindAPI, TokenScope: "write"}, "create_page",
		`{"parent_id":"`+col+`","title":"By agent","view_id":"v-two"}`); err != nil {
		t.Fatal(err)
	}
	var agentID string
	s.db.QueryRow(`SELECT id FROM pages WHERE parent_id = ? AND title = 'By agent'`, col).Scan(&agentID)
	a, _ := json.Marshal(s.propsOf(t, personID))
	b, _ := json.Marshal(s.propsOf(t, agentID))
	if string(a) != string(b) || string(a) != `{"est":2,"status":"doing"}` {
		t.Errorf("person stored %s, agent stored %s; want both {\"est\":2,\"status\":\"doing\"}", a, b)
	}
}

// What naming a view adds to making a row (spec 005, SC-004): one read of the
// view and one primary-key check of the new row. Measured beside a plain
// create on the seeded 1k-row database, through the REST door the interface
// uses.
func BenchmarkCreateRowWithView(b *testing.B) {
	w := sharedBenchWorld(b, 0, 1000)
	views := `[{"id":"v-bench","name":"Stage 2","type":"table","filters":[{"property":"stage","op":"is","value":"s2"}]}]`
	if _, err := w.s.db.Exec(`UPDATE collections SET views = ? WHERE page_id = ?`, views, w.rowsDB); err != nil {
		b.Fatal(err)
	}
	for _, c := range []struct{ name, body string }{
		{"plain", `{"parentId":"` + w.rowsDB + `","title":""}`},
		{"view", `{"parentId":"` + w.rowsDB + `","title":"","viewId":"v-bench"}`},
	} {
		b.Run(c.name, func(b *testing.B) {
			var l latencies
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				l.time(func() {
					req := httptest.NewRequest("POST", "/api/pages", strings.NewReader(c.body))
					req.Header.Set("Content-Type", "application/json")
					req.Header.Set("Cookie", w.memberCookie())
					rec := httptest.NewRecorder()
					w.s.ServeHTTP(rec, req)
					if rec.Code != 200 {
						b.Fatalf("create: %d %s", rec.Code, rec.Body.String())
					}
				})
			}
			l.report(b)
		})
	}
}
