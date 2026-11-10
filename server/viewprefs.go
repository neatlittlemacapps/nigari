package server

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
)

// A person's own changes to a view (spec 013, US1): a filter or sort someone
// sets for a quick look is theirs alone, kept on their account so it follows
// them to every device, until they reset it or save it for everyone. Before
// this, one person narrowing "Open tasks" to their own narrowed it for the
// whole team (#279).
//
// One row of view_prefs per person, database and scope. A scope is a view id
// for a database's own view, or embed:<pageId>:<blockId>:<viewId> for a
// database shown in a document, where the filters belong to that embed.
//
// The rules that keep it one person's:
//   - every route is session-only: an agent has no personal state, and an
//     agent's view change is always for everyone (not_available_via_mcp);
//   - every query names the caller's user id, taken from the session and
//     never from the request, so nobody can read or write another's rows;
//   - nothing here is audited or announced to other browsers: a personal
//     change is not an event of the database (FR-006).

// maxViewStateBytes bounds one stored state. A state is a handful of filter
// conditions; 32 KB is far above any real one and keeps a row from becoming a
// place to park data.
const maxViewStateBytes = 32 << 10

// maxViewStatesPerDatabase bounds one person's rows for one database. Views
// are few, but an embed scope carries a block id the server does not check
// against the document, so without a bound a script could add rows forever.
const maxViewStatesPerDatabase = 200

const embedScopePrefix = "embed:"

// errNoSuchScope is the refusal for a scope that names no view of the
// database, or an embed in a page the caller cannot read. REST answers 404,
// the same as for a database the caller cannot read: which pages hold an
// embed is not told to someone who cannot open them.
var errNoSuchScope = errors.New("no such view")

// scopeViewID is the view a scope belongs to: the scope itself, or the last
// part of an embed scope. ok is false for a scope of neither shape.
func scopeViewID(scope string) (viewID, pageID string, ok bool) {
	if !strings.HasPrefix(scope, embedScopePrefix) {
		if scope == "" || strings.Contains(scope, ":") {
			return "", "", false
		}
		return scope, "", true
	}
	parts := strings.Split(scope[len(embedScopePrefix):], ":")
	if len(parts) != 3 || parts[0] == "" || parts[1] == "" || parts[2] == "" || len(parts[1]) > 64 {
		return "", "", false
	}
	return parts[2], parts[0], true
}

// checkViewScope answers the view a scope names, if the scope is one of this
// database for this caller: the view exists, and for an embed the caller can
// read the page that holds it.
func (s *Server) checkViewScope(r *http.Request, views []map[string]any, scope string) (map[string]any, error) {
	viewID, pageID, ok := scopeViewID(scope)
	if !ok {
		return nil, errNoSuchScope
	}
	if pageID != "" && !s.canReadReq(r, pageID) {
		return nil, errNoSuchScope
	}
	for _, v := range views {
		if id, _ := v["id"].(string); id == viewID {
			return v, nil
		}
	}
	return nil, errNoSuchScope
}

// viewerOf is the person behind a request that makes a row in a view, and
// the scope they named. A token is nobody in particular: an agent has no
// personal state, over REST as over MCP. An embed scope in a page the caller
// cannot read is dropped to the page's own (they could not have been looking
// at it there).
func (s *Server) viewerOf(r *http.Request, scope string) viewer {
	u := requestUser(r)
	if u == nil || u.TokenScope != "" {
		return viewer{}
	}
	if scope != "" {
		if _, pageID, ok := scopeViewID(scope); !ok || pageID == "" || !s.canReadReq(r, pageID) {
			scope = ""
		}
	}
	return viewer{userID: u.ID, scope: scope}
}

