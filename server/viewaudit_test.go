package server

import (
	"encoding/json"
	"strings"
	"testing"
)

type viewLogEntry struct {
	action, actorType, actorName, detail, changes string
}

// viewLog is the view entries of the activity log since id after, oldest first.
func viewLog(t *testing.T, s *Server, col string, after int64) []viewLogEntry {
	t.Helper()
	rows, err := s.db.Query(`SELECT action, actor_type, actor_name, detail, changes FROM audit_log
		WHERE page_id = ? AND action LIKE 'view.%' AND id > ? ORDER BY id`, col, after)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var out []viewLogEntry
	for rows.Next() {
		var e viewLogEntry
		if err := rows.Scan(&e.action, &e.actorType, &e.actorName, &e.detail, &e.changes); err != nil {
			t.Fatal(err)
		}
		out = append(out, e)
	}
	return out
}

func lastAuditID(t *testing.T, s *Server) int64 {
	t.Helper()
	var id int64
	s.db.QueryRow(`SELECT COALESCE(MAX(id), 0) FROM audit_log`).Scan(&id)
	return id
}

func actionsOf(es []viewLogEntry) string {
	var a []string
	for _, e := range es {
		a = append(a, e.action+"/"+e.actorType)
	}
	return strings.Join(a, " ")
}

// US5 through the interface's door: each kind of change once, as a person,
// naming the view; one save that changes two views makes two entries; a save
// that changes only layout (widths, order, hidden columns, how a row opens, a
// chart's style) makes none (FR-020, FR-021, SC-006).
func TestViewChangesAreLoggedByTheInterface(t *testing.T) {
	f := newLockFixture(t)
	put := func(views string) {
		t.Helper()
		if rec := requestAs(t, f.s, f.cookie, "PUT", "/api/collections/"+f.col, `{"views":`+views+`}`); rec.Code != 200 {
			t.Fatalf("PUT %s: %d %s", views, rec.Code, rec.Body.String())
		}
	}
	step := func(views, want string) []viewLogEntry {
		t.Helper()
		mark := lastAuditID(t, f.s)
		put(views)
		got := viewLog(t, f.s, f.col, mark)
		if actionsOf(got) != want {
			t.Errorf("after %s: %q, want %q", views, actionsOf(got), want)
		}
		return got
	}
	table := `{"id":"t","name":"Table","type":"table"}`
	board := `{"id":"b","name":"Board","type":"board","groupBy":"status"}`

	got := step(`[`+table+`,`+board+`,{"id":"c","name":"Calendar","type":"calendar","dateProp":"due"}]`, "view.create/human")
	if len(got) == 1 && (got[0].detail != "Calendar" || got[0].actorName != "Test") {
		t.Errorf("create names %q by %q, want Calendar by Test", got[0].detail, got[0].actorName)
	}
	got = step(`[`+table+`,`+board+`,{"id":"c","name":"Deadlines","type":"calendar","dateProp":"due"}]`, "view.rename/human")
	if len(got) == 1 && got[0].detail != "Calendar → Deadlines" {
		t.Errorf("rename detail %q", got[0].detail)
	}
	got = step(`[{"id":"t","name":"Table","type":"table","filters":[{"property":"status","op":"is","value":"open"}],"sort":{"property":"due","dir":"asc"}},`+board+`,{"id":"c","name":"Deadlines","type":"calendar","dateProp":"due"}]`, "view.update/human")
	if len(got) == 1 {
		var ch map[string]propChange
		if json.Unmarshal([]byte(got[0].changes), &ch) != nil || len(ch) != 2 || string(ch["filters"].From) != "null" || !strings.Contains(string(ch["sort"].To), `"due"`) {
			t.Errorf("update changes %s, want filters and sort with before and after", got[0].changes)
		}
		if got[0].detail != "Table" {
			t.Errorf("update names %q", got[0].detail)
		}
	}
	filtered := `{"id":"t","name":"Table","type":"table","filters":[{"property":"status","op":"is","value":"open"}],"sort":{"property":"due","dir":"asc"}`
	// Layout only: none, though every one of these is stored.
	step(`[`+filtered+`,"colWidths":{"__title":320},"colOrder":["due","status"],"hidden":["system"],"openIn":"side_peek"},`+board+`,{"id":"c","name":"Deadlines","type":"calendar","dateProp":"due"}]`, "")
	// Reordering the views, and respelling "no grouping": none.
	step(`[{"id":"c","name":"Deadlines","type":"calendar","dateProp":"due","filters":[]},`+filtered+`,"colWidths":{"__title":320},"colOrder":["due","status"],"hidden":["system"],"openIn":"side_peek"},`+board+`]`, "")
	// One save, two views changed: two entries, the unchanged one none.
	step(`[{"id":"c","name":"Deadlines","type":"calendar","dateProp":"due"},`+filtered+`,"colWidths":{"__title":320},"colOrder":["due","status"],"hidden":["system"],"openIn":"side_peek","name":"Open"},{"id":"b","name":"Board","type":"board","groupBy":"system"}]`,
		"view.rename/human view.update/human")
	got = step(`[{"id":"c","name":"Deadlines","type":"calendar","dateProp":"due"}]`, "view.delete/human view.delete/human")
	if len(got) == 2 && (got[0].detail != "Open" || got[1].detail != "Board") {
		t.Errorf("delete names %q and %q", got[0].detail, got[1].detail)
	}
	// None of them can be "taken back": that only knows row properties.
	rec := requestAs(t, f.s, f.cookie, "GET", "/api/audit?page="+f.col, "")
	if strings.Contains(rec.Body.String(), `"revertible":true`) {
		t.Errorf("a view entry is offered for taking back: %s", rec.Body.String())
	}
	var id int64
	f.s.db.QueryRow(`SELECT id FROM audit_log WHERE action = 'view.update' LIMIT 1`).Scan(&id)
	if rec := requestAs(t, f.s, f.cookie, "POST", "/api/audit/"+itoa(id)+"/revert", ""); rec.Code != 400 {
		t.Errorf("taking back a view change: %d %s, want 400 not_revertible", rec.Code, rec.Body.String())
	}
	var props string
	f.s.db.QueryRow(`SELECT props FROM pages WHERE id = ?`, f.col).Scan(&props)
	if strings.Contains(props, "filters") {
		t.Errorf("the database page's properties gained a view's keys: %s", props)
	}
}

