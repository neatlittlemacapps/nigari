package server

import "testing"

// A read-only token may aggregate a database over REST, as it may over MCP
// query_rows, and is still refused every route that writes, the same
// collection's PUT included (#473). The aggregate route uses POST only to
// carry its body; the read-only check in auth refused every POST.
func TestAReadOnlyTokenMayAggregateButNotWrite(t *testing.T) {
	f := newScopeFixture(t)
	const readTok = "token-that-only-reads"
	if _, err := f.s.db.Exec(`INSERT INTO api_tokens (id, user_id, name, token_hash, scope, workspace_scope, created_at)
		VALUES (?, ?, 'reader', ?, 'read', '', ?)`, newID(), f.owner, tokenHash(readTok), now()); err != nil {
		t.Fatalf("insert token: %v", err)
	}
	col := f.s.makeCollection(t, f.team, f.owner, "Tasks", `[{"id":"st","name":"Status","type":"select","options":[{"id":"a","name":"A"}]}]`)
	f.s.makeRow(t, f.team, f.owner, col, "r", `{"st":"a"}`)

	if rec := f.bearer(readTok, "POST", "/api/collections/"+col+"/aggregate", `{"groupBy":"st","aggregate":"count"}`); rec.Code != 200 {
		t.Errorf("aggregate with a read-only token: %d %s, want 200", rec.Code, rec.Body.String())
	}
	for _, c := range []struct{ method, path, body string }{
		{"PUT", "/api/collections/" + col, `{"views":[]}`},
		{"POST", "/api/pages", `{"title":"x","workspaceId":"` + f.team + `"}`},
		{"POST", "/api/collections/" + col + "/templates", `{"title":"x"}`},
	} {
		if rec := f.bearer(readTok, c.method, c.path, c.body); rec.Code != 403 {
			t.Errorf("%s %s with a read-only token: %d, want 403", c.method, c.path, rec.Code)
		}
	}
	// A write token still aggregates, so the route is not open to readers only.
	if rec := f.bearer(f.openTok, "POST", "/api/collections/"+col+"/aggregate", `{"groupBy":"st","aggregate":"count"}`); rec.Code != 200 {
		t.Errorf("aggregate with a write token: %d", rec.Code)
	}
}
