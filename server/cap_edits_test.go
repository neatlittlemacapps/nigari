package server

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

// Find-and-replace edits (cap_edits.go, specs/003-find-replace-edits).

// para is a paragraph as the editor stores it: an id, the default props, one
// text run.
func para(id, text string) string {
	return fmt.Sprintf(`{"id":%q,"type":"paragraph","props":{"textColor":"default","backgroundColor":"default","textAlignment":"left"},"content":[{"type":"text","text":%q,"styles":{}}],"children":[]}`, id, text)
}

func blocksOf(parts ...string) string { return "[" + strings.Join(parts, ",") + "]" }

type editWorld struct {
	s      *Server
	u      *user
	cookie string
	ws     string
}

func newEditWorld(t *testing.T) editWorld {
	t.Helper()
	s := testServer(t)
	uid, cookie := signedIn(t, s, "edits@example.test")
	return editWorld{s: s, u: &user{ID: uid, Name: "Editor"}, cookie: cookie, ws: s.firstWorkspaceOf(t, uid)}
}

func (w editWorld) page(t *testing.T, content string) string {
	t.Helper()
	id := w.s.makePage(t, w.ws, w.u.ID, "", "Launch plan", `{}`)
	if _, err := w.s.db.Exec(`UPDATE pages SET content = ? WHERE id = ?`, content, id); err != nil {
		t.Fatal(err)
	}
	return id
}

func (w editWorld) content(t *testing.T, id string) string {
	t.Helper()
	var c string
	w.s.db.QueryRow(`SELECT content FROM pages WHERE id = ?`, id).Scan(&c)
	return c
}

func edits(page string, pairs ...string) string {
	var es []string
	for i := 0; i+1 < len(pairs); i += 2 {
		o, _ := json.Marshal(pairs[i])
		n, _ := json.Marshal(pairs[i+1])
		es = append(es, `{"old":`+string(o)+`,"new":`+string(n)+`}`)
	}
	return `{"page_id":"` + page + `","mode":"edit","edits":[` + strings.Join(es, ",") + `]}`
}

func TestAnEditChangesOnlyTheQuotedPassage(t *testing.T) {
	w := newEditWorld(t)
	first, last := para("b1", "Intro stays."), para("b3", "Outro stays.")
	id := w.page(t, blocksOf(first, para("b2", "Launch is on 3 March, in Berlin."), last))

	out, err := callTool(t, w.s, w.u, "write_content", edits(id, "3 March", "10 March"))
	if err != nil {
		t.Fatalf("edit: %v", err)
	}
	if !strings.Contains(out, "1 replacement") {
		t.Errorf("answer does not count the replacement: %s", out)
	}
	if strings.Contains(out, "Berlin") {
		t.Errorf("answer carries page text: %s", out)
	}
	got := w.content(t, id)
	// Untouched blocks byte for byte: not re-encoded, not reordered.
	if !strings.HasPrefix(got, "["+first+",") || !strings.HasSuffix(got, ","+last+"]") {
		t.Errorf("untouched blocks changed:\n%s", got)
	}
	if !strings.Contains(got, "Launch is on 10 March, in Berlin.") {
		t.Errorf("edit missing:\n%s", got)
	}
	// The edited paragraph is still the same block: comments hang on its id.
	if !strings.Contains(got, `"id":"b2"`) {
		t.Errorf("edited block lost its id:\n%s", got)
	}
}

func TestSeveralEditsApplyInOrderAndAllOrNone(t *testing.T) {
	w := newEditWorld(t)
	before := blocksOf(para("a", "alpha"), para("b", "beta"))
	id := w.page(t, before)

	// The second edit quotes the result of the first.
	if _, err := callTool(t, w.s, w.u, "write_content", edits(id, "alpha", "gamma", "gamma", "delta")); err != nil {
		t.Fatalf("chained edits: %v", err)
	}
	if got := w.content(t, id); !strings.Contains(got, `"delta"`) || strings.Contains(got, "alpha") {
		t.Errorf("edits not applied in order:\n%s", got)
	}

	// One bad edit in three: nothing is written.
	now := w.content(t, id)
	if _, err := callTool(t, w.s, w.u, "write_content", edits(id, "delta", "x", "missing", "y", "beta", "z")); err == nil {
		t.Fatal("a request with a failing edit succeeded")
	}
	if w.content(t, id) != now {
		t.Error("a failed request left part of its edits in the page")
	}
}

