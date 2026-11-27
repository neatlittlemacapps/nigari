package server

import (
	"encoding/base64"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

// Spec 027 (MCP 2026-07-28): nigari answers two protocol eras on one
// endpoint. These helpers send a call in either era, so a test of any MCP
// answer can run through both doors of /mcp and not only through mcpCall.

const (
	eraLegacy = "legacy" // initialize, or no per-request _meta
	eraModern = "modern" // 2026-07-28: _meta and the routing headers on every request
)

// mcpToken mints an API token for an account, for tests that go through
// HTTP rather than straight to mcpCall.
func mcpToken(t testing.TB, s *Server, uid, scope string) string {
	t.Helper()
	tok := "tok-" + newID()
	if _, err := s.db.Exec(`INSERT INTO api_tokens (id, user_id, name, token_hash, scope, created_at)
		VALUES (?, ?, 'agent', ?, ?, ?)`, newID(), uid, tokenHash(tok), scope, now()); err != nil {
		t.Fatalf("insert token: %v", err)
	}
	return tok
}

// mcpPost sends one raw body with the given headers.
func mcpPost(s *Server, tok, body string, headers map[string]string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/mcp", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	s.ServeHTTP(rec, req)
	return rec
}

// mcpModernBody and mcpModernHeaders build what a 2026-07-28 client sends:
// the version, the client's capabilities and its name in params._meta, and
// the same method, version and name again in the headers.
func mcpModernBody(t testing.TB, method, params string) (string, map[string]string) {
	t.Helper()
	p := map[string]any{}
	if params != "" {
		if err := json.Unmarshal([]byte(params), &p); err != nil {
			t.Fatalf("params: %v", err)
		}
	}
	p["_meta"] = map[string]any{
		mcpMetaProtocolVersion:               mcpModernVersion,
		mcpMetaClientCapabilities:            map[string]any{},
		"io.modelcontextprotocol/clientInfo": map[string]any{"name": "test", "version": "1"},
	}
	body, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": 1, "method": method, "params": p})
	headers := map[string]string{"MCP-Protocol-Version": mcpModernVersion, "Mcp-Method": method}
	if name, _ := p["name"].(string); name != "" && (method == "tools/call" || method == "prompts/get") {
		headers["Mcp-Name"] = name
	}
	if uri, _ := p["uri"].(string); uri != "" && method == "resources/read" {
		headers["Mcp-Name"] = uri
	}
	return string(body), headers
}

// mcpRequest sends method with params (a JSON object, or "") in the given era.
func mcpRequest(t testing.TB, s *Server, tok, era, method, params string) *httptest.ResponseRecorder {
	t.Helper()
	if era == eraModern {
		body, headers := mcpModernBody(t, method, params)
		return mcpPost(s, tok, body, headers)
	}
	if params == "" {
		params = "{}"
	}
	return mcpPost(s, tok, `{"jsonrpc":"2.0","id":1,"method":"`+method+`","params":`+params+`}`, nil)
}

// mcpToolText reads a tools/call answer in either era: its text and whether
// it was an error result.
func mcpToolText(t testing.TB, rec *httptest.ResponseRecorder) (string, bool) {
	t.Helper()
	var out struct {
		Result struct {
			IsError bool `json:"isError"`
			Content []struct {
				Text string `json:"text"`
			} `json:"content"`
		} `json:"result"`
		Error *struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("unreadable answer %d: %s", rec.Code, rec.Body.String())
	}
	if out.Error != nil {
		t.Fatalf("JSON-RPC error %d: %s", out.Error.Code, out.Error.Message)
	}
	if len(out.Result.Content) == 0 {
		t.Fatalf("no content: %s", rec.Body.String())
	}
	return out.Result.Content[0].Text, out.Result.IsError
}

// rpcBody is what writeJSON would put on the wire for v, newline included,
// so an answer can be compared byte for byte.
func rpcBody(t testing.TB, v any) string {
	t.Helper()
	var b strings.Builder
	if err := json.NewEncoder(&b).Encode(v); err != nil {
		t.Fatal(err)
	}
	return b.String()
}

// The legacy era is answered exactly as it was before spec 027, byte for
// byte. Every connector configured today speaks it, and FR-005 promises them
// nothing changes. The expected bodies are written out here, not built by the
// code under test, so a refactor that shifts a field fails.
func TestLegacyMCPAnswersAreUnchanged(t *testing.T) {
	s := testServer(t)
	uid, _ := signedIn(t, s, "legacy@example.test")
	tok := mcpToken(t, s, uid, "write")

	t.Run("initialize", func(t *testing.T) {
		rec := mcpPost(s, tok, `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}`, nil)
		req := httptest.NewRequest("POST", "/mcp", nil)
		info := map[string]any{"name": "nigari", "version": Version}
		icons := []map[string]any{}
		if s.mcpIcon != "" {
			icons = append(icons, map[string]any{"src": s.mcpIcon, "mimeType": "image/svg+xml", "sizes": []string{"any"}})
		}
		if base := s.publicShareBase(req); base != "" {
			icons = append(icons, map[string]any{"src": base + "/icon-192.png", "mimeType": "image/png", "sizes": []string{"192x192"}})
		}
		if len(icons) > 0 {
			info["icons"] = icons
		}
		want := rpcBody(t, map[string]any{"jsonrpc": "2.0", "id": 1, "result": map[string]any{
			"protocolVersion": "2025-06-18",
			"capabilities":    map[string]any{"tools": map[string]any{}},
			"serverInfo":      info,
			"instructions": "Workspaces can carry rules — working conventions their admin wrote for agents. " +
				"list with kind=\"workspaces\" marks them (has_rules); read them via get_workspace before writing into a workspace, and follow them. " +
				"Rules are managed by workspace admins alone: if your user is one, propose_workspace_rules submits a draft (with their agreement) that activates only when an admin applies it in the browser; if not, follow the rules and leave them be.",
		}})
		if rec.Code != 200 || rec.Body.String() != want {
			t.Errorf("initialize changed: %d\n got %s\nwant %s", rec.Code, rec.Body.String(), want)
		}
	})
	t.Run("initialize without a version", func(t *testing.T) {
		rec := mcpPost(s, tok, `{"jsonrpc":"2.0","id":1,"method":"initialize"}`, nil)
		if !strings.Contains(rec.Body.String(), `"protocolVersion":"2025-06-18"`) {
			t.Errorf("default version changed: %s", rec.Body.String())
		}
	})
	t.Run("tools/list", func(t *testing.T) {
		rec := mcpPost(s, tok, `{"jsonrpc":"2.0","id":2,"method":"tools/list"}`, nil)
		want := rpcBody(t, map[string]any{"jsonrpc": "2.0", "id": 2, "result": map[string]any{"tools": mcpTools}})
		if rec.Code != 200 || rec.Body.String() != want {
			t.Errorf("tools/list changed: %d, %d bytes, want %d", rec.Code, rec.Body.Len(), len(want))
		}
	})
	t.Run("tools/call", func(t *testing.T) {
		rec := mcpPost(s, tok, `{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"whoami","arguments":{}}}`, nil)
		out, err := s.mcpCall(s.userByID(uid), "whoami", nil, "")
		if err != nil {
			t.Fatal(err)
		}
		want := rpcBody(t, map[string]any{"jsonrpc": "2.0", "id": 3, "result": textResult(out, false)})
		if rec.Code != 200 || rec.Body.String() != want {
			t.Errorf("tools/call changed: %d\n got %s\nwant %s", rec.Code, rec.Body.String(), want)
		}
	})
	t.Run("tool error", func(t *testing.T) {
		rec := mcpPost(s, tok, `{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_page","arguments":{"page_id":"nope"}}}`, nil)
		if rec.Code != 200 || !strings.HasPrefix(rec.Body.String(), `{"id":4,"jsonrpc":"2.0","result":{"content":[{"text":`) ||
			!strings.Contains(rec.Body.String(), `"isError":true`) {
			t.Errorf("a tool error is no longer an isError result: %d %s", rec.Code, rec.Body.String())
		}
	})
	t.Run("ping", func(t *testing.T) {
		rec := mcpPost(s, tok, `{"jsonrpc":"2.0","id":5,"method":"ping"}`, nil)
		if want := `{"id":5,"jsonrpc":"2.0","result":{}}` + "\n"; rec.Code != 200 || rec.Body.String() != want {
			t.Errorf("ping changed: %d %s", rec.Code, rec.Body.String())
		}
	})
	t.Run("unknown method", func(t *testing.T) {
		rec := mcpPost(s, tok, `{"jsonrpc":"2.0","id":6,"method":"nope/nope"}`, nil)
		if want := `{"error":{"code":-32601,"message":"method not found: nope/nope"},"id":6,"jsonrpc":"2.0"}` + "\n"; rec.Code != 200 || rec.Body.String() != want {
			t.Errorf("unknown method changed: %d %s", rec.Code, rec.Body.String())
		}
	})
	t.Run("notification", func(t *testing.T) {
		rec := mcpPost(s, tok, `{"jsonrpc":"2.0","method":"notifications/initialized"}`, nil)
		if rec.Code != 202 || rec.Body.Len() != 0 {
			t.Errorf("notification changed: %d %q", rec.Code, rec.Body.String())
		}
	})
	// The headers a 2026-07-28 client sends mean nothing to the legacy era:
	// a legacy client after initialize sends MCP-Protocol-Version as well,
	// and nothing in its body says it is modern.
	t.Run("headers alone do not make a request modern", func(t *testing.T) {
		rec := mcpPost(s, tok, `{"jsonrpc":"2.0","id":7,"method":"tools/list"}`,
			map[string]string{"MCP-Protocol-Version": "2025-06-18", "Mcp-Method": "ping"})
		if rec.Code != 200 || strings.Contains(rec.Body.String(), "resultType") || strings.Contains(rec.Body.String(), `"error"`) {
			t.Errorf("legacy request with headers: %d %s", rec.Code, rec.Body.String()[:min(200, rec.Body.Len())])
		}
	})
}

// modernResult decodes a 2026-07-28 answer's result, failing on an error.
func modernResult(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var out struct {
		Result map[string]any `json:"result"`
		Error  any            `json:"error"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil || rec.Code != 200 || out.Error != nil {
		t.Fatalf("not a result: %d %s", rec.Code, rec.Body.String())
	}
	return out.Result
}

// modernError decodes a refusal: the HTTP status and the JSON-RPC error.
func modernError(t *testing.T, rec *httptest.ResponseRecorder) (int, int, map[string]any) {
	t.Helper()
	var out struct {
		Error *struct {
			Code int            `json:"code"`
			Data map[string]any `json:"data"`
		} `json:"error"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil || out.Error == nil {
		t.Fatalf("not an error: %d %s", rec.Code, rec.Body.String())
	}
	return rec.Code, out.Error.Code, out.Error.Data
}

// US1: a client that speaks only 2026-07-28 discovers nigari, lists its tools
// and calls them, without the handshake.
func TestModernClientDiscoversListsAndCalls(t *testing.T) {
	s := testServer(t)
	uid, _ := signedIn(t, s, "modern@example.test")
	tok := mcpToken(t, s, uid, "write")

	d := modernResult(t, mcpRequest(t, s, tok, eraModern, "server/discover", ""))
	if d["resultType"] != "complete" || d["instructions"] != mcpInstructions || d["cacheScope"] != "public" || d["ttlMs"] != float64(mcpListTTLms) {
		t.Errorf("discover: %v", d)
	}
	if v, _ := json.Marshal(d["supportedVersions"]); !strings.Contains(string(v), `"2026-07-28"`) || !strings.Contains(string(v), `"2025-06-18"`) {
		t.Errorf("supportedVersions: %s", v)
	}
	if c, _ := json.Marshal(d["capabilities"]); string(c) != `{"tools":{}}` {
		// Extensions are declared by the phase that builds them, not before.
		t.Errorf("capabilities: %s", c)
	}
	info, _ := d["_meta"].(map[string]any)[mcpMetaServerInfo].(map[string]any)
	if info["name"] != "nigari" || info["version"] != Version || (s.mcpIcon != "" && info["icons"] == nil) {
		t.Errorf("serverInfo: %v", info)
	}
	if _, top := d["serverInfo"]; top {
		t.Error("serverInfo belongs in _meta, not at the top level")
	}

	l := modernResult(t, mcpRequest(t, s, tok, eraModern, "tools/list", ""))
	got, _ := json.Marshal(l["tools"])
	want, _ := json.Marshal(mcpTools)
	if string(got) != string(want) || l["resultType"] != "complete" || l["cacheScope"] != "public" || l["ttlMs"] != float64(mcpListTTLms) {
		t.Errorf("tools/list differs from the catalogue, or lacks its hints (%d vs %d bytes)", len(got), len(want))
	}
	meta, _ := l["_meta"].(map[string]any)[mcpMetaServerInfo].(map[string]any)
	if meta["name"] != "nigari" || meta["icons"] != nil {
		// Every answer names the server; only discover carries the icons,
		// which would otherwise add kilobytes to every call.
		t.Errorf("tools/list serverInfo: %v", meta)
	}

	rec := mcpRequest(t, s, tok, eraModern, "tools/call", `{"name":"whoami","arguments":{}}`)
	text, isErr := mcpToolText(t, rec)
	legacy, _ := mcpToolText(t, mcpRequest(t, s, tok, eraLegacy, "tools/call", `{"name":"whoami","arguments":{}}`))
	if isErr || text != legacy || modernResult(t, rec)["resultType"] != "complete" {
		t.Errorf("tools/call: %v %q, legacy %q", isErr, text, legacy)
	}
	// A tool error stays an isError result, not a JSON-RPC error (plan D2).
	rec = mcpRequest(t, s, tok, eraModern, "tools/call", `{"name":"get_page","arguments":{"page_id":"nope"}}`)
	if _, isErr := mcpToolText(t, rec); !isErr || rec.Code != 200 {
		t.Errorf("tool error: %d %s", rec.Code, rec.Body.String())
	}
	// Notifications are accepted with 202 and no body in both eras.
	body, headers := mcpModernBody(t, "notifications/cancelled", `{"requestId":1}`)
	body = strings.Replace(body, `"id":1,`, "", 1)
	if rec := mcpPost(s, tok, body, headers); rec.Code != 202 || rec.Body.Len() != 0 {
		t.Errorf("notification: %d %q", rec.Code, rec.Body.String())
	}
}

// What the revision removed, and what nigari never answered, is "method not
// found" with HTTP 404 in the modern era (FR-006). The legacy era keeps ping.
func TestModernEraDropsPingAndAnswersUnknownMethodsWith404(t *testing.T) {
	s := testServer(t)
	uid, _ := signedIn(t, s, "removed@example.test")
	tok := mcpToken(t, s, uid, "write")
	for _, m := range []string{"ping", "logging/setLevel", "resources/list", "nope/nope"} {
		status, code, _ := modernError(t, mcpRequest(t, s, tok, eraModern, m, ""))
		if status != 404 || code != rpcMethodNotFound {
			t.Errorf("%s: HTTP %d code %d, want 404 %d", m, status, code, rpcMethodNotFound)
		}
	}
	if rec := mcpRequest(t, s, tok, eraLegacy, "ping", ""); rec.Code != 200 || !strings.Contains(rec.Body.String(), `"result":{}`) {
		t.Errorf("legacy ping: %d %s", rec.Code, rec.Body.String())
	}
}

// US1 scenario 2: an unknown version is refused, naming the versions nigari
// speaks so the client can pick one it also knows.
func TestModernUnsupportedVersionListsTheSupportedOnes(t *testing.T) {
	s := testServer(t)
	uid, _ := signedIn(t, s, "version@example.test")
	tok := mcpToken(t, s, uid, "write")
	body, headers := mcpModernBody(t, "tools/list", "")
	body = strings.Replace(body, mcpModernVersion, "1900-01-01", 1)
	headers["MCP-Protocol-Version"] = "1900-01-01"
	status, code, data := modernError(t, mcpPost(s, tok, body, headers))
	if status != 400 || code != rpcUnsupportedProtocolVersion || data["requested"] != "1900-01-01" {
		t.Fatalf("HTTP %d code %d data %v", status, code, data)
	}
	if got, _ := json.Marshal(data["supported"]); string(got) != `["2026-07-28","2025-11-25","2025-06-18"]` {
		t.Errorf("supported: %s", got)
	}
}

// US1 scenario 3 (plan D3): headers that disagree with the body, or are
// missing, refuse the request before any tool runs. A gateway routes and
// authorises on the headers; a call whose body says something else would get
// past it as a different call.
func TestModernHeaderMismatchRunsNoTool(t *testing.T) {
	s := testServer(t)
	uid, _ := signedIn(t, s, "headers@example.test")
	tok := mcpToken(t, s, uid, "write")
	ws := s.firstWorkspaceOf(t, uid)
	create := `{"name":"create_page","arguments":{"workspace_id":"` + ws + `","title":"Should not exist"}}`
	pages := func() int {
		var n int
		s.db.QueryRow(`SELECT COUNT(*) FROM pages WHERE title = 'Should not exist'`).Scan(&n)
		return n
	}
	b64 := func(v string) string {
		return mcpHeaderBase64Prefix + base64.StdEncoding.EncodeToString([]byte(v)) + mcpHeaderBase64Suffix
	}
	for _, c := range []struct {
		name   string
		header string
		value  string // "" removes it
	}{
		{"another tool in Mcp-Name", "Mcp-Name", "whoami"},
		{"no Mcp-Name", "Mcp-Name", ""},
		{"another method in Mcp-Method", "Mcp-Method", "tools/list"},
		{"no Mcp-Method", "Mcp-Method", ""},
		{"another version in MCP-Protocol-Version", "MCP-Protocol-Version", "2025-06-18"},
		{"no MCP-Protocol-Version", "MCP-Protocol-Version", ""},
		{"a name Base64-encoded wrong", "Mcp-Name", b64("whoami")},
		{"marked Base64 that does not decode", "Mcp-Name", "=?base64?!!!?="},
		{"the name in another case", "Mcp-Name", "Create_Page"},
	} {
		body, headers := mcpModernBody(t, "tools/call", create)
		if c.value == "" {
			delete(headers, c.header)
		} else {
			headers[c.header] = c.value
		}
		status, code, _ := modernError(t, mcpPost(s, tok, body, headers))
		if status != 400 || code != rpcHeaderMismatch {
			t.Errorf("%s: HTTP %d code %d, want 400 %d", c.name, status, code, rpcHeaderMismatch)
		}
	}
	if n := pages(); n != 0 {
		t.Fatalf("a refused request still created %d page(s)", n)
	}
	// The encoded form of the right name is the right name.
	body, headers := mcpModernBody(t, "tools/call", create)
	headers["Mcp-Name"] = b64("create_page")
	if _, isErr := mcpToolText(t, mcpPost(s, tok, body, headers)); isErr || pages() != 1 {
		t.Errorf("an encoded Mcp-Name was not decoded: %d page(s)", pages())
	}
	// Header names are case-insensitive; Go's Header.Get already folds them.
	body, headers = mcpModernBody(t, "tools/list", "")
	delete(headers, "Mcp-Method")
	headers["mcp-method"] = "tools/list"
	modernResult(t, mcpPost(s, tok, body, headers))
}

// The revision makes the client's capabilities part of every request. A
// request without them is malformed (-32602, HTTP 400); one with an empty
// object is a client with no optional capability, and works.
func TestModernRequestNeedsClientCapabilities(t *testing.T) {
	s := testServer(t)
	uid, _ := signedIn(t, s, "caps@example.test")
	tok := mcpToken(t, s, uid, "write")
	body, headers := mcpModernBody(t, "tools/list", "")
	body = strings.Replace(body, `"`+mcpMetaClientCapabilities+`":{},`, "", 1)
	if strings.Contains(body, mcpMetaClientCapabilities) {
		t.Fatalf("fixture still has capabilities: %s", body)
	}
	if status, code, _ := modernError(t, mcpPost(s, tok, body, headers)); status != 400 || code != rpcInvalidParams {
		t.Errorf("no capabilities: HTTP %d code %d", status, code)
	}
	body = strings.Replace(body, `"_meta":{`, `"_meta":{"`+mcpMetaClientCapabilities+`":"none",`, 1)
	if status, code, _ := modernError(t, mcpPost(s, tok, body, headers)); status != 400 || code != rpcInvalidParams {
		t.Errorf("capabilities not an object: HTTP %d code %d", status, code)
	}
}

// US1 scenario 4: a read-only token is refused a write tool in the modern era
// exactly as in the legacy one, by mcpCall's own gate, and nothing is
// written. (The HTTP 403 insufficient_scope answer is phase 2, D10.)
func TestModernReadTokenIsRefusedAWriteTool(t *testing.T) {
	s := testServer(t)
	uid, _ := signedIn(t, s, "reader@example.test")
	tok := mcpToken(t, s, uid, "read")
	ws := s.firstWorkspaceOf(t, uid)
	call := `{"name":"create_page","arguments":{"workspace_id":"` + ws + `","title":"Read token wrote this"}}`
	modern, mErr := mcpToolText(t, mcpRequest(t, s, tok, eraModern, "tools/call", call))
	legacy, lErr := mcpToolText(t, mcpRequest(t, s, tok, eraLegacy, "tools/call", call))
	if !mErr || !lErr || modern != legacy || !strings.Contains(modern, "read-only") {
		t.Errorf("modern %v %q, legacy %v %q", mErr, modern, lErr, legacy)
	}
	var n int
	s.db.QueryRow(`SELECT COUNT(*) FROM pages WHERE title = 'Read token wrote this'`).Scan(&n)
	if n != 0 {
		t.Errorf("%d page(s) written by a read token", n)
	}
	// A read tool works for it in the modern era.
	if _, isErr := mcpToolText(t, mcpRequest(t, s, tok, eraModern, "tools/call", `{"name":"whoami","arguments":{}}`)); isErr {
		t.Error("whoami refused to a read token")
	}
}

// An idempotency key is per credential, not per era: a client that retries
// a create after switching eras (it learned of 2026-07-28 between the two
// attempts) gets the first answer back, not a second page.
func TestIdempotencyKeyHoldsAcrossEras(t *testing.T) {
	s := testServer(t)
	uid, _ := signedIn(t, s, "retry@example.test")
	tok := mcpToken(t, s, uid, "write")
	ws := s.firstWorkspaceOf(t, uid)
	call := `{"name":"create_page","arguments":{"workspace_id":"` + ws + `","title":"Made once","idempotency_key":"k-1"}}`
	first, _ := mcpToolText(t, mcpRequest(t, s, tok, eraLegacy, "tools/call", call))
	again, isErr := mcpToolText(t, mcpRequest(t, s, tok, eraModern, "tools/call", call))
	var n int
	s.db.QueryRow(`SELECT COUNT(*) FROM pages WHERE title = 'Made once'`).Scan(&n)
	if isErr || again != first || n != 1 {
		t.Errorf("retry across eras: %d page(s), answers %q / %q", n, first, again)
	}
}

// A request is modern only when its body says so. The version in _meta
// alone decides; initialize stays legacy even if a client adds _meta to it.
func TestInitializeIsLegacyEvenWithMeta(t *testing.T) {
	s := testServer(t)
	uid, _ := signedIn(t, s, "init@example.test")
	tok := mcpToken(t, s, uid, "write")
	body, headers := mcpModernBody(t, "initialize", `{"protocolVersion":"2025-11-25"}`)
	rec := mcpPost(s, tok, body, headers)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"protocolVersion":"2025-11-25"`) || strings.Contains(rec.Body.String(), "resultType") {
		t.Errorf("initialize with _meta: %d %s", rec.Code, rec.Body.String())
	}
}
