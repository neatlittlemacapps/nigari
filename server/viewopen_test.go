package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"
)

// checkViewOpenIn is the one rule for how a view opens its rows (spec 007),
// shared by PUT /api/collections and MCP set_view. Each case is a line of
// research R2 or an edge case of the spec: a value the interface cannot
// honour must never be stored, and full page is stored as no key at all.
func TestViewOpenInRule(t *testing.T) {
	cases := []struct {
		name    string
		view    string
		wantErr string // "" = accepted
		wantKey any    // the stored openIn after the check; nil = no key
	}{
		{"no setting", `{"type":"table"}`, "", nil},
		{"side peek", `{"type":"board","openIn":"side_peek"}`, "", "side_peek"},
		{"full page is stored as no key", `{"type":"table","openIn":"full_page"}`, "", nil},
		{"an empty string is full page", `{"type":"table","openIn":""}`, "", nil},
		{"null is full page", `{"type":"table","openIn":null}`, "", nil},
		{"an unknown value", `{"type":"table","openIn":"sideways"}`, "must be full_page, side_peek or center_peek", nil},
		{"a value that is not a string", `{"type":"table","openIn":true}`, "must be full_page, side_peek or center_peek", nil},
		{"centre peek", `{"type":"table","openIn":"center_peek"}`, "", "center_peek"},
		{"centre peek on a form", `{"type":"form","openIn":"center_peek"}`, "form view", nil},
		{"a form shows no rows", `{"type":"form","openIn":"side_peek"}`, "form view", nil},
		{"a form may say full page", `{"type":"form","openIn":"full_page"}`, "", nil},
	}
	for _, c := range cases {
		var view map[string]any
		if err := json.Unmarshal([]byte(c.view), &view); err != nil {
			t.Fatalf("%s: %v", c.name, err)
		}
		err := checkViewOpenIn(view)
		switch {
		case c.wantErr == "" && err != nil:
			t.Errorf("%s: refused: %v", c.name, err)
		case c.wantErr != "" && (err == nil || !strings.Contains(err.Error(), c.wantErr)):
			t.Errorf("%s: got %v, want an error containing %q", c.name, err, c.wantErr)
		case c.wantErr == "":
			got, has := view["openIn"]
			if c.wantKey == nil && has {
				t.Errorf("%s: stored openIn %v, want no key", c.name, got)
			}
			if c.wantKey != nil && got != c.wantKey {
				t.Errorf("%s: stored openIn %v, want %v", c.name, got, c.wantKey)
			}
		}
	}
}

// A save that does not touch the setting must store exactly the bytes the
// browser sent: re-encoding would reorder every view's keys on every column
// resize.
func TestNormalizeViewsKeepsUntouchedBytes(t *testing.T) {
	raw := []byte(`[{"name":"A","id":"a","type":"table","openIn":"side_peek"},{"type":"board","id":"b"}]`)
	got, err := normalizeViews(raw, nil, nil)
	if err != nil || string(got) != string(raw) {
		t.Errorf("got %s, %v; want the same bytes back", got, err)
	}
	got, err = normalizeViews([]byte(`[{"id":"a","type":"table","openIn":"full_page"}]`), nil, nil)
	if err != nil || strings.Contains(string(got), "openIn") {
		t.Errorf("full_page: got %s, %v; want the key dropped", got, err)
	}
	if _, err := normalizeViews([]byte(`[{"id":"f","name":"Sign-up","type":"form","openIn":"side_peek"}]`), nil, nil); err == nil || !strings.Contains(err.Error(), "Sign-up") {
		t.Errorf("a refusal should name the view: %v", err)
	}
}

