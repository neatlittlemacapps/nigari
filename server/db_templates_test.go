package server

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestDatabaseTemplates(t *testing.T) {
	s := testServer(t)
	owner, cookie := signedIn(t, s, "dbt-owner@example.test")
	ws := s.firstWorkspaceOf(t, owner)
	col := s.makeCollection(t, ws, owner, "Bugs", `[{"id":"note","name":"Note","type":"text"}]`)
	other := s.makeCollection(t, ws, owner, "Tasks", `[]`)

	var tpl pageMeta
	rr := requestAs(t, s, cookie, "POST", "/api/collections/"+col+"/templates", `{"title":"Bug report"}`)
	if rr.Code != 200 {
		t.Fatalf("add template: %d %s", rr.Code, rr.Body.String())
	}
	json.Unmarshal(rr.Body.Bytes(), &tpl)
	if tpl.TemplateOf != col || !tpl.IsTemplate || tpl.ParentID != nil {
		t.Fatalf("template is %+v: want a flagged page of the database with no parent", tpl)
	}
	s.db.Exec(`UPDATE pages SET props = '{"note":"steps"}', content = '[{"type":"paragraph"}]' WHERE id = ?`, tpl.ID)

	// It is not a row, and not a workspace template either.
	var rows struct {
		Total int `json:"total"`
	}
	json.Unmarshal(requestAs(t, s, cookie, "GET", "/api/collections/"+col+"/rows", "").Body.Bytes(), &rows)
	if rows.Total != 0 {
		t.Errorf("the database lists its template as a row (total %d)", rows.Total)
	}
	if body := requestAs(t, s, cookie, "GET", "/api/templates", "").Body.String(); strings.Contains(body, tpl.ID) {
		t.Error("a database template is in the workspace template list")
	}
	if body := requestAs(t, s, cookie, "GET", "/api/pages", "").Body.String(); strings.Contains(body, tpl.ID) {
		t.Error("a database template is in the page list")
	}
	if body := requestAs(t, s, cookie, "GET", "/api/collections/"+col+"/templates", "").Body.String(); !strings.Contains(body, tpl.ID) {
		t.Error("the database's own list does not show it")
	}
	if body := requestAs(t, s, cookie, "GET", "/api/collections/"+other+"/templates", "").Body.String(); strings.Contains(body, tpl.ID) {
		t.Error("another database lists it")
	}

	// A row from it: lands in the database, keeps the title, takes the values.
	rr = requestAs(t, s, cookie, "POST", "/api/collections/"+col+"/from-template", `{"templateId":"`+tpl.ID+`"}`)
	if rr.Code != 200 {
		t.Fatalf("row from template: %d %s", rr.Code, rr.Body.String())
	}
	var row pageMeta
	json.Unmarshal(rr.Body.Bytes(), &row)
	if row.ParentID == nil || *row.ParentID != col || row.Title != "Bug report" || row.IsTemplate || row.TemplateOf != "" {
		t.Errorf("row is %+v", row)
	}
	if !strings.Contains(string(row.Props), "steps") {
		t.Errorf("row props %s lost the template's values", row.Props)
	}
	rr = requestAs(t, s, cookie, "POST", "/api/collections/"+col+"/from-template", `{"templateId":"`+tpl.ID+`","title":"Crash on save","props":{"note":"mine"}}`)
	json.Unmarshal(rr.Body.Bytes(), &row)
	if row.Title != "Crash on save" || !strings.Contains(string(row.Props), "mine") {
		t.Errorf("title and props did not apply on top: %+v %s", row, row.Props)
	}
	json.Unmarshal(requestAs(t, s, cookie, "GET", "/api/collections/"+col+"/rows", "").Body.Bytes(), &rows)
	if rows.Total != 2 {
		t.Errorf("want the 2 new rows and no template, got %d", rows.Total)
	}

	// Another database's template is not usable here.
	if rr = requestAs(t, s, cookie, "POST", "/api/collections/"+other+"/from-template", `{"templateId":"`+tpl.ID+`"}`); rr.Code != 404 {
		t.Errorf("a template of another database was used: %d", rr.Code)
	}

	// Saving a row as a template snapshots it and leaves the row alone.
	rr = requestAs(t, s, cookie, "POST", "/api/collections/"+col+"/templates", `{"fromPageId":"`+row.ID+`"}`)
	var snap pageMeta
	json.Unmarshal(rr.Body.Bytes(), &snap)
	if rr.Code != 200 || snap.TemplateOf != col || snap.ParentID != nil || snap.ID == row.ID {
		t.Fatalf("row saved as template: %d %+v", rr.Code, snap)
	}
	json.Unmarshal(requestAs(t, s, cookie, "GET", "/api/collections/"+col+"/rows", "").Body.Bytes(), &rows)
	if rows.Total != 2 {
		t.Errorf("saving a template changed the rows: %d", rows.Total)
	}

	// A viewer reads the list but changes nothing.
	viewer, vcookie := signedIn(t, s, "dbt-viewer@example.test")
	s.addMember(t, ws, viewer, "viewer")
	if rr = requestAs(t, s, vcookie, "GET", "/api/collections/"+col+"/templates", ""); rr.Code != 200 {
		t.Errorf("viewer list: %d", rr.Code)
	}
	for _, c := range [][2]string{{"/templates", `{"title":"x"}`}, {"/from-template", `{"templateId":"` + tpl.ID + `"}`}} {
		if rr = requestAs(t, s, vcookie, "POST", "/api/collections/"+col+c[0], c[1]); rr.Code == 200 {
			t.Errorf("viewer POST %s accepted", c[0])
		}
	}

	// A database that is gone for good takes its templates with it.
	s.db.Exec(`DELETE FROM pages WHERE id = ?`, col)
	s.dropOrphanedTemplates()
	var n int
	s.db.QueryRow(`SELECT COUNT(*) FROM pages WHERE template_of = ?`, col).Scan(&n)
	if n != 0 {
		t.Errorf("%d templates outlived their database", n)
	}
}

