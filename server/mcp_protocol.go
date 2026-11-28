package server

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
)

// MCP protocol eras (spec 027, plan D1–D5).
//
// The 2026-07-28 revision of MCP removed the initialize handshake: each
// request names its protocol version and the client's capabilities in
// params._meta, repeats its method (and tool name) in headers so a proxy can
// route it without reading the body, and gets an answer that says what kind
// of result it is. The revision lets one endpoint serve both eras, decided
// per request: modern _meta means 2026-07-28, initialize means the legacy
// era. nigari does exactly that on /mcp, because every connector configured
// today speaks the legacy era and a second endpoint (/mcp2) would have to be
// typed into each of them by hand.
//
// Only the envelope differs. Both eras end in mcpCall, the one function that
// holds every gate (read-only tokens, idempotency, canRead/canWrite,
// credentialMayEnter): a dispatcher per era is the "check on one door only"
// history this repository keeps finding (constitution III).

const (
	mcpModernVersion = "2026-07-28"
	// The keys a 2026-07-28 request carries in params._meta.
	mcpMetaProtocolVersion    = "io.modelcontextprotocol/protocolVersion"
	mcpMetaClientCapabilities = "io.modelcontextprotocol/clientCapabilities"
	mcpMetaServerInfo         = "io.modelcontextprotocol/serverInfo"

	// JSON-RPC codes the revision defines in its reserved range.
	rpcHeaderMismatch             = -32020
	rpcUnsupportedProtocolVersion = -32022
	rpcInvalidParams              = -32602
	rpcMethodNotFound             = -32601
	mcpListTTLms                  = 3_600_000
	mcpLegacyDefaultVersion       = "2025-06-18"
	mcpHeaderBase64Prefix         = "=?base64?"
	mcpHeaderBase64Suffix         = "?="
)

// mcpSupportedVersions are the versions nigari answers: the modern one per
// request, the others through initialize. A client refused for its version is
// told all of them (UnsupportedProtocolVersion's data.supported), so it can
// fall back to one it also speaks.
var mcpSupportedVersions = []string{mcpModernVersion, "2025-11-25", mcpLegacyDefaultVersion}

// mcpInstructions is the one convention worth knowing before the first tool
// call: workspaces can carry rules their admin wrote for agents. initialize
// and server/discover both carry it, from this one constant.
const mcpInstructions = "Workspaces can carry rules — working conventions their admin wrote for agents. " +
	"list with kind=\"workspaces\" marks them (has_rules); read them via get_workspace before writing into a workspace, and follow them. " +
	"Rules are managed by workspace admins alone: if your user is one, propose_workspace_rules submits a draft (with their agreement) that activates only when an admin applies it in the browser; if not, follow the rules and leave them be."

// mcpServerInfo is serverInfo for initialize and server/discover.
//
// icons has been part of serverInfo since spec revision 2025-11-25 (SEP-973)
// and lets a client show the logo instead of a placeholder. Claude.ai does NOT
// read it as of today (anthropics/claude-ai-mcp#152, open) — other clients do,
// and the moment Claude follows it will be there with nothing further to do.
// Two entries, because both routes occur: the embedded SVG (always present,
// even under a strict CSP) and an absolute link to the PNG for clients that
// dislike SVG.
//
// withIcons is false for the serverInfo that every modern answer carries in
// _meta: the SVG is a data URI of several kilobytes, and sending it with each
// tool call would cost every call that much for a logo the client already has
// from server/discover.
func (s *Server) mcpServerInfo(r *http.Request, withIcons bool) map[string]any {
	info := map[string]any{"name": mcpServerName, "version": Version}
	if !withIcons {
		return info
	}
	icons := []map[string]any{}
	if s.mcpIcon != "" {
		icons = append(icons, map[string]any{
			"src": s.mcpIcon, "mimeType": "image/svg+xml", "sizes": []string{"any"},
		})
	}
	if base := s.publicShareBase(r); base != "" {
		icons = append(icons, map[string]any{
			"src": base + "/icon-192.png", "mimeType": "image/png", "sizes": []string{"192x192"},
		})
	}
	if len(icons) > 0 {
		info["icons"] = icons
	}
	return info
}

// mcpRefusal is a protocol-level refusal of a modern request: an HTTP status
// beside the JSON-RPC error, because the revision has proxies route on both.
type mcpRefusal struct {
	status int
	code   int
	msg    string
	data   any
}

