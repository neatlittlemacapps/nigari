package server

import (
	"fmt"
	"strings"
)

// Changing a view's layout (spec 018): a view's type is a setting like any
// other, changed by the doors that already save views (REST views PUT,
// set_view on a database view or an embed's view). Changing it keeps every
// other key of the view, the settings of the type it leaves included, so a
// table → board → table round trip gives back the table exactly (SC-002), and
// fills what the new type needs and does not have yet (R2).
//
// The browser applies the same rule before it saves (switchLayout in
// web/src/viewLayout.ts); testdata/viewlayout/cases.json holds the two to the
// same answers, read by viewlayout_test.go and check-viewlayout.mjs.

// boardGroupTypes are the property types a board makes columns from; the
// list applyViewSpec checks a board's group_by against.
var boardGroupTypes = map[string]bool{"select": true, "status": true, "multiselect": true, "relation": true}

// viewTypeList is the known types, for messages.
func viewTypeList() string {
	return "table, board, list, gallery, calendar, timeline, form or chart"
}

// errViewType is a view type that cannot be stored. REST answers it as 400
// invalid_view_type.
type errViewType struct{ msg string }

func (e errViewType) Error() string { return e.msg }

// checkViewType is the one type rule both doors apply (FR-010): a known type,
// and no form in an embed, which collects rows and stays on the database.
func checkViewType(t string, inEmbed bool) error {
	if !validViewTypes[t] {
		return errViewType{fmt.Sprintf("unknown view type %q: use %s", t, viewTypeList())}
	}
	if inEmbed && t == "form" {
		return errViewType{"a form cannot be shown in a document: it collects rows and stays on the database"}
	}
	return nil
}

// defaultViewName is the name set_view gives a view created without one: its
// type, capitalised ("Board").
func defaultViewName(typ string) string {
	if typ == "" {
		return ""
	}
	return strings.ToUpper(typ[:1]) + typ[1:]
}

// switchViewLayout returns the view as the given type: every key kept, and the
// settings the type needs filled in when the view has none that work.
// needsDate is true for a calendar or timeline on a database with no date
// property: the view then has no date to show, and the caller decides (the
// browser offers to add one, set_view refuses, FR-004a).
func switchViewLayout(view map[string]any, typ string, schema []map[string]any) (out map[string]any, needsDate bool) {
	out = cloneView(view)
	old, _ := view["type"].(string)
	if old == typ {
		return out, false
	}
	out["type"] = typ
	// A view still named after its type, as a new view is, takes the new
	// type's name: a tab reading "Table" over a calendar misleads (owner, "A",
	// spec 018 ux audit). A name somebody chose stays.
	if name, _ := out["name"].(string); name != "" && name == defaultViewName(old) {
		out["name"] = defaultViewName(typ)
	}
	propType := func(id any) string {
		s, _ := id.(string)
		if s == "" {
			return ""
		}
		for _, p := range schema {
			if pid, _ := p["id"].(string); pid == s {
				t, _ := p["type"].(string)
				if t == "" {
					t = "text"
				}
				return t
			}
		}
		return ""
	}
	first := func(ok func(string) bool, skip string) string {
		for _, p := range schema {
			id, _ := p["id"].(string)
			t, _ := p["type"].(string)
			if id != skip && ok(t) {
				return id
			}
		}
		return ""
	}
	setOrDrop := func(key, id string) {
		if id == "" {
			delete(out, key)
		} else {
			out[key] = id
		}
	}
	isDate := func(t string) bool { return t == "date" }
	switch typ {
	case "table", "list":
		// A board becomes a table or list grouped by its columns' property
		// (spec 024, Q6), so the change keeps how the rows were sorted out.
		// Only from a board: a chart's grouping is often by each row or by a
		// period, and a table was never grouped by it.
		// A table or list that was flat when it became a board left
		// grouped: false behind, so the round trip gives it back flat
		// (spec 018, SC-002).
		if was, has := out["grouped"].(bool); has && !was {
			delete(out, "grouped")
		} else if old == "board" && rowGroupTypes[propType(out["groupBy"])] {
			out["grouped"] = true
		}
	case "board":
		if (old == "table" || old == "list") && out["grouped"] != true {
			out["grouped"] = false
		}
		if !boardGroupTypes[propType(out["groupBy"])] {
			g := first(func(t string) bool { return t == "select" || t == "status" }, "")
			if g == "" {
				g = first(func(t string) bool { return boardGroupTypes[t] }, "")
			}
			setOrDrop("groupBy", g)
		}
	case "calendar", "timeline":
		if propType(out["dateProp"]) != "date" {
			setOrDrop("dateProp", first(isDate, ""))
		}
		start, _ := out["dateProp"].(string)
		if start == "" {
			return out, true
		}
		if typ == "timeline" {
			// The end, as a new timeline gets it: the next date property, when
			// there is one. One that is no longer a date is dropped.
			if end, has := out["endDateProp"]; has && (propType(end) != "date" || end == start) {
				delete(out, "endDateProp")
			}
			if _, has := out["endDateProp"]; !has {
				setOrDrop("endDateProp", first(isDate, start))
			}
		}
	case "chart":
		kind, _ := out["chartKind"].(string)
		if kind == "" {
			kind = "bar"
		}
		for k, v := range chartSettingsFor(kind, schema, out) {
			if v == nil {
				delete(out, k)
			} else {
				out[k] = v
			}
		}
	}
	return out, false
}

