package server

import (
	"encoding/json"
	"strings"
	"testing"
)

// Quick filters and a board's lanes (spec 013, US3 and US4): one rule each,
// checkViewQuickFilters and checkViewSubGroup, on both doors. The fixture is
// the lock's Tasks database: status (select), system (text), due (date).

const quickSchemaExtra = `,{"id":"owner","name":"Owner","type":"person"},{"id":"score","name":"Score","type":"formula","formula":"1"}`

func quickFixture(t *testing.T) lockFixture {
	t.Helper()
	f := newLockFixture(t)
	var schema string
	f.s.db.QueryRow(`SELECT schema FROM collections WHERE page_id = ?`, f.col).Scan(&schema)
	schema = strings.TrimSuffix(strings.TrimSpace(schema), "]") + quickSchemaExtra + "]"
	if _, err := f.s.db.Exec(`UPDATE collections SET schema = ? WHERE page_id = ?`, schema, f.col); err != nil {
		t.Fatal(err)
	}
	return f
}

func (f lockFixture) putViews(t *testing.T, views string) (int, string) {
	t.Helper()
	rec := requestAs(t, f.s, f.cookie, "PUT", "/api/collections/"+f.col, `{"views":`+views+`}`)
	return rec.Code, rec.Body.String()
}

func (f lockFixture) viewByID(t *testing.T, id string) map[string]any {
	t.Helper()
	var views []map[string]any
	json.Unmarshal([]byte(f.storedViews(t)), &views)
	for _, v := range views {
		if v["id"] == id {
			return v
		}
	}
	t.Fatalf("no view %q in %s", id, f.storedViews(t))
	return nil
}

// REST: what the browser sends is checked like set_view checks it.
func TestQuickFiltersOverREST(t *testing.T) {
	f := quickFixture(t)
	code, body := f.putViews(t, `[{"id":"t","name":"Table","type":"table","quickFilters":["status","owner","status","gone"]},{"id":"b","name":"Board","type":"board","groupBy":"status"}]`)
	if code != 200 {
		t.Fatalf("PUT: %d %s", code, body)
	}
	if got, _ := json.Marshal(f.viewByID(t, "t")["quickFilters"]); string(got) != `["status","owner"]` {
		t.Errorf("stored %s, want the repeat and the unknown id dropped", got)
	}
	for name, views := range map[string]string{
		"a text property": `[{"id":"t","name":"Table","type":"table","quickFilters":["system"]}]`,
		"not a list":      `[{"id":"t","name":"Table","type":"table","quickFilters":"status"}]`,
		"on a chart":      `[{"id":"c","name":"Chart","type":"chart","chartKind":"donut","groupBy":"status","quickFilters":["status"]}]`,
		"more than eight": `[{"id":"t","name":"Table","type":"table","quickFilters":["status","owner","p3","p4","p5","p6","p7","p8","p9"]}]`,
	} {
		if name == "more than eight" {
			// Nine real properties of a chip type.
			var schema string
			f.s.db.QueryRow(`SELECT schema FROM collections WHERE page_id = ?`, f.col).Scan(&schema)
			extra := ""
			for _, id := range []string{"p3", "p4", "p5", "p6", "p7", "p8", "p9"} {
				extra += `,{"id":"` + id + `","name":"` + id + `","type":"checkbox"}`
			}
			f.s.db.Exec(`UPDATE collections SET schema = ? WHERE page_id = ?`, strings.TrimSuffix(schema, "]")+extra+"]", f.col)
		}
		code, body := f.putViews(t, views)
		if code != 400 || !strings.Contains(body, "invalid_view_quick_filters") {
			t.Errorf("%s: %d %s, want 400 invalid_view_quick_filters", name, code, body)
		}
	}
	// [] removes the key.
	if code, body := f.putViews(t, `[{"id":"t","name":"Table","type":"table","quickFilters":[]}]`); code != 200 {
		t.Fatalf("PUT []: %d %s", code, body)
	}
	if _, has := f.viewByID(t, "t")["quickFilters"]; has {
		t.Error("an empty list was stored")
	}
}

// MCP set_view: the same rule, and an unknown id is refused rather than
// dropped (an agent passing names must hear it).
func TestQuickFiltersOverMCP(t *testing.T) {
	f := quickFixture(t)
	if _, err := f.s.mcpUpdateView(f.agent, f.col, "t", viewSpec{QuickFilters: &[]string{"status", "owner"}}); err != nil {
		t.Fatal(err)
	}
	if got, _ := json.Marshal(f.viewByID(t, "t")["quickFilters"]); string(got) != `["status","owner"]` {
		t.Errorf("stored %s", got)
	}
	for name, ids := range map[string][]string{"unknown": {"Status"}, "text": {"system"}} {
		if _, err := f.s.mcpUpdateView(f.agent, f.col, "t", viewSpec{QuickFilters: &ids}); err == nil {
			t.Errorf("%s: accepted %v", name, ids)
		}
	}
	if _, err := f.s.mcpUpdateView(f.agent, f.col, "t", viewSpec{QuickFilters: &[]string{}}); err != nil {
		t.Fatal(err)
	}
	if _, has := f.viewByID(t, "t")["quickFilters"]; has {
		t.Error("quick_filters [] did not remove them")
	}
}

