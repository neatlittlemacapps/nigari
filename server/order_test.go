package server

import (
	"encoding/json"
	"strings"
	"testing"
)

// Spec 022: putting a page before or after a sibling, for a person
// (POST /api/pages/{id}/place) and for an agent (update_page and create_page
// with after/before). Both doors call placePage.

type orderFixture struct {
	s       *Server
	owner   string
	cookie  string
	ws      string
	db      string
	a, b, c string
}

// newOrderFixture makes a database with rows A, B, C at positions 1, 2, 3.
func newOrderFixture(t *testing.T) orderFixture {
	t.Helper()
	s := testServer(t)
	owner, cookie := signedIn(t, s, "order@example.test")
	ws := s.firstWorkspaceOf(t, owner)
	db := s.makeCollection(t, ws, owner, "Tasks", `[{"id":"note","name":"Note","type":"text"}]`)
	f := orderFixture{s: s, owner: owner, cookie: cookie, ws: ws, db: db}
	f.a = s.makeRow(t, ws, owner, db, "A", `{}`)
	f.b = s.makeRow(t, ws, owner, db, "B", `{}`)
	f.c = s.makeRow(t, ws, owner, db, "C", `{}`)
	for i, id := range []string{f.a, f.b, f.c} {
		s.db.Exec(`UPDATE pages SET position = ? WHERE id = ?`, float64(i+1), id)
	}
	return f
}

// order is the titles of the database's rows in the rows query's order.
func (f orderFixture) order(t *testing.T) string {
	t.Helper()
	rows, err := f.s.db.Query(`SELECT title FROM pages WHERE parent_id = ? AND trashed_at IS NULL ORDER BY position, created_at, id`, f.db)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var title string
		rows.Scan(&title)
		out = append(out, title)
	}
	return strings.Join(out, "")
}

func (f orderFixture) place(t *testing.T, id, body string) (int, string) {
	t.Helper()
	rec := requestAs(t, f.s, f.cookie, "POST", "/api/pages/"+id+"/place", body)
	return rec.Code, rec.Body.String()
}

func TestPlaceMovesARowBetweenItsNeighbours(t *testing.T) {
	f := newOrderFixture(t)
	if code, body := f.place(t, f.c, `{"after":"`+f.a+`"}`); code != 200 {
		t.Fatalf("place C after A: %d %s", code, body)
	}
	if got := f.order(t); got != "ACB" {
		t.Fatalf("order %q, want ACB", got)
	}
	if code, _ := f.place(t, f.b, `{"before":"`+f.a+`"}`); code != 200 {
		t.Fatal("place B before A")
	}
	if got := f.order(t); got != "BAC" {
		t.Fatalf("order %q, want BAC", got)
	}
	// To the end and to the start.
	f.place(t, f.b, `{"after":"`+f.c+`"}`)
	if got := f.order(t); got != "ACB" {
		t.Fatalf("order %q, want ACB", got)
	}
}

func TestPlaceWritesOneRowAndKeepsUpdatedAt(t *testing.T) {
	f := newOrderFixture(t)
	f.s.db.Exec(`UPDATE pages SET updated_at = '2020-01-01T00:00:00Z' WHERE parent_id = ?`, f.db)
	f.place(t, f.c, `{"before":"`+f.b+`"}`)
	var n int
	f.s.db.QueryRow(`SELECT COUNT(*) FROM pages WHERE parent_id = ? AND position IN (1, 2, 3)`, f.db).Scan(&n)
	if n != 2 {
		t.Errorf("%d rows kept their positions, want 2: a move writes the moved row only", n)
	}
	var changed int
	f.s.db.QueryRow(`SELECT COUNT(*) FROM pages WHERE parent_id = ? AND updated_at != '2020-01-01T00:00:00Z'`, f.db).Scan(&changed)
	if changed != 0 {
		t.Errorf("%d rows got a new updated_at: a move is not an edit", changed)
	}
	var action, detail string
	f.s.db.QueryRow(`SELECT action, detail FROM audit_log WHERE page_id = ? ORDER BY id DESC LIMIT 1`, f.c).Scan(&action, &detail)
	if action != "reorder_page" || !strings.Contains(detail, "before "+f.b) {
		t.Errorf("activity log: %q %q, want reorder_page before B", action, detail)
	}
}

