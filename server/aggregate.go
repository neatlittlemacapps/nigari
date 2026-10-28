package server

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"time"
)

// Charts (spec 004): how a database's rows are grouped and aggregated, for the
// chart view in the browser (POST /api/collections/{id}/aggregate) and for
// agents (MCP query_rows with group_by). Both doors call aggregateRows, so a
// person and an agent read the same numbers, and both validate a chart view
// with checkChartView.
//
// The numbers are computed here, over exactly the rows the same filters show
// in a table (rowsWhere), and never by sending rows to the browser: past a few
// thousand rows that is slow, and the 5-second read limit stops it (spec 002).

// aggSpec is what to compute: a grouping (empty for one value over every row,
// the number chart), the period of a date grouping, and the aggregate with its
// property.
type aggSpec struct {
	GroupBy string
	Period  string // day|week|month|year, date groupings only
	Agg     string // count|sum|avg|min|max
	AggProp string // the number, formula or rollup property, unless counting
}

// aggGroup is one group of the answer. Value is nil when the group has no
// number to aggregate (an average of nothing is not zero).
type aggGroup struct {
	Key     string   `json:"key"`
	Label   string   `json:"label"`
	Value   *float64 `json:"value"`
	Rows    int      `json:"rows"`
	Missing bool     `json:"missing,omitempty"`
}

// aggResult is the whole answer: every group in display order (the browser
// folds the smallest into "Other"; agents and the table alternative get them
// all), the rows a sum or average left out for want of a number, and how many
// rows the filters let through.
type aggResult struct {
	Groups  []aggGroup `json:"groups"`
	LeftOut int        `json:"leftOut"`
	Total   int        `json:"total"`
}

// aggAllKey is the one group's key when there is no grouping.
const aggAllKey = "*"

// rowGroupKey is the grouping "Each row" (FR-030, research R18): one group per
// row, keyed by the row's id and labelled by its title, so a sum is that row's
// own number. It is not a property id: property ids are generated and never
// start with an underscore pair, and checkAggSpec takes it before the schema.
const rowGroupKey = "__row"

// rowGroupProp stands in for the grouping property when the grouping is Each
// row, so the code that switches on a property's type has a case for it.
var rowGroupProp = map[string]any{"id": rowGroupKey, "type": "row"}

// maxPeriods bounds a date grouping after its gaps are filled: more than a year
// of days. A line with more points than the chart has pixels says nothing more,
// and the answer would grow without limit (research R4).
const maxPeriods = 400

// errChart is a chart request or setting that cannot work: a property that
// does not group, an aggregate over something that is not a number, an
// unknown value. REST answers it as 400 invalid_chart.
type errChart struct{ msg string }

func (e errChart) Error() string { return e.msg }

// errTooManyPeriods is a date grouping finer than maxPeriods allows. REST
// answers it as 400 too_many_periods; the sentence says what to do.
type errTooManyPeriods struct{ n int }

func (e errTooManyPeriods) Error() string {
	return fmt.Sprintf("this grouping makes %d periods, more than %d; choose a coarser period (week, month or year)", e.n, maxPeriods)
}

var (
	chartKinds    = []string{"bar", "hbar", "line", "donut", "number"}
	chartAggs     = []string{"count", "sum", "avg", "min", "max"}
	chartPeriods  = []string{"day", "week", "month", "year"}
	chartSorts    = []string{"auto", "label_asc", "label_desc", "value_asc", "value_desc"}
	chartPalettes = []string{"auto", "colorful", "colorless", "blue", "yellow", "green",
		"purple", "teal", "orange", "pink", "red"}
	chartHeights = []string{"small", "medium", "large", "xlarge"}
	chartLegends = []string{"bottom", "right", "none"}
)

// groupableTypes are the property types a chart groups by (FR-003, research
// R2). Text, numbers, formulas, rollups and checklists do not: their values
// are as many as their rows.
var groupableTypes = map[string]bool{
	"select": true, "status": true, "multiselect": true, "person": true,
	"checkbox": true, "date": true, "relation": true,
}

// numberTypes are the property types a sum, average, minimum or maximum reads.
var numberTypes = map[string]bool{"number": true, "formula": true, "rollup": true}

func oneOf(v string, list []string) bool {
	for _, x := range list {
		if v == x {
			return true
		}
	}
	return false
}

func schemaProp(schema []map[string]any, id string) map[string]any {
	for _, p := range schema {
		if pid, _ := p["id"].(string); pid == id {
			return p
		}
	}
	return nil
}

func propType(p map[string]any) string {
	t, _ := p["type"].(string)
	return t
}

func groupableList() string { return "select, multiselect, person, checkbox, date or relation" }

