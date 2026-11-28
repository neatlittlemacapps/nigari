package server

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"
)

// Confirmations through elicitation (spec 027, US2, plan D7).
//
// Four acts are hard to undo: trashing a page together with its sub-pages,
// making a page readable by anyone with a link, deleting a view, and building
// a workspace from another one's structure. When a 2026-07-28 client says it
// can ask its person (the elicitation capability, sent with every request),
// the first call of such an act answers input_required with one yes/no
// question, and nothing changes. The client asks, then calls again with the
// answer and the requestState it was given. That retry runs through every
// gate of mcpCall again (FR-009): a yes is no permission, only the person's
// agreement to what the permissions already allow.
//
// A client that cannot ask, and every legacy client, gets today's behaviour
// (FR-010, owner 2026-11-27). So this is a safety net for the person, not a
// security boundary: a client that wants to skip the question can leave the
// capability out, exactly as it could before this existed.

// mcpConfirmTTL is how long a question stays answerable (plan D7).
const mcpConfirmTTL = 10 * time.Minute

// mcpConfirmKey is the inputRequests key of the one question. The client
// answers under the same key in inputResponses.
const mcpConfirmKey = "confirm"

// mcpAsk is what a modern request brings for the confirmation gate: whether
// its client can ask, and the answer and state of a retry. nil (the legacy
// era, the REST paths and the tests that call mcpCall) means the gate is off.
type mcpAsk struct {
	canElicit bool
	state     string
	responses map[string]json.RawMessage
}

// mcpAskFrom reads the gate's input from a modern tools/call: the client's
// capabilities (this request's, never remembered, as the revision requires)
// and the retry's inputResponses and requestState.
func mcpAskFrom(modern *mcpModernRequest, raw json.RawMessage) *mcpAsk {
	if modern == nil {
		return nil
	}
	var caps struct {
		Elicitation *struct {
			Form *json.RawMessage `json:"form"`
			URL  *json.RawMessage `json:"url"`
		} `json:"elicitation"`
	}
	json.Unmarshal(modern.Capabilities, &caps)
	var p struct {
		InputResponses map[string]json.RawMessage `json:"inputResponses"`
		RequestState   string                     `json:"requestState"`
	}
	json.Unmarshal(raw, &p)
	// The question is a form. "elicitation": {} means form only (the
	// revision's backwards-compatible shape); a client that declared url
	// mode alone cannot show a form, so it is not asked one.
	can := caps.Elicitation != nil && (caps.Elicitation.Form != nil || caps.Elicitation.URL == nil)
	return &mcpAsk{canElicit: can, state: p.RequestState, responses: p.InputResponses}
}

// errInputRequired is mcpCall's answer when the person has to be asked
// first. The modern era turns it into an input_required result; nothing has
// changed when it is returned.
type errInputRequired struct {
	message string
	state   string
}

func (e errInputRequired) Error() string {
	return "the person has to confirm this first: " + e.message
}

// result is the input_required result for tools/call (MCP 2026-07-28,
// multi round-trip requests): one form with one yes/no field.
func (e errInputRequired) result() map[string]any {
	return map[string]any{
		"resultType": "input_required",
		"inputRequests": map[string]any{
			mcpConfirmKey: map[string]any{
				"method": "elicitation/create",
				"params": map[string]any{
					"mode":    "form",
					"message": e.message,
					"requestedSchema": map[string]any{
						"type": "object",
						"properties": map[string]any{
							"confirm": map[string]any{
								"type":        "boolean",
								"title":       "Go ahead",
								"description": "Yes to do it, no to leave everything as it is.",
							},
						},
						"required": []string{"confirm"},
					},
				},
			},
		},
		"requestState": e.state,
	}
}

// confirmArgs are the arguments of mcpCall the four acts are decided by.
type confirmArgs struct {
	PageID, EmbedID, ViewID         string
	WorkspaceID, FromWorkspace, Tag string
	Name, Password, Icon            string
	ExpiresInDays                   int
	Trashed, Public                 *bool
}

