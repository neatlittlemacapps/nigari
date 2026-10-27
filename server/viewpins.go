package server

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// A row made in a filtered view takes the values the view's filters pin down
// (spec 005, #139). Before this, New in a view filtered to "Status is To do"
// created an empty row, which matched nothing and vanished from the view the
// moment it was made; the person had to find it elsewhere and set the status
// by hand.
//
// The rule lives here, on the server, and every door calls it: POST
// /api/pages, the row-from-template route, and the MCP create_page and
// create_rows tools. The browser sends a view id and never works out values of
// its own, so an agent and a person making a row in the same view store the
// same thing (constitution III). Copies of filter semantics have drifted
// before: "is" on a number matched in the browser and not on the server (#95).

// pinTypes are the property types a pin may write, and for each whether the
// value is stored as a list. Everything else (formula, rollup, backrelation,
// lastActivity, checklist) is derived or structured, and never pinned.
var pinTypes = map[string]bool{
	"text": false, "url": false, "number": false, "date": false, "checkbox": false,
	"select": false, "person": false,
	"multiselect": true, "relation": true,
}

// pinsFromFilters works out the values a view's filters pin to a single
// answer: an armed "is" with exactly one value, on a property that can be
// written. The value comes back in the property's stored form, because the
// comparison is typed (#95): "5" as text never matches the number 5.
//
// A property two filters pin differently gets nothing; no row can satisfy
// both, and guessing one would store a value the person never chose. Every
// other operator (is_not, contains, gt, lt, between, is_not_empty, "is" with
// several values) pins nothing; is_empty needs nothing, a new row is empty.
func pinsFromFilters(schema []map[string]any, filters []rowFilter, now time.Time) map[string]any {
	props := map[string]map[string]any{}
	for _, p := range schema {
		if id, _ := p["id"].(string); id != "" {
			props[id] = p
		}
	}
	pins := map[string]any{}
	clash := map[string]bool{}
	for _, f := range filters {
		p, ok := props[f.Prop]
		if !ok {
			continue
		}
		op := f.Op
		if op == "" && f.Value != "" {
			op = "is"
		}
		if op != "is" {
			continue
		}
		vals := f.vals()
		if len(vals) != 1 || vals[0] == "" || isUnfinishedRelativeDay(vals[0]) {
			continue
		}
		v, ok := pinValue(p, vals[0], now)
		if !ok {
			continue
		}
		if prev, seen := pins[f.Prop]; seen {
			a, _ := json.Marshal(prev)
			b, _ := json.Marshal(v)
			if string(a) != string(b) {
				clash[f.Prop] = true
			}
			continue
		}
		pins[f.Prop] = v
	}
	for prop := range clash {
		delete(pins, prop)
	}
	return pins
}

// pinValue is one filter value in the property's stored form, or false when
// it cannot be stored there.
func pinValue(p map[string]any, raw string, now time.Time) (any, bool) {
	typ, _ := p["type"].(string)
	list, writable := pinTypes[typ]
	if !writable {
		return nil, false
	}
	var v any
	switch typ {
	case "number":
		n, err := strconv.ParseFloat(strings.TrimSpace(raw), 64)
		if err != nil {
			return nil, false
		}
		v = n
	case "checkbox":
		switch raw {
		case "true":
			v = true
		case "false":
			v = false
		default:
			return nil, false
		}
	case "date":
		// The day the filter means now, by the rule the rows query filters
		// with. A word that names no day pins nothing.
		if day, ok := resolveSmartDate(raw, now); ok {
			v = day
		} else if dayRe.MatchString(raw) {
			v = raw
		} else {
			return nil, false
		}
	case "select", "multiselect":
		// An option that has since been removed is not pinned: the row would
		// store a value the property no longer offers.
		if !hasOption(p, raw) {
			return nil, false
		}
		v = raw
	case "person":
		v = raw
		if multi, _ := p["personMultiple"].(bool); multi {
			list = true
		}
	default:
		v = raw
	}
	if list {
		return []any{v}, true
	}
	return v, true
}

func hasOption(p map[string]any, id string) bool {
	opts, _ := p["options"].([]any)
	for _, o := range opts {
		if om, _ := o.(map[string]any); om != nil && om["id"] == id {
			return true
		}
	}
	return false
}

// errViewNotInDatabase is the refusal for a view id that names no view of the
// database a row is being made in. Checked before anything is created.
type errViewNotInDatabase struct{ viewID, colID string }

func (e errViewNotInDatabase) Error() string {
	return fmt.Sprintf("view %q is not a view of database %q", e.viewID, e.colID)
}