// cleanViewState checks a state a browser sent and returns it as stored, or
// nil for a state with nothing in it (which deletes the row).
//
// A key that is present means something even when empty: "filters": [] is a
// person who removed the view's filters for themselves, and "sort": null one
// who removed its sort. So presence is kept, and only an absent key falls
// back to the shared view (mergeViewState).
//
// Conditions and picks naming a property the database no longer has are
// dropped rather than refused: a property deleted by a colleague must not
// make a person's next filter click fail. An unknown operator is refused,
// like a view's (checkViewFilter): that is a broken caller, not a stale one.
func cleanViewState(raw []byte, schema []map[string]any) (map[string]any, error) {
	var in map[string]json.RawMessage
	if err := json.Unmarshal(raw, &in); err != nil || in == nil {
		return nil, errors.New("the state must be a JSON object")
	}
	has := func(id string) bool {
		for _, p := range schema {
			if pid, _ := p["id"].(string); pid == id {
				return true
			}
		}
		return false
	}
	out := map[string]any{}
	if rawFilters, ok := in["filters"]; ok {
		var list []map[string]any
		if err := json.Unmarshal(rawFilters, &list); err != nil {
			return nil, errors.New("filters must be a list of conditions")
		}
		kept := []any{}
		dates := dateProps(schema)
		for _, f := range list {
			prop, _ := f["property"].(string)
			if prop == "" || !has(prop) {
				continue
			}
			entry, err := checkViewFilter(f, "filter", has)
			if err != nil {
				return nil, err
			}
			// The same day check a shared view's filter gets (applyViewSpec):
			// a day the server cannot read would pin nothing on a new row and
			// match nothing in the rows query (code review).
			if dates[prop] {
				if v, bad := viewFilterRow(entry).unreadableDay(); bad {
					return nil, notADay(prop, v)
				}
			}
			kept = append(kept, entry)
		}
		out["filters"] = kept
	}
	if rawSort, ok := in["sort"]; ok {
		var sort *struct {
			Property string `json:"property"`
			Dir      string `json:"dir"`
		}
		if err := json.Unmarshal(rawSort, &sort); err != nil {
			return nil, errors.New("sort must be {property, dir} or null")
		}
		switch {
		case sort == nil:
			out["sort"] = nil
		case sort.Dir != "asc" && sort.Dir != "desc":
			return nil, errors.New("sort dir must be asc or desc")
		case has(sort.Property):
			out["sort"] = map[string]any{"property": sort.Property, "dir": sort.Dir}
		}
		// A sort by a property that is gone is dropped: the shared sort shows.
	}
	if rawPicks, ok := in["quickPicks"]; ok {
		var picks map[string]string
		if err := json.Unmarshal(rawPicks, &picks); err != nil {
			return nil, errors.New("quickPicks must map a property to a value")
		}
		kept := map[string]any{}
		for prop, v := range picks {
			if v != "" && has(prop) {
				kept[prop] = v
			}
		}
		if len(kept) > 0 {
			out["quickPicks"] = kept
		}
	}
	if rawLanes, ok := in["foldedLanes"]; ok {
		var lanes []string
		if err := json.Unmarshal(rawLanes, &lanes); err != nil {
			return nil, errors.New("foldedLanes must be a list")
		}
		if len(lanes) > 0 {
			out["foldedLanes"] = lanes
		}
	}
	if len(out) == 0 {
		return nil, nil
	}
	return out, nil
}

// viewStateOf reads one person's state for one scope, or nil when there is
// none. One row by primary key.
func (s *Server) viewStateOf(userID, colID, scope string) map[string]json.RawMessage {
	if userID == "" || scope == "" {
		return nil
	}
	var raw string
	if err := s.db.QueryRow(`SELECT state FROM view_prefs WHERE user_id = ? AND collection_id = ? AND scope = ?`,
		userID, colID, scope).Scan(&raw); err != nil {
		return nil
	}
	var state map[string]json.RawMessage
	if json.Unmarshal([]byte(raw), &state) != nil {
		return nil
	}
	return state
}

// mergeViewState is the filters and sort a person sees in a view: their own
// where they have set them, the view's otherwise (research R5).
//
//   - personal filters replace the shared ones (the person edited them from
//     the shared ones, so theirs is the whole list, not an addition);
//   - a quick filter pick adds an "is" condition, for a property the view
//     offers as a quick filter;
//   - a personal sort replaces the shared sort, and a personal "no sort"
//     removes it.
//
// The browser does the same in web/src/viewState.ts for what it draws; this
// is for the row a person makes in the view, which the server fills in from
// the filters they see (FR-005). Both are held to one fixture
// (server/testdata/viewstate.json): check-viewstate.mjs and
// TestMergeViewStateMatchesTheBrowser.
func mergeViewState(view map[string]any, personal map[string]json.RawMessage) (filters []any, sort any) {
	filters, _ = view["filters"].([]any)
	sort = view["sort"]
	if raw, ok := personal["filters"]; ok {
		var own []any
		if json.Unmarshal(raw, &own) == nil {
			filters = own
		}
	}
	if raw, ok := personal["sort"]; ok {
		var own any
		if json.Unmarshal(raw, &own) == nil {
			sort = own
		}
	}
	if raw, ok := personal["quickPicks"]; ok {
		var picks map[string]string
		if json.Unmarshal(raw, &picks) == nil {
			// In the view's own order of quick filters, so the list is the
			// same every time (a map has no order).
			offered, _ := view["quickFilters"].([]any)
			merged := append([]any{}, filters...)
			for _, q := range offered {
				prop, _ := q.(string)
				if v := picks[prop]; prop != "" && v != "" {
					merged = append(merged, map[string]any{"property": prop, "op": "is", "value": v})
				}
			}
			filters = merged
		}
	}
	if filters == nil {
		filters = []any{}
	}
	return filters, sort
}