func TestPlaceRenumbersWhenNeighboursTie(t *testing.T) {
	f := newOrderFixture(t)
	// B and C share a position, as copies of a page tree can.
	f.s.db.Exec(`UPDATE pages SET position = 2 WHERE id IN (?, ?)`, f.b, f.c)
	before := f.order(t)
	first, second := before[1:2], before[2:3]
	ids := map[string]string{"B": f.b, "C": f.c}
	if code, body := f.place(t, f.a, `{"after":"`+ids[first]+`"}`); code != 200 {
		t.Fatalf("place A between two tied rows: %d %s", code, body)
	}
	if got, want := f.order(t), first+"A"+second; got != want {
		t.Fatalf("order %q, want %q", got, want)
	}
}

func TestPlaceNextToItselfOrWhereItIsWritesNothing(t *testing.T) {
	f := newOrderFixture(t)
	for _, body := range []string{`{"after":"` + f.b + `"}`, `{"after":"` + f.a + `"}`, `{"before":"` + f.c + `"}`} {
		if code, out := f.place(t, f.b, body); code != 200 {
			t.Fatalf("%s: %d %s", body, code, out)
		}
	}
	var n int
	f.s.db.QueryRow(`SELECT COUNT(*) FROM audit_log WHERE action = 'reorder_page'`).Scan(&n)
	if n != 0 || f.order(t) != "ABC" {
		t.Errorf("a move that changes nothing wrote %d log entries, order %q", n, f.order(t))
	}
}

func TestPlaceRefusesAnchorsThatAreNotSiblings(t *testing.T) {
	f := newOrderFixture(t)
	other := f.s.makeCollection(t, f.ws, f.owner, "Other", `[]`)
	stranger := f.s.makeRow(t, f.ws, f.owner, other, "X", `{}`)
	trashed := f.s.makeRow(t, f.ws, f.owner, f.db, "T", `{}`)
	f.s.db.Exec(`UPDATE pages SET trashed_at = ? WHERE id = ?`, now(), trashed)
	for name, body := range map[string]string{
		"a row of another database": `{"after":"` + stranger + `"}`,
		"a row in the trash":        `{"after":"` + trashed + `"}`,
		"a page that is not there":  `{"after":"nope"}`,
	} {
		code, out := f.place(t, f.a, body)
		if code != 400 || !strings.Contains(out, "anchor_not_sibling") {
			t.Errorf("%s: %d %s, want 400 anchor_not_sibling", name, code, out)
		}
	}
	for _, body := range []string{`{}`, `{"after":"` + f.b + `","before":"` + f.c + `"}`} {
		if code, _ := f.place(t, f.a, body); code != 400 {
			t.Errorf("%s: %d, want 400", body, code)
		}
	}
	if f.order(t) != "ABC" {
		t.Errorf("a refused move changed the order: %q", f.order(t))
	}
}

func TestPlaceIsRefusedWithoutTheRightToWrite(t *testing.T) {
	f := newOrderFixture(t)
	viewer, cookie := signedIn(t, f.s, "reader@example.test")
	f.s.addMember(t, f.ws, viewer, "viewer")
	if rec := requestAs(t, f.s, cookie, "POST", "/api/pages/"+f.c+"/place", `{"after":"`+f.a+`"}`); rec.Code != 404 {
		t.Errorf("a viewer moved a row: %d %s, want 404", rec.Code, rec.Body.String())
	}
	outsider, cookie2 := signedIn(t, f.s, "outsider@example.test")
	_ = outsider
	if rec := requestAs(t, f.s, cookie2, "POST", "/api/pages/"+f.c+"/place", `{"after":"`+f.a+`"}`); rec.Code != 404 {
		t.Errorf("an outsider moved a row: %d, want 404", rec.Code)
	}
	if f.order(t) != "ABC" {
		t.Errorf("order changed: %q", f.order(t))
	}
}