func (e *mcpRefusal) write(w http.ResponseWriter, id json.RawMessage) {
	rpcErrorStatus(w, e.status, id, e.code, e.msg, e.data)
}

// rpcErrorStatus is rpcError with an HTTP status and optional data. The legacy
// era always answers 200; only the modern one uses this.
func rpcErrorStatus(w http.ResponseWriter, status int, id json.RawMessage, code int, msg string, data any) {
	e := map[string]any{"code": code, "message": msg}
	if data != nil {
		e["data"] = data
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": id, "error": e})
}

// mcpModernRequest is what a modern request says about itself in _meta.
type mcpModernRequest struct {
	Version string
	// Capabilities is the client's capabilities object as sent. It is read
	// from every request and never remembered: the revision says a server
	// MUST NOT infer capabilities from earlier requests.
	Capabilities json.RawMessage
}

// mcpEra decides the era of one request (plan D1). It returns nil, nil for
// the legacy era: initialize, a notification, or a request without the
// per-request version in _meta, so clients that skip initialize today keep
// working. A modern request is checked in full here, before any tool runs:
// its headers against its body (plan D3), its version and the capabilities
// the revision requires it to send.
//
// The headers repeat what the body says, so a gateway can route and
// authorise on them without parsing JSON. A request whose headers say one
// thing and whose body another is refused, or the gateway's decision and
// nigari's would be about two different calls.
func mcpEra(r *http.Request, req rpcRequest) (*mcpModernRequest, *mcpRefusal) {
	if strings.HasPrefix(req.Method, "notifications/") {
		return nil, nil
	}
	var params struct {
		Meta   map[string]json.RawMessage `json:"_meta"`
		Name   string                     `json:"name"`
		URI    string                     `json:"uri"`
		TaskID string                     `json:"taskId"`
	}
	// Params that are not an object say nothing about the era; the method's
	// own handler refuses them as it always has.
	_ = json.Unmarshal(req.Params, &params)
	rawVersion, modern := params.Meta[mcpMetaProtocolVersion]
	if req.Method == "initialize" {
		modern = false
	}

	// required: a missing header is a mismatch too, because the revision
	// requires each of them on a modern request.
	mismatch := func(header, want string, required bool) *mcpRefusal {
		raw := r.Header.Get(header)
		if raw == "" && !required {
			return nil
		}
		got, ok := mcpHeaderValue(raw)
		if ok && got == want {
			return nil
		}
		return &mcpRefusal{http.StatusBadRequest, rpcHeaderMismatch,
			"the " + header + " header does not match the request body", nil}
	}
	routing := func(required bool) *mcpRefusal {
		if e := mismatch("Mcp-Method", req.Method, required); e != nil {
			return e
		}
		switch req.Method {
		case "tools/call", "prompts/get":
			return mismatch("Mcp-Name", params.Name, required)
		case "resources/read":
			return mismatch("Mcp-Name", params.URI, required)
		case "tasks/get", "tasks/update", "tasks/cancel":
			// The Tasks extension routes these on the task they name.
			return mismatch("Mcp-Name", params.TaskID, required)
		}
		return nil
	}

	if !modern {
		// A legacy client never sends Mcp-Method or Mcp-Name (they came with
		// 2026-07-28), so where they are present they are checked as well:
		// otherwise a call could pass a gateway's rule on "Mcp-Name: get_page"
		// by leaving _meta out and run another tool behind it (security
		// review, spec 027 phase 1). MCP-Protocol-Version is not compared:
		// legacy clients send it after initialize, with nothing in the body
		// to compare it with.
		return nil, routing(false)
	}

	var version string
	if err := json.Unmarshal(rawVersion, &version); err != nil || version == "" {
		return nil, &mcpRefusal{http.StatusBadRequest, rpcInvalidParams,
			"_meta " + mcpMetaProtocolVersion + " must be a version string", nil}
	}
	// The header first: a body and a header naming two versions disagree,
	// which is a mismatch whichever of them nigari happens to speak.
	if e := mismatch("MCP-Protocol-Version", version, true); e != nil {
		return nil, e
	}
	if version != mcpModernVersion {
		return nil, &mcpRefusal{http.StatusBadRequest, rpcUnsupportedProtocolVersion, "Unsupported protocol version",
			map[string]any{"supported": mcpSupportedVersions, "requested": version}}
	}
	if e := routing(true); e != nil {
		return nil, e
	}

	caps, ok := params.Meta[mcpMetaClientCapabilities]
	if !ok || len(caps) == 0 || caps[0] != '{' {
		return nil, &mcpRefusal{http.StatusBadRequest, rpcInvalidParams,
			"_meta " + mcpMetaClientCapabilities + " is required (an empty object if the client supports no optional capability)", nil}
	}
	return &mcpModernRequest{Version: version, Capabilities: caps}, nil
}

// mcpHeaderValue decodes a routing header. A value that is not plain ASCII
// travels as =?base64?<UTF-8 in Base64>?=, with the markers in lower case;
// it is decoded before it is compared with the body. ok is false for a
// missing header or a marked value that does not decode.
func mcpHeaderValue(v string) (string, bool) {
	if v == "" {
		return "", false
	}
	if strings.HasPrefix(v, mcpHeaderBase64Prefix) && strings.HasSuffix(v, mcpHeaderBase64Suffix) &&
		len(v) >= len(mcpHeaderBase64Prefix)+len(mcpHeaderBase64Suffix) {
		b, err := base64.StdEncoding.DecodeString(v[len(mcpHeaderBase64Prefix) : len(v)-len(mcpHeaderBase64Suffix)])
		if err != nil {
			return "", false
		}
		return string(b), true
	}
	return v, true
}

// rpcResultModern writes a 2026-07-28 result: resultType says what kind of
// result it is ("complete" for everything nigari answers in this phase), and
// _meta carries serverInfo, which the revision asks for on every answer now
// that no handshake delivers it once.
func (s *Server) rpcResultModern(w http.ResponseWriter, r *http.Request, id json.RawMessage, result map[string]any) {
	result["resultType"] = "complete"
	result["_meta"] = map[string]any{mcpMetaServerInfo: s.mcpServerInfo(r, false)}
	rpcResult(w, id, result)
}

// serveModernMCP answers one 2026-07-28 request. u is already authenticated
// and not deactivated; handleMCP did that for both eras.
//
// ping and logging/setLevel are not answered: the revision removed them, and
// a modern client never sends them (FR-006). initialize never arrives here.
func (s *Server) serveModernMCP(w http.ResponseWriter, r *http.Request, u *user, req rpcRequest, modern *mcpModernRequest) {
	switch req.Method {
	case "server/discover":
		// What initialize used to hand over once, asked for whenever the
		// client wants it, and cacheable (plan D4, D5). Capabilities name only
		// what is built: the skills extension is declared by the phase that
		// implements it, not before.
		info := s.mcpServerInfo(r, true)
		// The PNG icon's address comes from the Host header when no public
		// address is configured. A shared cache that keys on the path alone
		// would then hand one caller's Host to everyone (a logo, and a
		// beacon, from wherever that caller named): such an answer is only
		// for its own credential (security review, spec 027 phase 1).
		scope := "public"
		if s.publicShareBaseFromHost(r) {
			scope = "private"
		}
		rpcResult(w, req.ID, map[string]any{
			"resultType":        "complete",
			"supportedVersions": mcpSupportedVersions,
			"capabilities": map[string]any{
				"tools":      map[string]any{},
				"extensions": map[string]any{mcpTasksExtension: map[string]any{}},
			},
			"instructions": mcpInstructions,
			"ttlMs":        mcpListTTLms,
			"cacheScope":   scope,
			"_meta":        map[string]any{mcpMetaServerInfo: info},
		})
	case "tools/list":
		// One static list in a fixed order (the slice's), the same for every
		// credential: a read token is refused per call, not shown fewer tools.
		// That is what lets a shared cache keep it (cacheScope public). A
		// change that makes the list depend on the caller has to make this
		// private in the same change.
		s.rpcResultModern(w, r, req.ID, map[string]any{
			"tools":      mcpTools,
			"ttlMs":      mcpListTTLms,
			"cacheScope": "public",
		})
	case "tools/call":
		result, bad, callErr := s.mcpToolsCall(r, u, req.Params, mcpAskFrom(modern, req.Params))
		if bad != "" {
			rpcErrorStatus(w, http.StatusBadRequest, req.ID, rpcInvalidParams, bad, nil)
			return
		}
		// A read-only credential calling a write tool is told so at the HTTP
		// level (plan D10, MCP 2026-07-28 authorization): 403 with the scope
		// it lacks, so the client can ask the person for more (step-up)
		// instead of showing an agent a dead end. The decision is mcpCall's
		// own read-only gate, mapped from its typed error, not a second copy.
		// The legacy era keeps the isError result: its clients do not expect
		// a 403 in the middle of a session.
		var scopeErr errReadOnlyToken
		if errors.As(callErr, &scopeErr) {
			s.insufficientScope(w, r, scopeErr.Error())
			return
		}
		// The person has to be asked first (spec 027 US2): an input_required
		// result, not an error, and nothing has changed.
		var askErr errInputRequired
		if errors.As(callErr, &askErr) {
			out := askErr.result()
			out["_meta"] = map[string]any{mcpMetaServerInfo: s.mcpServerInfo(r, false)}
			rpcResult(w, req.ID, out)
			return
		}
		// A client that declared the Tasks extension gets import_url as a
		// task (spec 027, US3). The import ran through mcpCall like any call,
		// gates, audit and idempotency included; only the answer differs.
		if callErr == nil && mcpDeclaresExtension(modern, mcpTasksExtension) && mcpCallName(req.Params) == "import_url" {
			if text, ok := mcpResultText(result); ok {
				if task, ok := s.importTaskResult(u, text); ok {
					task["_meta"] = map[string]any{mcpMetaServerInfo: s.mcpServerInfo(r, false)}
					rpcResult(w, req.ID, task)
					return
				}
			}
		}
		s.rpcResultModern(w, r, req.ID, result)
	case "tasks/get", "tasks/update", "tasks/cancel":
		s.serveTaskMethod(w, r, u, req, modern)
	default:
		rpcErrorStatus(w, http.StatusNotFound, req.ID, rpcMethodNotFound, "method not found: "+req.Method, nil)
	}
}

// mcpToolsCall runs tools/call for either era and returns its result, or the
// reason its params are unreadable. Rate limit, then mcpCall with its gates;
// a refusal is an isError result in both eras, as before (plan D2). callErr
// is mcpCall's refusal itself, for the one the modern era answers at the HTTP
// level (errReadOnlyToken).
func (s *Server) mcpToolsCall(r *http.Request, u *user, raw json.RawMessage, ask *mcpAsk) (result map[string]any, bad string, callErr error) {
	var params struct {
		Name      string          `json:"name"`
		Arguments json.RawMessage `json:"arguments"`
	}
	if err := json.Unmarshal(raw, &params); err != nil {
		return nil, "invalid params", nil
	}
	// Stop a runaway agent from hammering the sync layer.
	if !s.mcpRate.allow(u.ID) {
		return textResult("rate limit exceeded: too many requests, slow down", true), "", nil
	}
	out, err := s.mcpCallAsk(u, params.Name, params.Arguments, s.publicShareBase(r), ask)
	if err != nil {
		return textResult(err.Error(), true), "", err
	}
	return textResult(out, false), "", nil
}

// insufficientScope answers a read-only credential's write with 403 and the
// scope it lacks, so the client can ask the person for more (step-up).
func (s *Server) insufficientScope(w http.ResponseWriter, r *http.Request, msg string) {
	w.Header().Set("WWW-Authenticate", `Bearer error="insufficient_scope", scope="write", `+
		`resource_metadata="`+s.publicBase(r)+`/.well-known/oauth-protected-resource", `+
		// A fixed sentence: the tool name is quoted in the error's text, and
		// a quote inside a quoted header value ends it.
		`error_description="this credential is read-only; the tool needs the write scope"`)
	httpError(w, http.StatusForbidden, msg)
}

// errReadOnlyToken is mcpCall's refusal of a write tool to a read-only
// credential. Its text is the sentence both eras showed before spec 027's
// phase 2; the modern era also maps it to HTTP 403 insufficient_scope.
type errReadOnlyToken struct{ tool string }

func (e errReadOnlyToken) Error() string {
	return fmt.Sprintf("this API token is read-only; %q requires a write token", e.tool)
}

// publicShareBaseFromHost reports whether publicShareBase fell through to the
// request's own Host header: no public address, HTTPS domain or tunnel is
// configured. A configured address that equals the Host also counts, which
// only makes an answer private that could have been public.
func (s *Server) publicShareBaseFromHost(r *http.Request) bool {
	proto := "http"
	if isHTTPS(r) {
		proto = "https"
	}
	return s.publicShareBase(r) == proto+"://"+r.Host
}
