package server

import (
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"
)

// The upgrade fixtures (spec 008, FR-012) are databases written by the code
// just before a step, kept in server/testdata/upgrade/ and opened by every
// later release. upgradeFixture is what each of them holds: the generator
// below writes it, and the fixture test checks that a new release still finds
// all of it after its steps ran. One value for both, so the test cannot drift
// from what was written.
var upgradeFixture = struct {
	Page, PageText, SearchWord string
	Child                      string
	Database                   string
	Rows                       []string
	ChartView                  string
	Comment                    string
	FileName, FileText         string
}{
	Page:       "Upgrade fixture",
	PageText:   "This page was written before the upgrade. The word quokka is here so search can find it.",
	SearchWord: "quokka",
	Child:      "Child page",
	Database:   "Hours",
	Rows:       []string{"Design", "Build", "Test"},
	ChartView:  "Hours by stage",
	Comment:    "Written before the upgrade",
	FileName:   "notes.txt",
	FileText:   "a file reference that must survive",
}

// pageIDIn finds the page id in a tool's answer; create_page answers with a
// link (/p/<id>), create_database with the bare id last.
func pageIDIn(t *testing.T, answer string) string {
	t.Helper()
	id := regexp.MustCompile(`[0-9a-f]{32}`).FindString(answer)
	if id == "" {
		t.Fatalf("no page id in %q", answer)
	}
	return id
}

// TestWriteUpgradeFixture writes a fixture; it is not a test of anything and
// skips unless asked:
//
//	SALT_WRITE_UPGRADE_FIXTURE=$PWD/server/testdata/upgrade/step-0.db \
//	  go test ./server -run TestWriteUpgradeFixture -count=1
//
// It goes through the MCP tools, the same write paths an agent uses, so the
// search index, revisions and document generations are written the way a real
// instance writes them, not by hand-made INSERTs that skip half of it.
func TestWriteUpgradeFixture(t *testing.T) {
	out := os.Getenv("SALT_WRITE_UPGRADE_FIXTURE")
	if out == "" {
		t.Skip("set SALT_WRITE_UPGRADE_FIXTURE to the path of the fixture to write")
	}
	if _, err := os.Stat(out); err == nil {
		// A fixture is written once, by the code before its step; rewriting it
		// later with newer code would test nothing.
		t.Fatalf("%s exists; fixtures are never rewritten", out)
	}
	f := upgradeFixture
	s := testServer(t)
	uid, _ := signedIn(t, s, "fixture@example.test")
	u := &user{ID: uid, Name: "Test"}
	tool := func(name, args string) string {
		t.Helper()
		res, err := callTool(t, s, u, name, args)
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		return res
	}
	js := func(v string) string { b, _ := json.Marshal(v); return string(b) }

	page := pageIDIn(t, tool("create_page", `{"title":`+js(f.Page)+`,"markdown":`+js(f.PageText)+`}`))
	tool("create_page", `{"title":`+js(f.Child)+`,"parent_id":"`+page+`"}`)
	tool("comments", `{"page_id":"`+page+`","action":"add","body":`+js(f.Comment)+`}`)
	tool("upload_file", `{"file_name":`+js(f.FileName)+`,"page_id":"`+page+`","data_base64":"`+
		base64.StdEncoding.EncodeToString([]byte(f.FileText))+`"}`)

	db := pageIDIn(t, tool("create_database", `{"title":`+js(f.Database)+`,"schema":[
		{"name":"Stage","type":"select","options":["Now","Later"]},
		{"name":"Hours","type":"number"}]}`))
	schema, _, err := s.loadCollection(db)
	if err != nil {
		t.Fatal(err)
	}
	ids := map[string]string{}
	for _, p := range schema {
		name, _ := p["name"].(string)
		id, _ := p["id"].(string)
		ids[name] = id
	}
	var rows []string
	for i, title := range f.Rows {
		stage := "Now"
		if i == len(f.Rows)-1 {
			stage = "Later"
		}
		rows = append(rows, `{"title":`+js(title)+`,"properties":{"`+ids["Stage"]+`":"`+stage+`","`+
			ids["Hours"]+`":`+strconv.Itoa(3+i)+`}}`)
	}
	tool("create_rows", `{"page_id":"`+db+`","rows":[`+strings.Join(rows, ",")+`]}`)
	tool("set_view", `{"page_id":"`+db+`","type":"chart","name":`+js(f.ChartView)+
		`,"chart_kind":"bar","group_by":"`+ids["Stage"]+`","aggregate":"sum","aggregate_property":"`+ids["Hours"]+`"}`)

	if res := tool("search", `{"query":`+js(f.SearchWord)+`}`); !strings.Contains(res, f.Page) {
		t.Fatalf("search does not find the fixture page before writing it: %s", res)
	}

	if err := os.MkdirAll(filepath.Dir(out), 0o755); err != nil {
		t.Fatal(err)
	}
	// VACUUM INTO writes one self-contained, compacted file: no -wal beside it.
	if _, err := s.db.Exec(`VACUUM INTO ?`, out); err != nil {
		t.Fatalf("VACUUM INTO: %v", err)
	}
	t.Logf("wrote %s", out)
}
