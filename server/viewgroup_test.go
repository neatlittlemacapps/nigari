package server

import (
	"strings"
	"testing"
)

// Spec 024: a table or list grouped by a property. Both doors (set_view and
// PUT /api/collections/{id}) go through checkViewGrouping.

func TestSetViewGroupsATableAndRefusesWhatCannotGroup(t *testing.T) {
	f, _ := layoutFixture(t)
	if _, err := callTool(t, f.s, f.agent, "set_view", `{"page_id":"`+f.col+`","view_id":"t","group_by":"status","group_reverse":true,"show_empty_groups":true,"hidden_groups":[""]}`); err != nil {
		t.Fatalf("group by status: %v", err)
	}
	v := viewOf(t, f, "t")
	if v["grouped"] != true || v["groupBy"] != "status" || v["groupReverse"] != true || v["showEmptyGroups"] != true {
		t.Fatalf("grouped table: %v", v)
	}
	if _, err := callTool(t, f.s, f.agent, "set_view", `{"page_id":"`+f.col+`","view_id":"t","group_by":"due","period":"week"}`); err != nil {
		t.Fatalf("group by a date by week: %v", err)
	}
	if v := viewOf(t, f, "t"); v["groupBy"] != "due" || v["groupPeriod"] != "week" {
		t.Fatalf("date grouping: %v", v)
	}
	before := f.storedViews(t)
	for args, want := range map[string]string{
		`"group_by":"system"`:                      "is a text property",
		`"group_by":"nope"`:                        "is not a property",
		`"group_by":"status","period":"month"`:     "a period groups a date",
		`"group_by":"due","period":"fortnight"`:    "is not a period",
		`"group_by":"status","status_groups":true`: "status groups are for a status property",
	} {
		_, err := callTool(t, f.s, f.agent, "set_view", `{"page_id":"`+f.col+`","view_id":"t",`+args+`}`)
		if err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("%s: %v, want %q", args, err, want)
		}
	}
	// Grouping arguments on a board, or on a flat table, are refused.
	if _, err := callTool(t, f.s, f.agent, "set_view", `{"page_id":"`+f.col+`","view_id":"b","group_reverse":true}`); err == nil {
		t.Error("group_reverse on a board was taken")
	}
	if after := f.storedViews(t); after != before {
		t.Errorf("a refused grouping changed the views:\nbefore %s\nafter  %s", before, after)
	}

	// "" removes the whole grouping.
	if _, err := callTool(t, f.s, f.agent, "set_view", `{"page_id":"`+f.col+`","view_id":"t","group_by":""}`); err != nil {
		t.Fatalf("ungroup: %v", err)
	}
	v = viewOf(t, f, "t")
	for _, k := range groupingKeys {
		if _, has := v[k]; has {
			t.Errorf("ungrouped table still has %s: %v", k, v)
		}
	}
	if _, err := callTool(t, f.s, f.agent, "set_view", `{"page_id":"`+f.col+`","view_id":"t","period":"week"}`); err == nil || !strings.Contains(err.Error(), "pass group_by") {
		t.Errorf("period on a flat table: %v", err)
	}

	// A read-only credential cannot group.
	reader := &user{ID: f.owner, Name: "Agent", TokenKind: tokenKindAPI, TokenScope: "read"}
	if _, err := callTool(t, f.s, reader, "set_view", `{"page_id":"`+f.col+`","view_id":"t","group_by":"status"}`); err == nil {
		t.Error("a read-only token grouped a view")
	}
}

func TestPutViewsChecksAGroupingAndDropsAStaleOne(t *testing.T) {
	f := newLockFixture(t)
	put := func(views string) (int, string) {
		rec := requestAs(t, f.s, f.cookie, "PUT", "/api/collections/"+f.col, `{"views":`+views+`}`)
		return rec.Code, rec.Body.String()
	}
	if code, body := put(`[{"id":"t","name":"Table","type":"table","grouped":true,"groupBy":"system"}]`); code != 400 || !strings.Contains(body, `"invalid_view_group"`) {
		t.Errorf("grouped by a text: %d %s, want 400 invalid_view_group", code, body)
	}
	if code, body := put(`[{"id":"t","name":"Table","type":"list","grouped":true,"groupBy":"status","hiddenGroups":["open"]}]`); code != 200 {
		t.Fatalf("grouped list: %d %s", code, body)
	}
	if v := f.storedViews(t); !strings.Contains(v, `"grouped":true`) {
		t.Fatalf("grouping not stored: %s", v)
	}

	// A table that was a board carries a groupBy and no switch: it stays flat.
	if code, body := put(`[{"id":"t","name":"Table","type":"table","groupBy":"status","groupReverse":true}]`); code != 200 {
		t.Fatalf("old table: %d %s", code, body)
	}
	if v := f.storedViews(t); strings.Contains(v, "grouped") || strings.Contains(v, "groupReverse") || !strings.Contains(v, `"groupBy":"status"`) {
		t.Errorf("an old table's groupBy was turned into a grouping, or lost: %s", v)
	}

	// A stored grouping that a schema change broke does not fail an
	// unrelated save; the view draws flat.
	if _, err := f.s.db.Exec(`UPDATE collections SET views = ? WHERE page_id = ?`,
		`[{"id":"t","name":"Table","type":"table","grouped":true,"groupBy":"system"}]`, f.col); err != nil {
		t.Fatal(err)
	}
	if code, body := put(`[{"id":"t","name":"Renamed","type":"table","grouped":true,"groupBy":"system"}]`); code != 200 {
		t.Fatalf("unrelated save of a stale grouping: %d %s", code, body)
	}
	if v := f.storedViews(t); strings.Contains(v, "grouped") || !strings.Contains(v, "Renamed") {
		t.Errorf("stale grouping kept, or the rename lost: %s", v)
	}
}

