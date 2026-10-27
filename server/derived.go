package server

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
)

// Computed database properties: relations, rollups and formulas. All are
// resolved SERVER-SIDE when rows are returned, so they work with pagination and
// stay consistent regardless of client.

type propDef struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Type string `json:"type"`
	// relation
	RelationCollection string `json:"relationCollection"`
	// rollup
	RollupRelation string `json:"rollupRelation"`
	RollupTarget   string `json:"rollupTarget"`
	RollupAgg      string `json:"rollupAgg"` // sum|count|avg|min|max|percent
	// Optional condition on the related rows: count/sum only those where
	// RollupWhereProp <op> RollupWhereValue. Without it a rollup can say how
	// many tasks a project has, but not how many are done — which is the one
	// number a progress bar needs, and the reason this exists.
	RollupWhereProp  string `json:"rollupWhereProp"`
	RollupWhereOp    string `json:"rollupWhereOp"` // is|is_not|is_empty|is_not_empty|contains
	RollupWhereValue string `json:"rollupWhereValue"`
	// SEVERAL values, for is and is_not. "Open" is neither done NOR discarded,
	// and one comparison cannot say that: an is_not against "done" counts every
	// discarded row as open, silently and by exactly the amount nobody notices.
	//
	// A real list rather than a comma-separated string, deliberately. Splitting
	// on commas would quietly change the meaning of any existing condition whose
	// value contains one — and a rollup that changes its answer under an upgrade
	// is the failure this whole field was careful about the first time round.
	// Empty falls back to RollupWhereValue, so nothing existing moves.
	RollupWhereValues []string `json:"rollupWhereValues"`
	// backrelation — the other side of someone else's relation. Holds no data
	// of its own: it asks "which rows over there point at me?" and answers at
	// read time. See backrelationIDs.
	BackrelationCollection string `json:"backrelationCollection"`
	BackrelationProp       string `json:"backrelationProp"`
	// formula
	Formula string `json:"formula"`
}

// matchesRollupWhere reports whether one related row satisfies a rollup's
// condition. No condition means every row counts, so an existing rollup keeps
// behaving exactly as before.
func matchesRollupWhere(d propDef, props map[string]any) bool {
	if d.RollupWhereProp == "" {
		return true
	}
	got := props[d.RollupWhereProp]
	text := ""
	switch t := got.(type) {
	case string:
		text = t
	case nil:
		text = ""
	default:
		text = fmt.Sprint(t)
	}
	switch d.RollupWhereOp {
	case "is_empty":
		return strings.TrimSpace(text) == ""
	case "is_not_empty":
		return strings.TrimSpace(text) != ""
	case "is_not":
		return !matchesAnyRollupValue(d, text)
	case "contains":
		return strings.Contains(strings.ToLower(text), strings.ToLower(d.RollupWhereValue))
	default: // "is" and anything unrecognised — the safe reading of a typo is
		// equality, not "match everything".
		return matchesAnyRollupValue(d, text)
	}
}

// matchesAnyRollupValue compares against the value list when there is one, and
// against the single value otherwise. is_not inverts the whole thing, which is
// what makes "neither done nor discarded" expressible at all.
func matchesAnyRollupValue(d propDef, text string) bool {
	if len(d.RollupWhereValues) == 0 {
		return text == d.RollupWhereValue
	}
	for _, v := range d.RollupWhereValues {
		if text == v {
			return true
		}
	}
	return false
}

func parseSchema(schemaJSON string) []propDef {
	var defs []propDef
	json.Unmarshal([]byte(schemaJSON), &defs)
	return defs
}

// toNumber best-effort coerces a stored prop value to a float. Handles the Go
// numeric types produced by our own computed aggregates (int) as well as the
// float64 that JSON numbers decode to.
func toNumber(v any) (float64, bool) {
	switch t := v.(type) {
	case float64:
		return t, true
	case int:
		return float64(t), true
	case int64:
		return float64(t), true
	case bool:
		if t {
			return 1, true
		}
		return 0, true
	case string:
		if f, err := strconv.ParseFloat(strings.TrimSpace(t), 64); err == nil {
			return f, true
		}
	}
	return 0, false
}

