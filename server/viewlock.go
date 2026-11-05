package server

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
)

// The views lock (spec 013, US2, research R3). A database's views can be
// locked so nobody changes them by accident: while locked, every change to
// the views list (add, delete, rename, reorder, filters, sort, grouping,
// widths, column order, hidden columns, chart settings) is refused. Rows,
// the schema and a person's own view state are not covered.
//
// The flag lives on the collections row (views_locked_by, views_locked_at),
// not inside the views JSON: any save of the views list could otherwise
// clear it just by sending a list without it.
//
// There are four doors that write a database's views: REST PUT
// /api/collections/{id} with a views half, and MCP set_view (create and
// update) and delete_view. REST writes with its own SQL and MCP through
// saveCollection, so the rule cannot live inside one writer; it is
// checkViewsUnlocked, which all four call. A new path that writes views
// calls it too (.specify/memory/surfaces.md, "View lock").

// errViewsLocked is the refusal. REST answers it 409 views_locked; MCP returns
// the same sentence. The browser translates by code (serverErrors.ts).
var errViewsLocked = errors.New("this database's views are locked; unlock them to change a view")

// errViewsLockedForAgents is the sentence an agent gets: it cannot unlock
// (not_available_via_mcp), so "unlock them" would send it looking for a tool
// that does not exist. Wraps errViewsLocked, so errors.Is holds for both.
var errViewsLockedForAgents = viewsLockedForAgents{}

type viewsLockedForAgents struct{}

func (viewsLockedForAgents) Error() string {
	return "this database's views are locked; a person can unlock them in the interface"
}
func (viewsLockedForAgents) Unwrap() error { return errViewsLocked }

// viewsLockInfo is who locked a database's views and when, as the interface
// and get_collection show it. Nil (JSON null) means unlocked.
type viewsLockInfo struct {
	By     string `json:"by"`
	ByName string `json:"byName"`
	At     string `json:"at"`
}

// viewsLock reads the lock of a database, for showing it. A missing
// collections row (a page that is not a database) reads as unlocked: there
// are no views to protect. One row by primary key; the name comes from users
// by primary key.
func (s *Server) viewsLock(colID string) *viewsLockInfo {
	l, _ := s.readViewsLock(colID)
	return l
}

// readViewsLock is viewsLock with its error, for deciding: a failed read is
// not "unlocked". checkViewsUnlocked refuses on it, so the lock fails closed
// (code review): a busy database must not let a locked view be changed.
func (s *Server) readViewsLock(colID string) (*viewsLockInfo, error) {
	var by, at string
	var name sql.NullString
	err := s.db.QueryRow(`SELECT c.views_locked_by, c.views_locked_at, u.name
		FROM collections c LEFT JOIN users u ON u.id = c.views_locked_by
		WHERE c.page_id = ?`, colID).Scan(&by, &at, &name)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if by == "" {
		return nil, nil
	}
	return &viewsLockInfo{By: by, ByName: name.String, At: at}, nil
}

// checkViewsUnlocked refuses a views save while the database's views are
// locked, unless the views would come out as they are: before is the stored
// views JSON, after what is about to be written. They are compared by meaning
// (jsonEqual), not by bytes: the browser writes keys in its own order and Go
// in sorted order, so the same views would otherwise read as a change, and a
// browser that sends the views back unchanged beside a schema change would be
// refused for nothing.
//
// The lock is read first: it is one row by primary key, and on an unlocked
// database, nearly every save, it settles the question without decoding and
// comparing two views lists.
//
// The read and the caller's write are two statements, so a lock taken in
// between does not stop a save already past this check. That is the order
// the two arrived in, as "the last one wins" for two people locking at once
// (spec, Edge Cases); the next save is refused.
func (s *Server) checkViewsUnlocked(colID string, before, after []byte) error {
	lock, err := s.readViewsLock(colID)
	if err != nil {
		return errViewsLocked
	}
	if lock == nil || jsonEqual(string(before), string(after)) {
		return nil
	}
	return errViewsLocked
}

// handleLockViews (PUT /api/collections/{id}/lock) and handleUnlockViews
// (DELETE) set and clear the lock. auth + sessionOnly in server.go: locking is
// a person's act, and an agent that could unlock would make the lock nothing
// against agents (owner, 2026-11-03; not_available_via_mcp). canWriteReq: the
// people who may change the views may lock them; a reader may not.
//
// Both answer the lock as it now stands, so the interface shows the stored
// state. Locking a locked database or unlocking an unlocked one changes
// nothing and logs nothing (conductor review): the first lock keeps its
// person and time, and the log does not say "Views unlocked" twice in a row.
// The spec's edge case, two people locking and unlocking at the same moment,
// still ends with the last one winning and both in the log, since each of
// those changes the state. The condition sits in the UPDATE itself, so two
// such requests cannot both pass a read and both write.
func (s *Server) handleLockViews(w http.ResponseWriter, r *http.Request) {
	s.setViewsLock(w, r, true)
}

func (s *Server) handleUnlockViews(w http.ResponseWriter, r *http.Request) {
	s.setViewsLock(w, r, false)
}

