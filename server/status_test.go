package server

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

// Spec 016: the status property. One function prepares a status on every
// door that writes a schema (R9): PUT /api/collections/{id}, update_schema
// and create_database. These tests go through each door, so a door that
// stops calling it fails here.

// The conversion's guess against the cases the browser's guess is checked
// against too (check-statusgroups.mjs): one file, two languages, no drift.
func TestStatusGroupGuessFollowsTheSharedCases(t *testing.T) {
	raw, err := os.ReadFile("testdata/statusgroups.json")
	if err != nil {
		t.Fatal(err)
	}
	var file struct {
		Cases [][2]string `json:"cases"`
	}
	if err := json.Unmarshal(raw, &file); err != nil {
		t.Fatal(err)
	}
	if len(file.Cases) == 0 {
		t.Fatal("no cases in testdata/statusgroups.json")
	}
	for _, c := range file.Cases {
		if got := guessStatusGroup(c[0]); got != c[1] {
			t.Errorf("guessStatusGroup(%q) = %q, want %q", c[0], got, c[1])
		}
	}
}

type statusDoors struct {
	s      *Server
	u      *user
	cookie string
	ws     string
	uid    string
}

func newStatusDoors(t *testing.T) statusDoors {
	s := testServer(t)
	uid, cookie := signedIn(t, s, "status@example.test")
	return statusDoors{s: s, u: &user{ID: uid, Name: "Test"}, cookie: cookie, ws: s.firstWorkspaceOf(t, uid), uid: uid}
}

func (d statusDoors) schemaOf(t *testing.T, id string) []map[string]any {
	t.Helper()
	schema, _, err := d.s.loadCollection(id)
	if err != nil {
		t.Fatalf("load %s: %v", id, err)
	}
	return schema
}

// putSchema saves a whole schema the way the interface does.
func (d statusDoors) putSchema(t *testing.T, id, schema string) (int, string) {
	t.Helper()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("PUT", "/api/collections/"+id, strings.NewReader(`{"schema":`+schema+`}`))
	req.Header.Set("Cookie", d.cookie)
	req.Header.Set("Content-Type", "application/json")
	d.s.ServeHTTP(rec, req)
	return rec.Code, rec.Body.String()
}

func (d statusDoors) updateSchema(t *testing.T, id, props string) error {
	t.Helper()
	_, err := callTool(t, d.s, d.u, "update_schema", `{"page_id":"`+id+`","properties":`+props+`}`)
	return err
}

func (d statusDoors) createDatabase(t *testing.T, title, schema string) (string, error) {
	t.Helper()
	_, err := callTool(t, d.s, d.u, "create_database", `{"title":"`+title+`","workspace_id":"`+d.ws+`","schema":`+schema+`}`)
	if err != nil {
		return "", err
	}
	var id string
	d.s.db.QueryRow(`SELECT id FROM pages WHERE title = ? AND type = 'collection'`, title).Scan(&id)
	return id, nil
}

func optionGroups(t *testing.T, schema []map[string]any, propID string) (ids, groups []string) {
	t.Helper()
	for _, p := range schema {
		if p["id"] != propID {
			continue
		}
		list, _ := p["options"].([]any)
		for _, o := range list {
			m := o.(map[string]any)
			id, _ := m["id"].(string)
			g, _ := m["group"].(string)
			ids = append(ids, id)
			groups = append(groups, g)
		}
		return
	}
	t.Fatalf("no property %q", propID)
	return
}

