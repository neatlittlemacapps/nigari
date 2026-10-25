package server

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

// Database templates: a template that belongs to one collection.
//
// A workspace template is a flagged page anybody can start from. A database
// template is the same flagged page with pages.template_of set to the
// collection, and with no parent, so it is never one of the collection's rows:
// nothing that lists rows (the table, counts, rollups, relations, the calendar
// feed, public tables, exports) has to learn to skip it. The workspace
// Templates section and gallery leave it out for the same reason they leave
// out every page that is not a plain template.
//
// Using one is a copy, like every template: the row and the template have
// nothing to do with each other afterwards.

// databaseTemplateOwner reports the collection a template belongs to, after
// checking that the template is live. Empty when it is not a database template.
func (s *Server) databaseTemplateOwner(templateID string) (string, error) {
	var owner string
	var trashed sql.NullString
	err := s.db.QueryRow(`SELECT template_of, trashed_at FROM pages WHERE id = ? AND is_template = 1`, templateID).Scan(&owner, &trashed)
	if err != nil || trashed.Valid {
		return "", sql.ErrNoRows
	}
	return owner, nil
}

// isLiveCollection is true for a collection that is not in the trash.
func (s *Server) isLiveCollection(id string) bool {
	var n int
	s.db.QueryRow(`SELECT COUNT(*) FROM pages p JOIN collections c ON c.page_id = p.id
		WHERE p.id = ? AND p.trashed_at IS NULL`, id).Scan(&n)
	return n > 0
}

