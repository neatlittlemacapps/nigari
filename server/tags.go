package server

import (
	"encoding/json"
	"errors"
	"net/http"
	"sort"
	"strings"
)

// Page tags (Welle 25): Obsidian-style lightweight labels. Stored as a JSON
// array in pages.tags; a tag is a short slug, deduped case-insensitively.

const (
	maxTagLen   = 40
	maxPageTags = 30
)

// normalizeTags cleans a tag list: trims, strips a leading '#', collapses
// whitespace to '-', drops empties, dedupes case-insensitively (first spelling
// wins), and caps length + count. Always returns a JSON array, never null.
func normalizeTags(in []string) json.RawMessage {
	seen := map[string]bool{}
	out := []string{}
	for _, t := range in {
		t = strings.TrimSpace(t)
		t = strings.TrimPrefix(t, "#")
		t = strings.Join(strings.Fields(t), "-")
		if t == "" {
			continue
		}
		if r := []rune(t); len(r) > maxTagLen {
			t = string(r[:maxTagLen])
		}
		k := strings.ToLower(t)
		if seen[k] {
			continue
		}
		seen[k] = true
		out = append(out, t)
		if len(out) >= maxPageTags {
			break
		}
	}
	b, _ := json.Marshal(out)
	return b
}

// tagColorPalette is the fixed set of colours a tag may be given (Notion-style).
// Empty / "default" means "no override" — the client falls back to an automatic
// colour derived from the tag name.
var tagColorPalette = map[string]bool{
	"gray": true, "brown": true, "orange": true, "yellow": true, "green": true,
	"blue": true, "purple": true, "pink": true, "red": true,
}

// handleTagColors returns the tag→colour overrides for one workspace.
func (s *Server) handleTagColors(w http.ResponseWriter, r *http.Request) {
	userID := requestUser(r).ID
	ws := r.URL.Query().Get("workspace")
	if ws == "" {
		ws = s.userDefaultWorkspace(userID)
	}
	if !s.tokenReachesWorkspace(r, ws) || !s.isMember(userID, ws) {
		httpError(w, 404, "workspace not found")
		return
	}
	rows, err := s.db.Query(`SELECT tag, color FROM tag_colors WHERE workspace_id = ?`, ws)
	if err != nil {
		httpError(w, 500, err.Error())
		return
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var tag, color string
		if rows.Scan(&tag, &color) == nil {
			out[tag] = color
		}
	}
	writeJSON(w, out)
}

// Refusals of setTagColor, so each door can answer in its own terms (a status
// code for REST, a sentence for MCP) from the same decision.
var (
	errTagWorkspaceNotFound = errors.New("workspace not found")
	errTagWorkspaceReadOnly = errors.New("You can only read this workspace, so its tag colours cannot be changed.")
	errTagRequired          = errors.New("tag is required")
	errTagColorUnknown      = errors.New(`unknown colour — use gray, brown, orange, yellow, green, blue, purple, pink, red, or "default" to reset`)
)

// setTagColor sets (or, for an empty/"default" colour, clears) the colour
// override for a tag in a workspace. Any member who may write may recolour —
// tags are shared — but not a viewer.
//
// REST and MCP both call this. They used to have a copy each, and the copies
// had drifted: the MCP one checked "may create pages here" instead of the
// viewer rule, and then nothing called it at all once set_tag_color was folded
// into other tools (#2).
func (s *Server) setTagColor(u *user, ws, tag, color string) (cleared bool, err error) {
	if ws == "" || !s.isMember(u.ID, ws) || !s.credentialMayEnter(u, ws) {
		return false, errTagWorkspaceNotFound
	}
	if s.workspaceRole(u.ID, ws) == "viewer" {
		return false, errTagWorkspaceReadOnly
	}
	// The tag key is normalized like normalizeTags (lower-case, first spelling).
	tag = strings.ToLower(strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(tag), "#")))
	if tag == "" {
		return false, errTagRequired
	}
	color = strings.ToLower(strings.TrimSpace(color))
	if color == "" || color == "default" {
		_, err := s.db.Exec(`DELETE FROM tag_colors WHERE workspace_id = ? AND tag = ?`, ws, tag)
		return true, err
	}
	if !tagColorPalette[color] {
		return false, errTagColorUnknown
	}
	_, err = s.db.Exec(`INSERT INTO tag_colors (workspace_id, tag, color) VALUES (?, ?, ?)
		ON CONFLICT(workspace_id, tag) DO UPDATE SET color = excluded.color`, ws, tag, color)
	return false, err
}

