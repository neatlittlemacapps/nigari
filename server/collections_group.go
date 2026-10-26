package server

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

// groupCounts answers "how many rows per value of this property" for the rows
// u may see in a database: the aggregation behind a chart (#20) and a board's
// column counts. Values are read as stored, so a select gives its option ids;
// a row without a value counts under "".
//
// It is one GROUP BY in SQL over rowScope, the same row set query_rows uses,
// and not the rows fetched and counted in Go: at 100k rows that would move
// every row's props across the one connection to throw them away (spec 002,
// FR-005, budget in research P3). It runs under readLimit like every
// analytical read.
//
// A multi-value property (multiselect, relation) is counted per value through
// json_each, so a row tagged twice counts once under each tag, as a filter on
// either tag would find it.
func (s *Server) groupCounts(ctx context.Context, u *user, colID, propID string) (map[string]int, error) {
	if !safePropID(propID) {
		return nil, fmt.Errorf("property %q is not a valid property id", propID)
	}
	where, args := s.rowScope(u, colID)
	whereSQL := strings.Join(where, " AND ")
	path := "'$." + propID + "'"
	// One pass. json_each spreads a list into one row per element and gives a
	// scalar back as a single row, so both shapes group the same way; a missing
	// value or an empty list joins nothing and counts under "". An earlier
	// version scanned twice (lists, then scalars, joined by UNION ALL) and
	// missed the 100k budget for that alone.
	q := `SELECT COALESCE(je.value, ''), COUNT(*)
		FROM pages LEFT JOIN json_each(pages.props, ` + path + `) AS je
		WHERE ` + whereSQL + `
		GROUP BY 1`
	ctx, cancel := withReadLimit(ctx)
	defer cancel()
	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, readErr(ctx, err)
	}
	defer rows.Close()
	out := map[string]int{}
	for rows.Next() {
		var v sql.NullString
		var n int
		if err := rows.Scan(&v, &n); err != nil {
			return nil, err
		}
		out[v.String] += n
	}
	if err := rows.Err(); err != nil {
		return nil, readErr(ctx, err)
	}
	return out, nil
}