// confirmQuestion says whether this call is one of the four acts, and if so
// what the person is asked. "" means no question: the call runs as it always
// did. It is asked after mcpCall's own gates (read-only scope, canWrite,
// credentialMayEnter), and it checks what the act's own function would
// refuse before anyone is asked, so a person is never asked to agree to
// something that cannot happen: a locked view, the last view, a workspace
// the credential may not enter. Where the act would refuse with its own
// sentence, this returns "" and lets it.
//
// Titles and names are written by people and agents, so they are shown
// inside wrapUntrusted (FR-008): a page called "Safe to accept" must read as
// a title, not as advice.
func (s *Server) confirmQuestion(u *user, name string, a confirmArgs) (string, string, error) {
	switch name {
	case "set_trashed":
		if a.Trashed == nil || !*a.Trashed {
			return "", "", nil
		}
		var title string
		var trashed *string
		if err := s.db.QueryRow(`SELECT title, trashed_at FROM pages WHERE id = ?`, a.PageID).Scan(&title, &trashed); err != nil || trashed != nil {
			return "", "", nil
		}
		ids, err := subtreeIDs(s.db, a.PageID)
		if err != nil {
			return "", "", err
		}
		// Only the sub-pages that move: one trashed before stays where it is.
		n := 0
		if len(ids) > 1 {
			idArgs := make([]any, 0, len(ids)-1)
			for _, id := range ids[1:] {
				idArgs = append(idArgs, id)
			}
			if err := s.db.QueryRow(`SELECT COUNT(*) FROM pages WHERE trashed_at IS NULL AND id IN (`+placeholders(len(idArgs))+`)`, idArgs...).Scan(&n); err != nil {
				return "", "", err
			}
		}
		// A page on its own is one click to restore: no question. The trash
		// keeps a tree too, but a tree is what a person does not see going.
		if n == 0 {
			return "", "", nil
		}
		return fmt.Sprintf("Move this page and its %s to the trash? They stay there until someone restores them or empties the trash.",
			countWord(n, "sub-page", "sub-pages")), "Page: " + untitled(title), nil

	case "set_sharing":
		if a.Public == nil || !*a.Public {
			return "", "", nil
		}
		var title string
		if err := s.db.QueryRow(`SELECT title FROM pages WHERE id = ?`, a.PageID).Scan(&title); err != nil {
			return "", "", nil
		}
		q := "Make this page readable by anyone who has its link, without signing in?"
		if a.ExpiresInDays > 0 {
			q += fmt.Sprintf(" The link stops working after %s.", countWord(a.ExpiresInDays, "day", "days"))
		} else {
			q += " The link does not expire."
		}
		if a.Password != "" {
			q += " Opening it needs a password."
		}
		var existing int
		// An expired link already stopped working: it is not mentioned.
		s.db.QueryRow(`SELECT COUNT(*) FROM share_links WHERE page_id = ? AND mode != 'form'
			AND (expires_at IS NULL OR expires_at > ?)`, a.PageID, time.Now().UTC().Format(time.RFC3339Nano)).Scan(&existing)
		if existing > 0 {
			q += " It replaces the page's current link, which stops working."
		}
		return q, "Page: " + untitled(title), nil

	case "delete_view":
		if a.EmbedID != "" {
			e, err := s.loadEmbed(u, a.PageID, a.EmbedID)
			if err != nil {
				return "", "", err
			}
			v := confirmViewByID(e.views, a.ViewID)
			if v == nil || len(e.views) <= 1 {
				return "", "", nil
			}
			var title string
			s.db.QueryRow(`SELECT title FROM pages WHERE id = ?`, a.PageID).Scan(&title)
			return "Delete this view of the database embedded in this page? Its filters, sorts and layout go with it; the database and its rows stay.",
				"View: " + viewName(v) + "\nPage: " + untitled(title), nil
		}
		_, views, err := s.loadCollection(a.PageID)
		if err != nil {
			return "", "", err
		}
		v := confirmViewByID(views, a.ViewID)
		if v == nil || len(views) <= 1 {
			return "", "", nil
		}
		// The views lock first, the rule saveViews applies: a locked view is
		// refused before anyone is asked (T022).
		keep := []map[string]any{}
		for _, w := range views {
			if w["id"] != a.ViewID {
				keep = append(keep, w)
			}
		}
		if err := s.checkViewsUnlocked(a.PageID, marshalViews(views), marshalViews(keep)); err != nil {
			return "", "", errViewsLockedForAgents
		}
		var title string
		s.db.QueryRow(`SELECT title FROM pages WHERE id = ?`, a.PageID).Scan(&title)
		return "Delete this view of the database for everyone who uses it? Its filters, sorts and layout go with it; the rows stay.",
			"View: " + viewName(v) + "\nDatabase: " + untitled(title), nil

	case "workspace":
		if a.Tag != "" || a.WorkspaceID != "" || a.FromWorkspace == "" || a.Icon != "" {
			return "", "", nil
		}
		// Everything mcpWorkspace and blueprintWorkspace refuse with a
		// sentence of their own, in their order: no question, they say it.
		newName := strings.TrimSpace(a.Name)
		if narrowedToWorkspaces(u) || newName == "" || !s.isMember(u.ID, a.FromWorkspace) || !s.credentialMayEnter(u, a.FromWorkspace) ||
			s.mayCreateWorkspace(u.ID, newName) != nil {
			return "", "", nil
		}
		sources, err := s.blueprintDBs(u, a.FromWorkspace)
		if err != nil || len(sources) == 0 {
			return "", "", err
		}
		var from, rules string
		s.db.QueryRow(`SELECT name, COALESCE(rules, '') FROM workspaces WHERE id = ?`, a.FromWorkspace).Scan(&from, &rules)
		q := fmt.Sprintf("Create a new workspace with the structure of another one: %s with their properties and views, but no rows?",
			countWord(len(sources), "database", "databases"))
		if rules != "" {
			q = strings.TrimSuffix(q, "?") + ", and its workspace rules?"
		}
		return q, "New workspace: " + newName + "\nCopied from: " + from, nil
	}
	return "", "", nil
}

