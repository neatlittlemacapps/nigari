package server

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
)

// Template tools for agents (W115).
//
// The interface had templates for a long time and MCP had no idea: an agent
// asked to "set up a project like the others" rebuilt the structure from
// scratch every time, next to a prepared snapshot nobody told it about.
//
// A template is a snapshot, not a link (see duplicatePage's asTemplate): using
// one copies it and the two never affect each other again. That is the single
// fact these descriptions have to carry, because an agent that believes the
// copy stays attached will avoid editing it.

// mcpListTemplates lists the templates the caller may actually read. Same two
// stages as everywhere else: the token's workspaces first, then canRead per
// hit, which is what keeps somebody else's private template out of the list.
func (s *Server) mcpListTemplates(u *user, databaseID string) (string, error) {
	if databaseID != "" {
		return s.mcpDatabaseTemplates(u, "list", databaseID, "", "", "")
	}
	ws := s.scopeWorkspacesFor(u, s.visibleWorkspaces(u.ID))
	if len(ws) == 0 {
		return "[]", nil
	}
	wargs := make([]any, len(ws))
	for i, v := range ws {
		wargs[i] = v
	}
	rows, err := s.db.Query(`SELECT id, title, icon, type, description, workspace_id
		FROM pages WHERE is_template = 1 AND template_of = '' AND trashed_at IS NULL
		AND workspace_id IN (`+placeholders(len(ws))+`) ORDER BY title`, wargs...)
	if err != nil {
		return "", err
	}
	type tpl struct {
		ID          string `json:"id"`
		Title       string `json:"title"`
		Icon        string `json:"icon"`
		Kind        string `json:"kind"`
		Description string `json:"description"`
		WorkspaceID string `json:"workspace_id"`
	}
	var scanned []tpl
	for rows.Next() {
		var t tpl
		if rows.Scan(&t.ID, &t.Title, &t.Icon, &t.Kind, &t.Description, &t.WorkspaceID) == nil {
			scanned = append(scanned, t)
		}
	}
	rows.Close() // drain before per-row canRead (single DB connection)
	out := []tpl{}
	for _, t := range scanned {
		if s.canRead(u.ID, t.ID) {
			out = append(out, t)
		}
	}
	b, err := json.Marshal(out)
	if err != nil {
		return "", err
	}
	// Titles and descriptions are user-authored, so they travel fenced.
	return wrapUntrusted(string(b)), nil
}

// mcpCreateFromTemplate instantiates a template in its source workspace.
// The destination must be writable; duplicatePage enforces this for all callers.
func (s *Server) mcpCreateFromTemplate(u *user, templateID, title, parentID string, props json.RawMessage, viewID string) (string, error) {
	if templateID == "" {
		return "", fmt.Errorf("template_id is required — call list with kind=\"templates\" for the ids")
	}
	// The copy lands in the template's workspace, so the credential has to be
	// allowed there: a token for one workspace instantiated templates of others.
	if !s.canRead(u.ID, templateID) || !s.credentialMayEnter(u, s.pageWorkspace(templateID)) {
		return "", fmt.Errorf("template %q not found", templateID)
	}
	var isTemplate int
	if err := s.db.QueryRow(`SELECT is_template FROM pages WHERE id = ? AND trashed_at IS NULL`, templateID).Scan(&isTemplate); err == sql.ErrNoRows {
		return "", fmt.Errorf("template %q not found", templateID)
	} else if err != nil {
		return "", err
	}
	// A template of a database makes a row of that database. The parent may be
	// left out (the database is the only place it can go) but not name another.
	if owner, err := s.databaseTemplateOwner(templateID); err == nil && owner != "" {
		if parentID != "" && parentID != owner {
			return "", fmt.Errorf("template %q belongs to database %s: parent_id must be that database, or left out", templateID, owner)
		}
		if !s.canWrite(u.ID, owner) || !s.credentialMayEnter(u, s.pageWorkspace(owner)) {
			return "", fmt.Errorf("database %q not found", owner)
		}
		// Template, then the view's pins, then props (spec 005, as over REST).
		if viewID != "" {
			merged, err := s.propsInView(owner, viewID, props)
			if err != nil {
				return "", err
			}
			props = merged
		}
		nid, err := s.rowFromTemplate(u.ID, owner, templateID, title, props)
		if err == sql.ErrNoRows {
			return "", fmt.Errorf("template %q not found", templateID)
		}
		if err != nil {
			return "", err
		}
		s.fireWebhook("page.created", nid)
		created := fmt.Sprintf("Created row %s in database %s from template %s", nid, owner, templateID)
		if viewID != "" {
			return created + s.viewMatchNote(nid, owner, viewID), nil
		}
		return created, nil
	}
	if viewID != "" {
		return "", fmt.Errorf("view_id applies to a row of a database, and template %q is not a database template", templateID)
	}
	if isTemplate == 0 {
		return "", fmt.Errorf("page %q is not a template — call list with kind=\"templates\", or duplicate_page for an ordinary copy", templateID)
	}
	nid, err := s.duplicatePage(templateID, u.ID, true, false)
	if err == sql.ErrNoRows {
		return "", fmt.Errorf("template %q not found", templateID)
	}
	if err != nil {
		return "", err
	}
	if title != "" {
		if _, err := s.db.Exec(`UPDATE pages SET title = ?, updated_at = ? WHERE id = ?`, title, now(), nid); err != nil {
			return "", err
		}
		s.reindexPage(nid)
		s.pagesChanged()
	}
	return fmt.Sprintf("Created page %s from template %s", nid, templateID), nil
}

