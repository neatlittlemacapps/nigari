package server

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

// The reader of an embed's views (spec 014) has a twin in the browser
// (web/src/embedViews.ts). Each case in testdata/embedviews runs through
// both: here, and in web/scripts/check-embedviews.mjs. A rule changed on one
// side only fails the other's run, which is how two copies of one rule are
// kept from drifting (#95 was a filter rule that did).

type embedCase struct {
	DatabaseViews []map[string]any `json:"databaseViews"`
	Local         string           `json:"local"`
	Expect        struct {
		ViewID string           `json:"viewId"`
		Views  []map[string]any `json:"views"`
	} `json:"expect"`
}

func loadEmbedCases(t *testing.T) map[string]embedCase {
	t.Helper()
	files, err := filepath.Glob("testdata/embedviews/*.json")
	if err != nil || len(files) == 0 {
		t.Fatalf("no embed view cases: %v", err)
	}
	out := map[string]embedCase{}
	for _, f := range files {
		raw, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		var c embedCase
		if err := json.Unmarshal(raw, &c); err != nil {
			t.Fatalf("%s: %v", f, err)
		}
		out[filepath.Base(f)] = c
	}
	return out
}

// asJSON compares as the browser would: through JSON, numbers as numbers.
func asJSON(v any) any {
	b, _ := json.Marshal(v)
	var out any
	_ = json.Unmarshal(b, &out)
	return out
}

// matchEmbedRead checks a read against a case. An expected id "*" is a view
// made up by the reader (the default table): any id, and the open view is
// then that id.
func matchEmbedRead(c embedCase, viewID string, views []map[string]any) string {
	if len(views) != len(c.Expect.Views) {
		return "views: got " + string(embedJSON(views))
	}
	for i, want := range c.Expect.Views {
		got := asJSON(views[i]).(map[string]any)
		w := asJSON(want).(map[string]any)
		if w["id"] == "*" {
			if id, _ := got["id"].(string); id == "" {
				return "a made-up view has no id"
			}
			w["id"] = got["id"]
		}
		if !reflect.DeepEqual(got, w) {
			return "view " + string(embedJSON(got)) + ", want " + string(embedJSON(w))
		}
	}
	want := c.Expect.ViewID
	if want == "*" {
		want, _ = views[0]["id"].(string)
	}
	if viewID != want {
		return "open view " + viewID + ", want " + want
	}
	return ""
}

func embedJSON(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}

func TestEmbedViewsReadInBothShapes(t *testing.T) {
	for name, c := range loadEmbedCases(t) {
		viewID, views := readEmbedLocal(c.Local, c.DatabaseViews)
		if msg := matchEmbedRead(c, viewID, views); msg != "" {
			t.Errorf("%s: %s", name, msg)
		}
		// What is written reads back as itself: the new shape is stable,
		// so reading an embed never changes what it shows.
		id2, views2 := readEmbedLocal(encodeEmbedLocal(viewID, views), c.DatabaseViews)
		if id2 != viewID || !reflect.DeepEqual(asJSON(views2), asJSON(views)) {
			t.Errorf("%s: round trip changed the embed: %s %s", name, id2, embedJSON(views2))
		}
	}
}

// Reading an old embed must not reach into the database's views: the copy is
// the embed's (FR-014), and a change to it later changes nothing else.
func TestReadingAnOldEmbedCopiesTheDatabaseViews(t *testing.T) {
	db := []map[string]any{{"id": "a", "name": "A", "type": "table", "filters": []any{}}}
	_, views := readEmbedLocal(`{"viewId":"a","views":{"a":{"filters":[{"property":"x","op":"is","value":"1"}]}}}`, db)
	views[0]["name"] = "Changed"
	if db[0]["name"] != "A" || len(db[0]["filters"].([]any)) != 0 {
		t.Errorf("the database's view changed with the embed's copy: %v", db[0])
	}
}

// The new shape always carries its version, so a reader can tell it from the
// old one, whose views is an object rather than a list.
func TestEmbedViewsAreWrittenWithTheirVersion(t *testing.T) {
	got := encodeEmbedLocal("x", []map[string]any{{"id": "x", "name": "X", "type": "table"}})
	if !strings.HasPrefix(got, `{"v":2,"viewId":"x","views":[`) {
		t.Errorf("written as %s", got)
	}
}

// Reading is linear in the views; an embed of a database with many views
// costs a few microseconds per read (measured, see the pull request).
func TestReadingAnEmbedOfFiftyViewsIsCheap(t *testing.T) {
	var db []map[string]any
	for i := 0; i < 50; i++ {
		db = append(db, map[string]any{"id": "v" + string(rune('a'+i%26)) + string(rune('a'+i/26)), "name": "View", "type": "table",
			"filters": []any{map[string]any{"property": "status", "op": "is", "value": "open"}}})
	}
	start := time.Now()
	const n = 200
	for i := 0; i < n; i++ {
		if _, views := readEmbedLocal("", db); len(views) != 50 {
			t.Fatalf("read %d views", len(views))
		}
	}
	per := time.Since(start) / n
	t.Logf("readEmbedLocal, 50 views: %v per read", per)
	if per > 50*time.Millisecond {
		t.Errorf("reading an embed of 50 views took %v", per)
	}
}
