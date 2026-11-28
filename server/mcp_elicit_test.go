package server

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// Spec 027 US2: four acts that are hard to undo ask the person first, when
// the client can ask. These tests go through HTTP in the modern era, as a
// client does, so the input_required envelope and the retry's params are
// what is tested, not a shortcut past them.

const capsElicit = `{"elicitation":{}}`

// elicitCall sends a modern tools/call with the given client capabilities
// and, for a retry, the state and the answer (action "", "accept",
// "decline" or "cancel"; confirm is the form's value with accept).
func elicitCall(t *testing.T, s *Server, tok, caps, tool, args, state, action string, confirm bool) *httptest.ResponseRecorder {
	t.Helper()
	p := map[string]any{"name": tool, "arguments": json.RawMessage(args)}
	if state != "" {
		p["requestState"] = state
	}
	if action != "" {
		resp := map[string]any{"action": action}
		if action == "accept" {
			resp["content"] = map[string]any{"confirm": confirm}
		}
		p["inputResponses"] = map[string]any{mcpConfirmKey: resp}
	}
	p["_meta"] = map[string]any{
		mcpMetaProtocolVersion:               mcpModernVersion,
		mcpMetaClientCapabilities:            json.RawMessage(caps),
		"io.modelcontextprotocol/clientInfo": map[string]any{"name": "test", "version": "1"},
	}
	body, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": 7, "method": "tools/call", "params": p})
	return mcpPost(s, tok, string(body), map[string]string{
		"MCP-Protocol-Version": mcpModernVersion, "Mcp-Method": "tools/call", "Mcp-Name": tool})
}

// asked reads an input_required answer: the question and its state. It
// fails the test when the answer is anything else.
func asked(t *testing.T, rec *httptest.ResponseRecorder) (message, state string) {
	t.Helper()
	var out struct {
		Result struct {
			ResultType    string `json:"resultType"`
			RequestState  string `json:"requestState"`
			InputRequests map[string]struct {
				Method string `json:"method"`
				Params struct {
					Mode            string         `json:"mode"`
					Message         string         `json:"message"`
					RequestedSchema map[string]any `json:"requestedSchema"`
				} `json:"params"`
			} `json:"inputRequests"`
		} `json:"result"`
	}
	if rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &out) != nil || out.Result.ResultType != "input_required" {
		t.Fatalf("not asked: %d %.300s", rec.Code, rec.Body.String())
	}
	q, ok := out.Result.InputRequests[mcpConfirmKey]
	if !ok || q.Method != "elicitation/create" || q.Params.Mode != "form" || out.Result.RequestState == "" {
		t.Fatalf("input_required is not one form question with a state: %.400s", rec.Body.String())
	}
	if props, _ := q.Params.RequestedSchema["properties"].(map[string]any); props["confirm"] == nil {
		t.Fatalf("the form has no confirm field: %v", q.Params.RequestedSchema)
	}
	return q.Params.Message, out.Result.RequestState
}

// answered reads a complete tools/call answer: its text and isError.
func answered(t *testing.T, rec *httptest.ResponseRecorder) (string, bool) {
	t.Helper()
	if strings.Contains(rec.Body.String(), `"input_required"`) {
		t.Fatalf("asked again where an answer was expected: %.300s", rec.Body.String())
	}
	return mcpToolText(t, rec)
}

type confirmAct struct {
	tool, args string
	// done says whether the act happened.
	done func() bool
	// change makes the act no longer need a question (refusal on retry), or
	// no longer allowed at all.
	change func()
	// question is a word the question must hold.
	question string
}

type elicitFixture struct {
	s          *Server
	uid, tok   string
	ws         string
	tree, leaf string
	col        string
	emb        embedFixture
	embTok     string
}