func TestGroupingIsRefusedWhileViewsAreLocked(t *testing.T) {
	f := newLockFixture(t)
	f.lock(t)
	before := f.storedViews(t)
	if _, err := callTool(t, f.s, f.agent, "set_view", `{"page_id":"`+f.col+`","view_id":"t","group_by":"status"}`); err == nil || !strings.Contains(err.Error(), "locked") {
		t.Errorf("set_view group_by while locked: %v", err)
	}
	rec := requestAs(t, f.s, f.cookie, "PUT", "/api/collections/"+f.col,
		`{"views":[{"id":"t","name":"Table","type":"table","grouped":true,"groupBy":"status"},{"id":"b","name":"Board","type":"board","groupBy":"status"}]}`)
	if rec.Code != 409 {
		t.Errorf("PUT of a grouping while locked: %d %s", rec.Code, rec.Body.String())
	}
	if after := f.storedViews(t); after != before {
		t.Errorf("a locked view was grouped: %s", after)
	}
}

// A drag into another group: the row moves and takes the group's value in
// one request (research R4), logged as a property change. A refused move
// changes nothing.
func TestPlaceWithPropsMovesAndSetsTheValue(t *testing.T) {
	f := newOrderFixture(t)
	if code, body := f.place(t, f.c, `{"after":"`+f.a+`","propsPatch":{"note":"moved"}}`); code != 200 {
		t.Fatalf("place with props: %d %s", code, body)
	}
	if got := f.order(t); got != "ACB" {
		t.Errorf("order %q, want ACB", got)
	}
	var props string
	f.s.db.QueryRow(`SELECT props FROM pages WHERE id = ?`, f.c).Scan(&props)
	if !strings.Contains(props, `"note":"moved"`) {
		t.Errorf("props %s, want note set", props)
	}
	var n int
	f.s.db.QueryRow(`SELECT COUNT(*) FROM audit_log WHERE action = 'set_properties' AND page_id = ?`, f.c).Scan(&n)
	if n != 1 {
		t.Errorf("%d set_properties entries, want 1", n)
	}

	// A refused move (the anchor is not a sibling) leaves the value alone.
	other := f.s.makeCollection(t, f.ws, f.owner, "Other", `[]`)
	stranger := f.s.makeRow(t, f.ws, f.owner, other, "X", `{}`)
	if code, _ := f.place(t, f.b, `{"after":"`+stranger+`","propsPatch":{"note":"no"}}`); code == 200 {
		t.Error("place after a page of another database was taken")
	}
	f.s.db.QueryRow(`SELECT props FROM pages WHERE id = ?`, f.b).Scan(&props)
	if strings.Contains(props, "no") {
		t.Errorf("a refused move still set the value: %s", props)
	}
	if code, _ := f.place(t, f.b, `{"after":"`+f.a+`","propsPatch":["x"]}`); code != 400 {
		t.Errorf("propsPatch not an object: %d, want 400", code)
	}

	// Someone who cannot edit the row moves nothing and sets nothing.
	_, readerCookie := signedIn(t, f.s, "order-reader@example.test")
	if rec := requestAs(t, f.s, readerCookie, "POST", "/api/pages/"+f.b+"/place", `{"after":"`+f.c+`","propsPatch":{"note":"theirs"}}`); rec.Code == 200 {
		t.Error("a stranger placed a row")
	}
	f.s.db.QueryRow(`SELECT props FROM pages WHERE id = ?`, f.b).Scan(&props)
	if strings.Contains(props, "theirs") {
		t.Errorf("a stranger set a value: %s", props)
	}
}

func TestFoldedGroupsArePersonalState(t *testing.T) {
	f := newLockFixture(t)
	path := "/api/collections/" + f.col + "/personal/t"
	if rec := requestAs(t, f.s, f.cookie, "PUT", path, `{"foldedGroups":["open",""]}`); rec.Code != 200 {
		t.Fatalf("PUT foldedGroups: %d %s", rec.Code, rec.Body.String())
	}
	if got := f.personal(t, f.cookie); !strings.Contains(string(got["t"]), `"foldedGroups":["open",""]`) {
		t.Errorf("foldedGroups not returned: %v", got)
	}
	if got := f.personal(t, f.readerCookie); len(got) != 0 {
		t.Errorf("another account sees the folds: %v", got)
	}
	if rec := requestAs(t, f.s, f.cookie, "PUT", path, `{"foldedGroups":"open"}`); rec.Code != 400 {
		t.Errorf("foldedGroups not a list: %d", rec.Code)
	}
}