// computeDerived injects rollup and formula values into each row's props map,
// resolving relations against the target collection. Formulas support +-*/(),
// numeric literals, and other-property references by id, with cycle detection.
//
// The relation reads run under ctx, the deadline of the read that asked for
// the rows (readLimit, cap_limits.go). A rollup over a large relation was the
// one part of a row query no limit reached: the rows came back in time, then
// the per-target reads held the connection. When ctx ends, the error is
// returned and the half-filled rows must be thrown away.
func (s *Server) computeDerived(ctx context.Context, u *user, schema []propDef, rows []map[string]any) error {
	// Index derived props.
	var rollups, formulas, relations, backrelations, activities []propDef
	for _, d := range schema {
		switch d.Type {
		case "lastActivity":
			activities = append(activities, d)
		case "rollup":
			rollups = append(rollups, d)
		case "formula":
			formulas = append(formulas, d)
		case "relation":
			relations = append(relations, d)
		case "backrelation":
			backrelations = append(backrelations, d)
		}
	}
	if len(rollups) == 0 && len(formulas) == 0 && len(relations) == 0 && len(backrelations) == 0 && len(activities) == 0 {
		return nil
	}
	if len(activities) > 0 {
		s.fillLastActivity(activities, rows)
	}

	// Backrelations FIRST: they fill a props entry that looks exactly like a
	// relation's, so a rollup can aggregate over them afterwards. That order is
	// what turns "which tasks point at this system" into "how many of them are
	// done" without anyone maintaining a second list.
	for _, br := range backrelations {
		ids := s.backrelationIDs(ctx, u, br, rows)
		if err := ctx.Err(); err != nil {
			return err
		}
		for i, row := range rows {
			props, _ := row["props"].(map[string]any)
			if props == nil {
				continue
			}
			arr := make([]any, len(ids[i]))
			for j, id := range ids[i] {
				arr[j] = id
			}
			props[br.ID] = arr
		}
	}

	// Rollups: for each row, aggregate a target property over its related rows,
	// optionally only those meeting a condition.
	for _, ru := range rollups {
		related := s.relatedRows(ctx, u, ru.RollupRelation, rows)
		if err := ctx.Err(); err != nil {
			return err
		}
		for i, row := range rows {
			props, _ := row["props"].(map[string]any)
			if props == nil {
				continue
			}
			vals := make([]any, 0, len(related[i]))
			for _, target := range related[i] {
				if !matchesRollupWhere(ru, target) {
					continue
				}
				vals = append(vals, target[ru.RollupTarget])
			}
			// "percent" is the share of the related rows that meet the condition,
			// and it exists so a progress bar needs no formula. A formula would
			// have to divide, and 0 of 0 related rows is a division by zero — which
			// renders as an error message in the column of every newly created row.
			// Here it is simply 0.
			if ru.RollupAgg == "percent" {
				if n := len(related[i]); n > 0 {
					props[ru.ID] = math.Round(float64(len(vals))/float64(n)*1000) / 10
				} else {
					props[ru.ID] = 0
				}
				continue
			}
			props[ru.ID] = aggregate(ru.RollupAgg, vals)
		}
	}

	// Formulas: evaluate per row with cycle detection across formula refs.
	formulaByID := map[string]propDef{}
	for _, f := range formulas {
		formulaByID[f.ID] = f
	}
	for _, row := range rows {
		props, _ := row["props"].(map[string]any)
		if props == nil {
			continue
		}
		for _, f := range formulas {
			val, err := evalFormula(f.Formula, props, formulaByID, map[string]bool{})
			if err != nil {
				props[f.ID] = "⚠ " + err.Error()
			} else {
				props[f.ID] = val
			}
		}
	}
	return nil
}