func TestDatabaseTemplatesOverMCP(t *testing.T) {
	s := testServer(t)
	owner, _ := signedIn(t, s, "dbt-mcp@example.test")
	ws := s.firstWorkspaceOf(t, owner)
	col := s.makeCollection(t, ws, owner, "Bugs", `[{"id":"note","name":"Note","type":"text"}]`)
	u := &user{ID: owner}

	if _, err := s.mcpDatabaseTemplates(u, "add", col, "", "Bug report", ""); err != nil {
		t.Fatal(err)
	}
	out, err := s.mcpList(u, "templates", "", "", col)
	if err != nil || !strings.Contains(out, "Bug report") {
		t.Fatalf("list with database_id: %v %s", err, out)
	}
	var id string
	s.db.QueryRow(`SELECT id FROM pages WHERE template_of = ?`, col).Scan(&id)
	// The workspace list does not carry it.
	if out, _ := s.mcpList(u, "templates", "", "", ""); strings.Contains(out, id) {
		t.Error("the workspace template list carries a database template")
	}
	if _, err := s.mcpDatabaseTemplates(u, "rename", col, id, "Crash report", ""); err != nil {
		t.Fatal(err)
	}
	// create_page's path: no parent needed, properties on top.
	msg, err := s.mcpCreateFromTemplate(u, id, "", "", json.RawMessage(`{"Note":"x"}`))
	if err != nil || !strings.Contains(msg, "Created row") {
		t.Fatalf("create from template: %v %s", err, msg)
	}
	var n int
	s.db.QueryRow(`SELECT COUNT(*) FROM pages WHERE parent_id = ? AND title = 'Crash report'`, col).Scan(&n)
	if n != 1 {
		t.Errorf("want one row titled from the renamed template, got %d", n)
	}
	// A parent that is not the database is refused.
	other := s.makeCollection(t, ws, owner, "Tasks", `[]`)
	if _, err := s.mcpCreateFromTemplate(u, id, "", other, nil); err == nil {
		t.Error("a template made a row in another database")
	}
	// Another database's id cannot be used to edit this one's template.
	if _, err := s.mcpDatabaseTemplates(u, "remove", other, id, "", ""); err == nil {
		t.Error("removed a template through the wrong database")
	}
	if _, err := s.mcpDatabaseTemplates(u, "remove", col, id, "", ""); err != nil {
		t.Fatal(err)
	}
	if out, _ := s.mcpList(u, "templates", "", "", col); strings.Contains(out, id) {
		t.Error("a removed template is still listed")
	}
}
