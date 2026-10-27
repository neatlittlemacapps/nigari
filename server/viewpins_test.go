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