func TestPlaceKeepsToTheCredential(t *testing.T) {
	f := newScopeFixture(t)
	db := f.s.makeCollection(t, f.other, f.owner, "Elsewhere", `[]`)
	a := f.s.makeRow(t, f.other, f.owner, db, "A", `{}`)
	b := f.s.makeRow(t, f.other, f.owner, db, "B", `{}`)
	f.s.db.Exec(`UPDATE pages SET position = 2 WHERE id = ?`, b)
	if rec := f.bearer(f.teamTok, "POST", "/api/pages/"+b+"/place", `{"before":"`+a+`"}`); rec.Code != 404 {
		t.Errorf("a token narrowed to another workspace moved a row: %d", rec.Code)
	}
	u := &user{ID: f.owner, TokenKind: tokenKindAPI, TokenScope: "write", TokenWorkspaces: []string{f.team}}
	if _, err := callTool(t, f.s, u, "update_page", `{"page_id":"`+b+`","before":"`+a+`"}`); err == nil {
		t.Error("update_page moved a row outside the token's workspaces")
	}
	// A workspace closed to agents.
	f.s.db.Exec(`UPDATE workspaces SET agent_access = 'closed' WHERE id = ?`, f.other)
	open := &user{ID: f.owner, TokenKind: tokenKindAPI, TokenScope: "write"}
	if _, err := callTool(t, f.s, open, "update_page", `{"page_id":"`+b+`","before":"`+a+`"}`); err == nil {
		t.Error("update_page moved a row in a workspace closed to agents")
	}
	// Read scope may not move.
	ro := &user{ID: f.owner, TokenKind: tokenKindAPI, TokenScope: "read"}
	f.s.db.Exec(`UPDATE workspaces SET agent_access = 'open' WHERE id = ?`, f.other)
	if _, err := callTool(t, f.s, ro, "update_page", `{"page_id":"`+b+`","before":"`+a+`"}`); err == nil {
		t.Error("a read-scoped key moved a row")
	}
	var pa, pb float64
	f.s.db.QueryRow(`SELECT position FROM pages WHERE id = ?`, a).Scan(&pa)
	f.s.db.QueryRow(`SELECT position FROM pages WHERE id = ?`, b).Scan(&pb)
	if pb < pa {
		t.Error("a refused move changed the order")
	}
}

func TestAgentsPlaceRowsWithUpdatePage(t *testing.T) {
	f := newOrderFixture(t)
	u := &user{ID: f.owner, Name: "Agent"}
	out, err := callTool(t, f.s, u, "update_page", `{"page_id":"`+f.c+`","after":"`+f.a+`"}`)
	if err != nil {
		t.Fatalf("update_page after: %v", err)
	}
	if !strings.Contains(out, "Placed") || f.order(t) != "ACB" {
		t.Fatalf("answer %q, order %q, want ACB", out, f.order(t))
	}
	if _, err := callTool(t, f.s, u, "update_page", `{"page_id":"`+f.a+`","after":"`+f.b+`","before":"`+f.c+`"}`); err == nil {
		t.Error("after and before together were accepted")
	}
	if _, err := callTool(t, f.s, u, "update_page", `{"page_id":"`+f.a+`","after":"nope"}`); err == nil {
		t.Error("an anchor that is not a sibling was accepted")
	}
}

func TestNewRowsAndCopiesLandNextToTheirRow(t *testing.T) {
	f := newOrderFixture(t)
	// The + beside a row: one request, the new row right after it.
	rec := requestAs(t, f.s, f.cookie, "POST", "/api/pages", `{"parentId":"`+f.db+`","title":"N","after":"`+f.a+`"}`)
	if rec.Code != 200 {
		t.Fatalf("create after A: %d %s", rec.Code, rec.Body.String())
	}
	if got := f.order(t); got != "ANBC" {
		t.Fatalf("order %q, want ANBC", got)
	}
	// A refused anchor creates nothing.
	var before int
	f.s.db.QueryRow(`SELECT COUNT(*) FROM pages`).Scan(&before)
	other := f.s.makeCollection(t, f.ws, f.owner, "Other", `[]`)
	stranger := f.s.makeRow(t, f.ws, f.owner, other, "X", `{}`)
	before += 2
	for _, anchor := range []string{"nope", stranger} {
		rec = requestAs(t, f.s, f.cookie, "POST", "/api/pages", `{"parentId":"`+f.db+`","title":"Z","before":"`+anchor+`"}`)
		var after int
		f.s.db.QueryRow(`SELECT COUNT(*) FROM pages`).Scan(&after)
		if rec.Code != 400 || after != before {
			t.Errorf("create before %s: %d, %d pages made, want 400 and none", anchor, rec.Code, after-before)
		}
	}
	// An agent's create_page with before.
	u := &user{ID: f.owner, Name: "Agent"}
	if _, err := callTool(t, f.s, u, "create_page", `{"parent_id":"`+f.db+`","title":"M","before":"`+f.a+`"}`); err != nil {
		t.Fatalf("create_page before: %v", err)
	}
	if got := f.order(t); got != "MANBC" {
		t.Fatalf("order %q, want MANBC", got)
	}
	// Duplicate: the copy right below its source, by either door.
	rec = requestAs(t, f.s, f.cookie, "POST", "/api/pages/"+f.b+"/duplicate", ``)
	if rec.Code != 200 {
		t.Fatalf("duplicate: %d %s", rec.Code, rec.Body.String())
	}
	if got := f.order(t); got != "MANB"+"Copy of B"+"C" {
		t.Fatalf("order %q, want the copy of B right after B", got)
	}
	if _, err := callTool(t, f.s, u, "duplicate_page", `{"page_id":"`+f.a+`"}`); err != nil {
		t.Fatalf("duplicate_page: %v", err)
	}
	if got := f.order(t); got != "MA"+"Copy of A"+"NB"+"Copy of B"+"C" {
		t.Fatalf("order %q, want the copy of A right after A", got)
	}
}