// A board's lanes: board only, a type lanes can be drawn by, not the
// columns' own property, a deleted property dropped; both doors.
func TestSubGroupOnBothDoors(t *testing.T) {
	f := quickFixture(t)
	if code, body := f.putViews(t, `[{"id":"t","name":"Table","type":"table"},{"id":"b","name":"Board","type":"board","groupBy":"status","subGroupBy":"owner"}]`); code != 200 {
		t.Fatalf("PUT: %d %s", code, body)
	}
	if f.viewByID(t, "b")["subGroupBy"] != "owner" {
		t.Fatal("sub-group not stored")
	}
	for name, views := range map[string]string{
		"on a table":      `[{"id":"t","name":"Table","type":"table","subGroupBy":"owner"}]`,
		"the columns":     `[{"id":"b","name":"Board","type":"board","groupBy":"status","subGroupBy":"status"}]`,
		"a text property": `[{"id":"b","name":"Board","type":"board","groupBy":"status","subGroupBy":"system"}]`,
	} {
		if code, body := f.putViews(t, views); code != 400 || !strings.Contains(body, "invalid_view_sub_group") {
			t.Errorf("%s: %d %s, want 400 invalid_view_sub_group", name, code, body)
		}
	}
	// A formula draws lanes (read only in the interface).
	if code, body := f.putViews(t, `[{"id":"b","name":"Board","type":"board","groupBy":"status","subGroupBy":"score"}]`); code != 200 {
		t.Errorf("formula lanes: %d %s", code, body)
	}
	// A property deleted since: dropped, the save goes through.
	if code, body := f.putViews(t, `[{"id":"b","name":"Board","type":"board","groupBy":"status","subGroupBy":"gone"}]`); code != 200 {
		t.Fatalf("deleted property: %d %s", code, body)
	}
	if _, has := f.viewByID(t, "b")["subGroupBy"]; has {
		t.Error("a sub-group naming a deleted property was stored")
	}

	// MCP.
	if _, err := f.s.mcpUpdateView(f.agent, f.col, "b", viewSpec{SubGroupBy: ptr("owner")}); err != nil {
		t.Fatal(err)
	}
	if f.viewByID(t, "b")["subGroupBy"] != "owner" {
		t.Fatal("set_view sub_group_by not stored")
	}
	for _, bad := range []string{"Owner", "status", "system"} {
		if _, err := f.s.mcpUpdateView(f.agent, f.col, "b", viewSpec{SubGroupBy: ptr(bad)}); err == nil {
			t.Errorf("set_view sub_group_by %q accepted", bad)
		}
	}
	if _, err := f.s.mcpUpdateView(f.agent, f.col, "b", viewSpec{SubGroupBy: ptr("")}); err != nil {
		t.Fatal(err)
	}
	if _, has := f.viewByID(t, "b")["subGroupBy"]; has {
		t.Error(`sub_group_by "" did not clear it`)
	}
}

// A quick filter or sub-group that a later schema change made invalid (the
// property turned into text) must not block every views save of the
// database: it is dropped from the view nobody touched, while a save that
// sets it now is still refused (code review).
func TestStaleQuickFiltersAndSubGroupDoNotBlockSaves(t *testing.T) {
	f := quickFixture(t)
	if code, body := f.putViews(t, `[{"id":"t","name":"Table","type":"table","quickFilters":["owner"]},{"id":"b","name":"Board","type":"board","groupBy":"status","subGroupBy":"owner"}]`); code != 200 {
		t.Fatalf("setup: %d %s", code, body)
	}
	// Owner becomes a text property, by a schema-only save.
	var schema string
	f.s.db.QueryRow(`SELECT schema FROM collections WHERE page_id = ?`, f.col).Scan(&schema)
	schema = strings.Replace(schema, `{"id":"owner","name":"Owner","type":"person"}`, `{"id":"owner","name":"Owner","type":"text"}`, 1)
	f.s.db.Exec(`UPDATE collections SET schema = ? WHERE page_id = ?`, schema, f.col)
	// An unrelated views save (the table's column widths) goes through.
	code, body := f.putViews(t, `[{"id":"t","name":"Table","type":"table","quickFilters":["owner"],"colWidths":{"__title":300}},{"id":"b","name":"Board","type":"board","groupBy":"status","subGroupBy":"owner"}]`)
	if code != 200 {
		t.Fatalf("an unrelated save was refused: %d %s", code, body)
	}
	if _, has := f.viewByID(t, "t")["quickFilters"]; has {
		t.Error("the stale quick filter was kept")
	}
	if _, has := f.viewByID(t, "b")["subGroupBy"]; has {
		t.Error("the stale sub-group was kept")
	}
	// Setting it now is still refused.
	if code, body := f.putViews(t, `[{"id":"t","name":"Table","type":"table","quickFilters":["owner"]},{"id":"b","name":"Board","type":"board","groupBy":"status"}]`); code != 400 {
		t.Errorf("setting a text quick filter: %d %s, want 400", code, body)
	}
}

// A board saved without groupBy draws its columns from the first select
// property; lanes by that property would be the columns again.
func TestSubGroupKnowsTheBoardsDefaultColumns(t *testing.T) {
	f := quickFixture(t)
	if code, body := f.putViews(t, `[{"id":"b","name":"Board","type":"board","subGroupBy":"status"}]`); code != 400 || !strings.Contains(body, "invalid_view_sub_group") {
		t.Errorf("lanes by the default columns: %d %s, want 400 invalid_view_sub_group", code, body)
	}
}