// forgetViewStatesOfMissingViews removes every person's state for a view
// that is no longer among the database's views. Called after each views save
// (REST and MCP): a deleted view's filters must not come back on a new view
// that happens to get the same id. Uses the index on collection_id.
func (s *Server) forgetViewStatesOfMissingViews(colID string, views []map[string]any) {
	keep := map[string]bool{}
	for _, v := range views {
		if id, _ := v["id"].(string); id != "" {
			keep[id] = true
		}
	}
	rows, err := s.db.Query(`SELECT DISTINCT scope FROM view_prefs WHERE collection_id = ?`, colID)
	if err != nil {
		return
	}
	var gone []string
	for rows.Next() {
		var scope string
		if rows.Scan(&scope) != nil {
			continue
		}
		if viewID, _, ok := scopeViewID(scope); !ok || !keep[viewID] {
			gone = append(gone, scope)
		}
	}
	rows.Close()
	for _, scope := range gone {
		s.db.Exec(`DELETE FROM view_prefs WHERE collection_id = ? AND scope = ?`, colID, scope)
	}
}

// handleGetViewStates answers the caller's own states for one database, all
// scopes at once: the browser asks once when a database opens.
func (s *Server) handleGetViewStates(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !s.canReadReq(r, id) {
		httpError(w, 404, "not a collection")
		return
	}
	rows, err := s.db.Query(`SELECT scope, state FROM view_prefs WHERE user_id = ? AND collection_id = ?`,
		requestUser(r).ID, id)
	if err != nil {
		httpError(w, 500, err.Error())
		return
	}
	defer rows.Close()
	states := map[string]json.RawMessage{}
	for rows.Next() {
		var scope, state string
		if rows.Scan(&scope, &state) == nil && json.Valid([]byte(state)) {
			states[scope] = json.RawMessage(state)
		}
	}
	writeJSON(w, map[string]any{"states": states})
}

// handlePutViewState stores the caller's state for one scope, whole. The
// merge rule lives in one place (mergeViewState and its browser twin), so
// there is no patch format to keep in step with it.
func (s *Server) handlePutViewState(w http.ResponseWriter, r *http.Request) {
	id, scope := r.PathValue("id"), r.PathValue("scope")
	if !s.canReadReq(r, id) {
		httpError(w, 404, "not a collection")
		return
	}
	schema, views, err := s.loadCollection(id)
	if err != nil {
		httpError(w, 404, "not a collection")
		return
	}
	if _, err := s.checkViewScope(r, views, scope); err != nil {
		httpError(w, 404, err.Error())
		return
	}
	raw, err := io.ReadAll(io.LimitReader(r.Body, maxViewStateBytes+1))
	if err != nil || len(raw) > maxViewStateBytes {
		httpError(w, 413, "the state is too large")
		return
	}
	state, err := cleanViewState(raw, schema)
	if err != nil {
		httpError(w, 400, err.Error())
		return
	}
	u := requestUser(r)
	if state == nil {
		// Nothing left to keep is the same as a reset.
		if _, err := s.db.Exec(`DELETE FROM view_prefs WHERE user_id = ? AND collection_id = ? AND scope = ?`, u.ID, id, scope); err != nil {
			httpError(w, 500, err.Error())
			return
		}
		writeJSON(w, map[string]any{})
		return
	}
	stored, _ := json.Marshal(state)
	// The cap and the write in one statement, so two tabs adding a new scope
	// at once cannot both pass a count read before either writes (code
	// review). An update of a scope the person already has always passes.
	res, err := s.db.Exec(`INSERT INTO view_prefs (user_id, collection_id, scope, state, updated_at)
		SELECT ?, ?, ?, ?, ?
		WHERE (SELECT COUNT(*) FROM view_prefs WHERE user_id = ? AND collection_id = ?) < ?
		   OR EXISTS (SELECT 1 FROM view_prefs WHERE user_id = ? AND collection_id = ? AND scope = ?)
		ON CONFLICT (user_id, collection_id, scope) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`,
		u.ID, id, scope, string(stored), now(),
		u.ID, id, maxViewStatesPerDatabase,
		u.ID, id, scope)
	if err != nil {
		httpError(w, 500, err.Error())
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		httpError(w, 400, "too many personal view states for this database; reset some first")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(stored)
}

// handleDeleteViewState is Reset: the caller's state for one scope goes, and
// they see the shared view again. Deleting what is not there is not an error.
func (s *Server) handleDeleteViewState(w http.ResponseWriter, r *http.Request) {
	id, scope := r.PathValue("id"), r.PathValue("scope")
	if !s.canReadReq(r, id) {
		httpError(w, 404, "not a collection")
		return
	}
	if _, _, ok := scopeViewID(scope); !ok {
		httpError(w, 404, errNoSuchScope.Error())
		return
	}
	if _, err := s.db.Exec(`DELETE FROM view_prefs WHERE user_id = ? AND collection_id = ? AND scope = ?`,
		requestUser(r).ID, id, scope); err != nil {
		httpError(w, 500, err.Error())
		return
	}
	writeJSON(w, map[string]any{"ok": true})
}
