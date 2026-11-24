package server

import (
	"encoding/json"
	"fmt"
)

// Grouping a table or a list (spec 024, research R1, R2). A view's grouping
// lives in the keys a board and a chart already use — groupBy, groupPeriod,
// hiddenGroups, statusGroups — plus three of its own: grouped, the switch
// that makes a table or list draw its groupBy, groupReverse, and
// showEmptyGroups (a chart's showEmpty means the No value group only).
//
// The switch is the point. A board changed into a table keeps its groupBy
// (spec 018), so tables that were boards carry one, in databases and in the
// views of embeds inside documents. Drawing every groupBy would group those
// tables the day this shipped; an upgrade step could not reach the embeds.
// So a table or list groups only when something set grouped: the Group menu,
// set_view's group_by, or a layout change from a board made after this.
//
// Both doors call checkViewGrouping: normalizeViews for PUT
// /api/collections/{id}, applyViewSpec for set_view (and through it an
// embed's own views).

// rowGroupTypes are the property types a table or list can group by: a
// chart's (groupableTypes) and, as a board's lanes, formula and rollup. A
// formula and a rollup group (their values are drawn) but no drag can move a
// row between their groups; the browser refuses that drop.
var rowGroupTypes = map[string]bool{
	"select": true, "multiselect": true, "status": true, "relation": true, "person": true,
	"checkbox": true, "date": true, "formula": true, "rollup": true,
}

// groupPeriods are the periods a date groups by, as a chart's (spec 004).
var groupPeriods = map[string]bool{"day": true, "week": true, "month": true, "year": true}

// groupingKeys are the keys a table's or list's grouping is made of, in the
// order normalizeViews compares them.
var groupingKeys = []string{"grouped", "groupBy", "groupPeriod", "groupReverse", "showEmptyGroups", "hiddenGroups", "statusGroups"}

// groupingSignature is the grouping keys of a view as JSON, to tell whether a
// save changed them (strict) and whether the check changed them (re-encode).
func groupingSignature(view map[string]any) string {
	out := make([]any, 0, len(groupingKeys)*2)
	for _, k := range groupingKeys {
		v, has := view[k]
		out = append(out, has, v)
	}
	b, _ := json.Marshal(out)
	return string(b)
}

// errViewGroup marks a refusal of checkViewGrouping, so REST can answer it
// with its own code (invalid_view_group).
type errViewGroup struct{ msg string }

func (e errViewGroup) Error() string { return e.msg }

// clearGrouping removes a table's or list's grouping. groupBy goes too: on a
// table it means nothing without the switch, and a board made from the table
// later picks its own columns (switchViewLayout).
func clearGrouping(view map[string]any) {
	for _, k := range groupingKeys {
		delete(view, k)
	}
}

