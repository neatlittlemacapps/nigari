package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"testing"
)

// The rule a chart lives by (spec 004, SC-002): every bar holds exactly the
// rows the same filter shows in a table. Checked for each grouping type on the
// seeded workspace as a plain member, where 10% of the rows are private to
// someone else: a chart that counted them would reveal they exist.
func TestAggregateGroupsEqualTheFilteredRows(t *testing.T) {
	w := buildBenchWorld(t, t.TempDir(), benchDefaultSeed, 0, 600)
	defer w.s.Close()
	ctx := context.Background()
	visible := len(w.rows) - len(w.private)

	for _, c := range []struct {
		group, period string
		multi         bool
	}{{"stage", "", false}, {"tags", "", true}, {"assignee", "", true}, {"project", "", true}, {"due", "month", false}} {
		res, err := w.s.aggregateRows(ctx, w.member(), w.rowsDB, aggSpec{GroupBy: c.group, Period: c.period}, nil, nil, benchDay)
		if err != nil {
			t.Fatalf("%s: %v", c.group, err)
		}
		if res.Total != visible {
			t.Errorf("%s: total %d, want the %d rows the member may see", c.group, res.Total, visible)
		}
		sum := 0
		for _, g := range res.Groups {
			f := rowFilter{Prop: c.group, Op: "is", Value: g.Key}
			switch {
			case g.Key == "":
				f = rowFilter{Prop: c.group, Op: "is_empty"}
			case c.period == "month":
				f = rowFilter{Prop: c.group, Op: "between", Value: g.Key + "-01", Value2: g.Key + "-31"}
			}
			_, total, err := w.s.collectionRowsQuery(ctx, w.member(), w.rowsDB, []rowFilter{f}, nil, "", 1, 0, benchDay)
			if err != nil {
				t.Fatalf("%s=%s rows: %v", c.group, g.Key, err)
			}
			if g.Rows != total {
				t.Errorf("%s=%s (%s): chart %d rows, table %d", c.group, g.Key, g.Label, g.Rows, total)
			}
			if g.Value == nil || int(*g.Value) != g.Rows {
				t.Errorf("%s=%s: a count's value must be its rows, got %v", c.group, g.Key, g.Value)
			}
			sum += g.Rows
		}
		// Single values add up to the rows; a list counts a row once per value.
		if !c.multi && sum != visible {
			t.Errorf("%s: groups add up to %d, want %d", c.group, sum, visible)
		}
	}
}

// A sum, an average, a minimum and a maximum per group, against the same
// numbers worked out from the rows themselves; and the SQL path (a number)
// agrees with the Go path (a rollup, which only Go can compute) on how many
// rows each group holds, so the two key every grouping alike.
func TestAggregateValuesMatchTheRows(t *testing.T) {
	w := buildBenchWorld(t, t.TempDir(), benchDefaultSeed, 0, 400)
	defer w.s.Close()
	ctx := context.Background()
	rows, _, err := w.s.collectionRowsQuery(ctx, w.member(), w.rowsDB, nil, nil, "", 10000, 0, benchDay)
	if err != nil {
		t.Fatal(err)
	}
	for _, prop := range []string{"amount", "budget"} {
		for _, agg := range []string{"sum", "avg", "min", "max"} {
			res, err := w.s.aggregateRows(ctx, w.member(), w.rowsDB, aggSpec{GroupBy: "stage", Agg: agg, AggProp: prop}, nil, nil, benchDay)
			if err != nil {
				t.Fatalf("%s %s: %v", agg, prop, err)
			}
			for _, g := range res.Groups {
				var vals []float64
				for _, r := range rows {
					p := r["props"].(map[string]any)
					if p["stage"] != g.Key {
						continue
					}
					if f, ok := derivedNumber(p[prop]); ok {
						vals = append(vals, f)
					}
				}
				want := fold(agg, vals)
				if g.Value == nil || math.Abs(*g.Value-want) > 1e-6 {
					t.Errorf("%s of %s for %s: got %v, want %v", agg, prop, g.Key, g.Value, want)
				}
			}
		}
	}
	for _, c := range []aggSpec{{GroupBy: "stage"}, {GroupBy: "tags"}, {GroupBy: "assignee"}, {GroupBy: "project"},
		{GroupBy: "due", Period: "day"}, {GroupBy: "due", Period: "week"}, {GroupBy: "due", Period: "year"}, {}} {
		sqlRes, err := w.s.aggregateRows(ctx, w.member(), w.rowsDB, aggSpec{GroupBy: c.GroupBy, Period: c.Period, Agg: "sum", AggProp: "amount"}, nil, nil, benchDay)
		if err != nil {
			t.Fatalf("sql %+v: %v", c, err)
		}
		goRes, err := w.s.aggregateRows(ctx, w.member(), w.rowsDB, aggSpec{GroupBy: c.GroupBy, Period: c.Period, Agg: "sum", AggProp: "budget"}, nil, nil, benchDay)
		if err != nil {
			t.Fatalf("go %+v: %v", c, err)
		}
		if a, b := groupRows(sqlRes), groupRows(goRes); a != b {
			t.Errorf("%+v: SQL path %s, Go path %s", c, a, b)
		}
	}
}