// What a door may not store: each refused on all three doors, and nothing of
// it reaches the database.
func TestStatusRefusalsOnEveryDoor(t *testing.T) {
	cases := []struct {
		name, options, says string
	}{
		{"unknown group", `[{"id":"a","name":"A","group":"todo"},{"id":"b","name":"B","group":"in_progress"},{"id":"c","name":"C","group":"later"}]`, `"later`},
		{"empty group", `[{"id":"a","name":"A","group":"todo"},{"id":"c","name":"C","group":"complete"}]`, "In progress group"},
		{"duplicate name", `[{"id":"a","name":"Open","group":"todo"},{"id":"b","name":"open","group":"in_progress"},{"id":"c","name":"C","group":"complete"}]`, "two options named"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			d := newStatusDoors(t)
			prop := `{"id":"stage","name":"Stage","type":"status","options":` + c.options + `}`
			col := d.s.makeCollection(t, d.ws, d.uid, "Tasks", `[]`)

			code, body := d.putSchema(t, col, `[`+prop+`]`)
			if code != 400 || !strings.Contains(body, "invalid_status_options") || !strings.Contains(body, c.says) {
				t.Errorf("REST: %d %s, want 400 invalid_status_options saying %q", code, body, c.says)
			}
			if err := d.updateSchema(t, col, `[`+prop+`]`); err == nil || !strings.Contains(err.Error(), c.says) {
				t.Errorf("update_schema: %v, want a refusal saying %q", err, c.says)
			}
			if len(d.schemaOf(t, col)) != 0 {
				t.Errorf("a refused status was stored: %v", d.schemaOf(t, col))
			}
			if _, err := d.createDatabase(t, "Refused", `[`+prop+`]`); err == nil || !strings.Contains(err.Error(), c.says) {
				t.Errorf("create_database: %v, want a refusal saying %q", err, c.says)
			}
			var n int
			d.s.db.QueryRow(`SELECT COUNT(*) FROM pages WHERE title = 'Refused'`).Scan(&n)
			if n != 0 {
				t.Error("create_database made a database with a refused status")
			}
		})
	}
}

// Options are stored in group order, their order within a group kept (R2),
// on every door.
func TestStatusOptionsAreKeptInGroupOrder(t *testing.T) {
	d := newStatusDoors(t)
	prop := `{"id":"stage","name":"Stage","type":"status","options":[
		{"id":"shipped","name":"Shipped","group":"complete"},
		{"id":"idea","name":"Idea","group":"todo"},
		{"id":"build","name":"Build","group":"in_progress"},
		{"id":"next","name":"Next","group":"todo"}]}`
	want := "idea,next,build,shipped"

	col := d.s.makeCollection(t, d.ws, d.uid, "Tasks", `[]`)
	if code, body := d.putSchema(t, col, `[`+prop+`]`); code != 200 {
		t.Fatalf("REST: %d %s", code, body)
	}
	if ids, _ := optionGroups(t, d.schemaOf(t, col), "stage"); strings.Join(ids, ",") != want {
		t.Errorf("REST stored %v, want %s", ids, want)
	}

	col2 := d.s.makeCollection(t, d.ws, d.uid, "Tasks 2", `[]`)
	if err := d.updateSchema(t, col2, `[`+prop+`]`); err != nil {
		t.Fatal(err)
	}
	if ids, _ := optionGroups(t, d.schemaOf(t, col2), "stage"); strings.Join(ids, ",") != want {
		t.Errorf("update_schema stored %v, want %s", ids, want)
	}

	col3, err := d.createDatabase(t, "Tasks 3", `[`+prop+`]`)
	if err != nil {
		t.Fatal(err)
	}
	if ids, _ := optionGroups(t, d.schemaOf(t, col3), "stage"); strings.Join(ids, ",") != want {
		t.Errorf("create_database stored %v, want %s", ids, want)
	}
}

