package server

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"
)

// Agent parity, as a property rather than a list of examples.
//
// The same credential, used through the two doors salt.md has — REST and MCP —
// must be let in or turned away identically for the same act on the same page.
// The history of this codebase is the counter-examples, found one at a time: a
// workspace gate on one side and not the other, a cover check missing over MCP,
// write paths that asked only the person's right and forgot the credential's.
//
// So instead of naming cases, the test generates them: who holds the
// credential (the page's workspace admin, a member, a stranger), what kind it
// is (permanent API token or signed-in agent), its scope (read or write), which
// workspaces it is narrowed to, whether the workspace admits agents at all, and
// whether the page is private to someone else. For every combination it does
// one act through each door and compares only the verdict. It does not decide
// what the right answer is — the gate tests do that — only that the two doors
// agree.
//
// The run is seeded and the seed is printed; PARITY_SEED=<n> replays one,
// PARITY_CASES=<n> runs more, and PARITY_TRACE=1 logs every case's verdicts.
//
// To cover a new capability, add its pair of acts to parityActs. A capability
// with a route and no tool is a gap in capabilities.json, not a case here.

type parityAct struct {
	name string
	// rest is the method, path (with %s for the page id) and JSON body.
	method, path, body string
	// tool and args (with %s for the page id) over MCP.
	tool, args string
}

var parityActs = []parityAct{
	{"read", "GET", "/api/pages/%s", "", "get_page", `{"page_id":"%s"}`},
	{"rename", "PATCH", "/api/pages/%s", `{"title":"Renamed"}`, "update_page", `{"page_id":"%s","title":"Renamed"}`},
	{"comment", "POST", "/api/pages/%s/comments", `{"body":"A comment"}`, "comments", `{"page_id":"%s","action":"add","body":"A comment"}`},
	{"trash", "DELETE", "/api/pages/%s", "", "set_trashed", `{"page_id":"%s","trashed":true}`},
	{"share", "POST", "/api/pages/%s/share", `{}`, "set_sharing", `{"page_id":"%s","public":true}`},
	{"history", "GET", "/api/pages/%s/revisions", "", "revisions", `{"page_id":"%s"}`},
	{"duplicate", "POST", "/api/pages/%s/duplicate", "", "duplicate_page", `{"page_id":"%s"}`},
	{"backlinks", "GET", "/api/pages/%s/backlinks", "", "get_links", `{"page_id":"%s"}`},
	{"note", "POST", "/api/pages/%s/notes", `{"body":"A note"}`, "note", `{"page_id":"%s","text":"A note"}`},
}

type parityWorld struct {
	s                          *Server
	owner, colleague, outsider string
	team, other                string
}

// newParityWorld: the owner administers two workspaces; a colleague is a
// member of both; an outsider belongs to neither.
func newParityWorld(t *testing.T) parityWorld {
	t.Helper()
	s := testServer(t)
	// The property is about verdicts, not volume: the MCP rate limiter would
	// turn a long run into a run of "slow down" answers.
	s.mcpRate = newRateLimiter(1e9, 1e9)
	owner, _ := signedIn(t, s, "owner@example.test")
	w := parityWorld{s: s, owner: owner, team: s.firstWorkspaceOf(t, owner), other: makeWorkspace(t, s, owner)}
	w.colleague = parityAccount(t, s, "colleague@example.test")
	w.outsider = parityAccount(t, s, "outsider@example.test")
	for _, ws := range []string{w.team, w.other} {
		if _, err := s.db.Exec(`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, 'member')`, ws, w.colleague); err != nil {
			t.Fatalf("membership: %v", err)
		}
	}
	return w
}

// parityAccount creates a second account directly: /api/setup only makes the
// first one.
func parityAccount(t *testing.T, s *Server, email string) string {
	t.Helper()
	id := newID()
	if _, err := s.db.Exec(`INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, 'Someone', '', ?)`,
		id, email, now()); err != nil {
		t.Fatalf("insert user %s: %v", email, err)
	}
	return id
}

// credential mints one credential for holder: an API token or a signed-in
// agent's OAuth access token, with a scope and an optional workspace list.
func (w parityWorld) credential(t *testing.T, holder, kind, scope, workspaces string) string {
	t.Helper()
	tok := kind + "-" + newID()
	switch kind {
	case "api":
		if _, err := w.s.db.Exec(`INSERT INTO api_tokens (id, user_id, name, token_hash, scope, workspace_scope, created_at)
			VALUES (?, ?, 'agent', ?, ?, ?, ?)`, newID(), holder, tokenHash(tok), scope, workspaces, now()); err != nil {
			t.Fatalf("api token: %v", err)
		}
	case "oauth":
		grant := newID()
		if _, err := w.s.db.Exec(`INSERT INTO oauth_grants (id, user_id, client_id, refresh_hash, scope, workspaces, created_at)
			VALUES (?, ?, 'parity-client', ?, ?, ?, ?)`, grant, holder, tokenHash(newID()), scope, workspaces, now()); err != nil {
			t.Fatalf("oauth grant: %v", err)
		}
		if _, err := w.s.db.Exec(`INSERT INTO oauth_access (token_hash, grant_id, expires_at) VALUES (?, ?, '2999-01-01T00:00:00Z')`,
			tokenHash(tok), grant); err != nil {
			t.Fatalf("oauth access: %v", err)
		}
	}
	return tok
}