func fold(agg string, vals []float64) float64 {
	if len(vals) == 0 {
		return math.NaN()
	}
	out := vals[0]
	sum := 0.0
	for _, v := range vals {
		sum += v
		out = map[string]float64{"min": math.Min(out, v), "max": math.Max(out, v)}[agg]
	}
	switch agg {
	case "sum":
		return sum
	case "avg":
		return sum / float64(len(vals))
	}
	return out
}

func groupRows(r aggResult) string {
	var b strings.Builder
	for _, g := range r.Groups {
		fmt.Fprintf(&b, "%s=%d ", g.Key, g.Rows)
	}
	return b.String()
}

// The cases the seeded world has none of: a checkbox, a number stored as text,
// a negative number, a row without a value, an option since removed, gaps
// between months, and a grouping too fine to draw.
func TestAggregateEdgeCases(t *testing.T) {
	s := testServer(t)
	uid, _ := signedIn(t, s, "owner@example.test")
	ws := s.firstWorkspaceOf(t, uid)
	col := s.makeCollection(t, ws, uid, "Expenses", `[
		{"id":"cat","name":"Category","type":"select","options":[{"id":"food","name":"Food"},{"id":"rent","name":"Rent"}]},
		{"id":"paid","name":"Paid","type":"checkbox"},
		{"id":"amt","name":"Amount","type":"number"},
		{"id":"day","name":"Day","type":"date"},
		{"id":"note","name":"Note","type":"text"}]`)
	for _, props := range []string{
		`{"cat":"food","paid":true,"amt":10,"day":"2026-01-05"}`,
		`{"cat":"food","paid":false,"amt":-4,"day":"2026-04-20"}`,
		`{"cat":"rent","amt":"12","day":"2026-01-31"}`,
		`{"cat":"gone","amt":3}`,
		`{"amt":7,"day":"not a date"}`,
	} {
		s.makeRow(t, ws, uid, col, "r", props)
	}
	u := &user{ID: uid}
	ctx := context.Background()
	get := func(spec aggSpec) aggResult {
		t.Helper()
		res, err := s.aggregateRows(ctx, u, col, spec, nil, nil, benchDay)
		if err != nil {
			t.Fatalf("%+v: %v", spec, err)
		}
		return res
	}
	show := func(r aggResult) string {
		var b strings.Builder
		for _, g := range r.Groups {
			v := "nil"
			if g.Value != nil {
				v = fmt.Sprint(*g.Value)
			}
			fmt.Fprintf(&b, "%s:%s:%s:%d", g.Key, g.Label, v, g.Rows)
			if g.Missing {
				b.WriteString(":missing")
			}
			b.WriteString(" ")
		}
		return strings.TrimSpace(b.String())
	}

	// Option order, a removed option kept and marked, "No value" last; the
	// text "12" and nothing are left out of the sum, the negative is summed.
	r := get(aggSpec{GroupBy: "cat", Agg: "sum", AggProp: "amt"})
	if got, want := show(r), "food:Food:6:2 rent:Rent:nil:1 gone:gone:3:1:missing :No value:7:1"; got != want {
		t.Errorf("sum by category:\n got %s\nwant %s", got, want)
	}
	if r.LeftOut != 1 || r.Total != 5 {
		t.Errorf("left out %d of %d, want 1 of 5", r.LeftOut, r.Total)
	}
	// A checkbox: checked first, and never "No value".
	if got, want := show(get(aggSpec{GroupBy: "paid"})), "true:Checked:1:1 false:Unchecked:4:4"; got != want {
		t.Errorf("by checkbox: %s, want %s", got, want)
	}
	// Months in order with the empty ones at zero; a value that is no date is
	// "No value".
	if got, want := show(get(aggSpec{GroupBy: "day", Period: "month"})),
		"2026-01:2026-01:2:2 2026-02:2026-02:0:0 2026-03:2026-03:0:0 2026-04:2026-04:1:1 :No value:2:2"; got != want {
		t.Errorf("by month:\n got %s\nwant %s", got, want)
	}
	// No grouping: one value over every row.
	if got, want := show(get(aggSpec{Agg: "max", AggProp: "amt"})), "*:All rows:10:5"; got != want {
		t.Errorf("one value: %s, want %s", got, want)
	}
	// Days across more than 400 periods are refused, with a way out.
	s.makeRow(t, ws, uid, col, "far", `{"day":"2028-01-01"}`)
	_, err := s.aggregateRows(ctx, u, col, aggSpec{GroupBy: "day", Period: "day"}, nil, nil, benchDay)
	var tooMany errTooManyPeriods
	if !errors.As(err, &tooMany) || !strings.Contains(err.Error(), "coarser") {
		t.Errorf("a day grouping over two years: %v, want too many periods", err)
	}
	// What does not group, or is not a number, is refused by name.
	for _, bad := range []aggSpec{{GroupBy: "note"}, {GroupBy: "amt"}, {GroupBy: "cat", Agg: "sum", AggProp: "note"},
		{GroupBy: "cat", Agg: "sum"}, {GroupBy: "cat", Agg: "median"}, {GroupBy: "cat", Period: "week"}, {GroupBy: "nope"}} {
		var chartErr errChart
		if _, err := s.aggregateRows(ctx, u, col, bad, nil, nil, benchDay); !errors.As(err, &chartErr) {
			t.Errorf("%+v: %v, want a chart refusal", bad, err)
		}
	}
	// A property id goes into the SQL as a JSON path: anything unusual is
	// refused, not interpolated.
	if _, err := s.aggregateRows(ctx, u, col, aggSpec{GroupBy: "x') OR 1=1 --"}, nil, nil, benchDay); err == nil {
		t.Error("an unsafe property id was accepted")
	}
}

