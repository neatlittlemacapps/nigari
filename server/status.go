package server

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"sort"
	"strings"
	"sync"
)

// The status property (spec 016): a select whose options each sit in one of
// three fixed groups. The group lives on the option in the schema
// ({"id","name","color","group"}), never on the row (research R1), so moving
// an option to another group is one schema write and every view reads the new
// group at once.
//
// Everything a schema door must do with a status is here, in one function per
// rule, so the three doors (PUT /api/collections, update_schema,
// create_database) cannot drift apart (R9).

// statusGroupIDs in workflow order: the order options are kept in (R2) and
// the order a sort by status follows (R5).
var statusGroupIDs = []string{"todo", "in_progress", "complete"}

// statusGroupLabel is the English name of a group, for refusals. The
// interface translates its own labels (web/src/statusGroups.ts).
var statusGroupLabel = map[string]string{
	"todo":        "To-do",
	"in_progress": "In progress",
	"complete":    "Complete",
}

// statusGroupDefault is the option a group gets when a status starts out or a
// conversion leaves the group empty (FR-002, FR-003).
var statusGroupDefault = map[string]string{
	"todo":        "Not started",
	"in_progress": "In progress",
	"complete":    "Done",
}

func statusGroupIndex(g string) int {
	for i, id := range statusGroupIDs {
		if id == g {
			return i
		}
	}
	return -1
}

// optionTypes are the property types whose values are option ids (R10). A
// check that means "this property has options" asks this, not == "select":
// the next type with options would otherwise miss half the places, as url and
// backrelation once did (validPropTypes).
var optionTypes = map[string]bool{"select": true, "multiselect": true, "status": true}

// errStatusOptions is a status the interface could not draw: an option
// without a known group, a group with no option, two options of one name.
// REST answers it as 400 invalid_status_options; MCP with the same sentence.
type errStatusOptions struct{ msg string }

func (e errStatusOptions) Error() string { return e.msg }

// errStatusRows is a multi-select that cannot become a status because rows
// hold several of its values. Its own code (status_rows_hold_several): under
// invalid_status_options the interface said "every option needs a group…",
// and the person never learned that the rows were the reason.
type errStatusRows struct {
	msg  string
	rows int
}

func (e errStatusRows) Error() string { return e.msg }

// statusWords is the word list the conversion places options by (FR-010),
// shared with the browser's guess through server/testdata/statusgroups.json:
// a Go test and check-statusgroups.mjs both read it, so the two guesses
// cannot drift (R6).
var statusWords = sync.OnceValue(func() map[string]string {
	return statusWordsFrom(statusGroupsJSON)
})

// The word list and the cases both guesses are tested against.
//
//go:embed testdata/statusgroups.json
var statusGroupsJSON []byte

func statusWordsFrom(raw []byte) map[string]string {
	var file struct {
		Words map[string][]string `json:"words"`
	}
	out := map[string]string{}
	if err := json.Unmarshal(raw, &file); err != nil {
		fmt.Fprintln(os.Stderr, "status words:", err)
		return out
	}
	for group, words := range file.Words {
		for _, w := range words {
			out[normalizeStatusName(w)] = group
		}
	}
	return out
}

// normalizeStatusName is how a name is compared with the word list: lower
// case, straight apostrophes, single spaces, no surrounding punctuation. A
// whole-name match only, not a word inside it: "Not started" holds "started"
// and is not in progress.
func normalizeStatusName(name string) string {
	s := strings.ToLower(strings.TrimSpace(name))
	s = strings.NewReplacer("’", "'", "‘", "'", "-", " ", "_", " ").Replace(s)
	s = strings.Join(strings.Fields(s), " ")
	return strings.Trim(s, ".!?:;,")
}

// guessStatusGroup places an option by its name (R6): Complete and In
// progress by the word list, everything else To-do.
func guessStatusGroup(name string) string {
	if g, ok := statusWords()[normalizeStatusName(name)]; ok {
		return g
	}
	return "todo"
}