func TestAnEditKeepsTheStateBeforeInHistory(t *testing.T) {
	w := newEditWorld(t)
	id := w.page(t, blocksOf(para("a", "first version")))
	for _, step := range [][2]string{{"first", "second"}, {"second", "third"}} {
		if _, err := callTool(t, w.s, w.u, "write_content", edits(id, step[0], step[1])); err != nil {
			t.Fatalf("edit %v: %v", step, err)
		}
	}
	// Two edits within the throttle window: both earlier states are kept.
	rows, err := w.s.db.Query(`SELECT content, author_id FROM page_revisions WHERE page_id = ?`, id)
	if err != nil {
		t.Fatal(err)
	}
	var all []string
	for rows.Next() {
		var c, a string
		rows.Scan(&c, &a)
		if a != w.u.ID {
			t.Errorf("revision attributed to %q, want the caller", a)
		}
		all = append(all, c)
	}
	rows.Close()
	joined := strings.Join(all, "\n")
	if !strings.Contains(joined, "first version") || !strings.Contains(joined, "second version") {
		t.Errorf("history lost a state between edits: %d revisions", len(all))
	}
}

func TestAnEditIsFoundBySearchAndMovesTheGeneration(t *testing.T) {
	w := newEditWorld(t)
	id := w.page(t, blocksOf(para("a", "plain words")))
	gen := w.s.docGen(id)
	if _, err := callTool(t, w.s, w.u, "write_content", edits(id, "plain", "zanzibar")); err != nil {
		t.Fatal(err)
	}
	if w.s.docGen(id) != gen+1 {
		t.Error("the edit did not move the document generation: an open editor's autosave could put the old text back")
	}
	out, err := callTool(t, w.s, w.u, "search", `{"query":"zanzibar"}`)
	if err != nil || !strings.Contains(out, id) {
		t.Errorf("search does not find the edited text: %v %.200s", err, out)
	}
}

func TestAnEditThatWouldGuessIsRefused(t *testing.T) {
	w := newEditWorld(t)
	other := w.s.makePage(t, w.ws, w.u.ID, "", "Handbook", `{}`)
	mention := `{"id":"m","type":"paragraph","props":{},"content":[{"type":"text","text":"See ","styles":{}},{"type":"pageLink","props":{"pageId":"` + other + `","label":"Handbook"}}],"children":[]}`
	colored := `{"id":"c","type":"paragraph","props":{"textColor":"red"},"content":[{"type":"text","text":"red words","styles":{}}],"children":[]}`
	columns := `{"id":"cl","type":"columnList","props":{},"children":[{"id":"col","type":"column","props":{},"children":[` + para("in", "inside a column") + `]}]}`
	content := blocksOf(para("a", "twice twice"), mention, colored, columns, para("z", "once"))
	id := w.page(t, content)

	cases := []struct {
		name, args, want string
	}{
		{"zero matches", edits(id, "nowhere", "x"), "matched 0 times"},
		{"two matches", edits(id, "twice", "x"), "matched 2 times"},
		{"removes a page mention", edits(id, "See [Handbook](/p/"+other+")", "See nothing"), "Handbook"},
		{"touches a colour", edits(id, "red words", "x"), "textColor"},
		{"touches a column", edits(id, "inside a column", "x"), "columnList"},
		{"empty quote", `{"page_id":"` + id + `","mode":"edit","edits":[{"old":"","new":"x"}]}`, "empty quote"},
		{"no edits", `{"page_id":"` + id + `","mode":"edit","edits":[]}`, "no edits"},
		{"markdown with edit", `{"page_id":"` + id + `","mode":"edit","markdown":"x","edits":[{"old":"once","new":"x"}]}`, "not markdown"},
	}
	for _, c := range cases {
		_, err := callTool(t, w.s, w.u, "write_content", c.args)
		if err == nil {
			t.Errorf("%s: accepted", c.name)
		} else if !strings.Contains(err.Error(), c.want) {
			t.Errorf("%s: %v, want it to say %q", c.name, err, c.want)
		}
		if w.content(t, id) != content {
			t.Fatalf("%s: a refused edit changed the page", c.name)
		}
	}

	var many []string
	for i := 0; i <= maxEditsPerRequest; i++ {
		many = append(many, "once", "once")
	}
	if _, err := callTool(t, w.s, w.u, "write_content", edits(id, many...)); err == nil || !strings.Contains(err.Error(), "too many") {
		t.Errorf("101 edits: %v", err)
	}

	// all: every occurrence, counted.
	out, err := callTool(t, w.s, w.u, "write_content", `{"page_id":"`+id+`","mode":"edit","edits":[{"old":"twice","new":"thrice","all":true}]}`)
	if err != nil || !strings.Contains(out, "2 replacement") {
		t.Errorf("all: %v %s", err, out)
	}
	// allow_removals: the mention may go when the caller says so.
	if _, err := callTool(t, w.s, w.u, "write_content", `{"page_id":"`+id+`","mode":"edit","allow_removals":true,"edits":[{"old":"See [Handbook](/p/`+other+`)","new":"See nothing"}]}`); err != nil {
		t.Errorf("allow_removals: %v", err)
	}
}

