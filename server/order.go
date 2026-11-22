package server

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"
)

// Putting a page just before or after one of its siblings (spec 022, research
// R1). A database's rows are its child pages, so this is also how a row moves
// in the database's manual order, which every view without a sort shows.
//
// One function for both doors: POST /api/pages/{id}/place and, for agents,
// update_page and create_page with after/before. The browser does not send a
// position of its own: next to a filter's hidden rows it cannot know which
// rows are neighbours in the database, and an agent has no positions at all.
// The move is described by its anchor instead, and the server finds the
// neighbour on the other side and writes the midpoint: one row, not every row.

// placeError is a refusal with the status and code the REST door answers;
// the MCP door reports its sentence.
type placeError struct {
	status int
	code   string
	msg    string
}

func (e *placeError) Error() string { return e.msg }

var (
	errPlaceNotFound = &placeError{404, "", "page not found"}
	errPlaceTrashed  = &placeError{409, "", "page is in the trash"}
	errPlaceSide     = &placeError{400, "", "pass exactly one of after or before"}
)

func errAnchorNotSibling(anchorID string) error {
	return &placeError{400, "anchor_not_sibling",
		fmt.Sprintf("%q is not a sibling of this page: the page it is placed next to must have the same parent and not be in the trash.", anchorID)}
}

// writePlaceError answers a placeError on the REST door, anything else as 500.
func writePlaceError(w http.ResponseWriter, err error) {
	var pe *placeError
	if errors.As(err, &pe) {
		if pe.code != "" {
			httpErrorCode(w, pe.status, pe.code, pe.msg)
		} else {
			httpError(w, pe.status, pe.msg)
		}
		return
	}
	httpError(w, 500, err.Error())
}

// orderScope says whose order a move writes. Today every move writes the
// database's own order (the rows' position), whatever view it was made in.
// A view keeping an order of its own, with a "change everywhere" choice, is
// #870 (owner, 2026-11-22); it is decided here, so both doors follow.
func orderScope(parentID, viewID string) string {
	return "database"
}

// placeSide picks the side from the two optional anchors a caller passes.
func placeSide(after, before string) (anchor, side string, err error) {
	switch {
	case after != "" && before != "":
		return "", "", errPlaceSide
	case after != "":
		return after, "after", nil
	case before != "":
		return before, "before", nil
	}
	return "", "", errPlaceSide
}

// sibling is one page in a parent's order.
type sibling struct {
	id        string
	position  float64
	createdAt string
}