// prepareStatusProps brings every status property of a schema into the shape
// the interface draws, or refuses it. In place, on the schema a door is about
// to store:
//
//   - A status that arrives with no group on any option is new or converted
//     from a select: each option is placed by guessStatusGroup and every
//     group left empty gets its default option (FR-002, FR-003, FR-010).
//   - Otherwise an option without a group is guessed, an unknown group is
//     refused, and so is a group with no option (FR-002: the last option of a
//     group cannot be removed) and two options of one name.
//   - The options are then kept in group order, their order within a group
//     unchanged (R2), so boards, charts and pickers draw the workflow order
//     without knowing about groups.
func prepareStatusProps(schema []map[string]any, was statusSnapshot) error {
	for _, p := range schema {
		if t, _ := p["type"].(string); t != "status" {
			continue
		}
		id, _ := p["id"].(string)
		if err := prepareStatusProp(p, was.groups[id]); err != nil {
			return err
		}
	}
	return nil
}

// statusSnapshot is what a door needs to know about the schema as stored,
// taken before it merges the change in: each property's type, and each status
// option's group. An option sent without a group keeps the one it has, so an
// agent that renames an option does not send it back to a guessed group.
type statusSnapshot struct {
	types  map[string]string
	groups map[string]map[string]string
	// rollups holds each rollup's condition as stored, so a save checks
	// only the group conditions it changes (code review): a stored one whose
	// related status has since become a select narrows nothing and must not
	// block every later schema save of the database.
	rollups map[string]string
}

func snapshotStatus(schema []map[string]any) statusSnapshot {
	snap := statusSnapshot{types: map[string]string{}, groups: map[string]map[string]string{}, rollups: map[string]string{}}
	for _, p := range schema {
		id, _ := p["id"].(string)
		t, _ := p["type"].(string)
		snap.types[id] = t
		if t == "rollup" {
			snap.rollups[id] = rollupCondition(p)
		}
		if t != "status" {
			continue
		}
		g := map[string]string{}
		list, _ := p["options"].([]any)
		for _, o := range list {
			m, _ := o.(map[string]any)
			oid, _ := m["id"].(string)
			if grp, _ := m["group"].(string); oid != "" && grp != "" {
				g[oid] = grp
			}
		}
		snap.groups[id] = g
	}
	return snap
}

func prepareStatusProp(p map[string]any, stored map[string]string) error {
	name, _ := p["name"].(string)
	if name == "" {
		name, _ = p["id"].(string)
	}
	var raw []any
	switch v := p["options"].(type) {
	case nil:
	case []any:
		raw = v
	case []map[string]any: // a schema built in Go (defaults, tests)
		for _, o := range v {
			raw = append(raw, o)
		}
	default:
		return errStatusOptions{fmt.Sprintf("the options of status %q must be a list", name)}
	}
	opts := make([]map[string]any, 0, len(raw))
	grouped := false
	for _, o := range raw {
		m, ok := o.(map[string]any)
		if !ok {
			return errStatusOptions{fmt.Sprintf("each option of status %q must be an {id, name, color?, group} object", name)}
		}
		if g, _ := m["group"].(string); g == "" {
			if oid, _ := m["id"].(string); stored[oid] != "" {
				m["group"] = stored[oid]
			}
		}
		if g, _ := m["group"].(string); g != "" {
			grouped = true
		}
		opts = append(opts, m)
	}
	taken := map[string]bool{}
	names := map[string]bool{}
	for _, o := range opts {
		id, _ := o["id"].(string)
		if id == "" {
			return errStatusOptions{fmt.Sprintf("each option of status %q needs an id", name)}
		}
		taken[id] = true
		n, _ := o["name"].(string)
		key := strings.ToLower(strings.TrimSpace(n))
		if names[key] {
			return errStatusOptions{fmt.Sprintf("status %q has two options named %q; each name can be used once", name, n)}
		}
		names[key] = true
	}
	count := map[string]int{}
	for _, o := range opts {
		g, _ := o["group"].(string)
		if g == "" {
			n, _ := o["name"].(string)
			g = guessStatusGroup(n)
			o["group"] = g
		}
		if statusGroupIndex(g) < 0 {
			return errStatusOptions{fmt.Sprintf("option %q of status %q is in group %q; the groups are %s", o["name"], name, g, strings.Join(statusGroupIDs, ", "))}
		}
		count[g]++
	}
	for _, g := range statusGroupIDs {
		if count[g] > 0 {
			continue
		}
		if grouped {
			return errStatusOptions{fmt.Sprintf("the %s group of status %q needs at least one option", statusGroupLabel[g], name)}
		}
		label := statusGroupDefault[g]
		if names[strings.ToLower(label)] {
			// "In progress" already exists elsewhere: keep the names unique.
			label = statusGroupLabel[g]
		}
		id := slugID(label, taken)
		taken[id] = true
		names[strings.ToLower(label)] = true
		opts = append(opts, map[string]any{"id": id, "name": label, "group": g})
	}
	sort.SliceStable(opts, func(i, j int) bool {
		gi, _ := opts[i]["group"].(string)
		gj, _ := opts[j]["group"].(string)
		return statusGroupIndex(gi) < statusGroupIndex(gj)
	})
	out := make([]any, len(opts))
	for i, o := range opts {
		out[i] = o
	}
	p["options"] = out
	return nil
}

