package server

import (
	"net/http"
	"net/url"
	"strings"
)

// Cross-site requests made with somebody's sign-in are refused.
//
// The session cookie is SameSite=Lax, and that was taken to be enough. It is
// not: "site" ignores the port and every subdomain, so on a home server
// (umbrel.local:8420 beside umbrel.local:3000, 192.168.1.10:8420 beside
// :8080) or under a shared domain (nigari.example.com beside
// blog.example.com), every other app counts as the same site and the browser
// sends nigari's cookie along with its requests. A page served by any of them
// could then change things as the person signed in: a text/plain POST needs
// no CORS preflight, and decodeJSON reads the body whatever its type. It could
// also open the live-editing socket (GET /collab, which SameSite never
// covered) and read the page as it arrived, because that socket took every
// origin (InsecureSkipVerify, "origins vary").
//
// net/http's CrossOriginProtection makes the browser's own judgement the rule.
// Over HTTPS, and to localhost, browsers send Sec-Fetch-Site, which says
// whether the page that made the request has nigari's exact origin (scheme,
// host AND port). Over plain HTTP they do not (fetch metadata goes only to
// trustworthy origins), and the Origin header is compared with Host instead.
// A request carrying neither is not from a browser page (curl, agents, MCP
// clients) and has no ambient cookie to abuse, so it passes untouched.
//
// Plain HTTP behind a proxy that rewrites Host (nginx's proxy_pass without
// proxy_set_header Host sends the upstream's address) would then refuse every
// write from nigari's own pages, sign-in included. So an Origin that names
// the address the proxy says the browser used (X-Forwarded-Host), or the
// public address set in Instance settings, counts as nigari's own (see
// originIsThisInstance).
var crossOrigin = newCrossOriginGuard()

func newCrossOriginGuard() *http.CrossOriginProtection {
	c := http.NewCrossOriginProtection()
	// Requests that carry their own credential and never read the session
	// cookie, so a forged one gains nothing. Let through so that a client that
	// happens to send an Origin header (a browser-based MCP tool, a runtime
	// whose fetch adds one) is not turned away by a rule that protects
	// nothing here.
	for _, p := range []string{
		"POST /mcp/{token}",    // the token is in the URL
		"POST /oauth/token",    // client credentials and code in the body
		"POST /oauth/register", // open registration, signs nobody in
		"POST /oauth/revoke",   // the token to revoke is the credential
		// Anonymous: a shared page's password and a public form's answers.
		// Neither reads anybody's sign-in, and the shared page is served with
		// Referrer-Policy: no-referrer, so its own form posts "Origin: null".
		"POST /public/{token}",
		"POST /api/public/form/{token}/submit",
	} {
		c.AddInsecureBypassPattern(p)
	}
	return c
}

// refuseCrossOrigin answers a refused request. 403: the caller is known to be
// a browser page on another address, and signing in again would not help.
func refuseCrossOrigin(w http.ResponseWriter) {
	httpErrorCode(w, http.StatusForbidden, "cross_origin",
		"This request came from a page on another address. nigari only accepts changes from its own pages.")
}

// crossOriginRefused reports whether a request must be turned away before it
// reaches its handler. A request that presents an agent key is not checked: a
// browser cannot attach an Authorization header to a cross-site request
// without a CORS preflight, which nigari never grants, so such a request is
// never a forgery riding on somebody's cookie.
func (s *Server) crossOriginRefused(r *http.Request) bool {
	if hasBearer(r) {
		return false
	}
	if crossOrigin.Check(r) == nil {
		return false
	}
	// The browser said so itself: Sec-Fetch-Site is never second-guessed.
	if r.Header.Get("Sec-Fetch-Site") != "" {
		return true
	}
	origin := r.Header.Get("Origin")
	// The desktop app trades its sign-in code from Electron's main process,
	// which belongs to no page: no Origin, or "null". A page on another
	// address sends its own origin and stays refused. (The code and its
	// verifier are the credential, as at /oauth/token.)
	if r.URL.Path == "/api/desktop/exchange" && (origin == "" || origin == "null") {
		return false
	}
	return !s.originIsThisInstance(r, origin)
}

// originIsThisInstance reports whether an Origin names nigari's own address
// as the browser saw it, when Host does not: behind a proxy that rewrote Host,
// that address is in X-Forwarded-Host, or it is the public address an admin
// set. X-Forwarded-Host is believed here without trust_proxy, because the only
// caller that matters cannot set it: a page on another address cannot add the
// header to a request without a CORS preflight, which nigari never grants. A
// caller that can set it is not a browser and has no cookie of anybody's.
func (s *Server) originIsThisInstance(r *http.Request, origin string) bool {
	o, err := url.Parse(origin)
	if err != nil || o.Host == "" {
		return false
	}
	for _, v := range r.Header.Values("X-Forwarded-Host") {
		for _, h := range strings.Split(v, ",") {
			if strings.EqualFold(strings.TrimSpace(h), o.Host) {
				return true
			}
		}
	}
	if base := s.setting("public_base_url", ""); base != "" {
		if b, err := url.Parse(strings.TrimSpace(base)); err == nil && b.Host != "" &&
			strings.EqualFold(b.Host, o.Host) && strings.EqualFold(b.Scheme, o.Scheme) {
			return true
		}
	}
	return false
}

// crossOriginSocket is the same rule for a WebSocket handshake. The handshake
// is a GET, which CrossOriginProtection always lets through (a safe method
// changes nothing), but this GET opens a channel that reads and writes the
// document. So it is judged as if it were a write: the same headers, the same
// answer.
func (s *Server) crossOriginSocket(r *http.Request) bool {
	asWrite := *r
	asWrite.Method = http.MethodPost
	return s.crossOriginRefused(&asWrite)
}
