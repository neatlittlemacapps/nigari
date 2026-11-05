package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// A page on another address must not be able to act with somebody's sign-in
// (crossorigin.go). The case that matters most is "same-site": another app on
// the same host and a different port, which SameSite=Lax lets the cookie ride
// along with. Every other request shape, a browser page of nigari's own and a
// client that is no browser at all, must pass exactly as before.

type originCase struct {
	name      string
	headers   map[string]string
	wantBlock bool
}

var originCases = []originCase{
	{"own page", map[string]string{"Sec-Fetch-Site": "same-origin", "Origin": "http://example.com"}, false},
	{"typed into the address bar", map[string]string{"Sec-Fetch-Site": "none"}, false},
	{"no browser at all", nil, false},
	{"another app on the same host", map[string]string{"Sec-Fetch-Site": "same-site", "Origin": "http://example.com:3000"}, true},
	{"another site", map[string]string{"Sec-Fetch-Site": "cross-site", "Origin": "https://evil.example"}, true},
	// A browser too old for Sec-Fetch-Site still sends Origin.
	{"old browser, other port", map[string]string{"Origin": "http://example.com:3000"}, true},
	{"old browser, own address", map[string]string{"Origin": "http://example.com"}, false},
}

func originRequest(method, target, body, cookie string, headers map[string]string) *http.Request {
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	// httptest's default Host; the Origin cases above are written against it.
	req.Host = "example.com"
	if cookie != "" {
		req.Header.Set("Cookie", cookie)
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	return req
}

func TestAWriteFromAnotherAddressIsRefused(t *testing.T) {
	s := testServer(t)
	_, cookie := signedIn(t, s, "origin@example.test")
	for _, c := range originCases {
		t.Run(c.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			// text/plain: the body a page on another address can send without
			// asking the browser first.
			req := originRequest("PUT", "/api/me/prefs", `{"theme":"dark"}`, cookie, c.headers)
			req.Header.Set("Content-Type", "text/plain")
			s.ServeHTTP(rec, req)
			blocked := rec.Code == http.StatusForbidden && strings.Contains(rec.Body.String(), `"cross_origin"`)
			if blocked != c.wantBlock {
				t.Fatalf("blocked = %v, want %v (status %d, %s)", blocked, c.wantBlock, rec.Code, rec.Body)
			}
			if !c.wantBlock && rec.Code != http.StatusOK {
				t.Fatalf("allowed request failed: %d %s", rec.Code, rec.Body)
			}
		})
	}
}

// The live-editing socket opens with a GET, which the write rule alone would
// let through, and it reads the whole page. It is judged like a write.
func TestTheLiveEditingSocketRefusesAnotherAddress(t *testing.T) {
	s := testServer(t)
	_, cookie := signedIn(t, s, "socket@example.test")
	for _, c := range originCases {
		t.Run(c.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			req := originRequest("GET", "/collab/nosuchpage", "", cookie, c.headers)
			s.ServeHTTP(rec, req)
			blocked := rec.Code == http.StatusForbidden && strings.Contains(rec.Body.String(), `"cross_origin"`)
			if blocked != c.wantBlock {
				t.Fatalf("blocked = %v, want %v (status %d, %s)", blocked, c.wantBlock, rec.Code, rec.Body)
			}
			// Let through, the request goes on to the page lookup.
			if !c.wantBlock && rec.Code != http.StatusNotFound {
				t.Fatalf("allowed handshake did not reach the page lookup: %d %s", rec.Code, rec.Body)
			}
		})
	}
}

// An agent key cannot be attached by a page on another address (that needs a
// CORS preflight nigari never grants), and the token-in-URL and OAuth machine
// endpoints never read the cookie. None of them is judged by origin.
func TestRequestsWithTheirOwnCredentialAreNotJudgedByOrigin(t *testing.T) {
	s := testServer(t)
	foreign := map[string]string{"Sec-Fetch-Site": "cross-site", "Origin": "https://agent.example"}

	req := originRequest("POST", "/mcp", `{}`, "", foreign)
	req.Header.Set("Authorization", "Bearer not-a-real-token")
	if crossOriginRefused(req) {
		t.Fatal("a request with an agent key was judged by origin")
	}
	for _, target := range []string{"/mcp/sometoken", "/oauth/token", "/oauth/register", "/oauth/revoke"} {
		rec := httptest.NewRecorder()
		s.ServeHTTP(rec, originRequest("POST", target, `{}`, "", foreign))
		if strings.Contains(rec.Body.String(), `"cross_origin"`) {
			t.Fatalf("POST %s was refused by origin: %s", target, rec.Body)
		}
	}
	// The plain /mcp entry point does read the cookie, so without a key it is
	// judged like any other write.
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, originRequest("POST", "/mcp", `{}`, "", foreign))
	if rec.Code != http.StatusForbidden || !strings.Contains(rec.Body.String(), `"cross_origin"`) {
		t.Fatalf("POST /mcp without a key from another address: %d %s", rec.Code, rec.Body)
	}
}