// checkStatusConversion refuses a multi-select becoming a status while a row
// holds more than one of its values (R6): a status holds one, and keeping
// only the first would lose the others without a word. was is the schema as
// stored; next the one about to be saved. A new database (collectionID "")
// has no rows to check.
//
// Rows that hold one value keep it as stored (["id"]): a filter matches an
// array element like a scalar (rowsWhere) and the interface reads the first
// value, so no row is rewritten (the non-destructive type change, Q23).
func (s *Server) checkStatusConversion(collectionID string, was statusSnapshot, next []map[string]any) error {
	for _, p := range next {
		id, _ := p["id"].(string)
		if t, _ := p["type"].(string); collectionID == "" || t != "status" || was.types[id] != "multiselect" || !safePropID(id) {
			continue
		}
		var n int
		path := "$." + id
		if err := s.db.QueryRow(`SELECT COUNT(*) FROM pages WHERE parent_id = ? AND trashed_at IS NULL
			AND json_type(props, ?) = 'array' AND json_array_length(props, ?) > 1`, collectionID, path, path).Scan(&n); err != nil {
			return err
		}
		if n > 0 {
			name, _ := p["name"].(string)
			return errStatusRows{fmt.Sprintf("%d rows hold more than one value of %q; a status holds one. Leave one value in each, then change the type", n, name), n}
		}
	}
	return nil
}

// prepareStatusSchema is the whole rule for one door: the conversion check
// against the stored schema, then prepareStatusProps on what will be stored.
// Every door that writes a schema calls it: handlePutCollection,
// mcpUpdateSchema and mcpCreateDatabase (spec 015 found the third).
func (s *Server) prepareStatusSchema(collectionID string, was statusSnapshot, next []map[string]any) error {
	if err := s.checkStatusConversion(collectionID, was, next); err != nil {
		return err
	}
	if err := prepareStatusProps(next, was); err != nil {
		return err
	}
	// A rollup's group condition (spec 016, FR-007): on a status of the
	// related database only. Here, so all three schema doors check it.
	return s.checkRollupGroupConditions(next, was)
}

// hasStatus says whether a schema holds a status, whose options a door may
// have reordered or filled and must store as prepared.
func hasStatus(schema []map[string]any) bool {
	for _, p := range schema {
		if t, _ := p["type"].(string); t == "status" {
			return true
		}
	}
	return false
}

func isStatusErr(err error) bool {
	var e errStatusOptions
	var r errStatusRows
	return errors.As(err, &e) || errors.As(err, &r)
}