// A select changed to a status: every option placed by its name, ids and
// rows untouched (FR-010); an empty group gets its default option (FR-002).
func TestSelectBecomesStatusByTheGuess(t *testing.T) {
	d := newStatusDoors(t)
	selectSchema := `[{"id":"stage","name":"Stage","type":"select","options":[
		{"id":"backlog","name":"Backlog"},{"id":"done","name":"Done"},{"id":"wip","name":"Doing"}]}]`
	asStatus := strings.Replace(selectSchema, `"type":"select"`, `"type":"status"`, 1)

	for _, door := range []string{"rest", "mcp"} {
		col := d.s.makeCollection(t, d.ws, d.uid, "Tasks "+door, selectSchema)
		row := d.s.makeRow(t, d.ws, d.uid, col, "A row", `{"stage":"wip"}`)
		var err error
		if door == "rest" {
			if code, body := d.putSchema(t, col, asStatus); code != 200 {
				t.Fatalf("REST: %d %s", code, body)
			}
		} else {
			err = d.updateSchema(t, col, `[{"id":"stage","type":"status"}]`)
		}
		if err != nil {
			t.Fatalf("%s: %v", door, err)
		}
		ids, groups := optionGroups(t, d.schemaOf(t, col), "stage")
		if got := strings.Join(ids, ","); got != "backlog,wip,done" {
			t.Errorf("%s: options %s, want backlog,wip,done (group order, ids kept)", door, got)
		}
		if got := strings.Join(groups, ","); got != "todo,in_progress,complete" {
			t.Errorf("%s: groups %s, want todo,in_progress,complete", door, got)
		}
		var props string
		d.s.db.QueryRow(`SELECT props FROM pages WHERE id = ?`, row).Scan(&props)
		if !strings.Contains(props, `"wip"`) {
			t.Errorf("%s: the row lost its value: %s", door, props)
		}
	}

	// Nothing the guess puts in progress or complete: those groups get their
	// default option so none is empty.
	col := d.s.makeCollection(t, d.ws, d.uid, "Ideas", `[{"id":"stage","name":"Stage","type":"select","options":[{"id":"idea","name":"Idea"}]}]`)
	if err := d.updateSchema(t, col, `[{"id":"stage","type":"status"}]`); err != nil {
		t.Fatal(err)
	}
	ids, groups := optionGroups(t, d.schemaOf(t, col), "stage")
	if strings.Join(groups, ",") != "todo,in_progress,complete" || ids[0] != "idea" {
		t.Errorf("empty groups not filled: %v %v", ids, groups)
	}

	// A brand-new status with no options starts with one per group (FR-003).
	col = d.s.makeCollection(t, d.ws, d.uid, "Fresh", `[]`)
	if err := d.updateSchema(t, col, `[{"name":"Progress","type":"status"}]`); err != nil {
		t.Fatal(err)
	}
	_, groups = optionGroups(t, d.schemaOf(t, col), "progress")
	if strings.Join(groups, ",") != "todo,in_progress,complete" {
		t.Errorf("a new status starts with %v, want one option per group", groups)
	}
}

// An option an agent sends back without its group keeps the one it has: a
// rename must not move it to a guessed group.
func TestStatusOptionKeepsItsGroupWhenSentWithout(t *testing.T) {
	d := newStatusDoors(t)
	col := d.s.makeCollection(t, d.ws, d.uid, "Tasks", `[{"id":"stage","name":"Stage","type":"status","options":[
		{"id":"a","name":"Waiting","group":"todo"},{"id":"b","name":"Blocked","group":"in_progress"},{"id":"c","name":"Done","group":"complete"}]}]`)
	// The type is sent along: update_schema without it turns the property into
	// text (#733), which this test is not about.
	if err := d.updateSchema(t, col, `[{"id":"stage","type":"status","options":[{"id":"a","name":"Waiting"},{"id":"b","name":"Stuck"},{"id":"c","name":"Done"}]}]`); err != nil {
		t.Fatal(err)
	}
	_, groups := optionGroups(t, d.schemaOf(t, col), "stage")
	if strings.Join(groups, ",") != "todo,in_progress,complete" {
		t.Errorf("renamed options moved group: %v", groups)
	}
}