// checkAggSpec checks a request against the database's schema, and fills in
// the defaults (count; month for a date).
func checkAggSpec(spec *aggSpec, schema []map[string]any) error {
	if spec.Agg == "" {
		spec.Agg = "count"
	}
	if !oneOf(spec.Agg, chartAggs) {
		return errChart{fmt.Sprintf("aggregate must be count, sum, avg, min or max, not %q", spec.Agg)}
	}
	if spec.GroupBy == rowGroupKey {
		// Each row: every bar would be 1 with count, a chart that says
		// nothing, so it needs a number to show (research R18).
		if spec.Agg == "count" {
			return errChart{"group_by \"__row\" (each row) shows a number of each row: pass aggregate sum (or avg, min, max) with aggregate_property, not count"}
		}
		if spec.Period != "" {
			return errChart{"period only applies to a date grouping, not to each row"}
		}
	} else if spec.GroupBy != "" {
		p := schemaProp(schema, spec.GroupBy)
		if p == nil {
			return errChart{fmt.Sprintf("group_by %q is not a property of this database", spec.GroupBy)}
		}
		if !groupableTypes[propType(p)] {
			return errChart{fmt.Sprintf("a chart cannot group by %q, a %s property; it groups by %s properties", spec.GroupBy, propType(p), groupableList())}
		}
		if propType(p) == "date" {
			if spec.Period == "" {
				spec.Period = "month"
			}
			if !oneOf(spec.Period, chartPeriods) {
				return errChart{fmt.Sprintf("period must be day, week, month or year, not %q", spec.Period)}
			}
		} else if spec.Period != "" {
			return errChart{fmt.Sprintf("period only applies to a date grouping; %q is a %s property", spec.GroupBy, propType(p))}
		}
	} else if spec.Period != "" {
		return errChart{"period needs a date property in group_by"}
	}
	if spec.Agg == "count" {
		spec.AggProp = ""
		return nil
	}
	if spec.AggProp == "" {
		return errChart{fmt.Sprintf("aggregate %s needs aggregate_property: a number, formula or rollup property", spec.Agg)}
	}
	p := schemaProp(schema, spec.AggProp)
	if p == nil {
		return errChart{fmt.Sprintf("aggregate_property %q is not a property of this database", spec.AggProp)}
	}
	if !numberTypes[propType(p)] {
		return errChart{fmt.Sprintf("aggregate_property %q is a %s property; %s needs a number, formula or rollup property", spec.AggProp, propType(p), spec.Agg)}
	}
	return nil
}

// readSchema reads a database's schema on the read pool, under ctx: an
// aggregate must not wait for the writer (#82).
func (s *Server) readSchema(ctx context.Context, colID string) ([]map[string]any, error) {
	var raw string
	if err := s.rdb.QueryRowContext(ctx, `SELECT schema FROM collections WHERE page_id = ?`, colID).Scan(&raw); err != nil {
		if err == sql.ErrNoRows {
			return nil, errChart{fmt.Sprintf("page %q is not a database", colID)}
		}
		return nil, readErr(ctx, err)
	}
	var schema []map[string]any
	if json.Unmarshal([]byte(raw), &schema) != nil {
		schema = []map[string]any{}
	}
	return schema, nil
}

// aggregateRows groups and aggregates the rows u may see in a database, after
// the filters. The caller has checked read access and the credential's
// workspace, as for reading rows.
//
// A number property is aggregated in one SQL GROUP BY on the read pool. A
// formula or rollup has no stored value (computeDerived works them out per
// row), so it takes aggregateDerived, which folds in Go.
func (s *Server) aggregateRows(ctx context.Context, u *user, colID string, spec aggSpec, flat []rowFilter, groups [][]rowFilter, today time.Time) (aggResult, error) {
	now := today
	if now.IsZero() {
		now = time.Now()
	}
	ctx, cancel := withReadLimit(ctx)
	defer cancel()
	schema, err := s.readSchema(ctx, colID)
	if err != nil {
		return aggResult{}, err
	}
	if err := checkAggSpec(&spec, schema); err != nil {
		return aggResult{}, err
	}
	var groupProp map[string]any
	switch spec.GroupBy {
	case "":
	case rowGroupKey:
		groupProp = rowGroupProp
	default:
		groupProp = schemaProp(schema, spec.GroupBy)
	}
	var res aggResult
	if spec.AggProp != "" && propType(schemaProp(schema, spec.AggProp)) != "number" {
		res, err = s.aggregateDerived(ctx, u, colID, spec, groupProp, schema, flat, groups, now)
	} else {
		res, err = s.aggregateSQL(ctx, u, colID, spec, groupProp, flat, groups, now, true)
	}
	if err != nil {
		return aggResult{}, err
	}
	if err := s.finishGroups(ctx, u, &res, spec, groupProp); err != nil {
		return aggResult{}, readErr(ctx, err)
	}
	return res, nil
}

// groupKeySQL is the SQL for a row's group key, and the join it needs. It is
// the SQL twin of groupKeysGo; aggregate_test.go holds them level.
//
// Lists (multiselect, relation, a person property with several people) are
// spread by json_each, one row per element, so a row tagged twice counts under
// each tag, as a filter on either tag finds it. json_each gives a scalar back
// as one row, so single values group the same way, in one pass (groupCounts'
// lesson: two passes missed the 100k budget).
func groupKeySQL(spec aggSpec, p map[string]any) (key, join string) {
	if p == nil {
		return "'" + aggAllKey + "'", ""
	}
	path := "'$." + spec.GroupBy + "'"
	ex := "json_extract(pages.props, " + path + ")"
	switch propType(p) {
	case "row":
		return "pages.id", ""
	case "checkbox":
		// A ticked box is JSON true. Anything else, the box never touched
		// included, is unticked: a checkbox has no "No value".
		return "CASE WHEN json_type(pages.props, " + path + ") = 'true' THEN 'true' ELSE 'false' END", ""
	case "date":
		day := "substr(" + ex + ", 1, 10)"
		var k string
		switch spec.Period {
		case "day":
			k = day
		case "week":
			// SQLite's ISO week: the year the week belongs to, then the week,
			// as Go's ISOWeek counts them (fillPeriods).
			k = "strftime('%G-W%V', " + day + ")"
		case "year":
			k = "substr(" + ex + ", 1, 4)"
		default:
			k = "substr(" + ex + ", 1, 7)"
		}
		// Only a value that starts with a day is a date; anything else (text
		// typed into the field by an import) is "No value", not a group of
		// its own named after its first characters.
		return "CASE WHEN " + ex + " GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*' THEN " + k + " ELSE '' END", ""
	default:
		return "COALESCE(CAST(je.value AS TEXT), '')", "LEFT JOIN json_each(pages.props, " + path + ") AS je"
	}
}