// httpStatusErr answers a refused status on REST: each refusal with its own
// code, so the interface can say which it was.
func httpStatusErr(w http.ResponseWriter, err error) {
	var r errStatusRows
	if errors.As(err, &r) {
		httpErrorData(w, 400, "status_rows_hold_several", r.msg, map[string]any{"rows": r.rows})
		return
	}
	httpErrorCode(w, 400, "invalid_status_options", err.Error())
}

// statusDefaults is the value a new row of a database starts with in each of
// its status properties: the first option of the To-do group (FR-017, owner's
// answer Q1 "A").
func (s *Server) statusDefaults(collectionID string) map[string]string {
	schema, _, err := s.loadCollection(collectionID)
	if err != nil {
		return nil
	}
	out := map[string]string{}
	for _, p := range schema {
		id, _ := p["id"].(string)
		if t, _ := p["type"].(string); t != "status" || !safePropID(id) {
			continue
		}
		list, _ := p["options"].([]any)
		for _, o := range list {
			m, _ := o.(map[string]any)
			if g, _ := m["group"].(string); g == "todo" {
				if oid, _ := m["id"].(string); oid != "" {
					out[id] = oid
				}
				break
			}
		}
	}
	return out
}

// fillStatusDefaults gives a row just made in a database the To-do default
// in every status it does not hold yet (R4). It runs AFTER the door stored the
// row and its values, so whatever the door wrote wins: the caller's value, a
// view's pin, a template's value. One function called by every door that makes
// a row (handleCreatePage, rowFromTemplate for both REST and MCP templates,
// create_page, create_rows, the public form, ingest); TestEveryRowDoorStartsInToDo
// lists them, so a door without the call fails there.
//
// Empty is missing: a public form or an import that sends "" for the status
// gets the default, as FR-017 says.
//
// Not called by copies (duplicate, workspace import and transfer, blueprints):
// a copy keeps what its original held, an empty status included.
func (s *Server) fillStatusDefaults(collectionID, rowID string) error {
	for prop, opt := range s.statusDefaults(collectionID) {
		path := "$." + prop
		if _, err := s.db.Exec(`UPDATE pages SET props = json_set(CASE WHEN json_valid(props) AND props <> '' THEN props ELSE '{}' END, ?, ?)
			WHERE id = ? AND parent_id = ? AND (json_type(props, ?) IS NULL OR json_type(props, ?) = 'null' OR json_extract(props, ?) = '')`,
			path, opt, rowID, collectionID, path, path, path); err != nil {
			return err
		}
	}
	return nil
}

// statusSortExpr is the ORDER BY term for sorting by a status property: each
// option's place in the stored options, which are kept in group order (R2),
// so the place is group first, then position in the group (R5). A row
// without a value, or with one no longer offered, sorts after every option.
// "" when the property is not a status: the caller keeps its plain sort.
// The expression is the place, or len(options) for no value; the caller puts
// that case last in both directions, as SQLite puts a select's NULLs.
//
// The value is read as a scalar or as the first element of an array (a
// status converted from a single-value multi-select keeps ["id"]). The CASE
// lists the property's options, tens at most; the ids go in as arguments.
//
// The schema is read from the read pool, like everything else in the rows
// query: a rows read must not wait for the writer's connection
// (TestARowsReadDoesNotNeedTheWriter, #82), and loadCollection uses it.
func (s *Server) statusSortExpr(ctx context.Context, collectionID, propID string) (string, []any, int) {
	var raw string
	if err := s.rdb.QueryRowContext(ctx, `SELECT schema FROM collections WHERE page_id = ?`, collectionID).Scan(&raw); err != nil {
		return "", nil, 0
	}
	var schema []map[string]any
	if json.Unmarshal([]byte(raw), &schema) != nil {
		return "", nil, 0
	}
	for _, p := range schema {
		if id, _ := p["id"].(string); id != propID {
			continue
		}
		if t, _ := p["type"].(string); t != "status" {
			return "", nil, 0
		}
		list, _ := p["options"].([]any)
		var b strings.Builder
		args := []any{}
		b.WriteString("CASE COALESCE(json_extract(props, '$." + propID + "[0]'), json_extract(props, '$." + propID + "'))")
		for i, o := range list {
			m, _ := o.(map[string]any)
			oid, _ := m["id"].(string)
			fmt.Fprintf(&b, " WHEN ? THEN %d", i)
			args = append(args, oid)
		}
		fmt.Fprintf(&b, " ELSE %d END", len(list))
		return b.String(), args, len(list)
	}
	return "", nil, 0
}