// fillDerivedForPage computes a single row's derived properties.
//
// computeDerived ran in exactly one place: the query that returns a
// collection's ROWS. Open the same row as a PAGE and nobody computed anything,
// so the backrelation and every rollup rendered as an em dash — while the board
// two clicks away showed the numbers. The value was never missing; this route
// simply never asked for it.
//
// A no-op for anything that is not a row: a page whose parent is not a database
// has no schema to compute against.
//
// It gets the same read limit as a row query. When that runs out the page
// still opens, with its stored properties and without the computed ones: a
// page that will not open over a slow rollup is worse than a missing number.
func (s *Server) fillDerivedForPage(u *user, p *page) {
	if p.ParentID == nil || *p.ParentID == "" {
		return
	}
	var schemaJSON string
	if s.db.QueryRow(`SELECT schema FROM collections WHERE page_id = ?`, *p.ParentID).Scan(&schemaJSON) != nil {
		return
	}
	var props map[string]any
	if json.Unmarshal(p.Props, &props) != nil || props == nil {
		props = map[string]any{}
	}
	rows := []map[string]any{{"id": p.ID, "props": props}}
	ctx, cancel := withReadLimit(context.Background())
	defer cancel()
	if s.computeDerived(ctx, u, parseSchema(schemaJSON), rows) != nil {
		return
	}
	if b, err := json.Marshal(props); err == nil {
		p.Props = b
	}
}

// relatedRowProps returns, per input row, the target-property values of the
// rows it relates to. Kept as the thin wrapper it always was; the fetching now
// lives in relatedRows so a rollup can also look at properties OTHER than the
// one it aggregates — which is what a condition needs.
func (s *Server) relatedRowProps(ctx context.Context, u *user, relationProp, targetProp string, rows []map[string]any) [][]any {
	related := s.relatedRows(ctx, u, relationProp, rows)
	out := make([][]any, len(rows))
	for i, props := range related {
		for _, p := range props {
			out[i] = append(out[i], p[targetProp])
		}
	}
	return out
}

// relatedRows returns, per input row, the full property maps of the rows it
// relates to (via relationProp holding an array of target ids). It stops early
// when ctx ends; the caller checks ctx and discards what came back.
func (s *Server) relatedRows(ctx context.Context, u *user, relationProp string, rows []map[string]any) [][]map[string]any {
	// Collect all referenced target ids.
	idSet := map[string]bool{}
	for _, row := range rows {
		props, _ := row["props"].(map[string]any)
		for _, id := range relationIDs(props[relationProp]) {
			idSet[id] = true
		}
	}
	// Which targets may be read. The checks run per id; the props are then
	// fetched in batches below.
	allowed := make([]any, 0, len(idSet))
	for id := range idSet {
		if ctx.Err() != nil {
			break
		}
		// The target ids come from a row the user fills in themselves —
		// unchecked that was a read primitive on EVERY page of the instance:
		// create your own database, write somebody else's page id into the
		// relation, put a rollup on it, and the value stood in your own table.
		// Even "count" revealed whether an id exists at all.
		if !s.canRead(u.ID, id) {
			continue
		}
		// The workspace boundary of a narrowed API token applies too: otherwise
		// a token restricted to workspace A would read values out of workspace B
		// through a relation — one the human is a member of, but the token is
		// not meant to reach.
		if !s.credentialMayEnter(u, s.pageWorkspace(id)) {
			continue
		}
		allowed = append(allowed, id)
	}
	// The props in batches, not one query per target. A page of 50 rows with a
	// rollup made ~50 statements, each under the read deadline; on the CI
	// runner that cost a fixed ~4 ms per page (query_rows at 1k rows, +24% p95
	// in #83), which one statement per batch does not.
	targetVal := map[string]map[string]any{}
	const batch = 500 // well under SQLite's limit on bound parameters
	for start := 0; start < len(allowed) && ctx.Err() == nil; start += batch {
		ids := allowed[start:min(start+batch, len(allowed))]
		q := `SELECT id, props FROM pages WHERE trashed_at IS NULL AND id IN (` +
			strings.TrimSuffix(strings.Repeat("?,", len(ids)), ",") + `)`
		rs, err := s.rdb.QueryContext(ctx, q, ids...)
		if err != nil {
			break
		}
		for rs.Next() {
			var id, p string
			if rs.Scan(&id, &p) == nil {
				var m map[string]any
				json.Unmarshal([]byte(p), &m)
				targetVal[id] = m
			}
		}
		rs.Close()
	}
	out := make([][]map[string]any, len(rows))
	for i, row := range rows {
		props, _ := row["props"].(map[string]any)
		for _, id := range relationIDs(props[relationProp]) {
			if v, ok := targetVal[id]; ok { // dangling ids (deleted rows) are skipped — no dead reference
				out[i] = append(out[i], v)
			}
		}
	}
	return out
}