// A multi-select becomes a status only when no row holds two of its values:
// a status holds one (R6). Refused on both doors, saying how many rows.
func TestMultiSelectBecomesStatusOnlyWithSingleValues(t *testing.T) {
	d := newStatusDoors(t)
	schema := `[{"id":"tags","name":"Tags","type":"multiselect","options":[{"id":"x","name":"To do"},{"id":"y","name":"Done"}]}]`
	col := d.s.makeCollection(t, d.ws, d.uid, "Tasks", schema)
	d.s.makeRow(t, d.ws, d.uid, col, "One", `{"tags":["x"]}`)
	two := d.s.makeRow(t, d.ws, d.uid, col, "Two", `{"tags":["x","y"]}`)

	asStatus := strings.Replace(schema, `"multiselect"`, `"status"`, 1)
	// Its own code, so the interface says the rows are the reason.
	if code, body := d.putSchema(t, col, asStatus); code != 400 || !strings.Contains(body, "1 rows hold more than one value") || !strings.Contains(body, `"status_rows_hold_several"`) {
		t.Errorf("REST: %d %s, want the refusal naming 1 row", code, body)
	}
	if err := d.updateSchema(t, col, `[{"id":"tags","type":"status"}]`); err == nil || !strings.Contains(err.Error(), "1 rows hold more than one value") {
		t.Errorf("update_schema: %v, want the refusal naming 1 row", err)
	}
	if typ := d.schemaOf(t, col)[0]["type"]; typ != "multiselect" {
		t.Errorf("the refused conversion was stored: %v", typ)
	}

	d.s.db.Exec(`UPDATE pages SET props = '{"tags":["y"]}' WHERE id = ?`, two)
	if err := d.updateSchema(t, col, `[{"id":"tags","type":"status"}]`); err != nil {
		t.Errorf("single values: %v", err)
	}
}

// A new database's Status is a status, with the ids it had as a select, so
// the default board still groups by it (FR-018, R7).
func TestNewDatabaseGetsAStatus(t *testing.T) {
	d := newStatusDoors(t)
	if _, err := callTool(t, d.s, d.u, "create_database", `{"title":"Plans","workspace_id":"`+d.ws+`"}`); err != nil {
		t.Fatal(err)
	}
	var id string
	d.s.db.QueryRow(`SELECT id FROM pages WHERE title = 'Plans' AND type = 'collection'`).Scan(&id)
	schema := d.schemaOf(t, id)
	var status map[string]any
	for _, p := range schema {
		if p["id"] == "status" {
			status = p
		}
	}
	if status == nil || status["type"] != "status" {
		t.Fatalf("the default Status is %v, want a status", status)
	}
	ids, groups := optionGroups(t, schema, "status")
	if strings.Join(ids, ",") != "todo,doing,done" || strings.Join(groups, ",") != "todo,in_progress,complete" {
		t.Errorf("default options %v %v", ids, groups)
	}
}