// checkViewGrouping validates a table's or list's grouping in place. Other
// layouts are left to their own checks (a board's columns, a chart's
// grouping), and their keys are not touched here.
//
// strict is true for a grouping somebody sets now: a wrong one is refused
// with a sentence. Not strict, a stored grouping that a later schema change
// broke (the property deleted, or retyped to text) is dropped and the view
// draws flat, as checkViewSubGroup drops a stale lane: an unrelated save of
// the database must not fail on a view nobody touched.
func checkViewGrouping(view map[string]any, schema []map[string]any, strict bool) error {
	if t, _ := view["type"].(string); t != "table" && t != "list" {
		return nil
	}
	refuse := func(msg string) error {
		if strict {
			return errViewGroup{msg}
		}
		clearGrouping(view)
		return nil
	}
	raw, has := view["grouped"]
	if !has || raw == nil {
		delete(view, "grouped")
		delete(view, "groupReverse")
		return nil
	}
	on, isBool := raw.(bool)
	if !isBool {
		return refuse("grouped must be true or false")
	}
	if !on {
		delete(view, "grouped")
		delete(view, "groupReverse")
		return nil
	}
	id, _ := view["groupBy"].(string)
	if id == "" {
		return refuse("a grouped view needs a property to group by")
	}
	var pt, name string
	for _, p := range schema {
		if pid, _ := p["id"].(string); pid == id {
			pt, _ = p["type"].(string)
			if pt == "" {
				pt = "text"
			}
			name, _ = p["name"].(string)
		}
	}
	if pt == "" {
		return refuse(fmt.Sprintf("%q is not a property of this database", id))
	}
	if !rowGroupTypes[pt] {
		return refuse(fmt.Sprintf("%q is a %s property; a table or list groups by a select, multi-select, status, relation, person, checkbox, date, formula or rollup", name, pt))
	}
	if p, has := view["groupPeriod"]; has && p != nil {
		period, _ := p.(string)
		switch {
		case pt != "date":
			if strict {
				return errViewGroup{fmt.Sprintf("a period groups a date; %q is a %s property", name, pt)}
			}
			delete(view, "groupPeriod")
		case !groupPeriods[period]:
			if strict {
				return errViewGroup{fmt.Sprintf("%v is not a period: use day, week, month or year", p)}
			}
			delete(view, "groupPeriod")
		}
	} else {
		delete(view, "groupPeriod")
	}
	if s, has := view["statusGroups"]; has && s != nil {
		b, ok := s.(bool)
		if !ok || (b && pt != "status") {
			if strict {
				return errViewGroup{fmt.Sprintf("status groups are for a status property; %q is a %s property", name, pt)}
			}
			delete(view, "statusGroups")
		}
	}
	for _, k := range []string{"groupReverse", "showEmptyGroups"} {
		if v, has := view[k]; has && v != nil {
			if _, ok := v.(bool); !ok {
				if strict {
					return errViewGroup{k + " must be true or false"}
				}
				delete(view, k)
			}
		} else {
			delete(view, k)
		}
	}
	if h, has := view["hiddenGroups"]; has && h != nil {
		list, ok := h.([]any)
		if ok {
			for _, k := range list {
				if _, isString := k.(string); !isString {
					ok = false
					break
				}
			}
		}
		if !ok {
			if strict {
				return errViewGroup{"hidden groups must be a list of group keys"}
			}
			delete(view, "hiddenGroups")
		}
	} else {
		delete(view, "hiddenGroups")
	}
	return nil
}

// applyGroupSpec merges set_view's grouping arguments into a table or list,
// under the keys the interface stores (data-model.md). group_by sets the
// property and turns grouping on; "" removes the whole grouping. The other
// arguments are those a chart takes for its grouping, plus group_reverse
// and show_empty_groups. groupByWas is the view's groupBy before this call.
// checkViewGrouping then judges the result.
func applyGroupSpec(view map[string]any, spec viewSpec, groupByWas string) {
	if spec.GroupBy != nil {
		if *spec.GroupBy == "" {
			clearGrouping(view)
		} else {
			// Another property: the period, status groups and hidden groups
			// were the old property's and mean nothing for this one.
			if groupByWas != *spec.GroupBy {
				delete(view, "groupPeriod")
				delete(view, "statusGroups")
				delete(view, "hiddenGroups")
			}
			view["grouped"] = true
		}
	}
	if spec.Period != nil {
		if *spec.Period == "" {
			delete(view, "groupPeriod")
		} else {
			view["groupPeriod"] = *spec.Period
		}
	}
	for key, val := range map[string]*bool{"showEmptyGroups": spec.ShowEmptyGroups, "statusGroups": spec.StatusGroups, "groupReverse": spec.GroupReverse} {
		if val != nil {
			view[key] = *val
		}
	}
	if spec.HiddenGroups != nil {
		out := make([]any, 0, len(*spec.HiddenGroups))
		for _, k := range *spec.HiddenGroups {
			out = append(out, k)
		}
		view["hiddenGroups"] = out
	}
}

// groupArgsWithoutGrouping is the refusal for grouping arguments sent to a
// table or list that is not grouped: they would be stored and do nothing.
func groupArgsWithoutGrouping(view map[string]any, spec viewSpec) error {
	if on, _ := view["grouped"].(bool); on {
		return nil
	}
	if spec.Period != nil || spec.ShowEmptyGroups != nil || spec.StatusGroups != nil || spec.GroupReverse != nil || spec.HiddenGroups != nil {
		return errViewGroup{"period, show_empty_groups, status_groups, group_reverse and hidden_groups shape a grouping; pass group_by to group this view first"}
	}
	return nil
}
