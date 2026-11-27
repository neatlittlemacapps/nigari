package server

import (
	"encoding/json"
	"strings"
	"testing"
)

// A gallery's card image (spec 028, D5): one rule, checkViewCardImage, on
// every door that saves a view. The fixture is the quick-filter one (status
// select, system text, owner person) plus a Files & media and a URL property.

func cardImageFixture(t *testing.T) lockFixture {
	t.Helper()
	f := quickFixture(t)
	var schema string
	f.s.db.QueryRow(`SELECT schema FROM collections WHERE page_id = ?`, f.col).Scan(&schema)
	schema = strings.TrimSuffix(strings.TrimSpace(schema), "]") + `,{"id":"media","name":"Media","type":"files"},{"id":"link","name":"Link","type":"url"}]`
	if _, err := f.s.db.Exec(`UPDATE collections SET schema = ? WHERE page_id = ?`, schema, f.col); err != nil {
		t.Fatal(err)
	}
	return f
}

func galleryWith(cardImage string) string {
	return `[{"id":"t","name":"Table","type":"table"},{"id":"g","name":"Gallery","type":"gallery","cardImage":` + cardImage + `}]`
}

// REST: every allowed shape is stored, every other is refused with its own
// code, and automatic ("" or null) leaves the key out.
func TestCardImageOverREST(t *testing.T) {
	f := cardImageFixture(t)
	// A property is stored with its prefix; a bare id that is no keyword is
	// taken and given it.
	for v, want := range map[string]string{"cover": "cover", "content": "content", "none": "none",
		"prop:media": "prop:media", "prop:link": "prop:link", "media": "prop:media"} {
		if code, body := f.putViews(t, galleryWith(`"`+v+`"`)); code != 200 {
			t.Fatalf("%s: %d %s", v, code, body)
		}
		if got := f.viewByID(t, "g")["cardImage"]; got != want {
			t.Errorf("%s: stored %v, want %s", v, got, want)
		}
	}
	for _, auto := range []string{`""`, `null`, `"auto"`} {
		if code, body := f.putViews(t, galleryWith(auto)); code != 200 {
			t.Fatalf("automatic %s: %d %s", auto, code, body)
		}
		if _, has := f.viewByID(t, "g")["cardImage"]; has {
			t.Errorf("automatic %s was stored", auto)
		}
	}
	for name, views := range map[string]string{
		"a text property":    galleryWith(`"system"`),
		"a select":           galleryWith(`"status"`),
		"a prefixed select":  galleryWith(`"prop:status"`),
		"a prefixed unknown": galleryWith(`"prop:gone"`),
		"an unknown id":      galleryWith(`"gone"`),
		"not a string":       galleryWith(`3`),
		"on a table":         `[{"id":"t","name":"Table","type":"table","cardImage":"cover"}]`,
	} {
		code, body := f.putViews(t, views)
		if code != 400 || !strings.Contains(body, "invalid_view_card_image") {
			t.Errorf("%s: %d %s, want 400 invalid_view_card_image", name, code, body)
		}
	}
}

// A property chosen as the card image that later stops being one (deleted,
// or turned into text) must not block every later views save: the view
// nobody touched keeps it, and the browser draws it as automatic. Setting it
// now is still refused.
func TestAStaleCardImageDoesNotBlockSaves(t *testing.T) {
	f := cardImageFixture(t)
	if code, body := f.putViews(t, galleryWith(`"media"`)); code != 200 {
		t.Fatalf("setup: %d %s", code, body)
	}
	var schema string
	f.s.db.QueryRow(`SELECT schema FROM collections WHERE page_id = ?`, f.col).Scan(&schema)
	schema = strings.Replace(schema, `"type":"files"`, `"type":"text"`, 1)
	f.s.db.Exec(`UPDATE collections SET schema = ? WHERE page_id = ?`, schema, f.col)

	code, body := f.putViews(t, `[{"id":"t","name":"Table","type":"table","colWidths":{"__title":300}},{"id":"g","name":"Gallery","type":"gallery","cardImage":"prop:media"}]`)
	if code != 200 {
		t.Fatalf("an unrelated save was refused: %d %s", code, body)
	}
	if f.viewByID(t, "g")["cardImage"] != "prop:media" {
		t.Error("the stale card image was not kept")
	}
	// Choosing it on another gallery now is refused.
	if code, body := f.putViews(t, `[{"id":"t","name":"Table","type":"table"},{"id":"g","name":"Gallery","type":"gallery","cardImage":"prop:media"},{"id":"g2","name":"Second","type":"gallery","cardImage":"prop:media"}]`); code != 400 || !strings.Contains(body, "invalid_view_card_image") {
		t.Errorf("a text property chosen now: %d %s, want 400", code, body)
	}
}

