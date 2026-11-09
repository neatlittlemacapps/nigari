package server

import (
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"testing"
)

// A person's own filter and sort for a view (spec 013, US1; viewprefs.go).
// The fixture is the lock's: a Tasks database with a table "t" and a board
// "b", its owner, a write token of the owner, and a reader of the workspace.

const mineOnly = `{"filters":[{"property":"system","op":"is","value":"crm"}]}`

func (f lockFixture) personal(t *testing.T, cookie string) map[string]json.RawMessage {
	t.Helper()
	rec := requestAs(t, f.s, cookie, "GET", "/api/collections/"+f.col+"/personal", "")
	if rec.Code != 200 {
		t.Fatalf("GET personal: %d %s", rec.Code, rec.Body.String())
	}
	var out struct {
		States map[string]json.RawMessage `json:"states"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	return out.States
}

func (f lockFixture) prefRows(t *testing.T) int {
	t.Helper()
	var n int
	if err := f.s.db.QueryRow(`SELECT COUNT(*) FROM view_prefs`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

// FR-001, FR-006: a person's change is stored for them and returned to them,
// and to nobody else. The refusal that matters: another account that can read
// the same database gets nothing of it, and cannot reset it.
func TestPersonalViewStateIsOnlyItsOwners(t *testing.T) {
	f := newLockFixture(t)
	path := "/api/collections/" + f.col + "/personal/t"
	if rec := requestAs(t, f.s, f.cookie, "PUT", path, mineOnly); rec.Code != 200 {
		t.Fatalf("owner PUT: %d %s", rec.Code, rec.Body.String())
	}
	if got := f.personal(t, f.cookie); !strings.Contains(string(got["t"]), `"crm"`) {
		t.Fatalf("the owner does not get their own state back: %v", got)
	}
	if got := f.personal(t, f.readerCookie); len(got) != 0 {
		t.Fatalf("another account was given the owner's state: %v", got)
	}
	// The other account's Reset removes only its own (nothing), not the owner's.
	if rec := requestAs(t, f.s, f.readerCookie, "DELETE", path, ""); rec.Code != 200 {
		t.Fatalf("reader DELETE: %d", rec.Code)
	}
	if got := f.personal(t, f.cookie); len(got) != 1 {
		t.Fatalf("another account's reset removed the owner's state: %v", got)
	}
	// The stored views are untouched: nothing was changed for everyone.
	if v := f.storedViews(t); strings.Contains(v, "crm") {
		t.Fatalf("a personal change reached the shared views: %s", v)
	}
	// And nothing in the activity log (FR-006).
	var logged int
	f.s.db.QueryRow(`SELECT COUNT(*) FROM audit_log WHERE action LIKE 'view%'`).Scan(&logged)
	if logged != 0 {
		t.Fatalf("a personal change was logged %d time(s)", logged)
	}
}

// US1 scenario 6: someone who may only read the database may still narrow it
// for themselves; it changes nothing for anyone else.
func TestAReaderMayKeepTheirOwnViewState(t *testing.T) {
	f := newLockFixture(t)
	if rec := requestAs(t, f.s, f.readerCookie, "PUT", "/api/collections/"+f.col+"/personal/t", mineOnly); rec.Code != 200 {
		t.Fatalf("reader PUT: %d %s", rec.Code, rec.Body.String())
	}
	if got := f.personal(t, f.readerCookie); len(got) != 1 {
		t.Fatalf("the reader's state was not kept: %v", got)
	}
	// FR-009: the lock does not cover personal changes.
	f.lock(t)
	if rec := requestAs(t, f.s, f.readerCookie, "PUT", "/api/collections/"+f.col+"/personal/b", `{"sort":null}`); rec.Code != 200 {
		t.Fatalf("personal change while locked: %d %s", rec.Code, rec.Body.String())
	}
}

// The doors that must stay shut: a token (an agent has no personal state),
// someone who cannot read the database, a scope that names no view of it,
// and an embed in a page the caller cannot read.
func TestPersonalViewStateRefusals(t *testing.T) {
	f := newLockFixture(t)
	base := "/api/collections/" + f.col + "/personal"
	for _, c := range []struct{ method, path string }{
		{"GET", base}, {"PUT", base + "/t"}, {"DELETE", base + "/t"},
	} {
		rec := f.bearer(c.method, c.path, mineOnly)
		if rec.Code != 403 || !strings.Contains(rec.Body.String(), "session_required") {
			t.Errorf("token %s %s: %d %s, want 403 session_required", c.method, c.path, rec.Code, rec.Body.String())
		}
	}
	if f.prefRows(t) != 0 {
		t.Fatal("a token stored a personal state")
	}

	_, strangerCookie := signedIn(t, f.s, "prefs-stranger@example.test")
	for _, c := range []struct{ method, path string }{
		{"GET", base}, {"PUT", base + "/t"}, {"DELETE", base + "/t"},
	} {
		if rec := requestAs(t, f.s, strangerCookie, c.method, c.path, mineOnly); rec.Code != 404 {
			t.Errorf("stranger %s %s: %d, want 404", c.method, c.path, rec.Code)
		}
	}

	for _, scope := range []string{"nope", "embed:x", "embed:" + f.col + ":blk:nope", "a:b"} {
		if rec := requestAs(t, f.s, f.cookie, "PUT", base+"/"+scope, mineOnly); rec.Code != 404 {
			t.Errorf("scope %q: %d, want 404", scope, rec.Code)
		}
	}

	// An embed in a page the reader cannot read: the owner's private page.
	private := newID()
	if _, err := f.s.db.Exec(`INSERT INTO pages (id, workspace_id, owner_id, title, type, props, visibility, created_at, updated_at)
		VALUES (?, ?, ?, 'Private', 'doc', '{}', 'private', ?, ?)`, private, f.ws, f.owner, now(), now()); err != nil {
		t.Fatal(err)
	}
	scope := "embed:" + private + ":blk1:t"
	if rec := requestAs(t, f.s, f.readerCookie, "PUT", base+"/"+scope, mineOnly); rec.Code != 404 {
		t.Errorf("embed in an unreadable page: %d, want 404", rec.Code)
	}
	if rec := requestAs(t, f.s, f.cookie, "PUT", base+"/"+scope, mineOnly); rec.Code != 200 {
		t.Errorf("embed in the owner's own page: %d %s, want 200", rec.Code, rec.Body.String())
	}
	if f.prefRows(t) != 1 {
		t.Fatalf("stored %d rows, want only the owner's embed state", f.prefRows(t))
	}
}

// What is stored is what was checked: conditions on a property the database
// no longer has are dropped (a colleague's deletion must not break a filter
// click), an unknown operator and an oversized state are refused, and a
// state with nothing in it removes the row.
func TestPersonalViewStateIsChecked(t *testing.T) {
	f := newLockFixture(t)
	path := "/api/collections/" + f.col + "/personal/t"
	put := func(body string) (int, string) {
		rec := requestAs(t, f.s, f.cookie, "PUT", path, body)
		return rec.Code, rec.Body.String()
	}
	code, body := put(`{"filters":[{"property":"gone","op":"is","value":"x"},{"property":"system","op":"contains","value":"c"}],
		"sort":{"property":"gone","dir":"asc"},"quickPicks":{"gone":"x","status":"open"},"other":1}`)
	if code != 200 {
		t.Fatalf("PUT: %d %s", code, body)
	}
	if strings.Contains(body, "gone") || strings.Contains(body, "other") || strings.Contains(body, `"sort"`) {
		t.Errorf("a missing property or unknown key was stored: %s", body)
	}
	if !strings.Contains(body, `"system"`) || !strings.Contains(body, `"quickPicks":{"status":"open"}`) {
		t.Errorf("valid parts were not stored: %s", body)
	}
	// Presence is kept: an emptied filter list and a removed sort are a change.
	if code, body = put(`{"filters":[],"sort":null}`); code != 200 || !strings.Contains(body, `"filters":[]`) || !strings.Contains(body, `"sort":null`) {
		t.Errorf("empty-but-present keys: %d %s", code, body)
	}
	for _, bad := range []string{
		`{"filters":[{"property":"system","op":"explode","value":"x"}]}`,
		`{"sort":{"property":"system","dir":"sideways"}}`,
		`[]`, `not json`,
	} {
		if code, body = put(bad); code != 400 {
			t.Errorf("%s: %d %s, want 400", bad, code, body)
		}
	}
	if code, _ = put(`{"filters":[{"property":"system","op":"is","value":"` + strings.Repeat("x", maxViewStateBytes) + `"}]}`); code != 413 {
		t.Errorf("oversized state: %d, want 413", code)
	}
	if f.prefRows(t) != 1 {
		t.Fatalf("rows after refusals: %d, want the one valid state", f.prefRows(t))
	}
	if code, _ = put(`{}`); code != 200 || f.prefRows(t) != 0 {
		t.Errorf("an empty state should remove the row: %d, %d row(s) left", code, f.prefRows(t))
	}
}

// T020 and the foreign keys: a personal state goes with its view (both
// doors), with its database, and with its person.
func TestPersonalViewStateGoesWithItsViewDatabaseAndPerson(t *testing.T) {
	f := newLockFixture(t)
	base := "/api/collections/" + f.col + "/personal/"
	embed := "embed:" + f.col + ":blk1:b"
	for _, scope := range []string{"t", "b", embed} {
		if rec := requestAs(t, f.s, f.cookie, "PUT", base+scope, mineOnly); rec.Code != 200 {
			t.Fatalf("PUT %s: %d %s", scope, rec.Code, rec.Body.String())
		}
	}
	if rec := requestAs(t, f.s, f.readerCookie, "PUT", base+"t", mineOnly); rec.Code != 200 {
		t.Fatal("reader PUT")
	}

	// REST: a views save without "b" removes b's states (the view's own and
	// the embed's), everybody's, and leaves t's.
	if rec := requestAs(t, f.s, f.cookie, "PUT", "/api/collections/"+f.col,
		`{"views":[{"id":"t","name":"Table","type":"table"}]}`); rec.Code != 200 {
		t.Fatalf("views save: %d %s", rec.Code, rec.Body.String())
	}
	got := f.personal(t, f.cookie)
	if _, ok := got["t"]; !ok || len(got) != 1 {
		t.Fatalf("after deleting view b over REST: %v, want only t", got)
	}

	// MCP: delete_view removes the last view's states for both people.
	if _, err := f.s.mcpCreateView(viewTestAgent, f.col, viewSpec{Name: "Other", Type: "table"}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.s.mcpDeleteView(viewTestAgent, f.col, "t"); err != nil {
		t.Fatal(err)
	}
	if n := f.prefRows(t); n != 0 {
		t.Fatalf("after delete_view: %d row(s) left", n)
	}

	// The database deleted for good, and the account deleted.
	views := `[{"id":"t","name":"Table","type":"table"}]`
	f.s.db.Exec(`UPDATE collections SET views = ? WHERE page_id = ?`, views, f.col)
	requestAs(t, f.s, f.cookie, "PUT", base+"t", mineOnly)
	requestAs(t, f.s, f.readerCookie, "PUT", base+"t", mineOnly)
	if f.prefRows(t) != 2 {
		t.Fatalf("setup: %d rows", f.prefRows(t))
	}
	if _, err := f.s.db.Exec(`DELETE FROM users WHERE id = ?`, f.reader); err != nil {
		t.Fatal(err)
	}
	if f.prefRows(t) != 1 {
		t.Fatalf("after deleting the account: %d row(s), want 1", f.prefRows(t))
	}
	if _, err := f.s.db.Exec(`DELETE FROM pages WHERE id = ?`, f.col); err != nil {
		t.Fatal(err)
	}
	if f.prefRows(t) != 0 {
		t.Fatalf("after deleting the database: %d row(s) left", f.prefRows(t))
	}
}

// FR-005, US1 scenario 7: a row made in a view takes the values the filters
// the person SEES pin down. With "System is crm" set for themselves, the
// owner's new row is a crm row; the reader, who set nothing, and an agent,
// who has no personal state, get the shared view's (none).
func TestNewRowFollowsThePersonsOwnFilters(t *testing.T) {
	f := newLockFixture(t)
	if rec := requestAs(t, f.s, f.cookie, "PUT", "/api/collections/"+f.col+"/personal/t", mineOnly); rec.Code != 200 {
		t.Fatal(rec.Body.String())
	}
	create := func(cookie, extra string) (props map[string]any, matches any) {
		rec := requestAs(t, f.s, cookie, "POST", "/api/pages", `{"parentId":"`+f.col+`","title":"","viewId":"t"`+extra+`}`)
		if rec.Code != 200 {
			t.Fatalf("create: %d %s", rec.Code, rec.Body.String())
		}
		var p struct {
			Props       map[string]any `json:"props"`
			MatchesView any            `json:"matchesView"`
		}
		json.Unmarshal(rec.Body.Bytes(), &p)
		return p.Props, p.MatchesView
	}
	if props, matches := create(f.cookie, ""); props["system"] != "crm" || matches != true {
		t.Errorf("the owner's row: system=%v matchesView=%v, want crm and true", props["system"], matches)
	}
	// In a document's embed the page's personal state does not apply; the
	// embed's own does.
	embed := "embed:" + f.col + ":blk1:t"
	if props, _ := create(f.cookie, `,"viewScope":"`+embed+`"`); props["system"] != nil {
		t.Errorf("a row made in an embed took the page's personal filter: %v", props)
	}
	requestAs(t, f.s, f.cookie, "PUT", "/api/collections/"+f.col+"/personal/"+embed,
		`{"filters":[{"property":"status","op":"is","value":"done"}]}`)
	if props, _ := create(f.cookie, `,"viewScope":"`+embed+`"`); props["status"] != "done" || props["system"] != nil {
		t.Errorf("a row made in an embed with its own personal filter: %v, want status done only", props)
	}
	// A token of the same account: no personal state (an agent's row).
	rec := f.bearer("POST", "/api/pages", `{"parentId":"`+f.col+`","title":"","viewId":"t"}`)
	if rec.Code != 200 || strings.Contains(rec.Body.String(), "crm") {
		t.Errorf("a token's row took the person's own filter: %d %s", rec.Code, rec.Body.String())
	}
	// And over MCP.
	out, err := f.s.propsInView(f.col, "t", viewer{}, nil)
	if err != nil || strings.Contains(string(out), "crm") {
		t.Errorf("propsInView for nobody: %s %v", out, err)
	}
}

// The browser draws with web/src/viewState.ts and the server pins with
// mergeViewState: one fixture holds them to the same answer
// (check-viewstate.mjs reads the same file).
func TestMergeViewStateMatchesTheBrowser(t *testing.T) {
	raw, err := os.ReadFile("testdata/viewstate.json")
	if err != nil {
		t.Fatal(err)
	}
	var fx struct {
		Cases []struct {
			Name     string                     `json:"name"`
			View     map[string]any             `json:"view"`
			Personal map[string]json.RawMessage `json:"personal"`
			Filters  []any                      `json:"filters"`
			Sort     any                        `json:"sort"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(raw, &fx); err != nil {
		t.Fatal(err)
	}
	if len(fx.Cases) == 0 {
		t.Fatal("the fixture has no cases")
	}
	for _, c := range fx.Cases {
		filters, sort := mergeViewState(c.View, c.Personal)
		if !reflect.DeepEqual(filters, c.Filters) || !reflect.DeepEqual(sort, c.Sort) {
			got, _ := json.Marshal(map[string]any{"filters": filters, "sort": sort})
			want, _ := json.Marshal(map[string]any{"filters": c.Filters, "sort": c.Sort})
			t.Errorf("%s:\n got  %s\n want %s", c.Name, got, want)
		}
	}
}
