package server

import (
	"encoding/json"
	"strings"
	"testing"
)

// Agents chart a database the way a person does (spec 004, US3): query_rows
// with group_by gives the numbers the route gives, set_view builds the chart a
// person builds, embed_database puts it into a document. And the refusals:
// what a person cannot do through the interface, an agent cannot do either.
func TestAgentsChartLikePeople(t *testing.T) {
	s := testServer(t)
	uid, cookie := signedIn(t, s, "owner@example.test")
	ws := s.firstWorkspaceOf(t, uid)
	col := s.makeCollection(t, ws, uid, "Tasks", `[{"id":"st","name":"Status","type":"select","options":[{"id":"a","name":"Ideas"},{"id":"b","name":"Done"}]},{"id":"n","name":"Hours","type":"number"},{"id":"tx","name":"Note","type":"text"}]`)
	for _, p := range []string{`{"st":"a","n":1}`, `{"st":"a","n":2}`, `{"st":"b","n":5}`, `{"n":"x"}`} {
		s.makeRow(t, ws, uid, col, "r", p)
	}
	u := &user{ID: uid}
	unwrap := func(out string) map[string]any {
		t.Helper()
		start, end := strings.Index(out, "{"), strings.LastIndex(out, "}")
		var m map[string]any
		if start < 0 || json.Unmarshal([]byte(out[start:end+1]), &m) != nil {
			t.Fatalf("not JSON: %s", out)
		}
		return m
	}

	// The same numbers as the route, labels inside the untrusted wrapper.
	out, err := callTool(t, s, u, "query_rows", `{"page_id":"`+col+`","group_by":"st","aggregate":"sum","aggregate_property":"n"}`)
	if err != nil {
		t.Fatalf("query_rows group_by: %v", err)
	}
	if !strings.Contains(out, "UNTRUSTED") {
		t.Errorf("labels are user data and must be wrapped: %s", out)
	}
	rec := requestAs(t, s, cookie, "POST", "/api/collections/"+col+"/aggregate", `{"groupBy":"st","aggregate":"sum","aggregateProp":"n"}`)
	var viaREST map[string]any
	json.Unmarshal(rec.Body.Bytes(), &viaREST)
	got := unwrap(out)
	b1, _ := json.Marshal(got["groups"])
	b2, _ := json.Marshal(viaREST["groups"])
	if string(b1) != string(b2) || got["left_out"].(float64) != 1 {
		t.Errorf("MCP %s\nREST %s", b1, b2)
	}
	// Without a grouping: one value.
	out, err = callTool(t, s, u, "query_rows", `{"page_id":"`+col+`","aggregate":"max","aggregate_property":"n"}`)
	if err != nil || unwrap(out)["value"].(float64) != 5 || unwrap(out)["rows"].(float64) != 4 {
		t.Errorf("one value: %v %s", err, out)
	}
	// What cannot be charted is refused with the reason.
	if _, err := callTool(t, s, u, "query_rows", `{"page_id":"`+col+`","group_by":"tx"}`); err == nil || !strings.Contains(err.Error(), "groups by") {
		t.Errorf("grouping by text: %v", err)
	}

	// set_view builds a chart; its numbers come back through view_id.
	if _, err := callTool(t, s, u, "set_view", `{"page_id":"`+col+`","type":"chart","name":"Hours","chart_kind":"hbar","group_by":"st","aggregate":"sum","aggregate_property":"n","chart_sort":"value_desc","hidden_groups":[""],"chart_style":{"palette":"teal","center_label":"Hours"}}`); err != nil {
		t.Fatalf("set_view chart: %v", err)
	}
	view := viewByID(t, s, col, "hours")
	style, _ := view["chartStyle"].(map[string]any)
	if view["chartKind"] != "hbar" || view["agg"] != "sum" || view["aggProp"] != "n" || style["centerLabel"] != "Hours" || style["palette"] != "teal" {
		t.Errorf("stored chart: %v", view)
	}
	out, err = callTool(t, s, u, "query_rows", `{"page_id":"`+col+`","view_id":"hours"}`)
	if err != nil || !strings.Contains(out, `"value":3`) {
		t.Errorf("query_rows by the chart view: %v %s", err, out)
	}
	// A style key set to null is removed; a count drops the property it no
	// longer reads.
	if _, err := callTool(t, s, u, "set_view", `{"page_id":"`+col+`","view_id":"hours","aggregate":"count","chart_style":{"center_label":null}}`); err != nil {
		t.Fatalf("set_view update: %v", err)
	}
	view = viewByID(t, s, col, "hours")
	if _, has := view["aggProp"]; has {
		t.Errorf("a count kept aggProp: %v", view)
	}
	if st, _ := view["chartStyle"].(map[string]any); st["centerLabel"] != nil || st["palette"] != "teal" {
		t.Errorf("style merge: %v", view["chartStyle"])
	}
	for _, bad := range []string{
		`{"page_id":"` + col + `","type":"chart","name":"No grouping"}`,
		`{"page_id":"` + col + `","type":"chart","group_by":"tx"}`,
		`{"page_id":"` + col + `","type":"chart","group_by":"st","chart_style":{"palette":"neon"}}`,
		`{"page_id":"` + col + `","type":"table","chart_kind":"bar"}`,
	} {
		if _, err := callTool(t, s, u, "set_view", bad); err == nil {
			t.Errorf("accepted: %s", bad)
		}
	}
	if _, err := callTool(t, s, u, "query_rows", `{"page_id":"`+col+`","view_id":"`+firstViewID(t, s, col)+`"}`); err == nil && firstViewID(t, s, col) != "hours" {
		t.Error("a table view was taken for a chart")
	}

	// embed_database shows the chart in a document; a view of another
	// database is refused, and nothing is written.
	doc := s.makePage(t, ws, uid, "", "Weekly note", `{}`)
	other := s.makeCollection(t, ws, uid, "Other", `[]`)
	if _, err := callTool(t, s, u, "embed_database", `{"page_id":"`+doc+`","database_id":"`+other+`","view_id":"hours"}`); err == nil {
		t.Error("a view of another database was embedded")
	}
	if _, err := callTool(t, s, u, "embed_database", `{"page_id":"`+doc+`","database_id":"`+col+`","view_id":"hours"}`); err != nil {
		t.Fatalf("embed chart: %v", err)
	}
	var content string
	s.db.QueryRow(`SELECT content FROM pages WHERE id = ?`, doc).Scan(&content)
	if strings.Count(content, `"type":"database"`) != 1 || !strings.Contains(content, `\"viewId\":\"hours\"`) {
		t.Errorf("the document holds: %s", content)
	}
}