// Every door that makes a row of a database starts it in To-do in a status it
// was not given (FR-017, R4): the list below is the doors, so a new door
// without fillStatusDefaults fails here. A value the caller gives wins.
func TestEveryRowDoorStartsInToDo(t *testing.T) {
	d := newStatusDoors(t)
	col := d.s.makeCollection(t, d.ws, d.uid, "Work", `[
		{"id":"stage","name":"Stage","type":"status","options":[
			{"id":"later","name":"Later","group":"todo"},{"id":"now","name":"Now","group":"in_progress"},{"id":"shipped","name":"Shipped","group":"complete"}]},
		{"id":"note","name":"Note","type":"text"}]`)
	stageOf := func(title string) any {
		t.Helper()
		var props string
		if err := d.s.db.QueryRow(`SELECT props FROM pages WHERE parent_id = ? AND title = ?`, col, title).Scan(&props); err != nil {
			t.Fatalf("row %q: %v", title, err)
		}
		var m map[string]any
		json.Unmarshal([]byte(props), &m)
		return m["stage"]
	}
	post := func(path, body string) {
		t.Helper()
		rec := httptest.NewRecorder()
		req := httptest.NewRequest("POST", path, strings.NewReader(body))
		req.Header.Set("Cookie", d.cookie)
		req.Header.Set("Content-Type", "application/json")
		d.s.ServeHTTP(rec, req)
		if rec.Code != 200 {
			t.Fatalf("POST %s: %d %s", path, rec.Code, rec.Body.String())
		}
	}

	// A template of the database that holds no status.
	tmpl := d.s.makeRow(t, d.ws, d.uid, col, "Template", `{"note":"from the template"}`)
	d.s.db.Exec(`UPDATE pages SET is_template = 1, template_of = ? WHERE id = ?`, col, tmpl)

	// A public form on the database.
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/api/collections/"+col+"/form-share", strings.NewReader(`{}`))
	req.Header.Set("Cookie", d.cookie)
	req.Header.Set("Content-Type", "application/json")
	d.s.ServeHTTP(rec, req)
	var share struct{ Token string }
	json.Unmarshal(rec.Body.Bytes(), &share)
	if share.Token == "" {
		t.Fatalf("form share: %d %s", rec.Code, rec.Body.String())
	}

	doors := []struct {
		name string
		make func(title string)
	}{
		{"REST new row", func(title string) {
			post("/api/pages", `{"parentId":"`+col+`","title":"`+title+`"}`)
		}},
		{"REST row from template", func(title string) {
			post("/api/collections/"+col+"/from-template", `{"templateId":"`+tmpl+`","title":"`+title+`"}`)
		}},
		{"MCP create_page", func(title string) {
			if _, err := callTool(t, d.s, d.u, "create_page", `{"parent_id":"`+col+`","title":"`+title+`"}`); err != nil {
				t.Fatal(err)
			}
		}},
		{"MCP create_page from template", func(title string) {
			if _, err := callTool(t, d.s, d.u, "create_page", `{"template_id":"`+tmpl+`","title":"`+title+`"}`); err != nil {
				t.Fatal(err)
			}
		}},
		{"MCP create_rows", func(title string) {
			if _, err := callTool(t, d.s, d.u, "create_rows", `{"page_id":"`+col+`","rows":[{"title":"`+title+`"}]}`); err != nil {
				t.Fatal(err)
			}
		}},
		{"public form, status left empty", func(title string) {
			rec := httptest.NewRecorder()
			req := httptest.NewRequest("POST", "/api/public/form/"+share.Token+"/submit", strings.NewReader(`{"title":"`+title+`","props":{"stage":""}}`))
			req.Header.Set("Content-Type", "application/json")
			d.s.ServeHTTP(rec, req)
			if rec.Code != 200 {
				t.Fatalf("form submit: %d %s", rec.Code, rec.Body.String())
			}
		}},
		{"ingest", func(title string) {
			// The runner writes into its task row and stops without one.
			job := &ingestJob{ID: newID(), Total: 1}
			owner := taskOwnerOf(d.u)
			if err := d.s.createTask(owner, job.ID, "import", "", job); err != nil {
				t.Fatal(err)
			}
			d.s.runIngest(job, owner, col, d.ws, []ingestItem{{title: title, props: map[string]any{"Note": "imported"}}},
				map[string]string{"note": "note", "stage": "stage"})
		}},
	}
	for _, door := range doors {
		title := "Row by " + door.name
		door.make(title)
		if got := stageOf(title); got != "later" {
			t.Errorf("%s: stage = %v, want the first To-do option \"later\"", door.name, got)
		}
	}

	// What the caller gives wins over the default.
	if _, err := callTool(t, d.s, d.u, "create_rows", `{"page_id":"`+col+`","rows":[{"title":"Given","properties":{"stage":"now"}}]}`); err != nil {
		t.Fatal(err)
	}
	post("/api/pages", `{"parentId":"`+col+`","title":"Given REST","props":{"stage":"shipped"}}`)
	if stageOf("Given") != "now" || stageOf("Given REST") != "shipped" {
		t.Errorf("a given value was overwritten: %v, %v", stageOf("Given"), stageOf("Given REST"))
	}
}

