package server

import (
	"context"
	"testing"
)

// A chart must count exactly the rows the table shows. groupCounts is a
// separate query from query_rows, so this checks the two against each other
// for a plain member on the seeded workspace, where 10% of rows are private to
// someone else: per value, the group count equals the total query_rows reports
// for a filter on that value. A chart that counted another person's private
// rows would reveal they exist (spec 002, FR-005).
func TestGroupCountsMatchQueryRowsForAMember(t *testing.T) {
	w := buildBenchWorld(t, t.TempDir(), benchDefaultSeed, 0, 600)
	defer w.s.Close()
	ctx := context.Background()

	for _, prop := range []struct {
		id     string
		values []string
	}{{"stage", benchStages}, {"tags", benchTags}} {
		got, err := w.s.groupCounts(ctx, w.member(), w.rowsDB, prop.id)
		if err != nil {
			t.Fatalf("groupCounts(%s): %v", prop.id, err)
		}
		sum := 0
		for _, v := range prop.values {
			_, total, err := w.s.collectionRowsQuery(ctx, w.member(), w.rowsDB,
				[]rowFilter{{Prop: prop.id, Op: "is", Value: v}}, nil, "", 1, 0, benchDay)
			if err != nil {
				t.Fatalf("query_rows %s=%s: %v", prop.id, v, err)
			}
			if got[v] != total {
				t.Errorf("%s=%s: group count %d, query_rows total %d", prop.id, v, got[v], total)
			}
			sum += got[v]
		}
		if want := len(w.rows) - len(w.private); sum != want {
			t.Errorf("%s: counts add up to %d, want the %d rows the member may see", prop.id, sum, want)
		}
	}
}

// The property id goes into the SQL as a JSON path, so it is checked the same
// way a filter's is: anything unusual is refused, not interpolated.
func TestGroupCountsRefusesAnUnsafePropertyID(t *testing.T) {
	s := testServer(t)
	if _, err := s.groupCounts(context.Background(), &user{ID: "u"}, "c", "x') OR 1=1 --"); err == nil {
		t.Fatal("an unsafe property id was accepted")
	}
}