func (s *Server) setViewsLock(w http.ResponseWriter, r *http.Request, lock bool) {
	id := r.PathValue("id")
	if !s.canWriteReq(r, id) {
		httpError(w, 404, "not a collection")
		return
	}
	u := requestUser(r)
	by, at, action := "", "", "views.unlock"
	if lock {
		by, at, action = u.ID, now(), "views.lock"
	}
	// Only from the other state: unlocked to locked, or locked to unlocked.
	from := `views_locked_by = ''`
	if !lock {
		from = `views_locked_by <> ''`
	}
	res, err := s.db.Exec(`UPDATE collections SET views_locked_by = ?, views_locked_at = ? WHERE page_id = ? AND `+from, by, at, id)
	if err != nil {
		httpError(w, 500, err.Error())
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		var exists int
		if s.db.QueryRow(`SELECT COUNT(*) FROM collections WHERE page_id = ?`, id).Scan(&exists); exists == 0 {
			httpError(w, 404, "not a collection")
			return
		}
		// Already in the asked state: nothing to write, nothing to log.
		writeJSON(w, map[string]any{"viewsLocked": s.viewsLock(id)})
		return
	}
	s.audit("human", u.ID, u.Name, action, id, s.pageWorkspace(id), s.pageTitle(id))
	// Open views of this database redraw with the lock (or without it): the
	// same signal a views save sends. It reloads their rows as well, which a
	// lock does not need; a config-only signal would be a new event type and
	// a change to the browser's event handling (App.tsx), left for its own
	// change (conductor review).
	s.rowsChanged(id)
	writeJSON(w, map[string]any{"viewsLocked": s.viewsLock(id)})
}

// errPropertyInLockedView refuses removing a property that a locked view
// uses (conductor review, option b). The lock covers the views and not the
// schema, but removing a property a view filters, sorts or groups by
// changes what that view does: it used to leave the view pointing at
// nothing, an agent's set_view on that board then failed "no longer a
// property", and nothing tidied it after unlocking. REST answers 409
// property_in_locked_view with the property and the view, so the browser
// can say which.
//
// Turned down (option a): letting a views change through the lock when it
// only removes references to properties the same request deletes. It would
// be a hole in the lock that one function must judge right forever; a
// refusal with a sentence costs a person one unlock.
type errPropertyInLockedView struct{ Property, View string }

func (e errPropertyInLockedView) Error() string {
	return fmt.Sprintf("%q is used by the view %q, and this database's views are locked; unlock them to remove it", e.Property, e.View)
}

// viewPropertyRefs are the properties a view uses for what it shows: its
// filters, sort, grouping, dates, a chart's totals, a table's sub-items.
// Layout (hidden, colOrder, colWidths) is left out: a stale id there changes
// nothing, and the server already drops one from colOrder.
func viewPropertyRefs(v map[string]any) []string {
	var out []string
	str := func(k string) {
		if s, _ := v[k].(string); s != "" {
			out = append(out, s)
		}
	}
	for _, k := range []string{"groupBy", "subGroupBy", "dateProp", "endDateProp", "aggProp", "subItemProp"} {
		str(k)
	}
	if fs, ok := v["filters"].([]any); ok {
		for _, f := range fs {
			if m, ok := f.(map[string]any); ok {
				if p, _ := m["property"].(string); p != "" {
					out = append(out, p)
				}
			}
		}
	}
	if fs, ok := v["filters"].([]map[string]any); ok {
		for _, m := range fs {
			if p, _ := m["property"].(string); p != "" {
				out = append(out, p)
			}
		}
	}
	if srt, ok := v["sort"].(map[string]any); ok {
		if p, _ := srt["property"].(string); p != "" {
			out = append(out, p)
		}
	}
	if qs, ok := v["quickFilters"].([]any); ok {
		for _, q := range qs {
			if p, _ := q.(string); p != "" {
				out = append(out, p)
			}
		}
	}
	return out
}

// checkLockedViewsKeepProperties refuses removing a property a locked view
// uses: removed maps each removed property id to its name, views are the
// views as they will be stored. Called by both doors that remove properties,
// PUT /api/collections (a schema half) and MCP update_schema. A lock that
// cannot be read refuses, as checkViewsUnlocked does.
func (s *Server) checkLockedViewsKeepProperties(colID string, removed map[string]string, views []map[string]any) error {
	if len(removed) == 0 {
		return nil
	}
	lock, err := s.readViewsLock(colID)
	if err != nil {
		return errViewsLocked
	}
	if lock == nil {
		return nil
	}
	for _, v := range views {
		for _, p := range viewPropertyRefs(v) {
			if name, gone := removed[p]; gone {
				if name == "" {
					name = p
				}
				view, _ := v["name"].(string)
				return errPropertyInLockedView{Property: name, View: view}
			}
		}
	}
	return nil
}

// removedProperties is the properties in before that after no longer has,
// by id, with their names.
func removedProperties(before, after []map[string]any) map[string]string {
	keep := map[string]bool{}
	for _, p := range after {
		if id, _ := p["id"].(string); id != "" {
			keep[id] = true
		}
	}
	out := map[string]string{}
	for _, p := range before {
		id, _ := p["id"].(string)
		if id != "" && !keep[id] {
			name, _ := p["name"].(string)
			out[id] = name
		}
	}
	return out
}

// marshalViews is views as JSON for checkViewsUnlocked, from the parsed form
// the MCP tools work on.
func marshalViews(views []map[string]any) []byte {
	b, err := json.Marshal(views)
	if err != nil {
		return []byte("[]")
	}
	return b
}
