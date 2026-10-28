package server

import (
	"encoding/json"
	"fmt"
)

// How a view opens its rows (spec 007): a key on the view's JSON, beside its
// filters and sort.
//
//	missing       a click navigates the tab, as before this feature
//	"side_peek"   the row opens in a panel beside the view
//	"center_peek" the row opens in a panel over the view (follow-up)
//
// "full_page" is accepted on the way in and stored as no key at all, so a view
// saved before the feature and a view set back to full page are the same bytes.
//
// Both doors call this: PUT /api/collections/{id} (normalizeViews) and
// MCP set_view (checkViewOpenIn, through applyViewSpec). REST used to store the
// views array as sent, with only a JSON check; a rule on one side only is how
// this repository's earlier REST/MCP gaps started.

const (
	viewOpenFullPage   = "full_page"
	viewOpenSidePeek   = "side_peek"
	viewOpenCenterPeek = "center_peek"
)

// centerPeekShipped says the interface can draw a centre peek (spec 007,
// phase 7). While it was false no door could store the value: a view set to
// it would have behaved as a full page while an agent believed otherwise.
// Kept as a switch so the refusal stays tested (viewopen_test.go).
var centerPeekShipped = true

// errViewOpenIn marks a refusal of this rule, so REST can answer it with its
// own code rather than as a generic bad request.
type errViewOpenIn struct{ msg string }

func (e errViewOpenIn) Error() string { return e.msg }

// checkViewOpenIn validates view["openIn"] in place: an allowed value stays,
// "full_page" is removed, anything else is refused.
func checkViewOpenIn(view map[string]any) error {
	raw, ok := view["openIn"]
	if !ok || raw == nil {
		delete(view, "openIn")
		return nil
	}
	v, isString := raw.(string)
	allowed := "full_page or side_peek"
	if centerPeekShipped {
		allowed = "full_page, side_peek or center_peek"
	}
	if !isString {
		return errViewOpenIn{fmt.Sprintf("open_in must be %s", allowed)}
	}
	switch v {
	case viewOpenFullPage, "":
		delete(view, "openIn")
		return nil
	case viewOpenSidePeek, viewOpenCenterPeek:
	default:
		return errViewOpenIn{fmt.Sprintf("open_in must be %s, not %q", allowed, v)}
	}
	if v == viewOpenCenterPeek && !centerPeekShipped {
		return errViewOpenIn{"center_peek is not available yet; use side_peek or full_page"}
	}
	// A form shows no rows, so there is nothing for the setting to open. Stored
	// anyway it would follow the view into a later type it can never have
	// (a view's type does not change), and only confuse whoever reads it back.
	if t, _ := view["type"].(string); t == "form" {
		return errViewOpenIn{"a form view shows no rows, so it has no open_in"}
	}
	return nil
}

// normalizeViews runs the rules a stored view must meet over a whole views
// array, as the browser sends it: checkViewOpenIn on every view (spec 007) and
// checkChartView on every chart (spec 004). The bytes come back unchanged
// unless a "full_page" had to be dropped, so a save that does not touch a
// setting stores exactly what was sent.
//
// schema is the database's properties after this save; stored is the views
// array as it was. A chart is checked against the schema only when its chart
// settings differ from the stored ones (checkChartView explains why).
func normalizeViews(raw []byte, schema []map[string]any, stored []map[string]any) ([]byte, error) {
	var views []any
	if err := json.Unmarshal(raw, &views); err != nil {
		// Not an array: the caller's JSON check has already accepted it, and
		// these rules have nothing to say about a shape no view can have.
		return raw, nil
	}
	before := map[string]string{}
	for _, v := range stored {
		if id, _ := v["id"].(string); id != "" {
			before[id] = chartSignature(v)
		}
	}
	changed := false
	for i, v := range views {
		view, ok := v.(map[string]any)
		if !ok {
			continue
		}
		name, _ := view["name"].(string)
		if name == "" {
			name = fmt.Sprintf("view %d", i+1)
		}
		_, had := view["openIn"]
		if err := checkViewOpenIn(view); err != nil {
			return nil, errViewOpenIn{fmt.Sprintf("%s: %s", name, err.Error())}
		}
		if _, has := view["openIn"]; had && !has {
			changed = true
		}
		id, _ := view["id"].(string)
		old, known := before[id]
		if err := checkChartView(view, schema, !known || old != chartSignature(view)); err != nil {
			return nil, errChart{fmt.Sprintf("%s: %s", name, err.Error())}
		}
	}
	if !changed {
		return raw, nil
	}
	return json.Marshal(views)
}
