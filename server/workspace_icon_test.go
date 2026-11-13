package server

import (
	"strings"
	"testing"
)

// A workspace's icon takes the four forms the picker in the Workspace picture
// dialog produces (an emoji, lucide:Name, mdi:Name, an uploaded picture). The
// route and the MCP tool cut every icon to eight characters, so "lucide:Rocket"
// was stored as "lucide:R" and the sidebar drew nothing (#593).
func TestAWorkspaceIconKeepsTheFormsThePickerMakes(t *testing.T) {
	s := testServer(t)
	uid, cookie := signedIn(t, s, "icons@example.test")
	ws := s.firstWorkspaceOf(t, uid)
	u := &user{ID: uid, Name: "Test"}
	stored := func() string {
		var icon string
		if err := s.db.QueryRow(`SELECT icon FROM workspaces WHERE id = ?`, ws).Scan(&icon); err != nil {
			t.Fatal(err)
		}
		return icon
	}
	for _, icon := range []string{
		"🚀", "lucide:Rocket", "lucide:Rocket:#e03131", "mdi:rocket-launch", "mdi:rocket-launch:#2f9e44", "/files/0123456789abcdef0123456789abcdef.png",
	} {
		// By the route, as the dialog does.
		rec := requestAs(t, s, cookie, "PATCH", "/api/workspaces/"+ws, `{"icon":"`+icon+`","image":""}`)
		if rec.Code != 200 || stored() != icon {
			t.Errorf("REST %q: %d, stored %q", icon, rec.Code, stored())
		}
		// And by the tool, which has to agree.
		s.db.Exec(`UPDATE workspaces SET icon = '' WHERE id = ?`, ws)
		if _, err := callTool(t, s, u, "workspace", `{"workspace_id":"`+ws+`","icon":"`+icon+`"}`); err != nil || stored() != icon {
			t.Errorf("MCP %q: %v, stored %q", icon, err, stored())
		}
	}

	// Text that is not an icon is still cut to what an emoji or two takes.
	if rec := requestAs(t, s, cookie, "PATCH", "/api/workspaces/"+ws, `{"icon":"a very long piece of text"}`); rec.Code != 200 || stored() != "a very l" {
		t.Errorf("long text: %d, stored %q", rec.Code, stored())
	}

	// An address elsewhere, a data URL, a path that is not an upload and a
	// half-written reference are refused, and nothing is stored: the sidebar
	// never fetches from elsewhere.
	s.db.Exec(`UPDATE workspaces SET icon = '🚀' WHERE id = ?`, ws)
	for _, bad := range []string{
		"https://example.test/pixel.png", "http://example.test/x", "data:image/png;base64,AAAA", "/api/pages", "/files/../nigari.db", "lucide:", "lucide:has space", "mdi:" + strings.Repeat("a", 70),
	} {
		rec := requestAs(t, s, cookie, "PATCH", "/api/workspaces/"+ws, `{"icon":"`+bad+`"}`)
		if rec.Code != 400 || !strings.Contains(rec.Body.String(), "bad_icon") || stored() != "🚀" {
			t.Errorf("REST %q: %d %s, stored %q", bad, rec.Code, rec.Body.String(), stored())
		}
		if _, err := callTool(t, s, u, "workspace", `{"workspace_id":"`+ws+`","icon":"`+bad+`"}`); err == nil || stored() != "🚀" {
			t.Errorf("MCP %q: accepted (%v), stored %q", bad, err, stored())
		}
	}

	// Clearing it still works.
	if rec := requestAs(t, s, cookie, "PATCH", "/api/workspaces/"+ws, `{"icon":""}`); rec.Code != 200 || stored() != "" {
		t.Errorf("clearing: %d, stored %q", rec.Code, stored())
	}
}