// chartSettingsFor mirrors chartSettingsFor in web/src/chartDefaults.ts: the
// settings a chart of this kind needs to be drawable, keeping the current
// grouping and value where they still work. A nil value removes the key (the
// browser spreads an undefined over it).
func chartSettingsFor(kind string, schema []map[string]any, current map[string]any) map[string]any {
	if kind == "number" {
		return map[string]any{"chartKind": "number"}
	}
	typeOf := func(id string) string {
		for _, p := range schema {
			if pid, _ := p["id"].(string); pid == id {
				t, _ := p["type"].(string)
				return t
			}
		}
		return ""
	}
	var numbers []string
	var groupable []map[string]any
	for _, p := range schema {
		t, _ := p["type"].(string)
		if numberTypes[t] {
			id, _ := p["id"].(string)
			numbers = append(numbers, id)
		}
		if groupableTypes[t] {
			groupable = append(groupable, p)
		}
	}
	eachRow := func() map[string]any {
		agg, _ := current["agg"].(string)
		if agg == "" || agg == "count" {
			agg = "sum"
		}
		out := map[string]any{"chartKind": kind, "groupBy": rowGroupKey, "agg": agg, "aggProp": nil}
		aggProp, _ := current["aggProp"].(string)
		for _, n := range numbers {
			if n == aggProp {
				out["aggProp"] = aggProp
			}
		}
		if out["aggProp"] == nil && len(numbers) > 0 {
			out["aggProp"] = numbers[0]
		}
		return out
	}
	group, _ := current["groupBy"].(string)
	if group == rowGroupKey && len(numbers) > 0 {
		return eachRow()
	}
	keep := ""
	for _, p := range groupable {
		if id, _ := p["id"].(string); id == group && group != "" {
			keep = id
		}
	}
	g := keep
	if g == "" {
		// defaultGrouping: the first select or status, else the first
		// property that groups at all.
		for _, p := range schema {
			if t, _ := p["type"].(string); t == "select" || t == "status" {
				g, _ = p["id"].(string)
				break
			}
		}
		if g == "" && len(groupable) > 0 {
			g, _ = groupable[0]["id"].(string)
		}
	}
	if g == "" {
		if len(numbers) > 0 {
			return eachRow()
		}
		return map[string]any{"chartKind": "number"}
	}
	out := map[string]any{"chartKind": kind, "groupBy": g}
	if typeOf(g) == "date" {
		period, _ := current["groupPeriod"].(string)
		if period == "" {
			period = "month"
		}
		out["groupPeriod"] = period
	}
	return out
}

// layoutDefaultsSaid names, for set_view's answer, the default the switch
// chose (FR-009): the grouping of a board or chart, the date of a calendar or
// timeline, the grouping a table or list kept from a board (spec 024).
func layoutDefaultsSaid(view map[string]any, schema []map[string]any) string {
	name := func(id any) string {
		s, _ := id.(string)
		if s == rowGroupKey {
			return "each row"
		}
		for _, p := range schema {
			if pid, _ := p["id"].(string); pid == s && s != "" {
				n, _ := p["name"].(string)
				return fmt.Sprintf("%q", n)
			}
		}
		return ""
	}
	typ, _ := view["type"].(string)
	var parts []string
	switch typ {
	case "board", "chart":
		if typ == "chart" {
			if k, _ := view["chartKind"].(string); k != "" {
				parts = append(parts, "a "+k+" chart")
			}
		}
		if g := name(view["groupBy"]); g != "" {
			parts = append(parts, "grouped by "+g)
		}
	case "table", "list":
		if on, _ := view["grouped"].(bool); on {
			if g := name(view["groupBy"]); g != "" {
				parts = append(parts, "grouped by "+g)
			}
		}
	case "calendar", "timeline":
		if d := name(view["dateProp"]); d != "" {
			parts = append(parts, "dates from "+d)
		}
		if e := name(view["endDateProp"]); e != "" && typ == "timeline" {
			parts = append(parts, "ending at "+e)
		}
	}
	if len(parts) == 0 {
		return "now a " + typ
	}
	return "now a " + typ + ", " + strings.Join(parts, ", ")
}

// switchViewType applies set_view's type, when it names a new one, to the
// view in place, before applyViewSpec: the other arguments of the same call
// (a group_by, a date_prop) then win over the defaults (R4). It returns the
// part of the answer that names the defaults chosen, "" when the type stays.
func switchViewType(v map[string]any, spec viewSpec, schema []map[string]any) (string, error) {
	if t, _ := v["type"].(string); spec.Type == "" || spec.Type == t {
		return "", nil
	}
	next, needsDate := switchViewLayout(v, spec.Type, schema)
	if needsDate && spec.DateProp == nil {
		return "", fmt.Errorf("this database has no date property, and a %s shows rows by date: add one with update_schema first, then set_view with type %q", spec.Type, spec.Type)
	}
	for k := range v {
		delete(v, k)
	}
	for k, val := range next {
		v[k] = val
	}
	return " — " + layoutDefaultsSaid(v, schema), nil
}
