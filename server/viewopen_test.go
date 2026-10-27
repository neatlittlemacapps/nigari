package server

import (
	"encoding/json"
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
	got, err := normalizeViewsOpenIn(raw)
	if err != nil || string(got) != string(raw) {
		t.Errorf("got %s, %v; want the same bytes back", got, err)
	}
	got, err = normalizeViewsOpenIn([]byte(`[{"id":"a","type":"table","openIn":"full_page"}]`))
	if err != nil || strings.Contains(string(got), "openIn") {
		t.Errorf("full_page: got %s, %v; want the key dropped", got, err)
	}
	if _, err := normalizeViewsOpenIn([]byte(`[{"id":"f","name":"Sign-up","type":"form","openIn":"side_peek"}]`)); err == nil || !strings.Contains(err.Error(), "Sign-up") {
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