// TestAStaleEditIsRefused guards the quote-against-unread-text race: an editor's
// autosave or another agent's write landing between an edit's read and its
// write. The edit must fail loudly rather than overwrite what it never saw.
func TestAStaleEditIsRefused(t *testing.T) {
	w := newEditWorld(t)
	id := w.page(t, blocksOf(para("a", "text"), para("b", "more")))
	for name, race := range map[string]string{
		"editor autosave": `UPDATE pages SET content = ?, updated_at = '2099-01-01T00:00:00Z' WHERE id = ?`,
		"outside write":   `UPDATE pages SET content = ?, doc_gen = doc_gen + 1 WHERE id = ?`,
	} {
		theirs := blocksOf(para("a", "text"), para("b", "written by "+name))
		editBeforeWrite = func(page string) { w.s.db.Exec(race, theirs, page) }
		_, err := callTool(t, w.s, w.u, "write_content", edits(id, "text", "changed"))
		editBeforeWrite = nil
		if err == nil || !strings.Contains(err.Error(), "changed while") {
			t.Errorf("%s: %v, want a stale refusal", name, err)
		}
		if w.content(t, id) != theirs {
			t.Errorf("%s: the stale edit overwrote the other write", name)
		}
	}
}

func TestEditsOverRESTMatchMCP(t *testing.T) {
	w := newEditWorld(t)
	id := w.page(t, blocksOf(para("a", "same same"), para("b", "unique")))

	rec := requestAs(t, w.s, w.cookie, "POST", "/api/pages/"+id+"/edits", `{"edits":[{"old":"same","new":"x"}]}`)
	if rec.Code != 422 || !strings.Contains(rec.Body.String(), `"edit_ambiguous"`) || !strings.Contains(rec.Body.String(), `"matches":2`) {
		t.Errorf("ambiguous over REST: %d %s", rec.Code, rec.Body.String())
	}
	rec = requestAs(t, w.s, w.cookie, "POST", "/api/pages/"+id+"/edits", `{"edits":[{"old":"unique","new":"changed"}]}`)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"applied":[1]`) {
		t.Fatalf("edit over REST: %d %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(w.content(t, id), "changed") {
		t.Error("REST edit not written")
	}
	var n int
	w.s.db.QueryRow(`SELECT COUNT(*) FROM audit_log WHERE action = 'edit_content' AND page_id = ?`, id).Scan(&n)
	if n != 1 {
		t.Errorf("REST edit audited %d times, want 1", n)
	}
}

func TestEditsKeepToTheWriteGates(t *testing.T) {
	f := newScopeFixture(t)
	body := blocksOf(para("a", "secret plan"))
	page := f.s.makePage(t, f.team, f.owner, "", "Plan", `{}`)
	f.s.db.Exec(`UPDATE pages SET content = ? WHERE id = ?`, body, page)
	req := `{"edits":[{"old":"secret","new":"public"}]}`
	still := func(what string) {
		t.Helper()
		var c string
		f.s.db.QueryRow(`SELECT content FROM pages WHERE id = ?`, page).Scan(&c)
		if c != body {
			t.Fatalf("%s: the page was changed", what)
		}
	}

	// A read-scoped token, over both doors.
	readTok := "token-read-only"
	f.s.db.Exec(`INSERT INTO api_tokens (id, user_id, name, token_hash, scope, workspace_scope, created_at)
		VALUES (?, ?, 'reader', ?, 'read', '', ?)`, newID(), f.owner, tokenHash(readTok), now())
	if rec := f.bearer(readTok, "POST", "/api/pages/"+page+"/edits", req); rec.Code == 200 {
		t.Error("a read-scoped token edited over REST")
	}
	reader := &user{ID: f.owner, TokenKind: tokenKindAPI, TokenScope: "read"}
	if _, err := callTool(t, f.s, reader, "write_content", edits(page, "secret", "public")); err == nil {
		t.Error("a read-scoped token edited over MCP")
	}
	still("read scope")

	// A token narrowed to another workspace.
	f.s.db.Exec(`UPDATE api_tokens SET workspace_scope = ? WHERE token_hash = ?`, f.other, tokenHash(f.teamTok))
	if rec := f.bearer(f.teamTok, "POST", "/api/pages/"+page+"/edits", req); rec.Code == 200 {
		t.Error("a token for another workspace edited this one")
	}
	still("outside credential")

	// A workspace closed to agents.
	f.s.db.Exec(`UPDATE workspaces SET agent_access = 'closed' WHERE id = ?`, f.team)
	if rec := f.bearer(f.openTok, "POST", "/api/pages/"+page+"/edits", req); rec.Code == 200 {
		t.Error("an agent edited a page in a workspace closed to agents")
	}
	open := &user{ID: f.owner, TokenKind: tokenKindAPI, TokenScope: "write"}
	if _, err := callTool(t, f.s, open, "write_content", edits(page, "secret", "public")); err == nil {
		t.Error("write_content mode edit wrote into a workspace closed to agents")
	}
	f.s.db.Exec(`UPDATE workspaces SET agent_access = 'open' WHERE id = ?`, f.team)
	still("closed workspace")

	// Someone else's private page.
	stranger, strangerCookie := signedIn(t, f.s, "stranger@example.test")
	f.s.db.Exec(`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, 'member')`, f.team, stranger)
	f.s.db.Exec(`UPDATE pages SET visibility = 'private' WHERE id = ?`, page)
	if rec := requestAs(t, f.s, strangerCookie, "POST", "/api/pages/"+page+"/edits", req); rec.Code != 404 {
		t.Errorf("a member edited another person's private page: %d", rec.Code)
	}
	still("private page")

	// The trash.
	f.s.db.Exec(`UPDATE pages SET visibility = 'workspace', trashed_at = ? WHERE id = ?`, now(), page)
	if rec := requestAs(t, f.s, f.cookie, "POST", "/api/pages/"+page+"/edits", req); rec.Code != 409 {
		t.Errorf("an edit to a trashed page: %d, want 409", rec.Code)
	}
	still("trash")
}

func TestTheSpanRendererMatchesGetPage(t *testing.T) {
	blocks := []json.RawMessage{
		json.RawMessage(`{"type":"heading","props":{"level":2},"content":[{"type":"text","text":"Title","styles":{}}]}`),
		json.RawMessage(`{"type":"numberedListItem","content":[{"type":"text","text":"one","styles":{}}]}`),
		json.RawMessage(`{"type":"numberedListItem","content":[{"type":"text","text":"two","styles":{"bold":true}}]}`),
		json.RawMessage(para("p", "after")),
	}
	text, spans, _ := renderWithSpans(blocks)
	if want := blocksToMarkdown([]byte(joinBlocks(blocks))); text != want {
		t.Fatalf("span renderer differs from get_page's:\n%q\n%q", text, want)
	}
	if spans[0].start != 0 || spans[len(spans)-1].end != len(text) {
		t.Error("spans do not cover the text")
	}
	for i := 1; i < len(spans); i++ {
		if spans[i].start != spans[i-1].end {
			t.Errorf("gap or overlap between block %d and %d", i-1, i)
		}
	}
	if !strings.Contains(text[spans[2].start:spans[2].end], "2. **two**") {
		t.Errorf("numbering lost in the second list item: %q", text[spans[2].start:spans[2].end])
	}
}

func BenchmarkEditLargePage(b *testing.B) {
	parts := make([]string, 5000)
	for i := range parts {
		parts[i] = para(fmt.Sprintf("b%d", i), fmt.Sprintf("Paragraph number %d says something ordinary.", i))
	}
	content := blocksOf(parts...)
	var blocks []json.RawMessage
	json.Unmarshal([]byte(content), &blocks)
	e := pageEdit{Old: "Paragraph number 4321 says", New: "Paragraph number 4321 now says"}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, _, err := applyEdit(blocks, e, 0, false); err != nil {
			b.Fatal(err)
		}
	}
}
