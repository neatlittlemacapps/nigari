package server

import (
	"database/sql"
	"encoding/json"
	"errors"
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
// state. Locking an already locked database records the new person and time
// (the last one wins, spec edge case); both are in the activity log.
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
	res, err := s.db.Exec(`UPDATE collections SET views_locked_by = ?, views_locked_at = ? WHERE page_id = ?`, by, at, id)
	if err != nil {
		httpError(w, 500, err.Error())
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		httpError(w, 404, "not a collection")
		return
	}
	s.audit("human", u.ID, u.Name, action, id, s.pageWorkspace(id), s.pageTitle(id))
	// Open views of this database redraw with the lock (or without it): the
	// same signal a views save sends.
	s.rowsChanged(id)
	writeJSON(w, map[string]any{"viewsLocked": s.viewsLock(id)})
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