// --- Group conditions (spec 016 PR 2, R3) -----------------------------------
//
// "Group is" and "group is not" name groups, never options: a view of open
// work says group_is_not ["complete"] and keeps meaning that when someone adds
// an option to Complete. They are resolved to the existing is / is_not with
// the ids of the options currently in those groups, at the moment of reading,
// so no new SQL exists for them and a moved option is followed at once.

// statusGroupOps are the two operators that name groups.
var statusGroupOps = map[string]bool{"group_is": true, "group_is_not": true}

// noOption is an id no option can have (option ids are slugs): "is" over it
// matches no row, which is what "group is Complete" means when Complete has no
// option, a state the schema checks keep from being stored but an old schema
// could hold.
const noOption = "\x00no-option"

// errGroupFilter is a group condition that cannot work: on a property that is
// not a status, or naming a group that does not exist. REST answers it as 400
// invalid_group_filter; MCP with the same sentence.
type errGroupFilter struct{ msg string }

func (e errGroupFilter) Error() string { return e.msg }

// statusOptionGroups maps each status property of a schema to its options'
// groups (option id -> group).
func statusOptionGroups(schema []map[string]any) map[string]map[string]string {
	out := map[string]map[string]string{}
	for _, p := range schema {
		if t, _ := p["type"].(string); t != "status" {
			continue
		}
		id, _ := p["id"].(string)
		groups := map[string]string{}
		list, _ := p["options"].([]any)
		for _, o := range list {
			m, _ := o.(map[string]any)
			oid, _ := m["id"].(string)
			g, _ := m["group"].(string)
			if oid != "" {
				groups[oid] = g
			}
		}
		out[id] = groups
	}
	return out
}

// optionsInGroups lists, in the stored (group) order, the ids of a status's
// options that sit in any of the named groups.
func optionsInGroups(schema []map[string]any, propID string, groups []string) ([]string, bool) {
	want := map[string]bool{}
	for _, g := range groups {
		want[g] = true
	}
	for _, p := range schema {
		if id, _ := p["id"].(string); id != propID {
			continue
		}
		if t, _ := p["type"].(string); t != "status" {
			return nil, false
		}
		var ids []string
		list, _ := p["options"].([]any)
		for _, o := range list {
			m, _ := o.(map[string]any)
			oid, _ := m["id"].(string)
			if g, _ := m["group"].(string); oid != "" && want[g] {
				ids = append(ids, oid)
			}
		}
		return ids, true
	}
	return nil, false
}

// resolveStatusGroups turns a group condition into the is / is_not it means
// now. Any other condition comes back as it was. A group condition on a
// property that is not (or no longer) a status narrows nothing, as a filter on
// a deleted property does: its property id is cleared, which where() skips.
func resolveStatusGroups(schema []map[string]any, f rowFilter) rowFilter {
	if !statusGroupOps[f.Op] {
		return f
	}
	// Only known groups count. A condition that names none yet is
	// unfinished and narrows nothing, like any condition without a value
	// (where()), and as the browser reads it (statusFilter.ts).
	var groups []string
	for _, g := range f.vals() {
		if statusGroupIndex(g) >= 0 {
			groups = append(groups, g)
		}
	}
	ids, ok := optionsInGroups(schema, f.Prop, groups)
	if !ok || len(groups) == 0 {
		f.Prop = ""
		return f
	}
	if f.Op == "group_is" {
		f.Op = "is"
		if len(ids) == 0 {
			ids = []string{noOption}
		}
	} else {
		f.Op = "is_not"
		if len(ids) == 0 {
			// Not in no group: every row.
			f.Prop = ""
			return f
		}
	}
	f.Value = ""
	f.Values = ids
	return f
}