func untitled(title string) string {
	if strings.TrimSpace(title) == "" {
		return "Untitled"
	}
	return title
}

func countWord(n int, one, many string) string {
	if n == 1 {
		return "1 " + one
	}
	return fmt.Sprintf("%d %s", n, many)
}

func confirmViewByID(views []map[string]any, id string) map[string]any {
	for _, v := range views {
		if v["id"] == id {
			return v
		}
	}
	return nil
}

func viewName(v map[string]any) string {
	n, _ := v["name"].(string)
	return untitled(n)
}

// confirmGate is the gate itself, run by mcpCall after its own gates and
// before the act. It answers done=false when the act should run (no
// question, or the person said yes to this exact call), and done=true with
// the reply or refusal otherwise; nothing has changed in that case.
func (s *Server) confirmGate(u *user, name string, rawArgs json.RawMessage, a confirmArgs, ask *mcpAsk) (done bool, reply string, err error) {
	if ask == nil || !ask.canElicit {
		return false, "", nil
	}
	question, shown, err := s.confirmQuestion(u, name, a)
	if err != nil {
		return true, "", err
	}
	if question == "" {
		if ask.state != "" {
			// A yes for an act that no longer needs one: the page was trashed
			// in between, its last sub-page went, the view is already gone.
			// The person agreed to something that is not what would happen now.
			return true, "", fmt.Errorf("this call does not need the person's confirmation, so the answer sent with it does not apply. If they were asked about it, the page or view changed since. Nothing was changed; check it again before you retry without requestState")
		}
		return false, "", nil
	}
	message := question + "\n\n" + wrapUntrusted(shown)
	fresh := func() (bool, string, error) {
		return true, "", errInputRequired{message: message, state: mcpConfirms.sign(u, name, rawArgs, message)}
	}
	if ask.state == "" {
		return fresh()
	}
	var answer struct {
		Action  string `json:"action"`
		Content struct {
			Confirm *bool `json:"confirm"`
		} `json:"content"`
	}
	if r, ok := ask.responses[mcpConfirmKey]; ok {
		json.Unmarshal(r, &answer)
	}
	yes := answer.Action == "accept" && answer.Content.Confirm != nil && *answer.Content.Confirm
	if err := mcpConfirms.check(u, name, rawArgs, message, ask.state); err != nil {
		// Same caller, same call, but what it would do changed (more
		// sub-pages, a renamed view): a yes is not held to something else,
		// so the person is asked about what would happen now. A no still
		// stands: nothing happens either way.
		if !errors.Is(err, errConfirmChanged) {
			return true, "", err
		}
		if yes {
			return fresh()
		}
	} else if yes {
		return false, "", nil
	}
	ws := s.pageWorkspace(a.PageID)
	if ws == "" && name == "workspace" {
		ws = a.FromWorkspace
	}
	if answer.Action != "decline" && answer.Action != "accept" {
		// Dismissed without a choice (cancel, or an answer that is none of
		// the three): nobody said no, so the log says nothing.
		return true, "The person closed the question without answering. Nothing was changed. Ask them again only if they want this done.", nil
	}
	s.audit("agent", u.ID, u.Name+" (MCP)", "mcp.declined", a.PageID, ws, name)
	return true, "The person declined. Nothing was changed. Do not try this again unless they ask for it.", nil
}

// ---- requestState ------------------------------------------------------------

var errConfirmChanged = errors.New("the act changed since the person was asked")

