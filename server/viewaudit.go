package server

import (
	"encoding/json"
)

// View changes in the activity log (spec 013, US5, research R6). Views were
// the one part of a database that left no trace: an admin asking why "Open
// tasks" now hides finished tasks had nothing to look at (#178).
//
// auditViewChanges diffs the views list before and after a save, by view id,
// and writes one entry per changed view: view.create, view.delete,
// view.rename, view.update. It is called by every door that writes views
// (handlePutCollection as "human", set_view and delete_view as "agent"), the
// same doors checkViewsUnlocked guards; a new path that writes views calls
// both (.specify/memory/surfaces.md, "View lock").
//
// Only meaningful changes are logged (owner's choice): what a view shows and
// how it groups it. Layout is not: column widths, column order, hidden
// columns, how a row opens, a chart's style, a form's texts. A table resized
// ten times would otherwise bury the one change somebody is looking for.

// viewAuditKeys are the keys whose change makes a view.update entry: what
// a view shows and how it groups it (research R6: filters, sort, grouping
// and the view type's own settings that are not layout). groupBy is a
// board's columns and a chart's grouping; groupPeriod, agg and aggProp the
// rest of a chart's grouping and totals; chartKind, chartSort, hiddenGroups,
// showEmpty and showZero which groups a chart draws and how; subItemProp a
// table's tree. subGroupBy and quickFilters arrive with spec 013 PR 3 and
// are listed now so the log covers them from the first save that writes
// them.
//
// Since set_view no longer writes its generic entry, a setting left out
// here leaves no trace when an agent changes it (code review: an agent
// hiding the "Blocked" group of a chart was recorded before and would not
// have been). What is left out is layout: colWidths, colOrder, hidden,
// openIn, chartStyle, the form's texts.
var viewAuditKeys = []string{
	"filters", "sort", "groupBy", "subGroupBy", "quickFilters",
	"dateProp", "endDateProp", "groupPeriod", "agg", "aggProp",
	"chartKind", "chartSort", "hiddenGroups", "showEmpty", "showZero", "subItemProp",
}

// auditViewChanges writes the entries for one save. u is the person or the
// agent's account, named as the entries should name it (the MCP door adds
// " (MCP)", as every other MCP entry does); actorType is "human" or "agent".
// ws is the database's workspace, so the entry lands in that workspace's log.
//
// detail names the view (both names for a rename); changes carries the
// before and after: the name for a rename, each changed key for an update.
// The database itself is the entry's page.
func (s *Server) auditViewChanges(actorType string, u *user, colID, ws string, before, after []map[string]any) {
	name := u.Name
	idOf := func(v map[string]any) string { id, _ := v["id"].(string); return id }
	nameOf := func(v map[string]any) string { n, _ := v["name"].(string); return n }
	old := map[string]map[string]any{}
	for _, v := range before {
		if id := idOf(v); id != "" {
			old[id] = v
		}
	}
	seen := map[string]bool{}
	for _, v := range after {
		id := idOf(v)
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		prev, had := old[id]
		if !had {
			s.audit(actorType, u.ID, name, "view.create", colID, ws, nameOf(v))
			continue
		}
		if a, b := nameOf(prev), nameOf(v); a != b {
			s.auditChanges(actorType, u.ID, name, "view.rename", colID, ws, a+" → "+b,
				changesJSON(map[string]propChange{"name": {From: rawJSON(a), To: rawJSON(b)}}))
		}
		diff := map[string]propChange{}
		for _, k := range viewAuditKeys {
			from, to := rawJSON(prev[k]), rawJSON(v[k])
			if !jsonEqual(string(from), string(to)) {
				diff[k] = propChange{From: from, To: to}
			}
		}
		if len(diff) > 0 {
			s.auditChanges(actorType, u.ID, name, "view.update", colID, ws, nameOf(v), changesJSON(diff))
		}
	}
	for _, v := range before {
		if id := idOf(v); id != "" && !seen[id] {
			seen[id] = true
			s.audit(actorType, u.ID, name, "view.delete", colID, ws, nameOf(v))
		}
	}
}

// rawJSON is a value as JSON. A missing key, null, "", [] and {} are all
// null: each means "none" (no filter, no sort, no grouping), and the browser
// and the MCP tools spell "none" differently (a cleared sort is null in one
// and a removed key in the other), so a save that only respells "none" would
// otherwise log a change nobody made.
func rawJSON(v any) json.RawMessage {
	// Judged on the encoding, not the Go type: the MCP tools hold a view's
	// filters as []map[string]any and a decoded save as []any, and both must
	// read an empty list as none.
	b, err := json.Marshal(v)
	if err != nil {
		return json.RawMessage("null")
	}
	switch string(b) {
	case `""`, `[]`, `{}`:
		return json.RawMessage("null")
	}
	return b
}

func changesJSON(diff map[string]propChange) string {
	b, err := json.Marshal(diff)
	if err != nil {
		return ""
	}
	return string(b)
}