// The interface's door (US2): PUT /api/collections stores the setting, drops
// full page, and refuses a value it cannot honour without storing either half
// of the request.
func TestPutCollectionChecksTheViewOpenMode(t *testing.T) {
	s := testServer(t)
	uid, cookie := signedIn(t, s, "peek@example.test")
	ws := s.firstWorkspaceOf(t, uid)
	col := tasksCollection(t, s, ws, uid)
	put := func(body string) (int, string) {
		rec := requestAs(t, s, cookie, "PUT", "/api/collections/"+col, body)
		return rec.Code, rec.Body.String()
	}

	if code, body := put(`{"views":[{"id":"b","name":"Board","type":"board","groupBy":"status","openIn":"side_peek"}]}`); code != 200 {
		t.Fatalf("side peek: %d %s", code, body)
	}
	if v := viewByID(t, s, col, "b"); v["openIn"] != "side_peek" {
		t.Errorf("stored %v, want side_peek", v["openIn"])
	}

	if code, _ := put(`{"views":[{"id":"b","name":"Board","type":"board","groupBy":"status","openIn":"full_page"}]}`); code != 200 {
		t.Fatalf("full page: %d", code)
	}
	if v := viewByID(t, s, col, "b"); v["openIn"] != nil {
		t.Errorf("full page stored as %v, want no key", v["openIn"])
	}

	// Refusals: nothing of the request is stored, the schema half included.
	put(`{"views":[{"id":"b","name":"Board","type":"board","groupBy":"status","openIn":"side_peek"}]}`)
	for _, bad := range []string{
		`{"schema":[],"views":[{"id":"b","name":"Board","type":"board","groupBy":"status","openIn":"sideways"}]}`,
		`{"schema":[],"views":[{"id":"b","name":"Board","type":"board","groupBy":"status","openIn":"peek"}]}`,
		`{"schema":[],"views":[{"id":"f","name":"Form","type":"form","openIn":"side_peek"}]}`,
	} {
		code, body := put(bad)
		if code != 400 || !strings.Contains(body, "invalid_view_open_in") {
			t.Errorf("%s: %d %s, want 400 invalid_view_open_in", bad, code, body)
		}
	}
	if v := viewByID(t, s, col, "b"); v["openIn"] != "side_peek" {
		t.Errorf("a refused save changed the view: %v", v)
	}
	if schema, _, _ := s.loadCollection(col); len(schema) == 0 {
		t.Error("a refused save emptied the schema")
	}
}

