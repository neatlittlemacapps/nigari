package server

import (
	"encoding/json"
	"html"
	"net/http"
	"strings"
)

// RefusalHandler is what a refused start serves on its usual address
// (contracts/refusal.md, FR-019). Logging the sentence alone was not enough:
// someone who opens nigari in a browser, or an agent calling it, would only
// see a connection refused and guess. So every request is answered 503 with
// the sentence: a page for people, {error, code} for /api/ and /mcp.
//
// It holds no database and touches nothing in the data directory; the page
// has no scripts and no links into the app, which is not running.
func RefusalHandler(r *UpgradeRefusal) http.Handler {
	page := `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>nigari did not start</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem;color:#222;background:#fff}
code{font-size:.9em}@media (prefers-color-scheme:dark){body{color:#ddd;background:#111}}</style></head>
<body><h1>nigari did not start</h1><p>` + html.EscapeString(r.Sentence) + `</p>
<p>Code: <code>` + html.EscapeString(r.Code) + `</code></p></body></html>`
	body, _ := json.Marshal(map[string]string{"error": r.Sentence, "code": r.Code})
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if strings.HasPrefix(req.URL.Path, "/api/") || req.URL.Path == "/mcp" || strings.HasPrefix(req.URL.Path, "/mcp/") {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusServiceUnavailable)
			w.Write(body)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusServiceUnavailable)
		w.Write([]byte(page))
	})
}