func firstViewID(t *testing.T, s *Server, col string) string {
	_, views, _ := s.loadCollection(col)
	if len(views) == 0 {
		return ""
	}
	id, _ := views[0]["id"].(string)
	return id
}

// The gates, on the agent's side: a read-scoped token may aggregate (it is a
// read) but not save a chart view or embed one; a workspace closed to agents
// is closed to its charts too.
func TestChartGatesForAgents(t *testing.T) {
	s := testServer(t)
	uid, _ := signedIn(t, s, "owner@example.test")
	ws := s.firstWorkspaceOf(t, uid)
	col := s.makeCollection(t, ws, uid, "Tasks", `[{"id":"st","name":"Status","type":"select","options":[{"id":"a","name":"A"}]}]`)
	s.makeRow(t, ws, uid, col, "r", `{"st":"a"}`)
	doc := s.makePage(t, ws, uid, "", "Doc", `{}`)
	reader := &user{ID: uid, TokenKind: tokenKindAPI, TokenScope: "read"}
	if _, err := callTool(t, s, reader, "query_rows", `{"page_id":"`+col+`","group_by":"st"}`); err != nil {
		t.Errorf("a read token may aggregate: %v", err)
	}
	if _, err := callTool(t, s, reader, "set_view", `{"page_id":"`+col+`","type":"chart","group_by":"st"}`); err == nil {
		t.Error("a read token saved a chart view")
	}
	if _, err := callTool(t, s, reader, "embed_database", `{"page_id":"`+doc+`","database_id":"`+col+`"}`); err == nil {
		t.Error("a read token embedded a chart")
	}
	if _, err := s.db.Exec(`UPDATE workspaces SET agent_access = 'closed' WHERE id = ?`, ws); err != nil {
		t.Fatal(err)
	}
	agent := &user{ID: uid, TokenKind: tokenKindAPI, TokenScope: "write"}
	if _, err := callTool(t, s, agent, "query_rows", `{"page_id":"`+col+`","group_by":"st"}`); err == nil {
		t.Error("a workspace closed to agents gave an agent its chart's numbers")
	}
}

// Each row for agents (FR-030): set_view stores it, query_rows answers with
// one group per row through the view or spelled out, and a count is refused
// with the way out, as for people.
func TestAgentsChartEachRow(t *testing.T) {
	s := testServer(t)
	uid, cookie := signedIn(t, s, "owner@example.test")
	ws := s.firstWorkspaceOf(t, uid)
	col := s.makeCollection(t, ws, uid, "Costs", `[{"id":"amt","name":"Amount","type":"number"}]`)
	s.makeRow(t, ws, uid, col, "Rent", `{"amt":1200}`)
	s.makeRow(t, ws, uid, col, "Food", `{"amt":450}`)
	u := &user{ID: uid}

	if _, err := callTool(t, s, u, "set_view", `{"page_id":"`+col+`","type":"chart","name":"Per row","group_by":"__row"}`); err == nil || !strings.Contains(err.Error(), "not count") {
		t.Errorf("a counting Each row chart: %v, want refused with the way out", err)
	}
	if _, err := callTool(t, s, u, "set_view", `{"page_id":"`+col+`","type":"chart","name":"Per row","group_by":"__row","aggregate":"sum","aggregate_property":"amt"}`); err != nil {
		t.Fatalf("set_view each row: %v", err)
	}
	if v := viewByID(t, s, col, "per-row"); v["groupBy"] != "__row" || v["aggProp"] != "amt" {
		t.Errorf("stored: %v", v)
	}
	for _, args := range []string{
		`{"page_id":"` + col + `","view_id":"per-row"}`,
		`{"page_id":"` + col + `","group_by":"__row","aggregate":"sum","aggregate_property":"amt"}`,
	} {
		out, err := callTool(t, s, u, "query_rows", args)
		if err != nil {
			t.Fatalf("query_rows %s: %v", args, err)
		}
		if i, j := strings.Index(out, `"Rent"`), strings.Index(out, `"Food"`); i < 0 || j < i || !strings.Contains(out, `"value":1200`) {
			t.Errorf("query_rows %s: want Rent (1200) before Food, got %s", args, out)
		}
	}
	rec := requestAs(t, s, cookie, "POST", "/api/collections/"+col+"/aggregate", `{"groupBy":"__row"}`)
	if rec.Code != 400 || !strings.Contains(rec.Body.String(), "invalid_chart") {
		t.Errorf("REST counting each row: %d %s", rec.Code, rec.Body.String())
	}
}