// The settings a chart view stores, as both doors check them (data-model.md).
func TestCheckChartView(t *testing.T) {
	schema := []map[string]any{
		{"id": "st", "type": "select"}, {"id": "d", "type": "date"},
		{"id": "n", "type": "number"}, {"id": "f", "type": "formula"}, {"id": "tx", "type": "text"},
	}
	hidden := make([]any, 501)
	for i := range hidden {
		hidden[i] = fmt.Sprint(i)
	}
	for _, c := range []struct {
		name string
		view string
		ok   bool
	}{
		{"not a chart", `{"type":"table"}`, true},
		{"minimal", `{"type":"chart","groupBy":"st"}`, true},
		{"every field", `{"type":"chart","chartKind":"donut","groupBy":"d","groupPeriod":"week","agg":"avg","aggProp":"f","showEmpty":false,"showZero":true,"chartSort":"value_desc","hiddenGroups":["","a"],"chartStyle":{"palette":"teal","height":"xlarge","legend":"right","labels":true,"center":false,"centerLabel":"Sum","caption":"Per week","title":"x"}}`, true},
		{"number chart without grouping", `{"type":"chart","chartKind":"number"}`, true},
		{"number chart keeps a grouping", `{"type":"chart","chartKind":"number","groupBy":"tx"}`, true},
		{"grouped kind without grouping", `{"type":"chart","chartKind":"bar"}`, false},
		{"unknown kind", `{"type":"chart","chartKind":"pie","groupBy":"st"}`, false},
		{"text grouping", `{"type":"chart","groupBy":"tx"}`, false},
		{"unknown grouping", `{"type":"chart","groupBy":"zz"}`, false},
		{"period on a select", `{"type":"chart","groupBy":"st","groupPeriod":"week"}`, false},
		{"bad period", `{"type":"chart","groupBy":"d","groupPeriod":"hour"}`, false},
		{"sum without property", `{"type":"chart","groupBy":"st","agg":"sum"}`, false},
		{"sum of text", `{"type":"chart","groupBy":"st","agg":"sum","aggProp":"tx"}`, false},
		{"bad sort", `{"type":"chart","groupBy":"st","chartSort":"random"}`, false},
		{"hidden not a list", `{"type":"chart","groupBy":"st","hiddenGroups":"a"}`, false},
		{"showZero not a bool", `{"type":"chart","groupBy":"st","showZero":"yes"}`, false},
		{"bad palette", `{"type":"chart","groupBy":"st","chartStyle":{"palette":"neon"}}`, false},
		{"unknown style", `{"type":"chart","groupBy":"st","chartStyle":{"font":"big"}}`, false},
		{"caption too long", `{"type":"chart","groupBy":"st","chartStyle":{"caption":"` + strings.Repeat("x", 281) + `"}}`, false},
		{"style not an object", `{"type":"chart","groupBy":"st","chartStyle":"blue"}`, false},
	} {
		var view map[string]any
		if err := json.Unmarshal([]byte(c.view), &view); err != nil {
			t.Fatalf("%s: %v", c.name, err)
		}
		err := checkChartView(view, schema, true)
		if (err == nil) != c.ok {
			t.Errorf("%s: err %v, want ok=%v", c.name, err, c.ok)
		}
	}
	view := map[string]any{"type": "chart", "groupBy": "st", "hiddenGroups": hidden}
	if err := checkChartView(view, schema, true); err == nil {
		t.Error("501 hidden groups were accepted")
	}
	// Without the schema, only the shape is checked.
	if err := checkChartView(map[string]any{"type": "chart", "groupBy": "gone"}, schema, false); err != nil {
		t.Errorf("shape only: %v", err)
	}
}