// viewOf reads one view of a database: its name and its filters.
func (s *Server) viewOf(colID, viewID string) (name string, filters []rowFilter, schema []map[string]any, err error) {
	schema, views, err := s.loadCollection(colID)
	if err != nil {
		return "", nil, nil, err
	}
	for _, v := range views {
		if id, _ := v["id"].(string); id != viewID {
			continue
		}
		name, _ = v["name"].(string)
		raw, _ := json.Marshal(v["filters"])
		var fs []filterJSON
		_ = json.Unmarshal(raw, &fs)
		for _, f := range fs {
			if f.Property != "" {
				filters = append(filters, f.rowFilter())
			}
		}
		return name, filters, schema, nil
	}
	return "", nil, nil, errViewNotInDatabase{viewID, colID}
}

// rowPinsForView is what every door calls before it creates a row "in" a
// view: the values to store, under whatever the caller passes explicitly.
func (s *Server) rowPinsForView(colID, viewID string) (map[string]any, error) {
	_, filters, schema, err := s.viewOf(colID, viewID)
	if err != nil {
		return nil, err
	}
	return pinsFromFilters(schema, filters, time.Now()), nil
}

// rowMatchesView reports whether a row passes every filter of the view, by
// the SQL the rows query fills the view with, so the answer cannot disagree
// with what the person then sees.
func (s *Server) rowMatchesView(rowID, colID, viewID string) (bool, error) {
	_, filters, _, err := s.viewOf(colID, viewID)
	if err != nil {
		return false, err
	}
	return s.rowMatchesFilters(rowID, s.viewFiltersNow(colID, filters))
}

// viewFiltersNow types a view's filters and resolves their relative days, as
// collectionRowsQuery does per query. create_rows does it once for all rows.
func (s *Server) viewFiltersNow(colID string, filters []rowFilter) []rowFilter {
	return s.typeFilters(colID, s.resolveSmartDates(colID, filters, time.Now()))
}

// rowMatchesFilters runs prepared filters (viewFiltersNow) against one row.
// On the writer: the row was just written and the read pool may not see it.
func (s *Server) rowMatchesFilters(rowID string, filters []rowFilter) (bool, error) {
	q := `SELECT 1 FROM pages WHERE id = ?`
	args := []any{rowID}
	for _, f := range filters {
		cond, a := f.where()
		if cond == "" {
			continue
		}
		q += " AND (" + cond + ")"
		args = append(args, a...)
	}
	var one int
	switch err := s.db.QueryRow(q, args...).Scan(&one); err {
	case nil:
		return true, nil
	case sql.ErrNoRows:
		return false, nil
	default:
		return false, err
	}
}

// viewMatchNote is what an agent's answer adds after creating a row in a
// view: whether it matches, and if not, that it will not show there. It names
// the view by id, not by name: a name is text a person wrote, and returning
// it would need wrapUntrusted for no gain.
func (s *Server) viewMatchNote(rowID, colID, viewID string) string {
	_, filters, _, err := s.viewOf(colID, viewID)
	if err != nil {
		return ""
	}
	ok, err := s.rowMatchesFilters(rowID, s.viewFiltersNow(colID, filters))
	if err != nil {
		return ""
	}
	if ok {
		return "; matches_view: true"
	}
	return fmt.Sprintf("; matches_view: false. The row does not match the filters of view %s, so it will not show there.", viewID)
}

// mergePins lays explicit values over the pins: a value the caller typed or a
// board column decided always wins (FR-002). Returns the merged JSON object.
func mergePins(pins map[string]any, explicit json.RawMessage) (json.RawMessage, error) {
	out := map[string]json.RawMessage{}
	for k, v := range pins {
		b, _ := json.Marshal(v)
		out[k] = b
	}
	if len(explicit) > 0 && string(explicit) != "null" {
		var ex map[string]json.RawMessage
		if err := json.Unmarshal(explicit, &ex); err != nil {
			return nil, fmt.Errorf("properties must be a JSON object")
		}
		for k, v := range ex {
			out[k] = v
		}
	}
	return json.Marshal(out)
}

// propsInView is the properties a row made in a view starts with: the view's
// pins under the caller's explicit values.
func (s *Server) propsInView(colID, viewID string, explicit json.RawMessage) (json.RawMessage, error) {
	pins, err := s.rowPinsForView(colID, viewID)
	if err != nil {
		return nil, err
	}
	return mergePins(pins, explicit)
}

// withMatchesView is a created page as JSON with matchesView beside its
// fields, the answer the interface reads to decide on the "not shown here"
// notice.
func withMatchesView(p any, matches bool) map[string]any {
	out := map[string]any{}
	b, _ := json.Marshal(p)
	_ = json.Unmarshal(b, &out)
	out["matchesView"] = matches
	return out
}