// The agent's door (US3): set_view takes open_in through the same rule, merges
// like every other field, and refuses what the interface refuses.
func TestSetViewOpenIn(t *testing.T) {
	s := testServer(t)
	uid, _ := signedIn(t, s, "agentpeek@example.test")
	ws := s.firstWorkspaceOf(t, uid)
	col := tasksCollection(t, s, ws, uid)
	agent := &user{ID: uid, Name: "Agent", TokenKind: tokenKindAPI, TokenScope: "write"}
	call := func(args string) error {
		_, err := callTool(t, s, agent, "set_view", args)
		return err
	}

	if err := call(`{"page_id":"` + col + `","name":"Board","type":"board","group_by":"status","open_in":"side_peek"}`); err != nil {
		t.Fatalf("create with side peek: %v", err)
	}
	_, views, _ := s.loadCollection(col)
	id, _ := views[len(views)-1]["id"].(string)
	if v := viewByID(t, s, col, id); v["openIn"] != "side_peek" {
		t.Fatalf("created view stored %v", v["openIn"])
	}
	out, err := callTool(t, s, agent, "get_collection", `{"page_id":"`+col+`"}`)
	if err != nil || !strings.Contains(out, `"openIn":"side_peek"`) {
		t.Errorf("get_collection does not show the setting: %v %s", err, out)
	}

	// Omitted keeps it; full_page clears it.
	if err := call(`{"page_id":"` + col + `","view_id":"` + id + `","name":"Renamed"}`); err != nil {
		t.Fatal(err)
	}
	if v := viewByID(t, s, col, id); v["openIn"] != "side_peek" {
		t.Errorf("a rename lost the setting: %v", v["openIn"])
	}
	if err := call(`{"page_id":"` + col + `","view_id":"` + id + `","open_in":"full_page"}`); err != nil {
		t.Fatal(err)
	}
	if v := viewByID(t, s, col, id); v["openIn"] != nil {
		t.Errorf("full_page stored as %v, want no key", v["openIn"])
	}

	// Refusals change nothing.
	call(`{"page_id":"` + col + `","view_id":"` + id + `","open_in":"side_peek"}`)
	for _, bad := range []string{
		`{"page_id":"` + col + `","view_id":"` + id + `","open_in":"sideways"}`,
		`{"page_id":"` + col + `","view_id":"` + id + `","open_in":"peek"}`,
	} {
		if err := call(bad); err == nil {
			t.Errorf("%s was accepted", bad)
		}
	}
	if v := viewByID(t, s, col, id); v["openIn"] != "side_peek" {
		t.Errorf("a refused call changed the view: %v", v["openIn"])
	}

	// Centre peek is stored like side peek (spec 007, phase 7).
	if err := call(`{"page_id":"` + col + `","view_id":"` + id + `","open_in":"center_peek"}`); err != nil {
		t.Fatalf("center_peek: %v", err)
	}
	if v := viewByID(t, s, col, id); v["openIn"] != "center_peek" {
		t.Errorf("stored %v, want center_peek", v["openIn"])
	}
	call(`{"page_id":"` + col + `","view_id":"` + id + `","open_in":"side_peek"}`)
	before := len(views)
	if err := call(`{"page_id":"` + col + `","name":"Sign-up","type":"form","open_in":"side_peek"}`); err == nil || !strings.Contains(err.Error(), "form") {
		t.Errorf("a form with side peek: %v, want a refusal naming the form", err)
	}
	if _, after, _ := s.loadCollection(col); len(after) != before {
		t.Errorf("a refused create added a view")
	}

	// A read-only token may not change a view at all (the existing gate).
	reader := &user{ID: uid, TokenScope: "read"}
	if _, err := s.mcpCall(reader, "set_view", json.RawMessage(`{"page_id":"`+col+`","view_id":"`+id+`","open_in":"full_page"}`), ""); err == nil {
		t.Error("a read-only token changed the open mode")
	}
}

// SC-004: a person and an agent set and read the same value. Set through one
// door, read through the other, both ways round.
func TestViewOpenInIsTheSameThroughBothDoors(t *testing.T) {
	s := testServer(t)
	uid, cookie := signedIn(t, s, "bothdoors@example.test")
	ws := s.firstWorkspaceOf(t, uid)
	col := tasksCollection(t, s, ws, uid)
	agent := &user{ID: uid, Name: "Agent", TokenKind: tokenKindAPI, TokenScope: "write"}

	if rec := requestAs(t, s, cookie, "PUT", "/api/collections/"+col, `{"views":[{"id":"t","name":"Table","type":"table","openIn":"side_peek"}]}`); rec.Code != 200 {
		t.Fatalf("PUT: %d %s", rec.Code, rec.Body.String())
	}
	out, err := callTool(t, s, agent, "get_collection", `{"page_id":"`+col+`"}`)
	if err != nil || !strings.Contains(out, `"openIn":"side_peek"`) {
		t.Errorf("set by a person, the agent reads: %v %s", err, out)
	}

	if _, err := callTool(t, s, agent, "set_view", `{"page_id":"`+col+`","view_id":"t","open_in":"full_page"}`); err != nil {
		t.Fatal(err)
	}
	rec := requestAs(t, s, cookie, "GET", "/api/collections/"+col, "")
	if strings.Contains(rec.Body.String(), "openIn") {
		t.Errorf("set back by an agent, the person still reads a peek: %s", rec.Body.String())
	}
}

// The switch that kept centre peek out of storage until the interface could
// draw it. Should a later change hide it again, the refusal must still work.
func TestCenterPeekRefusedWhileUnshipped(t *testing.T) {
	was := centerPeekShipped
	centerPeekShipped = false
	defer func() { centerPeekShipped = was }()
	view := map[string]any{"type": "table", "openIn": "center_peek"}
	if err := checkViewOpenIn(view); err == nil || !strings.Contains(err.Error(), "not available yet") {
		t.Errorf("unshipped centre peek: %v, want a refusal", err)
	}
}