// A property deleted after a chart was made must not block every later save
// of the database's views (a column width in another view, say): the schema
// check runs only on a chart whose settings this save changes.
func TestNormalizeViewsChecksOnlyChangedCharts(t *testing.T) {
	schema := []map[string]any{{"id": "st", "type": "select"}}
	stored := []map[string]any{{"id": "c", "type": "chart", "groupBy": "gone"}}
	unchanged := []byte(`[{"id":"c","type":"chart","groupBy":"gone"},{"id":"t","type":"table","colWidths":{"x":90}}]`)
	if _, err := normalizeViews(unchanged, schema, stored); err != nil {
		t.Errorf("an untouched stale chart blocked the save: %v", err)
	}
	changed := []byte(`[{"id":"c","type":"chart","groupBy":"gone","chartKind":"line"}]`)
	var chartErr errChart
	if _, err := normalizeViews(changed, schema, stored); !errors.As(err, &chartErr) {
		t.Errorf("a changed chart on a deleted property: %v, want a chart refusal", err)
	}
	if _, err := normalizeViews([]byte(`[{"id":"new","name":"Mine","type":"chart"}]`), schema, stored); err == nil || !strings.Contains(err.Error(), "Mine") {
		t.Errorf("a new chart without grouping: %v, want a refusal naming the view", err)
	}
}

// The route, with the gates of reading rows: a person outside the workspace
// gets the same 404 as for the rows; a bad request gets invalid_chart; a view
// supplies its settings and filters, and a field sent overrides them.
func TestAggregateRoute(t *testing.T) {
	s := testServer(t)
	uid, cookie := signedIn(t, s, "owner@example.test")
	_, stranger := signedIn(t, s, "stranger@example.test")
	ws := s.firstWorkspaceOf(t, uid)
	col := s.makeCollection(t, ws, uid, "Tasks", `[{"id":"st","name":"Status","type":"select","options":[{"id":"a","name":"A"},{"id":"b","name":"B"}]},{"id":"n","name":"N","type":"number"}]`)
	for _, p := range []string{`{"st":"a","n":1}`, `{"st":"a","n":2}`, `{"st":"b","n":5}`} {
		s.makeRow(t, ws, uid, col, "r", p)
	}
	if code := requestAs(t, s, cookie, "PUT", "/api/collections/"+col,
		`{"views":[{"id":"c","name":"Chart","type":"chart","groupBy":"st","agg":"sum","aggProp":"n","filters":[{"property":"n","op":"gt","value":"1"}]}]}`).Code; code != 200 {
		t.Fatalf("saving a chart view: %d", code)
	}
	post := func(c, body string) (int, aggResult, string) {
		rec := requestAs(t, s, c, "POST", "/api/collections/"+col+"/aggregate", body)
		var r aggResult
		json.Unmarshal(rec.Body.Bytes(), &r)
		return rec.Code, r, rec.Body.String()
	}
	if code, r, body := post(cookie, `{"viewId":"c"}`); code != 200 || groupRows(r) != "a=1 b=1 " {
		t.Errorf("by the view (sum of n, n > 1): %d %s", code, body)
	}
	if code, r, body := post(cookie, `{"viewId":"c","filters":[],"aggregate":"count"}`); code != 200 || groupRows(r) != "a=2 b=1 " || r.Total != 3 {
		t.Errorf("view overridden: %d %s", code, body)
	}
	if code, _, body := post(cookie, `{"groupBy":"n"}`); code != 400 || !strings.Contains(body, "invalid_chart") {
		t.Errorf("grouping by a number: %d %s", code, body)
	}
	if code, _, body := post(cookie, `{"viewId":"nope"}`); code != 400 || !strings.Contains(body, "invalid_chart") {
		t.Errorf("an unknown view: %d %s", code, body)
	}
	if code, _, _ := post(stranger, `{"groupBy":"st"}`); code != 404 {
		t.Errorf("a stranger: %d, want 404", code)
	}
	// The PUT refuses a chart that cannot work, with its own code.
	rec := requestAs(t, s, cookie, "PUT", "/api/collections/"+col, `{"views":[{"id":"c2","name":"Bad","type":"chart","groupBy":"n"}]}`)
	if rec.Code != 400 || !strings.Contains(rec.Body.String(), "invalid_chart") {
		t.Errorf("PUT of a bad chart: %d %s", rec.Code, rec.Body.String())
	}
}
