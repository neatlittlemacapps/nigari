package server

import (
	"encoding/json"
	"fmt"
	"strings"
)

// A page's Appearance switches (⋯ → Appearance in the app) are props under keys
// no property id can take. update_page sets them and get_page reports them, so an
// agent does not have to know the key or reach for set_properties, whose answer
// calls every page a row.
var appearanceSettings = []struct{ Param, Key, Label string }{
	{"full_width", "_fullWidth", "full width"},
}

// appearanceNote is what get_page appends: the switches that are ON. A page with
// none on reads exactly as before, and the tool description says that missing
// means off.
func appearanceNote(props json.RawMessage) string {
	var on []string
	for _, a := range appearanceSettings {
		if propIsTrue(props, a.Key) {
			on = append(on, a.Param+"=true")
		}
	}
	if len(on) == 0 {
		return ""
	}
	return "\nPage settings: " + strings.Join(on, ", ")
}

// mcpSetAppearance turns switches on or off (false removes the key, so the page
// goes back to carrying nothing). Documents only, as in the app. The caller has
// already checked that this credential may write the page.
func (s *Server) mcpSetAppearance(u *user, pageID string, changes map[string]bool) (string, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return "", err
	}
	defer tx.Rollback()
	var current, typ string
	var trashed *string
	if err := tx.QueryRow(`SELECT props, type, trashed_at FROM pages WHERE id = ?`, pageID).Scan(&current, &typ, &trashed); err != nil {
		return "", fmt.Errorf("page %q not found", pageID)
	}
	if trashed != nil {
		return "", fmt.Errorf("page %q is in the trash", pageID)
	}
	if typ != "doc" {
		return "", fmt.Errorf("page settings apply to documents only; %q is a collection", pageID)
	}
	merged := map[string]json.RawMessage{}
	json.Unmarshal([]byte(current), &merged)
	patch := map[string]json.RawMessage{}
	var said []string
	for _, a := range appearanceSettings {
		on, ok := changes[a.Param]
		if !ok {
			continue
		}
		if on {
			patch[a.Key] = json.RawMessage("true")
			said = append(said, a.Label+" on")
		} else {
			patch[a.Key] = json.RawMessage("null")
			said = append(said, a.Label+" off")
		}
	}
	before := map[string]json.RawMessage{}
	for k, v := range merged {
		before[k] = v
	}
	for k, v := range patch {
		if string(v) == "null" {
			delete(merged, k)
		} else {
			merged[k] = v
		}
	}
	mergedJSON, err := json.Marshal(merged)
	if err != nil {
		return "", err
	}
	if _, err := tx.Exec(`UPDATE pages SET props = ?, updated_at = ? WHERE id = ?`, string(mergedJSON), now(), pageID); err != nil {
		return "", err
	}
	if err := tx.Commit(); err != nil {
		return "", err
	}
	s.pagesChanged()
	if diff := propsDiff(before, patch); len(diff) > 0 {
		if blob, err := json.Marshal(diff); err == nil {
			s.auditChanges("agent", u.ID, u.Name+" (MCP)", "set_properties", pageID, s.pageWorkspace(pageID),
				s.pageTitle(pageID)+": "+strings.Join(said, ", "), string(blob))
		}
	}
	return fmt.Sprintf("Set %s on page %s", strings.Join(said, ", "), pageID), nil
}