// Sorting by a status follows its workflow order: by group, then by the
// option's place (R5), not by the ids' text, which would put "doing" before
// "done" before "todo". Empty and unknown values come last; desc reverses.
func TestStatusSortsInWorkflowOrder(t *testing.T) {
	d := newStatusDoors(t)
	col := d.s.makeCollection(t, d.ws, d.uid, "Work", `[{"id":"stage","name":"Stage","type":"status","options":[
		{"id":"todo","name":"To do","group":"todo"},{"id":"doing","name":"In progress","group":"in_progress"},{"id":"done","name":"Done","group":"complete"}]}]`)
	d.s.makeRow(t, d.ws, d.uid, col, "Finished", `{"stage":"done"}`)
	d.s.makeRow(t, d.ws, d.uid, col, "Waiting", `{"stage":"todo"}`)
	d.s.makeRow(t, d.ws, d.uid, col, "Blank", `{}`)
	d.s.makeRow(t, d.ws, d.uid, col, "Busy", `{"stage":["doing"]}`)
	titles := func(sort string) string {
		t.Helper()
		list, _, err := d.s.collectionRowsQuery(context.Background(), d.u, col, nil, nil, sort, 100, 0, time.Time{})
		if err != nil {
			t.Fatal(err)
		}
		out := []string{}
		for _, r := range list {
			out = append(out, r["title"].(string))
		}
		return strings.Join(out, ",")
	}
	if got := titles("stage:asc"); got != "Waiting,Busy,Finished,Blank" {
		t.Errorf("asc: %s", got)
	}
	if got := titles("stage:desc"); got != "Finished,Busy,Waiting,Blank" {
		t.Errorf("desc: %s", got)
	}
}

// A read-scope token cannot change a schema to add or convert a status: the
// existing write gate holds for the new type.
func TestReadScopeCannotWriteAStatus(t *testing.T) {
	d := newStatusDoors(t)
	col := d.s.makeCollection(t, d.ws, d.uid, "Work", `[{"id":"stage","name":"Stage","type":"select","options":[{"id":"a","name":"A"}]}]`)
	reader := &user{ID: d.uid, Name: "Agent", TokenKind: tokenKindAPI, TokenScope: "read"}
	if _, err := callTool(t, d.s, reader, "update_schema", `{"page_id":"`+col+`","properties":[{"id":"stage","type":"status"}]}`); err == nil {
		t.Error("a read-scope token converted a select to a status")
	}
	if typ := d.schemaOf(t, col)[0]["type"]; typ != "select" {
		t.Errorf("type is %v after a refused call", typ)
	}
}

// Converting the Status select every database made before spec 016 has
// (SC-002): each row keeps its value, the board keeps grouping by it, and the
// options land in the groups their names say, on both doors.
func TestDefaultSelectConvertsWithItsBoard(t *testing.T) {
	d := newStatusDoors(t)
	oldDefault := `[{"id":"status","name":"Status","type":"select","options":[
		{"id":"todo","name":"To do","color":"#c4554d"},{"id":"doing","name":"In progress","color":"#b58a3b"},{"id":"done","name":"Done","color":"#2f7d4f"}]}]`
	for _, door := range []string{"rest", "mcp"} {
		col := d.s.makeCollection(t, d.ws, d.uid, "Old "+door, oldDefault)
		d.s.db.Exec(`UPDATE collections SET views = ? WHERE page_id = ?`, defaultViews, col)
		rows := map[string]string{}
		for _, v := range []string{"todo", "doing", "done"} {
			rows[d.s.makeRow(t, d.ws, d.uid, col, "Row "+v, `{"status":"`+v+`"}`)] = v
		}
		if door == "rest" {
			if code, body := d.putSchema(t, col, strings.Replace(oldDefault, `"type":"select"`, `"type":"status"`, 1)); code != 200 {
				t.Fatalf("REST: %d %s", code, body)
			}
		} else if err := d.updateSchema(t, col, `[{"id":"status","type":"status"}]`); err != nil {
			t.Fatalf("update_schema: %v", err)
		}
		ids, groups := optionGroups(t, d.schemaOf(t, col), "status")
		if strings.Join(ids, ",") != "todo,doing,done" || strings.Join(groups, ",") != "todo,in_progress,complete" {
			t.Errorf("%s: options %v in groups %v", door, ids, groups)
		}
		for id, want := range rows {
			var got string
			d.s.db.QueryRow(`SELECT json_extract(props, '$.status') FROM pages WHERE id = ?`, id).Scan(&got)
			if got != want {
				t.Errorf("%s: a row's value went from %q to %q", door, want, got)
			}
		}
		_, views, _ := d.s.loadCollection(col)
		board := false
		for _, v := range views {
			if v["type"] == "board" && v["groupBy"] == "status" {
				board = true
			}
		}
		if !board {
			t.Errorf("%s: the board no longer groups by status: %v", door, views)
		}
	}
}
