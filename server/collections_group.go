package server

import (
	"context"
	"fmt"
	"time"
)

// groupCounts answers "how many rows per value of this property" for the rows
// u may see in a database: the aggregation behind a chart (#20) and a board's
// column counts. Values are read as stored, so a select gives its option ids;
// a row without a value counts under "".
//
// It is one GROUP BY in SQL over rowsWhere, the same row set query_rows uses,
// and not the rows fetched and counted in Go: at 100k rows that would move
// every row's props out of SQLite only to throw them away (spec 002,
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
	// The count case of aggregateRows (spec 004), keyed as stored: what a
	// board needs, without the labels and display order a chart adds.
	ctx, cancel := withReadLimit(ctx)
	defer cancel()
	res, err := s.aggregateSQL(ctx, u, colID, aggSpec{GroupBy: propID, Agg: "count"}, map[string]any{"type": "multiselect"}, nil, nil, time.Now(), false)
	if err != nil {
		return nil, err
	}
	out := map[string]int{}
	for _, g := range res.Groups {
		out[g.Key] += g.Rows
	}
	return out, nil
}