// placePage puts page id just after or just before anchorID, a sibling, and
// answers its new position and whether anything was written. viewID, when
// given, is the database view the move was made in; it must exist
// (orderScope). A page placed next to itself, or already in that place,
// writes nothing.
//
// The activity log is the caller's: the person's door logs "reorder_page",
// an agent's tool call is logged once by mcpCall, and a page placed as it is
// created or duplicated is part of that act.
func (s *Server) placePage(u *user, id, anchorID, side, viewID string) (float64, bool, error) {
	if u == nil || !s.canWrite(u.ID, id) || !s.credentialMayEnter(u, s.pageWorkspace(id)) {
		return 0, false, errPlaceNotFound
	}
	if side != "after" && side != "before" {
		return 0, false, errPlaceSide
	}
	var parent sql.NullString
	var trashed sql.NullString
	var ws string
	var pos float64
	if err := s.db.QueryRow(`SELECT parent_id, trashed_at, workspace_id, position FROM pages WHERE id = ?`, id).
		Scan(&parent, &trashed, &ws, &pos); err == sql.ErrNoRows {
		return 0, false, errPlaceNotFound
	} else if err != nil {
		return 0, false, err
	}
	if trashed.Valid {
		return 0, false, errPlaceTrashed
	}
	if anchorID == id {
		return pos, false, nil
	}
	if err := s.checkAnchor(u, parent, ws, anchorID); err != nil {
		return 0, false, err
	}
	if viewID != "" {
		if !parent.Valid {
			return 0, false, &placeError{400, "view_not_in_database", "A view only applies to a row of a database."}
		}
		if _, _, _, err := s.viewOf(parent.String, viewID); err != nil {
			return 0, false, &placeError{400, "view_not_in_database", err.Error()}
		}
	}
	_ = orderScope(parent.String, viewID)

	tx, err := s.db.Begin()
	if err != nil {
		return 0, false, err
	}
	defer tx.Rollback()

	lo, hi, moved, err := placeBounds(tx, parent, ws, id, anchorID, side)
	if err != nil {
		return 0, false, err
	}
	if moved {
		// Already in that place: nothing to write.
		return pos, false, nil
	}
	next, ok := midpoint(lo, hi, side)
	if !ok {
		// The neighbours share a position, or the gap is too small for a
		// midpoint: number the siblings 1, 2, 3, … first (as
		// handleReindexSiblings does), then take it.
		if err := renumberSiblings(tx, parent, ws); err != nil {
			return 0, false, err
		}
		if lo, hi, _, err = placeBounds(tx, parent, ws, id, anchorID, side); err != nil {
			return 0, false, err
		}
		if next, ok = midpoint(lo, hi, side); !ok {
			return 0, false, errors.New("could not find room between the two siblings")
		}
	}
	// updated_at stays: a move is not an edit, and "last edited" must not
	// change because somebody dragged the row (research R1).
	if _, err := tx.Exec(`UPDATE pages SET position = ? WHERE id = ?`, next, id); err != nil {
		return 0, false, err
	}
	if err := tx.Commit(); err != nil {
		return 0, false, err
	}
	// After the commit: one connection, and a write inside the open
	// transaction would wait for it forever.
	s.pagesChanged()
	s.rowChanged(id)
	s.fireWebhook("page.updated", id)
	return next, true, nil
}

// checkAnchor refuses an anchor that is not a live, readable child of parent
// in workspace ws. Create checks it before it inserts, so a refused anchor
// leaves no page behind.
func (s *Server) checkAnchor(u *user, parent sql.NullString, ws, anchorID string) error {
	var aParent, aTrashed sql.NullString
	var aWS string
	err := s.db.QueryRow(`SELECT parent_id, trashed_at, workspace_id FROM pages WHERE id = ?`, anchorID).Scan(&aParent, &aTrashed, &aWS)
	if err != nil || aTrashed.Valid || aParent != parent || aWS != ws || !s.canRead(u.ID, anchorID) {
		return errAnchorNotSibling(anchorID)
	}
	return nil
}

// placeBounds reads the anchor and its neighbour on the side the page goes to.
// For "after", lo is the anchor and hi the next sibling (nil at the end); for
// "before", hi is the anchor and lo the one before it (nil at the start).
// moved reports that the page already sits there. The order is the rows
// query's, position then created_at, with the id to break a full tie the
// same way every time. Two short reads, not the whole list: a 10k-row
// database read whole per move was 25 ms at p95 (research R9).
func placeBounds(tx *sql.Tx, parent sql.NullString, ws, id, anchorID, side string) (lo, hi *sibling, moved bool, err error) {
	var a sibling
	a.id = anchorID
	if err := tx.QueryRow(`SELECT position, created_at FROM pages WHERE id = ?`, anchorID).Scan(&a.position, &a.createdAt); err != nil {
		return nil, nil, false, errAnchorNotSibling(anchorID)
	}
	// The sibling right next to the anchor on that side, the moved page
	// included: if it is the moved page, the page is already in place.
	cmp, dir := ">", "ASC"
	if side == "before" {
		cmp, dir = "<", "DESC"
	}
	q := `SELECT id, position, created_at FROM pages
		WHERE parent_id IS ? AND workspace_id = ? AND trashed_at IS NULL
		AND (position ` + cmp + ` ? OR (position = ? AND (created_at ` + cmp + ` ? OR (created_at = ? AND id ` + cmp + ` ?))))
		ORDER BY position ` + dir + `, created_at ` + dir + `, id ` + dir + ` LIMIT 2`
	rows, err := tx.Query(q, parent, ws, a.position, a.position, a.createdAt, a.createdAt, a.id)
	if err != nil {
		return nil, nil, false, err
	}
	var near []sibling
	for rows.Next() {
		var sb sibling
		if err := rows.Scan(&sb.id, &sb.position, &sb.createdAt); err != nil {
			rows.Close()
			return nil, nil, false, err
		}
		near = append(near, sb)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, nil, false, err
	}
	var n *sibling
	if len(near) > 0 {
		if near[0].id == id {
			return nil, nil, true, nil
		}
		n = &near[0]
	}
	if side == "after" {
		return &a, n, false, nil
	}
	return n, &a, false, nil
}

