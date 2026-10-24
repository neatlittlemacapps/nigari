package server

import (
	"encoding/json"
	"strings"
	"testing"
)

// An agent can switch a page's Appearance settings with update_page and read
// them back with get_page, under the same gates as every other write.
func TestMCPFullWidth(t *testing.T) {
	f := newScopeFixture(t)
	seedPage(t, f.s, "doc1", "", f.team, f.owner, "workspace", `[{"type":"paragraph","content":"hi"}]`)
	write := &user{ID: f.owner, Name: "Agent", TokenScope: "write", TokenKind: tokenKindAPI}
	read := &user{ID: f.owner, Name: "Agent", TokenScope: "read", TokenKind: tokenKindAPI}
	call := func(u *user, tool string, args map[string]any) (string, error) {
		b, _ := json.Marshal(args)
		return f.s.mcpCall(u, tool, b, "http://x")
	}
	props := func(id string) string {
		var p string
		f.s.db.QueryRow(`SELECT props FROM pages WHERE id = ?`, id).Scan(&p)
		return p
	}

	plain, _ := call(write, "get_page", map[string]any{"page_id": "doc1"})
	if strings.Contains(plain, "Page settings") {
		t.Fatalf("a page with nothing on reports settings: %s", plain)
	}

	if out, err := call(write, "update_page", map[string]any{"page_id": "doc1", "full_width": true}); err != nil || !strings.Contains(out, "full width on") {
		t.Fatalf("set: %q %v", out, err)
	}
	if got := props("doc1"); got != `{"_fullWidth":true}` {
		t.Fatalf("props = %s", got)
	}
	if out, _ := call(write, "get_page", map[string]any{"page_id": "doc1"}); !strings.HasSuffix(out, "\nPage settings: full_width=true") {
		t.Fatalf("get_page does not report it: %q", out)
	}
	var n int
	f.s.db.QueryRow(`SELECT COUNT(*) FROM audit_log WHERE page_id = 'doc1' AND action = 'set_properties' AND actor_type = 'agent'`).Scan(&n)
	if n != 1 {
		t.Fatalf("audit entries = %d, want 1", n)
	}

	// Together with another field, and the other field still lands.
	if _, err := call(write, "update_page", map[string]any{"page_id": "doc1", "title": "Wide", "full_width": true}); err != nil {
		t.Fatal(err)
	}
	if got := f.s.pageTitle("doc1"); got != "Wide" {
		t.Fatalf("title = %q", got)
	}

	if _, err := call(write, "update_page", map[string]any{"page_id": "doc1", "full_width": false}); err != nil {
		t.Fatal(err)
	}
	if got := props("doc1"); got != `{}` {
		t.Fatalf("switching off left %s", got)
	}
	if out, _ := call(write, "get_page", map[string]any{"page_id": "doc1"}); strings.Contains(out, "Page settings") {
		t.Fatalf("still reported after off: %q", out)
	}

	// A read-only token is refused, and nothing changes.
	if _, err := call(read, "update_page", map[string]any{"page_id": "doc1", "full_width": true}); err == nil || !strings.Contains(err.Error(), "read-only") {
		t.Fatalf("read token: %v", err)
	}
	// A token narrowed to another workspace stays out.
	narrowed := &user{ID: f.owner, Name: "Agent", TokenScope: "write", TokenKind: tokenKindAPI, TokenWorkspaces: []string{f.other}}
	if _, err := call(narrowed, "update_page", map[string]any{"page_id": "doc1", "full_width": true}); err == nil {
		t.Fatal("a token narrowed to another workspace changed the page")
	}
	// A viewer is refused, as in the app.
	viewer, _ := signedIn(t, f.s, "viewer-fw@example.test")
	f.s.addMember(t, f.team, viewer, "viewer")
	if _, err := call(&user{ID: viewer, Name: "V", TokenScope: "write", TokenKind: tokenKindAPI}, "update_page", map[string]any{"page_id": "doc1", "full_width": true}); err == nil {
		t.Fatal("a viewer changed the page")
	}
	if got := props("doc1"); got != `{}` {
		t.Fatalf("a refused call changed props: %s", got)
	}

	// Documents only.
	f.s.db.Exec(`INSERT INTO pages (id, title, content, position, created_at, updated_at, workspace_id, owner_id, visibility, type) VALUES ('db1','DB','[]',1,?,?,?,?,'workspace','collection')`, now(), now(), f.team, f.owner)
	if _, err := call(write, "update_page", map[string]any{"page_id": "db1", "full_width": true}); err == nil || !strings.Contains(err.Error(), "documents only") {
		t.Fatalf("collection: %v", err)
	}
}
