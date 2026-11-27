package server

import "fmt"

// A gallery's card image (spec 028, D5): where each card's picture comes from.
// Stored on the view as cardImage:
//
//	absent      Automatic: the first image of the first Files & media
//	            property, the cover, the icon, the first image in the content
//	"cover"     the page's cover only
//	"content"   the first image in the page's content only
//	"none"      no image area at all
//	a prop id   a Files & media or URL property
//
// The order Automatic follows and what each choice draws is the browser's
// (web/src/cardImage.ts, cardImageFor); the server only keeps the stored
// value to these shapes, on every door that saves views: REST's views save
// (normalizeViews), set_view and an embed's own views (applyViewSpec).

// errViewCardImage marks a refusal of checkViewCardImage, so REST can answer it
// with its own code (invalid_view_card_image).
type errViewCardImage struct{ msg string }

func (e errViewCardImage) Error() string { return e.msg }

// checkViewCardImage validates view["cardImage"] in place. strict: this save
// sets or changes it. Unchanged, a property id that has since gone (deleted,
// or turned into another type) is kept and drawn as Automatic, so a later save
// of the views is not refused for a view nobody touched (FR-009).
func checkViewCardImage(view map[string]any, schema []map[string]any, strict bool) error {
	raw, ok := view["cardImage"]
	if !ok || raw == nil {
		delete(view, "cardImage")
		return nil
	}
	v, isString := raw.(string)
	if !isString {
		return errViewCardImage{"card_image must be cover, content, none, a Files & media or URL property id, or empty for automatic"}
	}
	if v == "" || v == "auto" {
		delete(view, "cardImage")
		return nil
	}
	if !strict {
		return nil
	}
	if t, _ := view["type"].(string); t != "gallery" {
		return errViewCardImage{fmt.Sprintf("a %s view has no card image; only a gallery does", t)}
	}
	switch v {
	case "cover", "content", "none":
		return nil
	}
	for _, p := range schema {
		if id, _ := p["id"].(string); id != v {
			continue
		}
		switch t, _ := p["type"].(string); t {
		case "files", "url":
			return nil
		default:
			return errViewCardImage{fmt.Sprintf("card_image: %q is a %s property; a card image comes from a Files & media or URL property", v, t)}
		}
	}
	return errViewCardImage{fmt.Sprintf("card_image: %q is not a property of this database, nor cover, content or none", v)}
}