// midpoint is the position between lo and hi; at an end, one past the anchor.
// ok is false when there is no number strictly between the two, so the
// order would not change.
func midpoint(lo, hi *sibling, side string) (float64, bool) {
	switch {
	case lo != nil && hi != nil:
		m := lo.position + (hi.position-lo.position)/2
		return m, m > lo.position && m < hi.position
	case lo != nil:
		return lo.position + 1, true
	case hi != nil:
		return hi.position - 1, true
	}
	return 0, false
}

// renumberSiblings writes 1, 2, 3, … in the current order, inside tx.
func renumberSiblings(tx *sql.Tx, parent sql.NullString, ws string) error {
	rows, err := tx.Query(`SELECT id FROM pages WHERE parent_id IS ? AND workspace_id = ? AND trashed_at IS NULL
		ORDER BY position, created_at, id`, parent, ws)
	if err != nil {
		return err
	}
	var ids []string
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	rows.Close()
	for i, id := range ids {
		if _, err := tx.Exec(`UPDATE pages SET position = ? WHERE id = ?`, float64(i+1), id); err != nil {
			return err
		}
	}
	return nil
}

// handlePlacePage is the person's door: POST /api/pages/{id}/place with
// {"after": id} or {"before": id}, and the view it happens in.
func (s *Server) handlePlacePage(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var body struct {
		After  string `json:"after"`
		Before string `json:"before"`
		ViewID string `json:"viewId"`
	}
	if err := decodeJSON(w, r, &body); err != nil {
		httpError(w, 400, "invalid JSON")
		return
	}
	// The gate first, so an outsider learns nothing from the body's checks.
	u := requestUser(r)
	if !s.canWriteReq(r, id) {
		httpError(w, 404, "page not found")
		return
	}
	anchor, side, err := placeSide(body.After, body.Before)
	if err != nil {
		writePlaceError(w, err)
		return
	}
	pos, wrote, err := s.placePage(u, id, anchor, side, body.ViewID)
	if err != nil {
		writePlaceError(w, err)
		return
	}
	if wrote {
		detail := side + " " + anchor
		if body.ViewID != "" {
			detail += " in view " + body.ViewID
		}
		s.audit("human", u.ID, u.Name, "reorder_page", id, s.pageWorkspace(id), detail)
	}
	writeJSON(w, map[string]any{"id": id, "position": pos})
}

// placeCopyAfter puts a duplicated database row right after the row it was
// copied from, where the person was looking, instead of at the end (spec 022,
// research R3). A copy of anything else keeps its place at the end. Both the
// person's duplicate and an agent's duplicate_page call it.
func (s *Server) placeCopyAfter(u *user, srcID, copyID string) error {
	var parentType sql.NullString
	s.db.QueryRow(`SELECT parent.type FROM pages p JOIN pages parent ON parent.id = p.parent_id WHERE p.id = ?`, srcID).Scan(&parentType)
	if parentType.String != "collection" {
		return nil
	}
	// The copy has the source's parent; a source in the trash has no place
	// to be next to, and the copy stays at the end.
	_, _, err := s.placePage(u, copyID, srcID, "after", "")
	var pe *placeError
	if errors.As(err, &pe) && pe.code == "anchor_not_sibling" {
		return nil
	}
	return err
}