// numberCase is the SQL for the aggregate property's value where it is a
// stored number, and NULL otherwise. A number stored as text ("12") is left
// out, as the number filters treat it (#95), so a chart and a table agree.
func numberCase(prop string) string {
	path := "'$." + prop + "'"
	return "CASE WHEN json_type(pages.props, " + path + ") IN ('integer', 'real') THEN json_extract(pages.props, " + path + ") END"
}

// listTypes hold several values per row: a row is in as many groups as it has
// values, so the groups no longer add up to the rows.
var listTypes = map[string]bool{"multiselect": true, "relation": true, "person": true}

// aggregateSQL is the one GROUP BY. withTotals asks for Total and LeftOut as
// well; a board's column counts (groupCounts) need neither.
func (s *Server) aggregateSQL(ctx context.Context, u *user, colID string, spec aggSpec, p map[string]any, flat []rowFilter, groups [][]rowFilter, now time.Time, withTotals bool) (aggResult, error) {
	if (spec.GroupBy != "" && spec.GroupBy != rowGroupKey && !safePropID(spec.GroupBy)) || (spec.AggProp != "" && !safePropID(spec.AggProp)) {
		return aggResult{}, errChart{"not a valid property id"}
	}
	whereSQL, args := s.rowsWhere(u, colID, flat, groups, now)
	key, join := groupKeySQL(spec, p)
	val := "COUNT(*)"
	left := "0"
	if spec.Agg != "count" {
		n := numberCase(spec.AggProp)
		val = strings.ToUpper(spec.Agg) + "(" + n + ")"
		left = "SUM(CASE WHEN " + n + " IS NULL THEN 1 ELSE 0 END)"
	}
	q := `SELECT ` + key + `, ` + val + `, COUNT(*), ` + left + ` FROM pages ` + join + ` WHERE ` + whereSQL + ` GROUP BY 1`
	rows, err := s.rdb.QueryContext(ctx, q, args...)
	if err != nil {
		return aggResult{}, readErr(ctx, err)
	}
	res := aggResult{Groups: []aggGroup{}}
	for rows.Next() {
		var k sql.NullString
		var v sql.NullFloat64
		var n, l int
		if err := rows.Scan(&k, &v, &n, nullInt{&l}); err != nil {
			rows.Close()
			return aggResult{}, err
		}
		g := aggGroup{Key: k.String, Rows: n}
		if v.Valid {
			f := v.Float64
			g.Value = &f
		}
		res.Groups = append(res.Groups, g)
		res.Total += n
		res.LeftOut += l
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return aggResult{}, readErr(ctx, err)
	}
	rows.Close()
	if !withTotals || p == nil || !listTypes[propType(p)] {
		// One group per row: the groups add up to the rows.
		return res, nil
	}
	// A list puts a row tagged twice into two groups, and it is still one
	// row: count the total and the left-out rows per row instead.
	if err := s.rdb.QueryRowContext(ctx, `SELECT COUNT(*), `+left+` FROM pages WHERE `+whereSQL, args...).Scan(&res.Total, nullInt{&res.LeftOut}); err != nil {
		return aggResult{}, readErr(ctx, err)
	}
	return res, nil
}

// nullInt scans a SUM that is NULL over no rows as zero.
type nullInt struct{ p *int }

func (n nullInt) Scan(v any) error {
	var x sql.NullInt64
	if err := x.Scan(v); err != nil {
		return err
	}
	*n.p = int(x.Int64)
	return nil
}

// derivedPage is how many rows aggregateDerived reads at a time.
const derivedPage = 1000