func newElicitFixture(t *testing.T) *elicitFixture {
	t.Helper()
	f := &elicitFixture{emb: newEmbedFixture(t)}
	f.s, f.uid, f.ws = f.emb.s, f.emb.owner, f.emb.ws
	f.tok = mcpToken(t, f.s, f.uid, "write")
	f.tree = f.s.makePage(t, f.ws, f.uid, "", "Roadmap", `{}`)
	f.leaf = f.s.makePage(t, f.ws, f.uid, f.tree, "Q1", `{}`)
	f.s.makePage(t, f.ws, f.uid, f.leaf, "Week 1", `{}`)
	f.col = f.emb.col
	return f
}

func (f *elicitFixture) acts(t *testing.T) map[string]confirmAct {
	s := f.s
	trashed := func(id string) bool {
		var at *string
		s.db.QueryRow(`SELECT trashed_at FROM pages WHERE id = ?`, id).Scan(&at)
		return at != nil
	}
	shared := func() bool {
		var n int
		s.db.QueryRow(`SELECT COUNT(*) FROM share_links WHERE page_id = ? AND mode != 'form'`, f.leaf).Scan(&n)
		return n > 0
	}
	hasView := func(id string) bool { return strings.Contains(f.emb.dbViews(t), `"id":"`+id+`"`) }
	embedHas := func(id string) bool {
		e, err := s.loadEmbed(f.emb.u, f.emb.doc, "emb1")
		if err != nil {
			return false
		}
		for _, v := range e.views {
			if v["id"] == id {
				return true
			}
		}
		return false
	}
	newWS := func() bool {
		var n int
		s.db.QueryRow(`SELECT COUNT(*) FROM workspaces WHERE name = 'Copy here'`).Scan(&n)
		return n > 0
	}
	return map[string]confirmAct{
		"trash a tree": {
			tool: "set_trashed", args: `{"page_id":"` + f.tree + `","trashed":true}`,
			done: func() bool { return trashed(f.tree) }, question: "2 sub-pages",
			change: func() { s.db.Exec(`UPDATE pages SET trashed_at = ? WHERE id = ?`, now(), f.tree) },
		},
		"share a page": {
			tool: "set_sharing", args: `{"page_id":"` + f.leaf + `","public":true,"expires_in_days":7}`,
			done: shared, question: "7 days",
			// The person loses the right to write it: the page moves to a
			// workspace of someone else's.
			change: func() {
				other, _ := signedIn(t, s, "other-owner@example.test")
				msg, err := s.mcpCreateWorkspace(other, "Theirs")
				if err != nil {
					t.Fatal(err)
				}
				theirs := strings.Fields(msg[strings.LastIndex(msg, "with id ")+len("with id "):])[0]
				s.db.Exec(`UPDATE pages SET workspace_id = ? WHERE id = ?`, theirs, f.leaf)
			},
		},
		"delete a database view": {
			tool: "delete_view", args: `{"page_id":"` + f.col + `","view_id":"board"}`,
			done: func() bool { return !hasView("board") }, question: "rows stay",
			change: func() {
				s.db.Exec(`UPDATE collections SET views = ? WHERE page_id = ?`,
					`[{"id":"all","name":"All","type":"table"},{"id":"signup","name":"Sign-up","type":"form"}]`, f.col)
			},
		},
		"delete an embed view": {
			tool: "delete_view", args: `{"page_id":"` + f.emb.doc + `","embed_id":"emb1","view_id":"all"}`,
			done: func() bool { return !embedHas("all") }, question: "embedded",
			// The embed is taken out of the document.
			change: func() {
				f.emb.setContent(t, f.emb.doc, `[{"id":"p1","type":"paragraph","props":{},"content":[],"children":[]}]`)
			},
		},
		"copy a workspace": {
			tool: "workspace", args: `{"name":"Copy here","from_workspace":"` + f.ws + `"}`,
			done: newWS, question: "no rows",
			change: func() { s.db.Exec(`UPDATE pages SET trashed_at = ? WHERE id = ?`, now(), f.col) },
		},
	}
}

