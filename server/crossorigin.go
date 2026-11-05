package server

import (
	"net/http"
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
// net/http's CrossOriginProtection makes the browser's own judgement the rule:
// Sec-Fetch-Site, sent by every browser since 2023, says whether the page that
// made the request has nigari's exact origin (scheme, host AND port). Without
// it the Origin header is compared with Host. A request carrying neither is
// not from a browser page (curl, agents, MCP clients, the desktop app's own
// calls) and has no ambient cookie to abuse, so it passes untouched. That is
// also why this does not depend on which address nigari is reached by: an IP,
// a LAN name, a tunnel domain and a reverse proxy all look the same to it.
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
func crossOriginRefused(r *http.Request) bool {
	if hasBearer(r) {
		return false
	}
	return crossOrigin.Check(r) != nil
}

// crossOriginSocket is the same rule for a WebSocket handshake. The handshake
// is a GET, which CrossOriginProtection always lets through (a safe method
// changes nothing), but this GET opens a channel that reads and writes the
// document. So it is judged as if it were a write: the same headers, the same
// answer.
func crossOriginSocket(r *http.Request) bool {
	asWrite := *r
	asWrite.Method = http.MethodPost
	return crossOriginRefused(&asWrite)
}