// checkGroupCondition is the one rule a stored group condition follows, for a
// view's filters (REST views, set_view, a person's own filters) and a
// rollup's condition: a status property, at least one group, known groups.
func checkGroupCondition(schema []map[string]any, label, prop, op string, values []string) error {
	if !statusGroupOps[op] {
		return nil
	}
	if _, ok := optionsInGroups(schema, prop, nil); !ok {
		return errGroupFilter{fmt.Sprintf("%s: %s works only on a status property, and %q is not one", label, op, prop)}
	}
	// No group yet is an unfinished condition: stored, and it narrows
	// nothing until a group is ticked, like any condition without a value.
	for _, g := range values {
		if statusGroupIndex(g) < 0 {
			return errGroupFilter{fmt.Sprintf("%s: %q is not a group; the groups are %s", label, g, strings.Join(statusGroupIDs, ", "))}
		}
	}
	return nil
}

// filterValues reads a stored condition's values the way rowFilter.vals does:
// the list if there is one, else the single value.
func filterValues(f map[string]any) []string {
	if list, ok := f["values"].([]any); ok && len(list) > 0 {
		out := make([]string, 0, len(list))
		for _, v := range list {
			if s, ok := v.(string); ok {
				out = append(out, s)
			}
		}
		return out
	}
	if v, _ := f["value"].(string); v != "" {
		return []string{v}
	}
	return nil
}

// checkViewGroupFilters checks the group conditions of a view's filters and
// filter groups (REST's views save; set_view checks each condition itself).
func checkViewGroupFilters(schema []map[string]any, view map[string]any, name string) error {
	check := func(raw any, label string) error {
		list, _ := raw.([]any)
		for i, c := range list {
			f, _ := c.(map[string]any)
			if f == nil {
				continue
			}
			prop, _ := f["property"].(string)
			op, _ := f["op"].(string)
			if err := checkGroupCondition(schema, fmt.Sprintf("%s, %s %d", name, label, i+1), prop, op, filterValues(f)); err != nil {
				return err
			}
			// Files & media asks only empty or not (spec 028), as set_view
			// refuses (code review: REST and MCP disagreed).
			v, _ := f["value"].(string)
			if err := checkFilesFilterOp(schema, fmt.Sprintf("%s, %s %d", name, label, i+1), prop, op, v); err != nil {
				return err
			}
		}
		return nil
	}
	if err := check(view["filters"], "filter"); err != nil {
		return err
	}
	groups, _ := view["filterGroups"].([]any)
	for gi, g := range groups {
		if err := check(g, fmt.Sprintf("group %d, filter", gi+1)); err != nil {
			return err
		}
	}
	return nil
}

// rollupTargetCollection is the database a rollup's related rows live in:
// the relation's target, or the database a backrelation points back from.
func rollupTargetCollection(schema []map[string]any, rollup map[string]any) string {
	rel, _ := rollup["rollupRelation"].(string)
	for _, p := range schema {
		if id, _ := p["id"].(string); id != rel {
			continue
		}
		if c, _ := p["relationCollection"].(string); c != "" {
			return c
		}
		c, _ := p["backrelationCollection"].(string)
		return c
	}
	return ""
}

// rollupCondition is what a rollup's group condition depends on, as one
// comparable string.
func rollupCondition(p map[string]any) string {
	b, _ := json.Marshal([]any{p["rollupRelation"], p["rollupWhereProp"], p["rollupWhereOp"], p["rollupWhereValue"], p["rollupWhereValues"]})
	return string(b)
}