func itoa(n int64) string { b, _ := json.Marshal(n); return string(b) }

// US5 through the agent's doors: set_view (create, rename, re-filter) and
// delete_view each make one entry as an agent, and replace the generic tool
// entry (two entries for one call would say more happened than did). A
// set_view of layout only makes none.
func TestViewChangesAreLoggedForAgents(t *testing.T) {
	f := newLockFixture(t)
	call := func(tool, args, want string) {
		t.Helper()
		mark := lastAuditID(t, f.s)
		if _, err := callTool(t, f.s, f.agent, tool, args); err != nil {
			t.Fatalf("%s %s: %v", tool, args, err)
		}
		got := viewLog(t, f.s, f.col, mark)
		if actionsOf(got) != want {
			t.Errorf("%s %s: %q, want %q", tool, args, actionsOf(got), want)
		}
		for _, e := range got {
			if e.actorName != "Agent (MCP)" {
				t.Errorf("actor %q, want the agent's name with (MCP)", e.actorName)
			}
		}
		var generic int
		f.s.db.QueryRow(`SELECT COUNT(*) FROM audit_log WHERE id > ? AND action = ?`, mark, tool).Scan(&generic)
		if generic != 0 {
			t.Errorf("%s also wrote its generic entry", tool)
		}
	}
	p := `"page_id":"` + f.col + `"`
	call("set_view", `{`+p+`,"name":"Mine","type":"table"}`, "view.create/agent")
	call("set_view", `{`+p+`,"view_id":"t","name":"Everything"}`, "view.rename/agent")
	call("set_view", `{`+p+`,"view_id":"t","filters":[{"property":"status","op":"is","value":"open"}]}`, "view.update/agent")
	call("set_view", `{`+p+`,"view_id":"b","sort":"due:asc"}`, "view.update/agent")
	call("set_view", `{`+p+`,"view_id":"t","hidden":["system"],"column_order":["due"],"open_in":"side_peek"}`, "")
	call("delete_view", `{`+p+`,"view_id":"b"}`, "view.delete/agent")
}