// aggregateDerived aggregates a formula or rollup, whose values exist only in
// Go (computeDerived). It reads the filtered rows a page at a time on the read
// pool, drains each cursor before computeDerived queries again (go-server
// rule: a cursor held open would keep one of readPoolSize connections), and
// folds the values. Slower by nature; the read limit bounds it like any read.
func (s *Server) aggregateDerived(ctx context.Context, u *user, colID string, spec aggSpec, p map[string]any, schema []map[string]any, flat []rowFilter, groups [][]rowFilter, now time.Time) (aggResult, error) {
	whereSQL, args := s.rowsWhere(u, colID, flat, groups, now)
	var schemaJSON string
	if err := s.rdb.QueryRowContext(ctx, `SELECT schema FROM collections WHERE page_id = ?`, colID).Scan(&schemaJSON); err != nil {
		return aggResult{}, readErr(ctx, err)
	}
	defs := parseSchema(schemaJSON)
	type acc struct {
		sum, min, max float64
		nums, rows    int
	}
	accs := map[string]*acc{}
	order := []string{}
	res := aggResult{Groups: []aggGroup{}}
	for offset := 0; ; offset += derivedPage {
		rs, err := s.rdb.QueryContext(ctx, `SELECT id, props FROM pages WHERE `+whereSQL+` ORDER BY position, created_at LIMIT ? OFFSET ?`, append(append([]any{}, args...), derivedPage, offset)...)
		if err != nil {
			return aggResult{}, readErr(ctx, err)
		}
		page := []map[string]any{}
		for rs.Next() {
			var id, props string
			if err := rs.Scan(&id, &props); err != nil {
				rs.Close()
				return aggResult{}, err
			}
			var pm map[string]any
			if json.Unmarshal([]byte(props), &pm) != nil || pm == nil {
				pm = map[string]any{}
			}
			page = append(page, map[string]any{"id": id, "props": pm})
		}
		if err := rs.Err(); err != nil {
			rs.Close()
			return aggResult{}, readErr(ctx, err)
		}
		rs.Close()
		if len(page) == 0 {
			break
		}
		if err := s.computeDerived(ctx, u, defs, page); err != nil {
			return aggResult{}, readErr(ctx, err)
		}
		for _, row := range page {
			props, _ := row["props"].(map[string]any)
			res.Total++
			f, isNum := derivedNumber(props[spec.AggProp])
			if !isNum {
				res.LeftOut++
			}
			id, _ := row["id"].(string)
			for _, k := range groupKeysGo(spec, p, id, props) {
				a := accs[k]
				if a == nil {
					a = &acc{}
					accs[k] = a
					order = append(order, k)
				}
				a.rows++
				if !isNum {
					continue
				}
				if a.nums == 0 || f < a.min {
					a.min = f
				}
				if a.nums == 0 || f > a.max {
					a.max = f
				}
				a.sum += f
				a.nums++
			}
		}
		if len(page) < derivedPage {
			break
		}
	}
	for _, k := range order {
		a := accs[k]
		g := aggGroup{Key: k, Rows: a.rows}
		if a.nums > 0 {
			var v float64
			switch spec.Agg {
			case "sum":
				v = a.sum
			case "avg":
				v = a.sum / float64(a.nums)
			case "min":
				v = a.min
			case "max":
				v = a.max
			}
			g.Value = &v
		}
		res.Groups = append(res.Groups, g)
	}
	return res, nil
}

// derivedNumber reads a computed value as a number. A formula that failed
// computes to text, and a rollup over nothing to nil: both are left out.
func derivedNumber(v any) (float64, bool) {
	switch t := v.(type) {
	case float64:
		return t, !math.IsNaN(t) && !math.IsInf(t, 0)
	case int:
		return float64(t), true
	case int64:
		return float64(t), true
	}
	return 0, false
}

