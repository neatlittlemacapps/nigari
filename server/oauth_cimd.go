package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Client ID Metadata Documents (spec 027, plan D9; MCP 2026-07-28
// authorization, draft-ietf-oauth-client-id-metadata-document-00).
//
// A client can name itself by an https URL instead of registering: its
// client_id IS the address of a small JSON document saying its name and the
// addresses it receives codes at. The 2026-07-28 revision prefers this to
// Dynamic Client Registration (/oauth/register), which it deprecates; both
// stay, because older clients only know registration.
//
// What it buys: the name on the consent screen is no longer whatever a
// stranger typed into an open registration form, but what the document at
// that host says, and the screen can show the host. What it costs: nigari
// fetches a URL that anybody can send to /oauth/authorize without signing
// in. Hence:
//   - public addresses only, with no admin switch (publicDial, notPublicIP);
//   - no redirects (a redirect would serve one URL's identity from another);
//   - 5 KB, the draft's recommended limit, and 5 seconds;
//   - a rate limit per address, so nigari is nobody's fetching proxy;
//   - a document that fails any check is not stored (the draft: errors and
//     invalid documents MUST NOT be cached), and the authorization stops.

const (
	clientMetadataMaxBytes = 5 << 10
	// A stored document is read again by the first authorization after this,
	// so a client that changed its name or its redirect addresses is not held
	// to the old ones for long. The token endpoint never fetches: a client's
	// site being down must not end connections that are already granted.
	clientMetadataMaxAge = 24 * time.Hour
)

// clientMetadataTimeout is a variable only so a test of a slow document need
// not wait the full five seconds.
var clientMetadataTimeout = 5 * time.Second

// isClientMetadataURL reports whether a client_id is meant as a metadata
// document's address, by the draft's rules (section 3): https, a host, a path
// other than "/", no fragment, no user or password, no dot segments. An id
// from /oauth/register ("nigari-…") is never one.
func isClientMetadataURL(id string) bool {
	if !strings.HasPrefix(id, "https://") {
		return false
	}
	u, err := url.Parse(id)
	if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || u.Fragment != "" ||
		strings.Contains(id, "#") || u.Path == "" || u.Path == "/" {
		return false
	}
	for _, seg := range strings.Split(u.Path, "/") {
		if seg == "." || seg == ".." {
			return false
		}
	}
	return true
}

// clientMetadataHost is the host a metadata-URL client's document is served
// from, for the consent screen; "" for a registered client.
func clientMetadataHost(id string) string {
	if !isClientMetadataURL(id) {
		return ""
	}
	u, _ := url.Parse(id)
	return u.Hostname()
}

// errClientMetadataRate is the per-address limit on fetches.
var errClientMetadataRate = errors.New("too many client metadata documents fetched from this address; try again in a minute")

// refreshClientMetadata makes sure a metadata-URL client has a stored row no
// older than clientMetadataMaxAge, fetching its document if not. On any error
// nothing is written, and the caller stops the authorization: the draft says
// a server SHOULD abort when the document cannot be fetched, and a row kept
// from before would let a client whose document now says something else go on
// under what it used to say.
func (s *Server) refreshClientMetadata(r *http.Request, id string) error {
	var fetched string
	if err := s.db.QueryRow(`SELECT metadata_fetched_at FROM oauth_clients WHERE id = ?`, id).Scan(&fetched); err == nil {
		if t, perr := time.Parse(time.RFC3339Nano, fetched); perr == nil && time.Since(t) < clientMetadataMaxAge {
			return nil
		}
	}
	if !s.clientMetadataRate.allow(s.clientIP(r)) {
		return errClientMetadataRate
	}
	doc, err := s.fetchClientMetadata(id)
	if err != nil {
		return err
	}
	uris, _ := json.Marshal(doc.RedirectURIs)
	at := now()
	// A metadata client has no secret: the draft forbids shared secrets for
	// it, and PKCE is its proof, as for any public client.
	_, err = s.db.Exec(`INSERT INTO oauth_clients (id, secret_hash, name, redirect_uris, created_at, metadata_fetched_at)
		VALUES (?, '', ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET name = excluded.name, redirect_uris = excluded.redirect_uris,
			metadata_fetched_at = excluded.metadata_fetched_at`,
		id, doc.ClientName, string(uris), at, at)
	return err
}

type clientMetadataDoc struct {
	ClientID                string          `json:"client_id"`
	ClientName              string          `json:"client_name"`
	RedirectURIs            []string        `json:"redirect_uris"`
	TokenEndpointAuthMethod string          `json:"token_endpoint_auth_method"`
	ClientSecret            json.RawMessage `json:"client_secret"`
}

// fetchClientMetadata fetches and checks one document. Each refusal is a
// sentence the person at the consent screen, or the client's developer, can
// act on.
func (s *Server) fetchClientMetadata(id string) (*clientMetadataDoc, error) {
	var tr http.RoundTripper = &http.Transport{DialContext: publicDial}
	if s.clientMetadataTransport != nil {
		tr = s.clientMetadataTransport
	}
	client := &http.Client{
		Timeout:   clientMetadataTimeout,
		Transport: tr,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return errors.New("the client metadata document must be served at its client_id itself, without a redirect")
		},
	}
	req, err := http.NewRequest("GET", id, nil)
	if err != nil {
		return nil, fmt.Errorf("the client_id is not a valid URL")
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "nigari/"+Version+" (oauth client metadata)")
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("could not fetch the client metadata document: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("the client metadata document answered %s", resp.Status)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, clientMetadataMaxBytes+1))
	if err != nil {
		return nil, fmt.Errorf("could not read the client metadata document: %v", err)
	}
	if len(body) > clientMetadataMaxBytes {
		return nil, fmt.Errorf("the client metadata document is larger than %d KB", clientMetadataMaxBytes>>10)
	}
	var doc clientMetadataDoc
	if err := json.Unmarshal(body, &doc); err != nil {
		return nil, fmt.Errorf("the client metadata document is not a JSON object")
	}
	// Simple string comparison, as the draft says: a document copied to
	// another address does not become that address's client.
	if doc.ClientID != id {
		return nil, fmt.Errorf("the document's client_id is %q, not the address it is served at", doc.ClientID)
	}
	doc.ClientName = strings.TrimSpace(doc.ClientName)
	if doc.ClientName == "" {
		return nil, fmt.Errorf("the client metadata document has no client_name")
	}
	if len([]rune(doc.ClientName)) > 80 {
		doc.ClientName = string([]rune(doc.ClientName)[:80])
	}
	if len(doc.RedirectURIs) == 0 {
		return nil, fmt.Errorf("the client metadata document lists no redirect_uris")
	}
	for _, u := range doc.RedirectURIs {
		if err := validRedirectURI(u); err != nil {
			return nil, fmt.Errorf("redirect_uri %q in the client metadata document: %v", u, err)
		}
	}
	// A secret in a public document is no secret, and the draft forbids
	// every shared-secret method. private_key_jwt is allowed by the draft
	// but not built here, so such a client is told so rather than treated as
	// public.
	if len(doc.ClientSecret) > 0 && string(doc.ClientSecret) != "null" {
		return nil, fmt.Errorf("a client metadata document must not carry a client_secret")
	}
	if m := doc.TokenEndpointAuthMethod; m != "" && m != "none" {
		return nil, fmt.Errorf("token_endpoint_auth_method %q is not supported for a client metadata document; use \"none\" (PKCE)", m)
	}
	return &doc, nil
}