// mcpSaveAsTemplate snapshots a page into a template, leaving the page itself
// untouched — the same asymmetry the ⋯ menu offers.
func (s *Server) mcpSaveAsTemplate(u *user, pageID string) (string, error) {
	if pageID == "" {
		return "", fmt.Errorf("page_id is required")
	}
	if !s.canWrite(u.ID, pageID) {
		return "", fmt.Errorf("page %q not found", pageID)
	}
	nid, err := s.duplicatePage(pageID, u.ID, false, true)
	if err == sql.ErrNoRows {
		return "", fmt.Errorf("page %q not found", pageID)
	}
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("Saved page %s as template %s — the page itself is unchanged", pageID, nid), nil
}

// mcpDatabaseTemplates is the one tool for a database's own templates: list
// them, add one (empty, or a snapshot of a page), rename one, remove one. Using
// one is create_page with template_id.
func (s *Server) mcpDatabaseTemplates(u *user, action, databaseID, templateID, title, fromPageID string) (string, error) {
	if databaseID == "" {
		return "", fmt.Errorf("database_id is required — call list with kind=\"pages\" and look for type \"collection\"")
	}
	if !s.canRead(u.ID, databaseID) || !s.credentialMayEnter(u, s.pageWorkspace(databaseID)) || !s.isLiveCollection(databaseID) {
		return "", fmt.Errorf("database %q not found", databaseID)
	}
	if action != "list" && !s.canWrite(u.ID, databaseID) {
		return "", fmt.Errorf("database %q not found", databaseID)
	}
	// Name the template for the actions that act on one: it has to be this
	// database's own, or an id of another database would be editable here.
	owned := func() error {
		if templateID == "" {
			return fmt.Errorf("template_id is required — action=\"list\" gives the ids")
		}
		if owner, err := s.databaseTemplateOwner(templateID); err != nil || owner != databaseID {
			return fmt.Errorf("template %q not found in this database", templateID)
		}
		return nil
	}
	switch action {
	case "list", "":
		list, err := s.listDatabaseTemplates(u.ID, databaseID)
		if err != nil {
			return "", err
		}
		type tpl struct {
			ID          string `json:"id"`
			Title       string `json:"title"`
			Icon        string `json:"icon"`
			Description string `json:"description"`
			DatabaseID  string `json:"database_id"`
		}
		out := make([]tpl, 0, len(list))
		for _, m := range list {
			out = append(out, tpl{m.ID, m.Title, m.Icon, m.Description, databaseID})
		}
		b, err := json.Marshal(out)
		if err != nil {
			return "", err
		}
		return wrapUntrusted(string(b)), nil
	case "add":
		nid, err := s.addDatabaseTemplate(u.ID, databaseID, title, fromPageID)
		if err == sql.ErrNoRows {
			return "", fmt.Errorf("page %q not found in this database's workspace", fromPageID)
		}
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("Added template %s to database %s — fill it in with write_content and set_properties, use it with create_page template_id", nid, databaseID), nil
	case "rename":
		if err := owned(); err != nil {
			return "", err
		}
		if strings.TrimSpace(title) == "" {
			return "", fmt.Errorf("title is required — it is all rename changes")
		}
		if _, err := s.mcpUpdatePageMeta(templateID, title, "", "", "", "", nil); err != nil {
			return "", err
		}
		return fmt.Sprintf("Renamed template %s", templateID), nil
	case "remove":
		if err := owned(); err != nil {
			return "", err
		}
		yes := true
		if _, err := s.mcpSetTrashed(templateID, &yes); err != nil {
			return "", err
		}
		return fmt.Sprintf("Removed template %s (it is in the trash and can be restored with set_trashed)", templateID), nil
	}
	return "", fmt.Errorf("unknown action %q — use list, add, rename or remove", action)
}