var dayPrefix = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}`)

// groupKeysGo is groupKeySQL in Go, for the rows aggregateDerived folds
// itself. The two must give the same keys for the same value, or a formula
// chart and a number chart of the same rows would disagree.
func groupKeysGo(spec aggSpec, p map[string]any, rowID string, props map[string]any) []string {
	if p == nil {
		return []string{aggAllKey}
	}
	v := props[spec.GroupBy]
	switch propType(p) {
	case "row":
		return []string{rowID}
	case "checkbox":
		if b, _ := v.(bool); b {
			return []string{"true"}
		}
		return []string{"false"}
	case "date":
		s, _ := v.(string)
		if !dayPrefix.MatchString(s) {
			return []string{""}
		}
		switch spec.Period {
		case "day":
			return []string{s[:10]}
		case "week":
			d, err := time.Parse("2006-01-02", s[:10])
			if err != nil {
				return []string{""}
			}
			y, w := d.ISOWeek()
			return []string{fmt.Sprintf("%04d-W%02d", y, w)}
		case "year":
			return []string{s[:4]}
		default:
			return []string{s[:7]}
		}
	}
	switch t := v.(type) {
	case nil:
		return []string{""}
	case []any:
		if len(t) == 0 {
			return []string{""}
		}
		out := make([]string, 0, len(t))
		for _, e := range t {
			out = append(out, jsonScalarText(e))
		}
		return out
	default:
		return []string{jsonScalarText(t)}
	}
}

// jsonScalarText is how SQLite's CAST(json_each.value AS TEXT) writes a
// scalar, so groupKeysGo and groupKeySQL name a group alike.
func jsonScalarText(v any) string {
	switch t := v.(type) {
	case nil:
		return ""
	case string:
		return t
	case bool:
		if t {
			return "1"
		}
		return "0"
	case float64:
		if t == math.Trunc(t) && math.Abs(t) < 1e15 {
			return fmt.Sprintf("%d", int64(t))
		}
		return fmt.Sprint(t)
	default:
		b, _ := json.Marshal(t)
		return string(b)
	}
}

// finishGroups labels the groups, fills a date grouping's gaps and puts the
// groups in display order (research R2, R5): the option order for a select,
// checked before unchecked, time order for dates, largest first otherwise,
// and "No value" last.
func (s *Server) finishGroups(ctx context.Context, u *user, res *aggResult, spec aggSpec, p map[string]any) error {
	if p == nil {
		if len(res.Groups) == 0 {
			// No row at all: still one group, so a number chart reads 0 rows
			// and an agent gets a value rather than nothing.
			res.Groups = []aggGroup{{Key: aggAllKey, Rows: 0}}
			if spec.Agg == "count" {
				zero := 0.0
				res.Groups[0].Value = &zero
			}
		}
		res.Groups[0].Label = "All rows"
		return nil
	}
	var empty *aggGroup
	kept := make([]aggGroup, 0, len(res.Groups))
	for i := range res.Groups {
		if res.Groups[i].Key == "" {
			g := res.Groups[i]
			g.Label = "No value"
			empty = &g
			continue
		}
		kept = append(kept, res.Groups[i])
	}
	switch propType(p) {
	case "row":
		if err := s.labelRows(ctx, kept); err != nil {
			return err
		}
		highestFirst(kept)
	case "checkbox":
		labels := map[string]string{"true": "Checked", "false": "Unchecked"}
		for i := range kept {
			kept[i].Label = labels[kept[i].Key]
		}
		sort.SliceStable(kept, func(i, j int) bool { return kept[i].Key == "true" && kept[j].Key != "true" })
	case "date":
		filled, err := fillPeriods(kept, spec)
		if err != nil {
			return err
		}
		kept = filled
	case "select", "status", "multiselect":
		opts, _ := p["options"].([]any)
		pos := map[string]int{}
		names := map[string]string{}
		for i, o := range opts {
			if om, _ := o.(map[string]any); om != nil {
				id, _ := om["id"].(string)
				name, _ := om["name"].(string)
				pos[id] = i
				names[id] = name
			}
		}
		for i := range kept {
			if n, ok := names[kept[i].Key]; ok {
				kept[i].Label = n
			} else {
				// An option since removed keeps its number, labelled with its
				// id and marked, rather than vanishing from the chart (R5).
				kept[i].Label = kept[i].Key
				kept[i].Missing = true
			}
		}
		sort.SliceStable(kept, func(i, j int) bool {
			pi, oki := pos[kept[i].Key]
			pj, okj := pos[kept[j].Key]
			if oki != okj {
				return oki
			}
			if !oki {
				return kept[i].Rows > kept[j].Rows
			}
			return pi < pj
		})
	case "person":
		if err := s.labelPeople(ctx, kept); err != nil {
			return err
		}
		largestFirst(kept)
	case "relation":
		if err := s.labelPages(ctx, u, kept); err != nil {
			return err
		}
		largestFirst(kept)
	default:
		for i := range kept {
			kept[i].Label = kept[i].Key
		}
		largestFirst(kept)
	}
	if empty != nil {
		kept = append(kept, *empty)
	}
	res.Groups = kept
	return nil
}

func largestFirst(gs []aggGroup) {
	sort.SliceStable(gs, func(i, j int) bool {
		if gs[i].Rows != gs[j].Rows {
			return gs[i].Rows > gs[j].Rows
		}
		return gs[i].Label < gs[j].Label
	})
}

// highestFirst orders Each row by value, high to low (FR-030's default sort),
// rows without a number last: they have no bar to draw.
func highestFirst(gs []aggGroup) {
	sort.SliceStable(gs, func(i, j int) bool {
		vi, vj := gs[i].Value, gs[j].Value
		if (vi == nil) != (vj == nil) {
			return vi != nil
		}
		if vi != nil && *vi != *vj {
			return *vi > *vj
		}
		return gs[i].Label < gs[j].Label
	})
}

// labelRowsBatch bounds the ids in one IN list, well under SQLite's limit on
// bound parameters.
const labelRowsBatch = 500

// labelRows names each row of Each row by its title, a batch at a time: one
// query per row would be thousands on a large database. The rows came through
// rowsWhere, so the reader may see every one of them; an untitled row keeps an
// empty label, which the browser shows as Untitled in the reader's language.
func (s *Server) labelRows(ctx context.Context, gs []aggGroup) error {
	at := make(map[string][]int, len(gs))
	ids := make([]any, 0, len(gs))
	for i := range gs {
		if _, seen := at[gs[i].Key]; !seen {
			ids = append(ids, gs[i].Key)
		}
		at[gs[i].Key] = append(at[gs[i].Key], i)
	}
	for start := 0; start < len(ids); start += labelRowsBatch {
		batch := ids[start:min(start+labelRowsBatch, len(ids))]
		rows, err := s.rdb.QueryContext(ctx, `SELECT id, title FROM pages WHERE id IN (?`+strings.Repeat(",?", len(batch)-1)+`)`, batch...)
		if err != nil {
			return err
		}
		for rows.Next() {
			var id, title string
			if err := rows.Scan(&id, &title); err != nil {
				rows.Close()
				return err
			}
			for _, i := range at[id] {
				gs[i].Label = title
			}
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return err
		}
		rows.Close()
	}
	return nil
}

// labelPeople names each person by their account. A person property also
// holds names typed by hand (forms, imports); those are their own label.
func (s *Server) labelPeople(ctx context.Context, gs []aggGroup) error {
	for i := range gs {
		var name string
		err := s.rdb.QueryRowContext(ctx, `SELECT name FROM users WHERE id = ?`, gs[i].Key).Scan(&name)
		switch {
		case err == nil:
			gs[i].Label = name
		case err == sql.ErrNoRows:
			gs[i].Label = gs[i].Key
		default:
			return err
		}
	}
	return nil
}

// labelPages names each related row by its title, when the reader may read it.
// One they may not read is counted (it is a value of a row they may see) but
// not named: its title is not theirs to read. A deleted one is marked missing.
func (s *Server) labelPages(ctx context.Context, u *user, gs []aggGroup) error {
	for i := range gs {
		var title string
		err := s.rdb.QueryRowContext(ctx, `SELECT title FROM pages WHERE id = ? AND trashed_at IS NULL`, gs[i].Key).Scan(&title)
		switch {
		case err == sql.ErrNoRows:
			gs[i].Label = gs[i].Key
			gs[i].Missing = true
		case err != nil:
			return err
		case !s.canRead(u.ID, gs[i].Key):
			gs[i].Label = ""
		default:
			gs[i].Label = title
		}
	}
	return nil
}

// fillPeriods puts date groups in time order and adds the periods between the
// first and the last that no row falls in, at zero, so a line does not skip
// them (US2.2). More than maxPeriods is refused.
func fillPeriods(gs []aggGroup, spec aggSpec) ([]aggGroup, error) {
	if len(gs) == 0 {
		return gs, nil
	}
	sort.Slice(gs, func(i, j int) bool { return gs[i].Key < gs[j].Key })
	byKey := map[string]aggGroup{}
	for _, g := range gs {
		byKey[g.Key] = g
	}
	keys, err := periodKeys(gs[0].Key, gs[len(gs)-1].Key, spec.Period)
	if err != nil {
		// A key that is not a period of this kind (cannot happen from the
		// SQL above): keep what was counted, in order, rather than fail.
		for i := range gs {
			gs[i].Label = gs[i].Key
		}
		return gs, nil
	}
	if len(keys) > maxPeriods {
		return nil, errTooManyPeriods{len(keys)}
	}
	out := make([]aggGroup, 0, len(keys))
	for _, k := range keys {
		g, ok := byKey[k]
		if !ok {
			g = aggGroup{Key: k}
			if spec.Agg == "count" || spec.Agg == "sum" {
				zero := 0.0
				g.Value = &zero
			}
		}
		g.Label = k
		out = append(out, g)
	}
	return out, nil
}

// periodKeys lists every period from first to last inclusive, in the key
// format groupKeySQL writes. It stops counting past maxPeriods+1: the caller
// only needs to know that there are too many.
func periodKeys(first, last, period string) ([]string, error) {
	var start, end time.Time
	var err error
	var step func(time.Time) time.Time
	var format func(time.Time) string
	switch period {
	case "day":
		if start, err = time.Parse("2006-01-02", first); err != nil {
			return nil, err
		}
		if end, err = time.Parse("2006-01-02", last); err != nil {
			return nil, err
		}
		step = func(t time.Time) time.Time { return t.AddDate(0, 0, 1) }
		format = func(t time.Time) string { return t.Format("2006-01-02") }
	case "week":
		if start, err = isoWeekStart(first); err != nil {
			return nil, err
		}
		if end, err = isoWeekStart(last); err != nil {
			return nil, err
		}
		step = func(t time.Time) time.Time { return t.AddDate(0, 0, 7) }
		format = func(t time.Time) string {
			y, w := t.ISOWeek()
			return fmt.Sprintf("%04d-W%02d", y, w)
		}
	case "year":
		if start, err = time.Parse("2006", first); err != nil {
			return nil, err
		}
		if end, err = time.Parse("2006", last); err != nil {
			return nil, err
		}
		step = func(t time.Time) time.Time { return t.AddDate(1, 0, 0) }
		format = func(t time.Time) string { return t.Format("2006") }
	default:
		if start, err = time.Parse("2006-01", first); err != nil {
			return nil, err
		}
		if end, err = time.Parse("2006-01", last); err != nil {
			return nil, err
		}
		step = func(t time.Time) time.Time { return t.AddDate(0, 1, 0) }
		format = func(t time.Time) string { return t.Format("2006-01") }
	}
	keys := []string{}
	for t := start; !t.After(end); t = step(t) {
		keys = append(keys, format(t))
		if len(keys) > maxPeriods {
			// Count on cheaply: the refusal names how many there would be.
			n := len(keys)
			for t = step(t); !t.After(end); t = step(t) {
				n++
			}
			return make([]string, n), nil
		}
	}
	return keys, nil
}

// isoWeekStart is the Monday of an ISO week written "2026-W05".
func isoWeekStart(key string) (time.Time, error) {
	var y, w int
	if _, err := fmt.Sscanf(key, "%04d-W%02d", &y, &w); err != nil {
		return time.Time{}, err
	}
	// 4 January is always in week 1.
	jan4 := time.Date(y, 1, 4, 0, 0, 0, 0, time.UTC)
	wd := int(jan4.Weekday())
	if wd == 0 {
		wd = 7
	}
	return jan4.AddDate(0, 0, 1-wd+(w-1)*7), nil
}

// ---- The chart view's settings ----

// chartViewFields are the keys of a view that describe its chart. A save that
// changes none of them is not checked against the schema (normalizeViews).
var chartViewFields = []string{"chartKind", "groupBy", "groupPeriod", "agg", "aggProp",
	"showEmpty", "chartSort", "hiddenGroups", "showZero", "chartStyle"}

// checkChartView validates a chart view's settings in place (spec 004,
// data-model.md). Both doors call it: PUT /api/collections/{id} through
// normalizeViews and MCP set_view through applyViewSpec.
//
// withSchema also checks the grouping and the aggregate property against the
// database's properties. normalizeViews asks for that only on a chart whose
// settings changed: a property deleted after the chart was made must not
// block every later save of the database's views (the chart says what no
// longer works instead, spec edge case).
func checkChartView(view map[string]any, schema []map[string]any, withSchema bool) error {
	if t, _ := view["type"].(string); t != "chart" {
		return nil
	}
	str := func(k string) (string, error) {
		raw, ok := view[k]
		if !ok || raw == nil {
			return "", nil
		}
		v, isString := raw.(string)
		if !isString {
			return "", errChart{fmt.Sprintf("%s must be a string", k)}
		}
		return v, nil
	}
	kind, err := str("chartKind")
	if err != nil {
		return err
	}
	if kind != "" && !oneOf(kind, chartKinds) {
		return errChart{fmt.Sprintf("chartKind must be bar, hbar, line, donut or number, not %q", kind)}
	}
	groupBy, err := str("groupBy")
	if err != nil {
		return err
	}
	if groupBy == "" && kind != "number" {
		return errChart{"a chart needs group_by (a " + groupableList() + " property, or \"__row\" for each row), unless it is a number chart"}
	}
	period, err := str("groupPeriod")
	if err != nil {
		return err
	}
	agg, err := str("agg")
	if err != nil {
		return err
	}
	aggProp, err := str("aggProp")
	if err != nil {
		return err
	}
	if agg != "" && !oneOf(agg, chartAggs) {
		return errChart{fmt.Sprintf("agg must be count, sum, avg, min or max, not %q", agg)}
	}
	if period != "" && !oneOf(period, chartPeriods) {
		return errChart{fmt.Sprintf("groupPeriod must be day, week, month or year, not %q", period)}
	}
	if agg != "" && agg != "count" && aggProp == "" {
		return errChart{fmt.Sprintf("agg %s needs aggProp: a number, formula or rollup property", agg)}
	}
	if groupBy == rowGroupKey && kind != "number" && (agg == "" || agg == "count") {
		// Checked without the schema too: a saved Each row that counts would
		// draw a bar of 1 per row.
		return errChart{"each row (group_by \"__row\") shows a number of each row: set agg to sum (or avg, min, max) with aggProp, not count"}
	}
	chartSort, err := str("chartSort")
	if err != nil {
		return err
	}
	if chartSort != "" && !oneOf(chartSort, chartSorts) {
		return errChart{fmt.Sprintf("chartSort must be auto, label_asc, label_desc, value_asc or value_desc, not %q", chartSort)}
	}
	for _, k := range []string{"showEmpty", "showZero"} {
		if raw, ok := view[k]; ok && raw != nil {
			if _, isBool := raw.(bool); !isBool {
				return errChart{fmt.Sprintf("%s must be true or false", k)}
			}
		}
	}
	if raw, ok := view["hiddenGroups"]; ok && raw != nil {
		list, isList := raw.([]any)
		if !isList {
			return errChart{"hiddenGroups must be a list of group keys"}
		}
		if len(list) > 500 {
			return errChart{fmt.Sprintf("hiddenGroups holds %d keys, at most 500", len(list))}
		}
		for _, k := range list {
			ks, isString := k.(string)
			if !isString || len(ks) > 200 {
				return errChart{"each hidden group is a group key of at most 200 characters"}
			}
		}
	}
	if raw, ok := view["chartStyle"]; ok && raw != nil {
		if err := checkChartStyle(raw); err != nil {
			return err
		}
	}
	if !withSchema {
		return nil
	}
	spec := aggSpec{GroupBy: groupBy, Period: period, Agg: agg, AggProp: aggProp}
	if kind == "number" {
		// A number chart keeps the grouping it had, so switching back to bars
		// restores it, but it does not group: check only what it reads.
		spec.GroupBy, spec.Period = "", ""
	}
	return checkAggSpec(&spec, schema)
}

// checkChartStyle validates a chart's look (data-model.md, research R16).
// Unknown keys are refused: a typo would otherwise be stored and do nothing.
func checkChartStyle(raw any) error {
	st, ok := raw.(map[string]any)
	if !ok {
		return errChart{"chartStyle must be an object"}
	}
	enums := map[string][]string{"palette": chartPalettes, "height": chartHeights, "legend": chartLegends}
	texts := map[string]int{"centerLabel": 60, "caption": 280, "title": 120}
	bools := map[string]bool{"labels": true, "center": true}
	for k, v := range st {
		switch {
		case enums[k] != nil:
			s, isString := v.(string)
			if !isString || !oneOf(s, enums[k]) {
				return errChart{fmt.Sprintf("chartStyle.%s must be one of %s", k, strings.Join(enums[k], ", "))}
			}
		case texts[k] > 0:
			s, isString := v.(string)
			if !isString || len([]rune(s)) > texts[k] {
				return errChart{fmt.Sprintf("chartStyle.%s must be text of at most %d characters", k, texts[k])}
			}
		case bools[k]:
			if _, isBool := v.(bool); !isBool {
				return errChart{fmt.Sprintf("chartStyle.%s must be true or false", k)}
			}
		default:
			return errChart{fmt.Sprintf("chartStyle has no setting %q (palette, height, legend, labels, center, centerLabel, caption, title)", k)}
		}
	}
	return nil
}

// chartSignature is a chart view's settings as one string, to tell whether a
// save changed them.
func chartSignature(view map[string]any) string {
	sub := map[string]any{}
	for _, k := range chartViewFields {
		if v, ok := view[k]; ok {
			sub[k] = v
		}
	}
	b, _ := json.Marshal(sub)
	return string(b)
}

// ---- The request, from a view or spelled out ----

// aggRequest is one aggregate request as both doors receive it: optionally a
// chart view whose settings and filters are the defaults, and explicit fields
// that override them (the browser sends a document embed's own filters, #26).
type aggRequest struct {
	ViewID        string        `json:"viewId"`
	GroupBy       *string       `json:"groupBy"`
	Period        *string       `json:"period"`
	Aggregate     *string       `json:"aggregate"`
	AggregateProp *string       `json:"aggregateProp"`
	Filters       *[]filterJSON `json:"filters"`
	Today         string        `json:"today"`
}

// resolve turns the request into what aggregateRows takes. A view of another
// database, or no view by that id, is refused: silently charting the default
// would answer a question nobody asked.
func (s *Server) resolveAggRequest(ctx context.Context, colID string, req aggRequest) (aggSpec, []rowFilter, error) {
	var spec aggSpec
	var flat []rowFilter
	if req.ViewID != "" {
		var raw string
		if err := s.rdb.QueryRowContext(ctx, `SELECT views FROM collections WHERE page_id = ?`, colID).Scan(&raw); err != nil {
			if err == sql.ErrNoRows {
				return spec, nil, errChart{fmt.Sprintf("page %q is not a database", colID)}
			}
			return spec, nil, readErr(ctx, err)
		}
		var views []map[string]any
		json.Unmarshal([]byte(raw), &views)
		var view map[string]any
		for _, v := range views {
			if id, _ := v["id"].(string); id == req.ViewID {
				view = v
			}
		}
		if view == nil {
			return spec, nil, errChart{fmt.Sprintf("view %q is not a view of database %q", req.ViewID, colID)}
		}
		get := func(k string) string { v, _ := view[k].(string); return v }
		if t := get("type"); t != "chart" {
			// Other views have a grouping too (a board's columns), but taking
			// a board for a chart would answer with numbers its people never
			// see as such. Querying through any view is #14.
			return spec, nil, errChart{fmt.Sprintf("view %q is a %s view, not a chart; pass group_by instead", req.ViewID, t)}
		}
		if get("chartKind") != "number" {
			spec.GroupBy = get("groupBy")
			spec.Period = get("groupPeriod")
		}
		spec.Agg, spec.AggProp = get("agg"), get("aggProp")
		if fs, ok := view["filters"].([]any); ok {
			b, _ := json.Marshal(fs)
			var list []filterJSON
			json.Unmarshal(b, &list)
			for _, f := range list {
				if f.Property != "" {
					flat = append(flat, f.rowFilter())
				}
			}
		}
	}
	if req.GroupBy != nil {
		spec.GroupBy = *req.GroupBy
		if req.Period == nil {
			spec.Period = ""
		}
	}
	if req.Period != nil {
		spec.Period = *req.Period
	}
	if req.Aggregate != nil {
		spec.Agg = *req.Aggregate
	}
	if req.AggregateProp != nil {
		spec.AggProp = *req.AggregateProp
	}
	if req.Filters != nil {
		flat = nil
		for _, f := range *req.Filters {
			if f.Property != "" {
				flat = append(flat, f.rowFilter())
			}
		}
	}
	return spec, flat, nil
}

// handleAggregate is POST /api/collections/{id}/aggregate (contracts/rest.md):
// the same gates as reading the rows, then aggregateRows.
func (s *Server) handleAggregate(w http.ResponseWriter, r *http.Request) {
	colID := r.PathValue("id")
	if !s.canReadReq(r, colID) {
		httpError(w, 404, "not a collection")
		return
	}
	var req aggRequest
	if err := decodeJSON(w, r, &req); err != nil {
		httpError(w, 400, "invalid JSON")
		return
	}
	var today time.Time
	if day, ok := parseTodayParam(req.Today); ok {
		today = day
	}
	spec, flat, err := s.resolveAggRequest(r.Context(), colID, req)
	if err == nil {
		var res aggResult
		res, err = s.aggregateRows(r.Context(), requestUser(r), colID, spec, flat, nil, today)
		if err == nil {
			writeJSON(w, res)
			return
		}
	}
	writeAggErr(w, err)
}

func writeAggErr(w http.ResponseWriter, err error) {
	var chartErr errChart
	var periodsErr errTooManyPeriods
	switch {
	case errors.Is(err, errQueryTimeout):
		httpErrorCode(w, 503, "query_timeout", err.Error())
	case errors.As(err, &chartErr):
		httpErrorCode(w, 400, "invalid_chart", err.Error())
	case errors.As(err, &periodsErr):
		httpErrorCode(w, 400, "too_many_periods", err.Error())
	default:
		httpError(w, 500, err.Error())
	}
}