// listDatabaseTemplates returns the templates of one collection that the
// caller may read, by title.
func (s *Server) listDatabaseTemplates(userID, collectionID string) ([]pageMeta, error) {
	rows, err := s.db.Query(`SELECT `+pageMetaCols+` FROM pages p
		WHERE template_of = ? AND is_template = 1 AND trashed_at IS NULL
		ORDER BY title`, collectionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []pageMeta{}
	for rows.Next() {
		m, err := scanMeta(rows)
		if err != nil {
			return nil, err
		}
		list = append(list, m)
	}
	return s.filterReadable(userID, list), rows.Err()
}

// addDatabaseTemplate makes a template of a collection. With fromPageID it is a
// snapshot of that page (usually one of the collection's own rows); without,
// an empty page the person then fills in. The caller has checked that the user
// may write the collection.
func (s *Server) addDatabaseTemplate(userID, collectionID, title, fromPageID string) (string, error) {
	if !s.isLiveCollection(collectionID) {
		return "", fmt.Errorf("not a database")
	}
	title = strings.TrimSpace(title)
	if fromPageID != "" {
		// A snapshot of a page from another workspace would carry its content
		// across a boundary nobody asked to cross.
		if !s.canRead(userID, fromPageID) || s.pageWorkspace(fromPageID) != s.pageWorkspace(collectionID) {
			return "", sql.ErrNoRows
		}
		return s.duplicateTree(fromPageID, userID, dupOpts{fromTemplate: true, templateOf: collectionID, title: title})
	}
	if title == "" {
		title = "New template"
	}
	if len([]rune(title)) > maxTitleLen {
		return "", fmt.Errorf("title is too long")
	}
	id := newID()
	ts := now()
	_, err := s.db.Exec(`INSERT INTO pages (id, parent_id, title, icon, content, position, created_at, updated_at, type, props, workspace_id, owner_id, visibility, is_template, template_of)
		VALUES (?, NULL, ?, '', '[]', 0, ?, ?, 'doc', '{}', ?, ?, 'workspace', 1, ?)`,
		id, title, ts, ts, s.pageWorkspace(collectionID), userID, collectionID)
	if err != nil {
		return "", err
	}
	s.reindexPage(id)
	s.pagesChanged()
	return id, nil
}

// rowFromTemplate makes a new row in a collection from one of its templates:
// body, icon, cover, sub-pages and property values come along. props, when
// given, are laid over the template's values; title, when given, replaces the
// template's title. The caller has already checked who may write the collection
// and whether the credential may enter its workspace.
func (s *Server) rowFromTemplate(userID, collectionID, templateID, title string, props json.RawMessage) (string, error) {
	owner, err := s.databaseTemplateOwner(templateID)
	if err != nil || owner != collectionID || !s.isLiveCollection(collectionID) || !s.canRead(userID, templateID) {
		return "", sql.ErrNoRows
	}
	id, err := s.duplicateTree(templateID, userID, dupOpts{fromTemplate: true, intoParent: collectionID, title: strings.TrimSpace(title)})
	if err != nil {
		return "", err
	}
	if len(props) > 0 && string(props) != "null" {
		if _, err := s.mcpSetProperties(id, props, nil); err != nil {
			return id, fmt.Errorf("row created (%s) but properties failed: %w", id, err)
		}
	}
	return id, nil
}

func (s *Server) handleListDatabaseTemplates(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !s.canReadReq(r, id) || !s.isLiveCollection(id) {
		httpError(w, 404, "not a collection")
		return
	}
	list, err := s.listDatabaseTemplates(requestUser(r).ID, id)
	if err != nil {
		httpError(w, 500, err.Error())
		return
	}
	writeJSON(w, list)
}

func (s *Server) handleAddDatabaseTemplate(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !s.canWriteReq(r, id) {
		httpError(w, 404, "not a collection")
		return
	}
	var body struct {
		Title      string `json:"title"`
		FromPageID string `json:"fromPageId"`
	}
	if err := decodeJSON(w, r, &body); err != nil {
		httpError(w, 400, "invalid JSON")
		return
	}
	u := requestUser(r)
	nid, err := s.addDatabaseTemplate(u.ID, id, body.Title, body.FromPageID)
	if err == sql.ErrNoRows {
		httpError(w, 404, "page not found")
		return
	}
	if err != nil {
		httpError(w, 400, err.Error())
		return
	}
	s.audit("human", u.ID, u.Name, "create_template", nid, s.pageWorkspace(id), body.Title)
	p, err := s.getPage(nid)
	if err != nil {
		httpError(w, 500, err.Error())
		return
	}
	writeJSON(w, p)
}

func (s *Server) handleRowFromTemplate(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !s.canWriteReq(r, id) {
		httpError(w, 404, "not a collection")
		return
	}
	var body struct {
		TemplateID string          `json:"templateId"`
		Title      string          `json:"title"`
		Props      json.RawMessage `json:"props"`
	}
	if err := decodeJSON(w, r, &body); err != nil {
		httpError(w, 400, "invalid JSON")
		return
	}
	if len([]rune(body.Title)) > maxTitleLen {
		httpError(w, 400, "title is too long")
		return
	}
	u := requestUser(r)
	nid, err := s.rowFromTemplate(u.ID, id, body.TemplateID, body.Title, body.Props)
	if err == sql.ErrNoRows {
		httpError(w, 404, "template not found")
		return
	}
	if err != nil {
		httpError(w, 500, err.Error())
		return
	}
	p, err := s.getPage(nid)
	if err != nil {
		httpError(w, 500, err.Error())
		return
	}
	s.audit("human", u.ID, u.Name, "create_page", nid, p.WorkspaceID, p.Title)
	s.rowChanged(nid)
	s.fireWebhook("page.created", nid)
	writeJSON(w, p)
}

// dropOrphanedTemplates removes templates whose database is gone for good: they
// hang off no parent, so the usual cascade does not reach them.
func (s *Server) dropOrphanedTemplates() {
	s.db.Exec(`DELETE FROM pages_fts WHERE id IN (SELECT id FROM pages WHERE template_of != ''
		AND template_of NOT IN (SELECT id FROM pages))`)
	s.db.Exec(`DELETE FROM pages WHERE template_of != '' AND template_of NOT IN (SELECT id FROM pages)`)
}