// handleSetTagColor is the REST door to setTagColor.
func (s *Server) handleSetTagColor(w http.ResponseWriter, r *http.Request) {
	var body struct {
		WorkspaceID string `json:"workspaceId"`
		Tag         string `json:"tag"`
		Color       string `json:"color"`
	}
	if err := decodeJSON(w, r, &body); err != nil {
		httpError(w, 400, "invalid JSON")
		return
	}
	_, err := s.setTagColor(requestUser(r), body.WorkspaceID, body.Tag, body.Color)
	switch {
	case errors.Is(err, errTagWorkspaceNotFound):
		httpError(w, 404, "workspace not found")
	case errors.Is(err, errTagWorkspaceReadOnly):
		httpErrorCode(w, 403, "workspace_read_only", err.Error())
	case errors.Is(err, errTagRequired):
		httpError(w, 400, "tag is required")
	case errors.Is(err, errTagColorUnknown):
		httpError(w, 400, "invalid color")
	case err != nil:
		httpError(w, 500, err.Error())
	default:
		writeJSON(w, map[string]bool{"ok": true})
	}
}

// handleListTags returns every tag in the caller's readable pages with a usage
// count, most-used first — powering the sidebar "Tags" section and tag filter.
func (s *Server) handleListTags(w http.ResponseWriter, r *http.Request) {
	userID := requestUser(r).ID
	ws := s.scopeWorkspacesFor(requestUser(r), s.visibleWorkspaces(userID))
	if len(ws) == 0 {
		writeJSON(w, []map[string]any{})
		return
	}
	args := make([]any, len(ws))
	for i, v := range ws {
		args[i] = v
	}
	rows, err := s.db.Query(`SELECT id, workspace_id, tags FROM pages
		WHERE trashed_at IS NULL AND tags != '[]' AND tags != '' AND workspace_id IN (`+placeholders(len(ws))+`)`, args...)
	if err != nil {
		httpError(w, 500, err.Error())
		return
	}
	type row struct{ id, ws, tags string }
	var scanned []row
	for rows.Next() {
		var rw row
		if rows.Scan(&rw.id, &rw.ws, &rw.tags) == nil {
			scanned = append(scanned, rw)
		}
	}
	rows.Close() // drain before per-page visibility checks (single DB connection)

	// Aggregate case-insensitively (key by lower-case) so "Work" and "work" are
	// one tag, keeping the first-seen spelling as the display label — matching
	// normalizeTags' within-page case-insensitive dedupe.
	counts := map[string]int{}
	label := map[string]string{}
	for _, rw := range scanned {
		if s.forbiddenPrivateAncestor(userID, rw.id, rw.ws) {
			continue // hide tags that live only on pages the user can't read
		}
		var tags []string
		if json.Unmarshal([]byte(rw.tags), &tags) != nil {
			continue
		}
		for _, t := range tags {
			k := strings.ToLower(t)
			if _, ok := label[k]; !ok {
				label[k] = t
			}
			counts[k]++
		}
	}

	type tagCount struct {
		Tag   string `json:"tag"`
		Count int    `json:"count"`
	}
	out := make([]tagCount, 0, len(counts))
	for k, n := range counts {
		out = append(out, tagCount{label[k], n})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Count != out[j].Count {
			return out[i].Count > out[j].Count
		}
		return strings.ToLower(out[i].Tag) < strings.ToLower(out[j].Tag)
	})
	writeJSON(w, out)
}
