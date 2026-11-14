package server

import (
	"encoding/json"
	"errors"
	"fmt"
)

// A property's visibility on a row's page (spec 015, research R1, R2).
//
// Each property of a database may carry `pageVisibility`: "hide_empty" (shown
// only while the row has a value) or "hide" (folded under "N more
// properties"). Absent means shown. Every property that existed before this
// key keeps being shown, with no upgrade step, because absence IS the
// default; "show" is therefore never stored, only accepted and turned into
// absence, so an agent merging with update_schema can put a property back.
//
// The REST route stores a schema as sent and does not look inside it, so
// without this check a script could store a value no row's page knows how
// to draw. One function for every door that writes a schema: PUT
// /api/collections/{id}, update_schema and create_database.

// errBadPropertyVisibility is the refusal; REST answers it 400
// invalid_property_visibility.
var errBadPropertyVisibility = errors.New("bad property visibility")

const pageVisibilityKey = "pageVisibility"

// checkPropertyVisibility checks every property's pageVisibility and removes
// the ones that mean "shown" ("show" or ""). It changes the maps in place and
// says whether it removed any, so a caller holding the schema as sent bytes
// knows to write it out again.
func checkPropertyVisibility(schema []map[string]any) (removed bool, err error) {
	for _, p := range schema {
		raw, ok := p[pageVisibilityKey]
		if !ok {
			continue
		}
		v, isString := raw.(string)
		switch {
		case raw == nil, isString && (v == "" || v == "show"):
			delete(p, pageVisibilityKey)
			removed = true
		case isString && (v == "hide_empty" || v == "hide"):
		default:
			name, _ := p["name"].(string)
			if name == "" {
				name, _ = p["id"].(string)
			}
			return removed, fmt.Errorf("%w: %q on property %q — use \"hide_empty\" (hidden on a row's page while empty), \"hide\" (always hidden there) or \"show\"",
				errBadPropertyVisibility, fmt.Sprint(raw), name)
		}
	}
	return removed, nil
}

// importedSchemaVisibility is the rule for a schema that arrives in a
// workspace archive (transfer.go): a pageVisibility no row page can draw is
// dropped, so the property is shown, rather than refusing the whole import.
// Stored as it came, it would have made every later save of that database
// refused, update_schema's and the interface's alike, because both check the
// whole schema they write (review finding, spec 015). A schema that is not a
// list of properties is left as it was: the import never judged that.
func importedSchemaVisibility(raw string) string {
	var schema []map[string]any
	if json.Unmarshal([]byte(raw), &schema) != nil {
		return raw
	}
	touched := false
	for _, p := range schema {
		if _, has := p[pageVisibilityKey]; !has {
			continue
		}
		touched = true
		// One property at a time, so a bad value drops only its own key; the
		// check also turns "show" into no key.
		if _, err := checkPropertyVisibility([]map[string]any{p}); err != nil {
			delete(p, pageVisibilityKey)
		}
	}
	if !touched {
		return raw
	}
	b, err := json.Marshal(schema)
	if err != nil {
		return raw
	}
	return string(b)
}