// backrelationIDs answers, per input row, "which rows in the other collection
// point at me?" — the reverse of a relation somebody else declared.
//
// It is derived, never stored. A stored second copy would have to be kept in
// step on every write from both sides, and the first missed update makes the
// two lists disagree with no way to tell which is right. Reading is cheap by
// comparison: one query for the candidate rows, then a scan of their relation
// arrays.
//
// Permissions are checked the same way a forward relation checks them — per
// row, plus the token's workspace boundary. Skipping that here would leak the
// existence of rows in collections the caller cannot read.
//
// Like relatedRows it stops early when ctx ends, and the caller discards the
// result.
func (s *Server) backrelationIDs(ctx context.Context, u *user, def propDef, rows []map[string]any) [][]string {
	out := make([][]string, len(rows))
	if def.BackrelationCollection == "" || def.BackrelationProp == "" {
		return out
	}
	// Which of my ids are we looking for?
	want := make(map[string]int, len(rows))
	for i, row := range rows {
		if id, _ := row["id"].(string); id != "" {
			want[id] = i
		}
	}
	if len(want) == 0 {
		return out
	}
	// Candidate rows: children of the source collection that are not trashed.
	// Drain the cursor before doing per-row work. The cursor is on the read
	// pool and canRead on the writer, so this no longer deadlocks outright,
	// but a cursor held across per-row queries ties up a read connection for
	// all of them (see readPoolSize).
	type cand struct{ id, props, ws string }
	var cands []cand
	rowsQ, err := s.rdb.QueryContext(ctx,
		`SELECT id, props, workspace_id FROM pages WHERE parent_id = ? AND trashed_at IS NULL`,
		def.BackrelationCollection)
	if err != nil {
		return out
	}
	for rowsQ.Next() {
		var c cand
		if rowsQ.Scan(&c.id, &c.props, &c.ws) == nil {
			cands = append(cands, c)
		}
	}
	rowsQ.Close()

	for _, c := range cands {
		if ctx.Err() != nil {
			break
		}
		var m map[string]any
		if json.Unmarshal([]byte(c.props), &m) != nil {
			continue
		}
		targets := relationIDs(m[def.BackrelationProp])
		if len(targets) == 0 {
			continue
		}
		// Only pay for the permission check on rows that actually point at us.
		hits := false
		for _, t := range targets {
			if _, ok := want[t]; ok {
				hits = true
				break
			}
		}
		if !hits || !s.credentialMayEnter(u, c.ws) || !s.canRead(u.ID, c.id) {
			continue
		}
		for _, t := range targets {
			if i, ok := want[t]; ok {
				out[i] = append(out[i], c.id)
			}
		}
	}
	return out
}