// MCP set_view: the same rule; "" goes back to automatic.
func TestCardImageOverMCP(t *testing.T) {
	f := cardImageFixture(t)
	out, err := callTool(t, f.s, f.agent, "set_view", `{"page_id":"`+f.col+`","type":"gallery","name":"Cards","card_image":"link"}`)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	var id string
	var views []map[string]any
	json.Unmarshal([]byte(f.storedViews(t)), &views)
	for _, v := range views {
		if v["name"] == "Cards" {
			id, _ = v["id"].(string)
			if v["cardImage"] != "prop:link" {
				t.Errorf("stored %v (%s)", v["cardImage"], out)
			}
		}
	}
	if id == "" {
		t.Fatalf("no gallery made: %s", out)
	}
	for _, bad := range []string{"system", "gone"} {
		if _, err := callTool(t, f.s, f.agent, "set_view", `{"page_id":"`+f.col+`","view_id":"`+id+`","card_image":"`+bad+`"}`); err == nil || !strings.Contains(err.Error(), "card_image") {
			t.Errorf("%s: %v, want a card_image refusal", bad, err)
		}
	}
	if _, err := callTool(t, f.s, f.agent, "set_view", `{"page_id":"`+f.col+`","view_id":"t","card_image":"cover"}`); err == nil {
		t.Error("a table took a card image")
	}
	if _, err := callTool(t, f.s, f.agent, "set_view", `{"page_id":"`+f.col+`","view_id":"`+id+`","card_image":""}`); err != nil {
		t.Fatal(err)
	}
	if _, has := f.viewByID(t, id)["cardImage"]; has {
		t.Error(`card_image "" did not go back to automatic`)
	}
}

// A locked database: the card image is a view change like any other, and a
// property a locked gallery draws its cards from cannot be removed.
func TestALockedGalleryKeepsItsCardImage(t *testing.T) {
	f := cardImageFixture(t)
	if code, body := f.putViews(t, galleryWith(`"media"`)); code != 200 {
		t.Fatalf("setup: %d %s", code, body)
	}
	f.lock(t)
	if code, body := f.putViews(t, galleryWith(`"cover"`)); code != 409 || !strings.Contains(body, "views_locked") {
		t.Errorf("REST change while locked: %d %s", code, body)
	}
	if _, err := callTool(t, f.s, f.agent, "set_view", `{"page_id":"`+f.col+`","view_id":"g","card_image":"cover"}`); err == nil {
		t.Error("set_view changed a locked gallery's card image")
	}
	if _, err := callTool(t, f.s, f.agent, "update_schema", `{"page_id":"`+f.col+`","remove_properties":["media"]}`); err == nil || !strings.Contains(err.Error(), "locked") {
		t.Errorf("removing the card image's property: %v, want a lock refusal", err)
	}
}

// An embed's own views take a card image through the same rule, and the
// database's views stay as they were.
func TestAnEmbedsGalleryTakesACardImage(t *testing.T) {
	f := newEmbedFixture(t)
	before := f.dbViews(t)
	if _, err := callTool(t, f.s, f.u, "set_view", `{"page_id":"`+f.doc+`","embed_id":"emb1","type":"gallery","name":"Cards","card_image":"content"}`); err != nil {
		t.Fatal(err)
	}
	found := false
	for _, v := range f.embedViews(t) {
		if v["name"] == "Cards" {
			found = true
			if !strings.Contains(mustJSON(t, v), `"card_image":"content"`) && !strings.Contains(mustJSON(t, v), `"cardImage":"content"`) {
				t.Errorf("the embed's gallery lacks its card image: %s", mustJSON(t, v))
			}
		}
	}
	if !found {
		t.Fatalf("no gallery in the embed: %v", f.embedViews(t))
	}
	if _, err := callTool(t, f.s, f.u, "set_view", `{"page_id":"`+f.doc+`","embed_id":"emb1","type":"gallery","name":"Bad","card_image":"owner"}`); err == nil || !strings.Contains(err.Error(), "card_image") {
		t.Errorf("a text property in an embed: %v, want a card_image refusal", err)
	}
	if f.dbViews(t) != before {
		t.Error("the database's views changed")
	}
}

// Property ids are made from names: a Files & media property called "Cover"
// has the id cover, made by update_schema. The keyword cover stays the page's
// cover, and the property is chosen by its prefix (code review).
func TestACardImagePropertyNamedLikeAKeyword(t *testing.T) {
	f := cardImageFixture(t)
	if _, err := callTool(t, f.s, f.agent, "update_schema", `{"page_id":"`+f.col+`","properties":[{"name":"Cover","type":"files"},{"name":"Auto","type":"url"}]}`); err != nil {
		t.Fatal(err)
	}
	var schema string
	f.s.db.QueryRow(`SELECT schema FROM collections WHERE page_id = ?`, f.col).Scan(&schema)
	if !strings.Contains(schema, `"id":"cover"`) || !strings.Contains(schema, `"id":"auto"`) {
		t.Fatalf("the ids are not the names: %s", schema)
	}
	for v, want := range map[string]string{"cover": "cover", "prop:cover": "prop:cover", "prop:auto": "prop:auto"} {
		if code, body := f.putViews(t, galleryWith(`"`+v+`"`)); code != 200 {
			t.Fatalf("%s: %d %s", v, code, body)
		}
		if got := f.viewByID(t, "g")["cardImage"]; got != want {
			t.Errorf("%s: stored %v, want %s", v, got, want)
		}
	}
	// "auto" is automatic, not the property.
	if code, body := f.putViews(t, galleryWith(`"auto"`)); code != 200 {
		t.Fatalf("auto: %d %s", code, body)
	}
	if _, has := f.viewByID(t, "g")["cardImage"]; has {
		t.Error(`"auto" was stored`)
	}
}