// shown is the titles in the order the table gets them, from the rows route.
func (f orderFixture) shown(t *testing.T) string {
	t.Helper()
	rec := requestAs(t, f.s, f.cookie, "GET", "/api/collections/"+f.db+"/rows", "")
	if rec.Code != 200 {
		t.Fatalf("rows: %d %s", rec.Code, rec.Body.String())
	}
	var out struct {
		Rows []struct {
			Title string `json:"title"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	var b strings.Builder
	for _, r := range out.Rows {
		b.WriteString(r.Title)
	}
	return b.String()
}

// Two rows with the same position and the same created_at (a copied
// database) were in the table's order only by chance, while placePage broke
// the tie by id: a row dropped between them could land after both. Every
// query that shows rows now ends on the id too (code review, PR 1).
func TestPlaceBetweenRowsThatFullyTie(t *testing.T) {
	f := newOrderFixture(t)
	// Ten rows tied on both, so a table that orders them by chance is
	// caught by more than luck.
	ids := map[string]string{"B": f.b, "C": f.c}
	for _, title := range []string{"D", "E", "F", "G", "H", "I", "J", "K"} {
		ids[title] = f.s.makeRow(t, f.ws, f.owner, f.db, title, `{}`)
	}
	for _, id := range ids {
		f.s.db.Exec(`UPDATE pages SET position = 2, created_at = '2026-01-01T00:00:00Z' WHERE id = ?`, id)
	}
	shown := f.shown(t)
	if shown != f.order(t) {
		t.Fatalf("the table shows %q, placePage's order is %q", shown, f.order(t))
	}
	first, second := shown[1:2], shown[2:3]
	// Already in place, though only the id says which comes first: nothing moves.
	if code, body := f.place(t, ids[second], `{"after":"`+ids[first]+`"}`); code != 200 || f.order(t) != shown {
		t.Fatalf("placing %s after %s where it is: %d %s, order %q, want %q", second, first, code, body, f.order(t), shown)
	}
	if code, body := f.place(t, f.a, `{"after":"`+ids[first]+`"}`); code != 200 {
		t.Fatalf("place A between two tied rows: %d %s", code, body)
	}
	if got, want := f.shown(t)[:3], first+"A"+second; got != want {
		t.Fatalf("order %q, want %q", got, want)
	}
}

// update_page with a new parent and an anchor that is not a child of it used
// to move the page first and then fail, so the agent was told nothing
// happened while the page had moved (code review, PR 1).
func TestUpdatePageRefusesABadAnchorBeforeMoving(t *testing.T) {
	f := newOrderFixture(t)
	u := &user{ID: f.owner, Name: "Agent"}
	other := f.s.makeCollection(t, f.ws, f.owner, "Other", `[]`)
	if _, err := callTool(t, f.s, u, "update_page", `{"page_id":"`+f.a+`","parent_id":"`+other+`","after":"`+f.b+`"}`); err == nil {
		t.Fatal("an anchor outside the new parent was accepted")
	}
	var parent string
	f.s.db.QueryRow(`SELECT parent_id FROM pages WHERE id = ?`, f.a).Scan(&parent)
	if parent != f.db {
		t.Errorf("the refused call still moved the page to %q", parent)
	}
}

// An agent is told when a placement changed nothing, and a template with an
// anchor is refused rather than the anchor ignored (code review, PR 1).
func TestAgentsAreToldWhatPlacingDid(t *testing.T) {
	f := newOrderFixture(t)
	u := &user{ID: f.owner, Name: "Agent"}
	out, err := callTool(t, f.s, u, "update_page", `{"page_id":"`+f.b+`","after":"`+f.a+`"}`)
	if err != nil || !strings.Contains(out, "already") {
		t.Errorf("B after A where it is: %q %v, want an 'already' answer", out, err)
	}
	if _, err := callTool(t, f.s, u, "create_page", `{"title":"T","parent_id":"`+f.db+`","template_id":"any","after":"`+f.a+`"}`); err == nil || !strings.Contains(err.Error(), "template_id") {
		t.Errorf("create_page with template_id and after: %v, want a refusal naming template_id", err)
	}
}