// checkViewColOrder is the one rule for a table's column order (spec 012),
// called from normalizeViews (REST) and applyViewSpec (MCP set_view). Each
// case is a line of data-model.md.
func TestViewColOrderRule(t *testing.T) {
	schema := []map[string]any{{"id": "status"}, {"id": "system"}, {"id": "due"}}
	cases := []struct {
		name    string
		view    string
		wantErr bool
		want    string // the stored colOrder as JSON; "" = no key
	}{
		{"no order", `{"type":"table"}`, false, ""},
		{"an order on a table", `{"type":"table","colOrder":["due","status"]}`, false, `["due","status"]`},
		{"unknown ids and repeats are dropped", `{"type":"table","colOrder":["due","gone","due","status"]}`, false, `["due","status"]`},
		{"the title is no property", `{"type":"table","colOrder":["title","due"]}`, false, `["due"]`},
		{"an empty list removes the key", `{"type":"table","colOrder":[]}`, false, ""},
		{"nothing left removes the key", `{"type":"table","colOrder":["gone"]}`, false, ""},
		{"null is no order", `{"type":"table","colOrder":null}`, false, ""},
		{"on a board", `{"type":"board","colOrder":["status"]}`, true, ""},
		{"an empty list on a board", `{"type":"board","colOrder":[]}`, true, ""},
		{"not an array", `{"type":"table","colOrder":"status"}`, true, ""},
		{"not all strings", `{"type":"table","colOrder":["status",3]}`, true, ""},
	}
	for _, c := range cases {
		var view map[string]any
		if err := json.Unmarshal([]byte(c.view), &view); err != nil {
			t.Fatalf("%s: %v", c.name, err)
		}
		err := checkViewColOrder(view, schema)
		if c.wantErr {
			var orderErr errViewColOrder
			if err == nil || !errors.As(err, &orderErr) {
				t.Errorf("%s: got %v, want an errViewColOrder", c.name, err)
			}
			continue
		}
		if err != nil {
			t.Errorf("%s: refused: %v", c.name, err)
			continue
		}
		got, has := view["colOrder"]
		if c.want == "" {
			if has {
				t.Errorf("%s: stored %v, want no key", c.name, got)
			}
			continue
		}
		if b, _ := json.Marshal(got); string(b) != c.want {
			t.Errorf("%s: stored %s, want %s", c.name, b, c.want)
		}
	}
}

// The interface's door: PUT /api/collections stores a table's order, cleans
// it as set_view does, keeps the bytes of a view without one, and refuses a
// board's order or a non-array with invalid_view_column_order, storing nothing.
func TestPutCollectionChecksTheColumnOrder(t *testing.T) {
	s := testServer(t)
	uid, cookie := signedIn(t, s, "colorder@example.test")
	ws := s.firstWorkspaceOf(t, uid)
	col := tasksCollection(t, s, ws, uid)
	put := func(body string) (int, string) {
		rec := requestAs(t, s, cookie, "PUT", "/api/collections/"+col, body)
		return rec.Code, rec.Body.String()
	}

	// A view without colOrder: stored exactly as sent.
	plain := `[{"name":"T","id":"t","type":"table","colWidths":{"due":120}}]`
	if code, body := put(`{"views":` + plain + `}`); code != 200 {
		t.Fatalf("plain: %d %s", code, body)
	}
	var stored string
	if err := s.db.QueryRow(`SELECT views FROM collections WHERE page_id = ?`, col).Scan(&stored); err != nil || stored != plain {
		t.Errorf("a view without colOrder stored %q, want the bytes sent %q", stored, plain)
	}

	if code, body := put(`{"views":[{"id":"t","name":"T","type":"table","colOrder":["due","gone","due","status"]}]}`); code != 200 {
		t.Fatalf("order: %d %s", code, body)
	}
	if v := viewByID(t, s, col, "t"); fmt.Sprint(v["colOrder"]) != "[due status]" {
		t.Errorf("stored %v, want [due status]", v["colOrder"])
	}

	for _, bad := range []string{
		`{"schema":[],"views":[{"id":"b","name":"Board","type":"board","groupBy":"status","colOrder":["status"]}]}`,
		`{"schema":[],"views":[{"id":"t","name":"T","type":"table","colOrder":"due"}]}`,
		`{"schema":[],"views":[{"id":"t","name":"T","type":"table","colOrder":[1]}]}`,
	} {
		code, body := put(bad)
		if code != 400 || !strings.Contains(body, "invalid_view_column_order") {
			t.Errorf("%s: %d %s, want 400 invalid_view_column_order", bad, code, body)
		}
	}
	if v := viewByID(t, s, col, "t"); fmt.Sprint(v["colOrder"]) != "[due status]" {
		t.Errorf("a refused save changed the view: %v", v)
	}
	if schema, _, _ := s.loadCollection(col); len(schema) == 0 {
		t.Error("a refused save emptied the schema")
	}

	// [] clears it.
	if code, body := put(`{"views":[{"id":"t","name":"T","type":"table","colOrder":[]}]}`); code != 200 {
		t.Fatalf("clear: %d %s", code, body)
	}
	if v := viewByID(t, s, col, "t"); v["colOrder"] != nil {
		t.Errorf("[] stored %v, want no key", v["colOrder"])
	}
}