// relationIDs reads a relation's stored value, which is a list of target ids.
//
// A single id stored WITHOUT its list counts too. Writes are normalised now
// (normalizePropValues), but rows written before that are already sitting in
// databases, and reading them strictly is what made them invisible in the first
// place: the row kept its board column and its filter, so nothing looked
// broken, while backrelations and rollups skipped it. Accepting the bare string
// here heals those rows on the next read instead of needing a migration.
func relationIDs(v any) []string {
	switch t := v.(type) {
	case []any:
		var ids []string
		for _, x := range t {
			if s, ok := x.(string); ok {
				ids = append(ids, s)
			}
		}
		return ids
	case string:
		if t == "" {
			return nil
		}
		return []string{t}
	}
	return nil
}

func aggregate(agg string, vals []any) any {
	nums := make([]float64, 0, len(vals))
	for _, v := range vals {
		if n, ok := toNumber(v); ok {
			nums = append(nums, n)
		}
	}
	switch agg {
	case "count":
		return len(vals)
	case "sum":
		sum := 0.0
		for _, n := range nums {
			sum += n
		}
		return sum
	case "avg":
		if len(nums) == 0 {
			return 0
		}
		sum := 0.0
		for _, n := range nums {
			sum += n
		}
		return sum / float64(len(nums))
	case "min":
		if len(nums) == 0 {
			return 0
		}
		m := math.Inf(1)
		for _, n := range nums {
			if n < m {
				m = n
			}
		}
		return m
	case "max":
		if len(nums) == 0 {
			return 0
		}
		m := math.Inf(-1)
		for _, n := range nums {
			if n > m {
				m = n
			}
		}
		return m
	default:
		return len(vals)
	}
}

// ---- formula evaluator (recursive descent: + - * /, parens, numbers, {propId}) ----

func evalFormula(expr string, props map[string]any, formulas map[string]propDef, visiting map[string]bool) (float64, error) {
	p := &fparser{s: expr, formulas: formulas, props: props, visiting: visiting}
	v, err := p.parseExpr()
	if err != nil {
		return 0, err
	}
	p.skipSpace()
	if p.pos < len(p.s) {
		return 0, fmt.Errorf("unexpected %q", p.s[p.pos:])
	}
	return v, nil
}

type fparser struct {
	s        string
	pos      int
	formulas map[string]propDef
	props    map[string]any
	visiting map[string]bool
}

func (p *fparser) skipSpace() {
	for p.pos < len(p.s) && (p.s[p.pos] == ' ' || p.s[p.pos] == '\t') {
		p.pos++
	}
}

func (p *fparser) parseExpr() (float64, error) { // + and -
	v, err := p.parseTerm()
	if err != nil {
		return 0, err
	}
	for {
		p.skipSpace()
		if p.pos >= len(p.s) {
			return v, nil
		}
		op := p.s[p.pos]
		if op != '+' && op != '-' {
			return v, nil
		}
		p.pos++
		rhs, err := p.parseTerm()
		if err != nil {
			return 0, err
		}
		if op == '+' {
			v += rhs
		} else {
			v -= rhs
		}
	}
}

func (p *fparser) parseTerm() (float64, error) { // * and /
	v, err := p.parseFactor()
	if err != nil {
		return 0, err
	}
	for {
		p.skipSpace()
		if p.pos >= len(p.s) {
			return v, nil
		}
		op := p.s[p.pos]
		if op != '*' && op != '/' {
			return v, nil
		}
		p.pos++
		rhs, err := p.parseFactor()
		if err != nil {
			return 0, err
		}
		if op == '*' {
			v *= rhs
		} else {
			if rhs == 0 {
				return 0, fmt.Errorf("division by zero")
			}
			v /= rhs
		}
	}
}