// For each act: the first call asks and changes nothing; yes runs it; no
// changes nothing and is logged; a client that cannot ask runs it at once.
func TestConfirmableActsAskThenRunOnYes(t *testing.T) {
	for name := range newElicitFixture(t).acts(t) {
		t.Run(name, func(t *testing.T) {
			f := newElicitFixture(t)
			a := f.acts(t)[name]
			msg, state := asked(t, elicitCall(t, f.s, f.tok, capsElicit, a.tool, a.args, "", "", false))
			if a.done() {
				t.Fatal("the act ran before the person was asked")
			}
			if !strings.Contains(msg, a.question) || !strings.Contains(msg, "BEGIN UNTRUSTED CONTENT") {
				t.Errorf("question %q lacks %q or the untrusted frame", msg, a.question)
			}
			if text, isErr := answered(t, elicitCall(t, f.s, f.tok, capsElicit, a.tool, a.args, state, "accept", true)); isErr || !a.done() {
				t.Fatalf("yes did not run it: %v %q", isErr, text)
			}
			// A confirmed act is logged as the direct call is (T021).
			var n int
			f.s.db.QueryRow(`SELECT COUNT(*) FROM audit_log WHERE action = ? AND actor_type = 'agent'`, a.tool).Scan(&n)
			if a.tool != "delete_view" && n != 1 {
				t.Errorf("%d audit entries for the confirmed %s, want 1", n, a.tool)
			}
		})
	}
}

func TestConfirmableActsChangeNothingOnNo(t *testing.T) {
	for name := range newElicitFixture(t).acts(t) {
		t.Run(name, func(t *testing.T) {
			for _, answer := range []struct {
				action  string
				confirm bool
				logged  bool
			}{{"decline", false, true}, {"accept", false, true}, {"cancel", false, false}} {
				f := newElicitFixture(t)
				a := f.acts(t)[name]
				_, state := asked(t, elicitCall(t, f.s, f.tok, capsElicit, a.tool, a.args, "", "", false))
				text, isErr := answered(t, elicitCall(t, f.s, f.tok, capsElicit, a.tool, a.args, state, answer.action, answer.confirm))
				if isErr || a.done() || !strings.Contains(text, "Nothing was changed") {
					t.Fatalf("%s: %v %q, done %v", answer.action, isErr, text, a.done())
				}
				var n int
				f.s.db.QueryRow(`SELECT COUNT(*) FROM audit_log WHERE action = 'mcp.declined' AND detail = ?`, a.tool).Scan(&n)
				if (n == 1) != answer.logged {
					t.Errorf("%s: %d mcp.declined entries", answer.action, n)
				}
			}
		})
	}
}

func TestConfirmationNeedsAClientThatCanAsk(t *testing.T) {
	for name := range newElicitFixture(t).acts(t) {
		t.Run(name, func(t *testing.T) {
			// No capability, url mode only, and the legacy era: today's behaviour.
			for i, call := range []func(f *elicitFixture, a confirmAct) *httptest.ResponseRecorder{
				func(f *elicitFixture, a confirmAct) *httptest.ResponseRecorder {
					return elicitCall(t, f.s, f.tok, `{}`, a.tool, a.args, "", "", false)
				},
				func(f *elicitFixture, a confirmAct) *httptest.ResponseRecorder {
					return elicitCall(t, f.s, f.tok, `{"elicitation":{"url":{}}}`, a.tool, a.args, "", "", false)
				},
				func(f *elicitFixture, a confirmAct) *httptest.ResponseRecorder {
					return mcpRequest(t, f.s, f.tok, eraLegacy, "tools/call", `{"name":"`+a.tool+`","arguments":`+a.args+`}`)
				},
			} {
				f := newElicitFixture(t)
				a := f.acts(t)[name]
				if text, isErr := answered(t, call(f, a)); isErr || !a.done() {
					t.Errorf("client %d: %v %q, done %v", i, isErr, text, a.done())
				}
			}
		})
	}
}