// The agent's door: set_view's column_order goes through the same rule on a
// create and on an update, [] clears it, get_collection returns it, a board
// is refused, and a read-only token may not set it.
func TestSetViewColumnOrder(t *testing.T) {
	s := testServer(t)
	uid, _ := signedIn(t, s, "agentorder@example.test")
	ws := s.firstWorkspaceOf(t, uid)
	col := tasksCollection(t, s, ws, uid)
	agent := &user{ID: uid, Name: "Agent", TokenKind: tokenKindAPI, TokenScope: "write"}
	call := func(args string) error {
		_, err := callTool(t, s, agent, "set_view", args)
		return err
	}

	if err := call(`{"page_id":"` + col + `","name":"Ordered","type":"table","column_order":["due","gone","due"]}`); err != nil {
		t.Fatalf("create with column_order: %v", err)
	}
	if v := viewByID(t, s, col, "ordered"); fmt.Sprint(v["colOrder"]) != "[due]" {
		t.Errorf("create stored %v, want [due]", v["colOrder"])
	}
	if err := call(`{"page_id":"` + col + `","view_id":"ordered","column_order":["status","due"]}`); err != nil {
		t.Fatalf("update: %v", err)
	}
	if v := viewByID(t, s, col, "ordered"); fmt.Sprint(v["colOrder"]) != "[status due]" {
		t.Errorf("update stored %v, want [status due]", v["colOrder"])
	}
	out, err := callTool(t, s, agent, "get_collection", `{"page_id":"`+col+`"}`)
	if err != nil || !strings.Contains(out, `"colOrder":["status","due"]`) {
		t.Errorf("get_collection does not show the order: %v %s", err, out)
	}
	// A rename keeps it.
	if err := call(`{"page_id":"` + col + `","view_id":"ordered","name":"Renamed"}`); err != nil {
		t.Fatal(err)
	}
	if v := viewByID(t, s, col, "ordered"); fmt.Sprint(v["colOrder"]) != "[status due]" {
		t.Errorf("a rename lost the order: %v", v["colOrder"])
	}

	// Refusals: a board, on create and on update; nothing changes.
	_, before, _ := s.loadCollection(col)
	if err := call(`{"page_id":"` + col + `","name":"B","type":"board","group_by":"status","column_order":["status"]}`); err == nil || !strings.Contains(err.Error(), "only for a table view") {
		t.Errorf("a board with column_order: %v, want the rule's refusal", err)
	}
	if _, after, _ := s.loadCollection(col); len(after) != len(before) {
		t.Error("a refused create added a view")
	}
	if err := call(`{"page_id":"` + col + `","name":"B2","type":"board","group_by":"status"}`); err != nil {
		t.Fatal(err)
	}
	if err := call(`{"page_id":"` + col + `","view_id":"b2","column_order":["status"]}`); err == nil || !strings.Contains(err.Error(), "only for a table view") {
		t.Errorf("a board update with column_order: %v, want the rule's refusal", err)
	}
	if v := viewByID(t, s, col, "b2"); v["colOrder"] != nil {
		t.Errorf("a refused update stored %v", v["colOrder"])
	}

	// A read-only token may not set it (the existing gate).
	reader := &user{ID: uid, TokenScope: "read"}
	if _, err := s.mcpCall(reader, "set_view", json.RawMessage(`{"page_id":"`+col+`","view_id":"ordered","column_order":[]}`), ""); err == nil {
		t.Error("a read-only token changed the column order")
	}
	if v := viewByID(t, s, col, "ordered"); fmt.Sprint(v["colOrder"]) != "[status due]" {
		t.Errorf("a refused read-only call changed the order: %v", v["colOrder"])
	}

	// [] clears it.
	if err := call(`{"page_id":"` + col + `","view_id":"ordered","column_order":[]}`); err != nil {
		t.Fatal(err)
	}
	if v := viewByID(t, s, col, "ordered"); v["colOrder"] != nil {
		t.Errorf("[] stored %v, want no key", v["colOrder"])
	}
}

