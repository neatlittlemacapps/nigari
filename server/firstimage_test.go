package server

import (
	"encoding/json"
	"strings"
	"testing"
)

// Spec 028, D4: a gallery card falls back to the first image in a row's
// content. The rows route and query_rows return it as firstImage, read from
// pages.thumb, which reindexPage keeps on every content write (the notes list
// reads the same column). No row's document is read when a gallery opens.

func TestRowsCarryTheFirstContentImage(t *testing.T) {
	f := newFilesFixture(t)
	firstImage := func() string {
		rec := requestAs(t, f.s, f.cookie, "GET", "/api/collections/"+f.db+"/rows", "")
		var out struct {
			Rows []map[string]any `json:"rows"`
		}
		json.Unmarshal(rec.Body.Bytes(), &out)
		for _, r := range out.Rows {
			if r["id"] == f.row {
				s, _ := r["firstImage"].(string)
				return s
			}
		}
		t.Fatalf("the row is not in the rows: %s", rec.Body.String())
		return ""
	}
	write := func(content string) {
		t.Helper()
		if rec := requestAs(t, f.s, f.cookie, "PATCH", "/api/pages/"+f.row, `{"content":`+content+`}`); rec.Code != 200 {
			t.Fatalf("content write: %d %s", rec.Code, rec.Body.String())
		}
	}
	img := func(url string) string {
		return `{"type":"image","props":{"url":"` + url + `"},"content":[],"children":[]}`
	}
	para := `{"type":"paragraph","content":[{"type":"text","text":"x","styles":{}}],"children":[]}`

	if got := firstImage(); got != "" {
		t.Errorf("an empty row has a first image: %q", got)
	}
	// In reading order: the first of two.
	write(`[` + para + `,` + img("/files/one.png") + `,` + img("/files/two.png") + `]`)
	if got := firstImage(); got != "/files/one.png" {
		t.Errorf("first image %q, want /files/one.png", got)
	}
	// Nested under a toggle's children, before a later top-level one.
	write(`[{"type":"toggleListItem","content":[],"children":[` + img("/files/nested.png") + `]},` + img("/files/later.png") + `]`)
	if got := firstImage(); got != "/files/nested.png" {
		t.Errorf("a nested image: %q, want /files/nested.png", got)
	}
	// In a column of a columns block.
	write(`[{"type":"columnList","content":[],"children":[{"type":"column","content":[],"children":[` + img("/files/col.png") + `]}]}]`)
	if got := firstImage(); got != "/files/col.png" {
		t.Errorf("an image in a column: %q, want /files/col.png", got)
	}
	// The image taken out again.
	write(`[` + para + `]`)
	if got := firstImage(); got != "" {
		t.Errorf("a removed image is still the first: %q", got)
	}
	// query_rows returns the same.
	write(`[` + img("/files/agent.png") + `]`)
	out, err := callTool(t, f.s, f.u, "query_rows", `{"page_id":"`+f.db+`"}`)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out, `"firstImage":"/files/agent.png"`) {
		t.Errorf("query_rows lacks the first image: %s", out)
	}
}