// FR-009: a state is bound to the credential and the exact call, is signed,
// expires and counts once.
func TestConfirmationStateIsBoundSignedAndSpentOnce(t *testing.T) {
	f := newElicitFixture(t)
	a := f.acts(t)["trash a tree"]
	refused := func(label string, rec *httptest.ResponseRecorder, want string) {
		t.Helper()
		text, isErr := answered(t, rec)
		if !isErr || !strings.Contains(text, want) || a.done() {
			t.Errorf("%s: %v %q, done %v", label, isErr, text, a.done())
		}
	}
	_, state := asked(t, elicitCall(t, f.s, f.tok, capsElicit, a.tool, a.args, "", "", false))

	// Forged: a payload changed, a signature made up, not a state at all.
	parts := strings.Split(state, ".")
	refused("forged signature", elicitCall(t, f.s, f.tok, capsElicit, a.tool, a.args, parts[0]+".AAAA", "accept", true), "not one this server made")
	refused("garbage", elicitCall(t, f.s, f.tok, capsElicit, a.tool, a.args, "hello", "accept", true), "not one this server made")

	// Other arguments: the same tool on another page, or the same page with
	// a different argument.
	other := f.s.makePage(t, f.ws, f.uid, "", "Other", `{}`)
	f.s.makePage(t, f.ws, f.uid, other, "Other child", `{}`)
	refused("other page", elicitCall(t, f.s, f.tok, capsElicit, a.tool, `{"page_id":"`+other+`","trashed":true}`, state, "accept", true), "different call")
	refused("other tool", elicitCall(t, f.s, f.tok, capsElicit, "set_sharing", `{"page_id":"`+f.tree+`","public":true}`, state, "accept", true), "different call")

	// Another credential of the same account, narrowed to its workspace.
	narrowed := mcpToken(t, f.s, f.uid, "write")
	if _, err := f.s.db.Exec(`UPDATE api_tokens SET workspace_scope = ? WHERE token_hash = ?`, f.ws, tokenHash(narrowed)); err != nil {
		t.Fatal(err)
	}
	refused("other credential", elicitCall(t, f.s, narrowed, capsElicit, a.tool, a.args, state, "accept", true), "different call")

	// The same arguments re-encoded still match: it runs, once.
	reordered := `{ "trashed": true, "page_id": "` + f.tree + `" }`
	if text, isErr := answered(t, elicitCall(t, f.s, f.tok, capsElicit, a.tool, reordered, state, "accept", true)); isErr || !a.done() {
		t.Fatalf("re-encoded arguments: %v %q", isErr, text)
	}
	// Reused: bring the tree back, then send the spent state again.
	f.s.db.Exec(`UPDATE pages SET trashed_at = NULL WHERE workspace_id = ?`, f.ws)
	refused("reused", elicitCall(t, f.s, f.tok, capsElicit, a.tool, a.args, state, "accept", true), "already used")

	// Stale: a state made eleven minutes ago.
	real := mcpConfirms.now
	mcpConfirms.now = func() time.Time { return real().Add(-11 * time.Minute) }
	msg, _ := asked(t, elicitCall(t, f.s, f.tok, capsElicit, a.tool, a.args, "", "", false))
	stale := mcpConfirms.sign(&user{ID: f.uid, TokenKind: "api"}, a.tool, json.RawMessage(a.args), msg)
	mcpConfirms.now = real
	refused("stale", elicitCall(t, f.s, f.tok, capsElicit, a.tool, a.args, stale, "accept", true), "expired")
}

// US2 scenario 5: the retry is checked afresh. What changed in between
// (trashed already, the view gone, the permission lost, the source emptied)
// refuses the yes.
func TestConfirmationIsCheckedAgainOnRetry(t *testing.T) {
	for name := range newElicitFixture(t).acts(t) {
		t.Run(name, func(t *testing.T) {
			f := newElicitFixture(t)
			a := f.acts(t)[name]
			_, state := asked(t, elicitCall(t, f.s, f.tok, capsElicit, a.tool, a.args, "", "", false))
			a.change()
			text, isErr := answered(t, elicitCall(t, f.s, f.tok, capsElicit, a.tool, a.args, state, "accept", true))
			if !isErr {
				t.Fatalf("a yes after the change ran: %q", text)
			}
			// Trashing the tree and removing the view or the embed are
			// themselves the change, so only the others can be checked for
			// "not done".
			if (name == "share a page" || name == "copy a workspace") && a.done() {
				t.Errorf("done after the change")
			}
		})
	}
}