// Both doors store the same view for the same request: an order with a
// dropped id, and an order cleared with [], read back as the same bytes
// whether a person or an agent saved it.
func TestColumnOrderIsTheSameThroughBothDoors(t *testing.T) {
	s := testServer(t)
	uid, cookie := signedIn(t, s, "orderdoors@example.test")
	ws := s.firstWorkspaceOf(t, uid)
	agent := &user{ID: uid, Name: "Agent", TokenKind: tokenKindAPI, TokenScope: "write"}
	viewJSON := func(col string) string {
		var raw string
		if err := s.db.QueryRow(`SELECT views FROM collections WHERE page_id = ?`, col).Scan(&raw); err != nil {
			t.Fatal(err)
		}
		var views []map[string]any
		if err := json.Unmarshal([]byte(raw), &views); err != nil {
			t.Fatal(err)
		}
		b, _ := json.Marshal(views)
		return string(b)
	}
	start := `{"views":[{"id":"t","name":"T","type":"table"}]}`
	for _, c := range []struct{ name, rest, mcp string }{
		{"an order with an unknown id", `["due","gone"]`, `["due","gone"]`},
		{"an order cleared", `[]`, `[]`},
		// REST may send null; set_view's [] is its way to say the same.
		{"an order sent as null", `null`, `[]`},
	} {
		a := tasksCollection(t, s, ws, uid)
		b := tasksCollection(t, s, ws, uid)
		for _, col := range []string{a, b} {
			if rec := requestAs(t, s, cookie, "PUT", "/api/collections/"+col, start); rec.Code != 200 {
				t.Fatalf("start: %d", rec.Code)
			}
		}
		// First set an order, so clearing has something to clear.
		requestAs(t, s, cookie, "PUT", "/api/collections/"+a, `{"views":[{"id":"t","name":"T","type":"table","colOrder":["status"]}]}`)
		callTool(t, s, agent, "set_view", `{"page_id":"`+b+`","view_id":"t","column_order":["status"]}`)

		if rec := requestAs(t, s, cookie, "PUT", "/api/collections/"+a, `{"views":[{"id":"t","name":"T","type":"table","colOrder":`+c.rest+`}]}`); rec.Code != 200 {
			t.Fatalf("%s REST: %d %s", c.name, rec.Code, rec.Body.String())
		}
		if _, err := callTool(t, s, agent, "set_view", `{"page_id":"`+b+`","view_id":"t","column_order":`+c.mcp+`}`); err != nil {
			t.Fatalf("%s MCP: %v", c.name, err)
		}
		if ra, rb := viewJSON(a), viewJSON(b); ra != rb {
			t.Errorf("%s: REST stored %s, MCP stored %s", c.name, ra, rb)
		}
	}
}