func (p *fparser) parseFactor() (float64, error) {
	p.skipSpace()
	if p.pos >= len(p.s) {
		return 0, fmt.Errorf("unexpected end")
	}
	c := p.s[p.pos]
	if c == '(' {
		p.pos++
		v, err := p.parseExpr()
		if err != nil {
			return 0, err
		}
		p.skipSpace()
		if p.pos >= len(p.s) || p.s[p.pos] != ')' {
			return 0, fmt.Errorf("missing )")
		}
		p.pos++
		return v, nil
	}
	if c == '-' {
		p.pos++
		v, err := p.parseFactor()
		return -v, err
	}
	if c == '{' { // {propId} reference
		end := strings.IndexByte(p.s[p.pos:], '}')
		if end < 0 {
			return 0, fmt.Errorf("missing }")
		}
		id := p.s[p.pos+1 : p.pos+end]
		p.pos += end + 1
		return p.resolveRef(id)
	}
	// number
	start := p.pos
	for p.pos < len(p.s) && (p.s[p.pos] >= '0' && p.s[p.pos] <= '9' || p.s[p.pos] == '.') {
		p.pos++
	}
	if p.pos == start {
		return 0, fmt.Errorf("unexpected %q", string(c))
	}
	return strconv.ParseFloat(p.s[start:p.pos], 64)
}

func (p *fparser) resolveRef(id string) (float64, error) {
	// A referenced formula is evaluated recursively with cycle detection.
	if f, ok := p.formulas[id]; ok {
		if p.visiting[id] {
			return 0, fmt.Errorf("circular reference in formula")
		}
		p.visiting[id] = true
		v, err := evalFormula(f.Formula, p.props, p.formulas, p.visiting)
		delete(p.visiting, id)
		return v, err
	}
	n, _ := toNumber(p.props[id])
	return n, nil
}

// fillLastActivity answers "when did anything last happen here, and who did
// it" for every row at once.
//
// Nothing is stored: like a rollup, it is computed on read, so it cannot drift
// out of step with the thing it describes. `updated_at` is the source for WHEN
// because every write path sets it — a property edit, a body edit, an agent
// over MCP — while an audit entry exists only for the actions worth logging.
// WHO comes from the newest audit entry for that page and is simply absent
// when nothing was logged, which is better than guessing.
//
// ONE query for all rows, not one per row: this server holds a single database
// connection, so a query per row inside a loop is the classic way to make the
// whole instance wait.
func (s *Server) fillLastActivity(defs []propDef, rows []map[string]any) {
	ids := make([]any, 0, len(rows))
	for _, r := range rows {
		if id, _ := r["id"].(string); id != "" {
			ids = append(ids, id)
		}
	}
	if len(ids) == 0 {
		return
	}

	when := map[string]string{}
	if qr, err := s.db.Query(`SELECT id, updated_at FROM pages WHERE id IN (`+placeholders(len(ids))+`)`, ids...); err == nil {
		for qr.Next() {
			var id, at string
			if qr.Scan(&id, &at) == nil {
				when[id] = at
			}
		}
		qr.Close()
	}

	who := map[string]string{}
	if qr, err := s.db.Query(`SELECT page_id, actor_name FROM audit_log
		WHERE page_id IN (`+placeholders(len(ids))+`)
		ORDER BY id ASC`, ids...); err == nil {
		// Ascending, so the last row written for a page wins — the newest one.
		for qr.Next() {
			var id, name string
			if qr.Scan(&id, &name) == nil {
				who[id] = name
			}
		}
		qr.Close()
	}

	for _, r := range rows {
		id, _ := r["id"].(string)
		props, _ := r["props"].(map[string]any)
		if id == "" || props == nil {
			continue
		}
		title, _ := r["title"].(string)
		for _, d := range defs {
			// The row's own id travels IN the value. The cell that renders this
			// needs it to open the log for exactly this row, and it has no other
			// way to know: a property renderer is handed a value, not a row.
			// Threading the id through every caller instead would touch a dozen
			// components that have no business knowing about an audit log.
			v := map[string]any{"at": when[id], "page": id}
			if n := who[id]; n != "" {
				v["by"] = n
			}
			if title != "" {
				v["title"] = title
			}
			props[d.ID] = v
		}
	}
}