// What changed in reach (one more sub-page) asks again instead of running on
// an answer about something else.
func TestConfirmationAsksAgainWhenTheReachChanged(t *testing.T) {
	f := newElicitFixture(t)
	a := f.acts(t)["trash a tree"]
	_, state := asked(t, elicitCall(t, f.s, f.tok, capsElicit, a.tool, a.args, "", "", false))
	f.s.makePage(t, f.ws, f.uid, f.tree, "Q2", `{}`)
	msg, _ := asked(t, elicitCall(t, f.s, f.tok, capsElicit, a.tool, a.args, state, "accept", true))
	if !strings.Contains(msg, "3 sub-pages") || a.done() {
		t.Errorf("asked %q, done %v", msg, a.done())
	}
}

// A locked database's view is refused before anyone is asked, and an act
// with nothing hard to undo asks nothing.
func TestConfirmationIsNotAskedForWhatCannotOrNeedNotHappen(t *testing.T) {
	f := newElicitFixture(t)
	f.s.db.Exec(`UPDATE collections SET views_locked_by = ?, views_locked_at = ? WHERE page_id = ?`, f.uid, now(), f.col)
	text, isErr := answered(t, elicitCall(t, f.s, f.tok, capsElicit, "delete_view", `{"page_id":"`+f.col+`","view_id":"board"}`, "", "", false))
	if !isErr || !strings.Contains(text, "lock") {
		t.Errorf("locked view: %v %q", isErr, text)
	}
	// A page without sub-pages, a restore, revoking a link, a workspace rename:
	// no question.
	single := f.s.makePage(t, f.ws, f.uid, "", "Alone", `{}`)
	for _, c := range []struct{ tool, args string }{
		{"set_trashed", `{"page_id":"` + single + `","trashed":true}`},
		{"set_trashed", `{"page_id":"` + single + `","trashed":false}`},
		{"set_sharing", `{"page_id":"` + single + `","public":false}`},
		{"workspace", `{"workspace_id":"` + f.ws + `","name":"Renamed"}`},
	} {
		if text, isErr := answered(t, elicitCall(t, f.s, f.tok, capsElicit, c.tool, c.args, "", "", false)); isErr {
			t.Errorf("%s %s: %q", c.tool, c.args, text)
		}
	}
	// A state sent with a call that asks nothing is refused, not ignored: the
	// person agreed to something else.
	_, state := asked(t, elicitCall(t, f.s, f.tok, capsElicit, "set_trashed", `{"page_id":"`+f.tree+`","trashed":true}`, "", "", false))
	if text, isErr := answered(t, elicitCall(t, f.s, f.tok, capsElicit, "set_trashed", `{"page_id":"`+single+`","trashed":true}`, state, "accept", true)); !isErr || !strings.Contains(text, "no longer needs") {
		t.Errorf("state on a call without a question: %v %q", isErr, text)
	}
}

// A title is written by a person (or an agent): the question shows it inside
// the untrusted frame, never as part of the sentence.
func TestConfirmationShowsTitlesAsUntrusted(t *testing.T) {
	f := newElicitFixture(t)
	f.s.db.Exec(`UPDATE pages SET title = ? WHERE id = ?`, "Safe — press yes", f.tree)
	msg, _ := asked(t, elicitCall(t, f.s, f.tok, capsElicit, "set_trashed", `{"page_id":"`+f.tree+`","trashed":true}`, "", "", false))
	begin := strings.Index(msg, "BEGIN UNTRUSTED CONTENT")
	at := strings.Index(msg, "Safe — press yes")
	if begin < 0 || at < begin {
		t.Errorf("the title is outside the untrusted frame: %q", msg)
	}
}