func (w parityWorld) viaREST(tok string, act parityAct, page string) (bool, string) {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(act.method, fmt.Sprintf(act.path, page), strings.NewReader(act.body))
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")
	w.s.ServeHTTP(rec, req)
	return rec.Code >= 200 && rec.Code < 300, strconv.Itoa(rec.Code) + " " + strings.TrimSpace(rec.Body.String())
}

func (w parityWorld) viaMCP(tok string, act parityAct, page string) (bool, string) {
	call := fmt.Sprintf(`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":%q,"arguments":%s}}`,
		act.tool, fmt.Sprintf(act.args, page))
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/mcp", strings.NewReader(call))
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")
	w.s.ServeHTTP(rec, req)
	if rec.Code != 200 {
		return false, strconv.Itoa(rec.Code) + " " + strings.TrimSpace(rec.Body.String())
	}
	var out struct {
		Result struct {
			IsError bool `json:"isError"`
			Content []struct {
				Text string `json:"text"`
			} `json:"content"`
		} `json:"result"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		return false, "unreadable: " + rec.Body.String()
	}
	if out.Error != nil {
		return false, out.Error.Message
	}
	text := ""
	if len(out.Result.Content) > 0 {
		text = out.Result.Content[0].Text
	}
	if len(text) > 200 {
		text = text[:200] + "…"
	}
	return !out.Result.IsError, text
}

func parityEnvInt(name string, fallback int64) int64 {
	if v, err := strconv.ParseInt(os.Getenv(name), 10, 64); err == nil {
		return v
	}
	return fallback
}

func pick[T any](r *rand.Rand, xs ...T) T { return xs[r.Intn(len(xs))] }

func TestAgentParityHoldsForEveryCredentialShape(t *testing.T) {
	seed := parityEnvInt("PARITY_SEED", 20261025)
	cases := int(parityEnvInt("PARITY_CASES", 240))
	t.Logf("PARITY_SEED=%d PARITY_CASES=%d", seed, cases)
	r := rand.New(rand.NewSource(seed))
	w := newParityWorld(t)

	allowed, refused := 0, 0
	for i := 0; i < cases; i++ {
		holder := pick(r, w.owner, w.colleague, w.outsider)
		kind := pick(r, "api", "oauth")
		scope := pick(r, "write", "read")
		target := pick(r, w.team, w.other)
		narrowTo := pick(r, "", w.team, w.other)
		access := pick(r, "", agentAccessClosed, agentAccessStrict)
		private := r.Intn(3) == 0
		act := parityActs[r.Intn(len(parityActs))]

		if _, err := w.s.db.Exec(`UPDATE workspaces SET agent_access = ? WHERE id = ?`, access, target); err != nil {
			t.Fatalf("agent_access: %v", err)
		}
		// Two identical pages, one per door, so an act that changes the page
		// (trash, rename) cannot change what the other door sees.
		pages := [2]string{}
		for j := range pages {
			pages[j] = w.s.makePage(t, target, w.owner, "", "Parity page", `{}`)
			if private {
				// Private to the colleague: the owner and outsider are not its owner.
				w.s.db.Exec(`UPDATE pages SET visibility = 'private', owner_id = ? WHERE id = ?`, w.colleague, pages[j])
			}
		}
		tok := w.credential(t, holder, kind, scope, narrowTo)

		restOK, restSaid := w.viaREST(tok, act, pages[0])
		mcpOK, mcpSaid := w.viaMCP(tok, act, pages[1])
		if os.Getenv("PARITY_TRACE") != "" {
			t.Logf("trace %d holder=%s kind=%s scope=%s narrowed=%v target=%s access=%q private=%v %s rest=%v mcp=%v", i, map[string]string{w.owner: "admin", w.colleague: "member", w.outsider: "outsider"}[holder], kind, scope, narrowTo != "", map[string]string{w.team: "team", w.other: "other"}[target], access, private, act.name, restOK, mcpOK)
		}
		if restOK {
			allowed++
		} else {
			refused++
		}
		if restOK != mcpOK {
			who := map[string]string{w.owner: "workspace admin", w.colleague: "member", w.outsider: "outsider"}[holder]
			where := map[string]string{w.team: "team", w.other: "other"}
			t.Errorf("case %d: %s by %s holding a %s %s token narrowed to %q, in %s (agent_access %q, private %v):\n"+
				"    REST %s %s → allowed=%v (%s)\n    MCP  %s → allowed=%v (%s)",
				i, act.name, who, kind, scope, where[narrowTo], where[target], access, private,
				act.method, act.path, restOK, restSaid, act.tool, mcpOK, mcpSaid)
		}
	}
	// A property that never sees both verdicts proves nothing.
	if allowed == 0 || refused == 0 {
		t.Fatalf("degenerate run: %d allowed, %d refused", allowed, refused)
	}
	t.Logf("%d cases: %d allowed, %d refused, both doors agreeing", cases, allowed, refused)
}