// checkRollupGroupConditions refuses a rollup whose condition names groups
// of a property that is not a status in the related database. Run by every
// schema door with prepareStatusSchema, for the rollups the save adds or
// whose condition it changes. The related schema is read once per database.
func (s *Server) checkRollupGroupConditions(schema []map[string]any, was statusSnapshot) error {
	loaded := map[string][]map[string]any{}
	for _, p := range schema {
		if t, _ := p["type"].(string); t != "rollup" {
			continue
		}
		op, _ := p["rollupWhereOp"].(string)
		if !statusGroupOps[op] {
			continue
		}
		if id, _ := p["id"].(string); id != "" {
			if stored, ok := was.rollups[id]; ok && stored == rollupCondition(p) {
				continue
			}
		}
		target := rollupTargetCollection(schema, p)
		related, ok := loaded[target]
		if !ok && target != "" {
			related, _, _ = s.loadCollection(target)
			loaded[target] = related
		}
		name, _ := p["name"].(string)
		prop, _ := p["rollupWhereProp"].(string)
		var values []string
		if list, ok := p["rollupWhereValues"].([]any); ok {
			for _, v := range list {
				if s, ok := v.(string); ok {
					values = append(values, s)
				}
			}
		}
		if v, _ := p["rollupWhereValue"].(string); v != "" && len(values) == 0 {
			values = []string{v}
		}
		if err := checkGroupCondition(related, fmt.Sprintf("rollup %q", name), prop, op, values); err != nil {
			return err
		}
	}
	return nil
}

// resolveRollupGroups rewrites the group conditions of a query's rollups to
// is / is_not with option ids, once per computeDerived call, against each
// related database's schema read from the read pool (a rows read must not
// wait for the writer). A rollup whose group condition cannot be resolved
// counts every related row: the condition narrows nothing, as on a view.
func (s *Server) resolveRollupGroups(ctx context.Context, schema []propDef) []propDef {
	relTarget := map[string]string{}
	for _, d := range schema {
		if d.RelationCollection != "" {
			relTarget[d.ID] = d.RelationCollection
		} else if d.BackrelationCollection != "" {
			relTarget[d.ID] = d.BackrelationCollection
		}
	}
	loaded := map[string][]map[string]any{}
	out := schema
	copied := false
	for i, d := range schema {
		if d.Type != "rollup" || !statusGroupOps[d.RollupWhereOp] {
			continue
		}
		if !copied {
			out = append([]propDef(nil), schema...)
			copied = true
		}
		target := relTarget[d.RollupRelation]
		related, ok := loaded[target]
		if !ok && target != "" {
			var raw string
			if s.rdb.QueryRowContext(ctx, `SELECT schema FROM collections WHERE page_id = ?`, target).Scan(&raw) == nil {
				json.Unmarshal([]byte(raw), &related)
			}
			loaded[target] = related
		}
		values := d.RollupWhereValues
		if len(values) == 0 && d.RollupWhereValue != "" {
			values = []string{d.RollupWhereValue}
		}
		f := resolveStatusGroups(related, rowFilter{Prop: d.RollupWhereProp, Op: d.RollupWhereOp, Values: values})
		if f.Prop == "" {
			out[i].RollupWhereProp = "" // no condition: every related row counts
			continue
		}
		out[i].RollupWhereOp = f.Op
		out[i].RollupWhereValues = f.Values
		out[i].RollupWhereValue = ""
	}
	return out
}

// groupPin is the value a view's single-group "group is" condition pins on a
// new row: the first option of that group (R4, FR-008). Several groups, or
// none in the schema, pin nothing.
func groupPin(schema []map[string]any, f rowFilter) (string, bool) {
	if f.Op != "group_is" {
		return "", false
	}
	vals := f.vals()
	if len(vals) != 1 {
		return "", false
	}
	ids, ok := optionsInGroups(schema, f.Prop, vals)
	if !ok || len(ids) == 0 {
		return "", false
	}
	return ids[0], true
}