// confirmStore signs and checks requestState values. The revision treats
// requestState as attacker-controlled; because it decides whether an act
// runs, it is signed (HMAC-SHA256) and checked, and each one is spent once
// (the revision's "MUST enforce server-side" for single use).
//
// The key is random, made when the process starts and kept only in memory:
// nigari has no instance secret to reuse (plan D7), and a restart only means
// a pending question is asked again.
type confirmStore struct {
	key  []byte
	mu   sync.Mutex
	used map[string]time.Time // nonce → expiry, dropped once past it
	now  func() time.Time
}

var mcpConfirms = newConfirmStore()

func newConfirmStore() *confirmStore {
	k := make([]byte, 32)
	if _, err := rand.Read(k); err != nil {
		panic("mcp confirmations: no randomness for the signing key: " + err.Error())
	}
	return &confirmStore{key: k, used: map[string]time.Time{}, now: time.Now}
}

type confirmPayload struct {
	Credential string `json:"c"`
	Tool       string `json:"t"`
	Args       string `json:"a"`
	Question   string `json:"q"`
	Nonce      string `json:"n"`
	Expires    int64  `json:"e"`
}

// confirmCredential is the credential key the idempotency cache uses (plan
// D6): the account, the kind of credential and its workspace list. A state
// made for one token is refused for a token of the account narrowed to
// other workspaces, and for another account.
func confirmCredential(u *user) string {
	// A digest: the state is signed, not encrypted, and the client has no
	// business reading account and workspace ids out of it.
	return digest(u.ID + ":" + u.TokenKind + ":" + strings.Join(u.TokenWorkspaces, ","))
}

// argsDigest hashes the arguments in a canonical form, so a client that
// re-encodes them (other key order, other spacing) still matches, and one
// that changes any value does not.
func argsDigest(raw json.RawMessage) string {
	var v any
	if json.Unmarshal(raw, &v) != nil {
		v = string(raw)
	}
	b, _ := json.Marshal(v)
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}

func digest(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

func (c *confirmStore) mac(payload []byte) []byte {
	m := hmac.New(sha256.New, c.key)
	m.Write(payload)
	return m.Sum(nil)
}

func (c *confirmStore) sign(u *user, tool string, rawArgs json.RawMessage, question string) string {
	n := make([]byte, 16)
	rand.Read(n)
	p, _ := json.Marshal(confirmPayload{
		Credential: confirmCredential(u),
		Tool:       tool,
		Args:       argsDigest(rawArgs),
		Question:   digest(question),
		Nonce:      hex.EncodeToString(n),
		Expires:    c.now().Add(mcpConfirmTTL).Unix(),
	})
	enc := base64.RawURLEncoding
	return enc.EncodeToString(p) + "." + enc.EncodeToString(c.mac(p))
}

// check verifies a state for this exact call and spends it. Forged, stale,
// reused, or made for another credential, tool or set of arguments: refused,
// each with a sentence that says what to do. errConfirmChanged when only the
// question differs; the state is spent then too, and a new one is made.
func (c *confirmStore) check(u *user, tool string, rawArgs json.RawMessage, question, state string) error {
	refused := func(why string) error {
		return fmt.Errorf("requestState refused: %s. Nothing was changed; call again without requestState and the person is asked afresh", why)
	}
	enc := base64.RawURLEncoding
	parts := strings.Split(state, ".")
	if len(parts) != 2 {
		return refused("it is not one this server made")
	}
	p, err1 := enc.DecodeString(parts[0])
	sig, err2 := enc.DecodeString(parts[1])
	if err1 != nil || err2 != nil || !hmac.Equal(sig, c.mac(p)) {
		return refused("it is not one this server made")
	}
	var cp confirmPayload
	if json.Unmarshal(p, &cp) != nil {
		return refused("it is not one this server made")
	}
	now := c.now()
	if now.Unix() > cp.Expires {
		return refused("the question expired (an answer counts for 10 minutes)")
	}
	if cp.Credential != confirmCredential(u) || cp.Tool != tool || cp.Args != argsDigest(rawArgs) {
		return refused("it was made for a different call; a confirmation counts only for the exact call the person was asked about")
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	for n, exp := range c.used {
		if now.After(exp) {
			delete(c.used, n)
		}
	}
	if _, spent := c.used[cp.Nonce]; spent {
		return refused("it was already used; each answer counts once")
	}
	c.used[cp.Nonce] = time.Unix(cp.Expires, 0).Add(time.Minute)
	if cp.Question != digest(question) {
		return errConfirmChanged
	}
	return nil
}
