package server

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// A Files & media property (spec 028) holds a list of uploads to this
// instance:
//
//	[{ "url": "/files/<stored name>", "name": "<name as uploaded>" }, …]
//
// The order is the order shown. Only uploads made here count: an outside link
// belongs in a URL property, which has no privacy rules to keep (plan D1).
//
// The value is checked on every door that stores one (plan D2): REST props and
// propsPatch, POST /api/pages, MCP set_properties (and everything that goes
// through it: batch updates, create_rows, templates, ingest). Without the
// check an agent could put another workspace's upload into a row of a shared
// page, and the share link would then hand it out (spec 028, FR-006i).

// filesItem is one file of a Files & media value.
type filesItem struct {
	URL  string `json:"url"`
	Name string `json:"name"`
}

// maxFilesPerValue bounds the work one value costs (a stat and an index
// lookup per file). Claude's default: a hundred files is far past what one
// cell shows, and it stops a pasted list of thousands from stalling a write.
const maxFilesPerValue = 100

// filesPropIDs lists the ids of a database's Files & media properties. Empty
// for a page that is not a database, or a database without one, which is
// every database before spec 028: the check then costs one query.
func (s *Server) filesPropIDs(collectionID string) map[string]bool {
	var schemaJSON string
	if err := s.db.QueryRow(`SELECT schema FROM collections WHERE page_id = ?`, collectionID).Scan(&schemaJSON); err != nil {
		return nil
	}
	var schema []map[string]any
	if json.Unmarshal([]byte(schemaJSON), &schema) != nil {
		return nil
	}
	var out map[string]bool
	for _, p := range schema {
		if t, _ := p["type"].(string); t != "files" {
			continue
		}
		if id, _ := p["id"].(string); id != "" {
			if out == nil {
				out = map[string]bool{}
			}
			out[id] = true
		}
	}
	return out
}

// parseFilesValue reads a stored or sent value into its items, refusing any
// other shape. null and an empty list are an empty value.
func parseFilesValue(raw json.RawMessage) ([]filesItem, error) {
	t := bytes.TrimSpace(raw)
	if len(t) == 0 || string(t) == "null" {
		return nil, nil
	}
	if t[0] != '[' {
		return nil, fmt.Errorf("a Files & media value is a list of files, each {\"url\": \"/files/…\", \"name\": \"…\"}")
	}
	var list []json.RawMessage
	if err := json.Unmarshal(t, &list); err != nil {
		return nil, fmt.Errorf("a Files & media value is a list of files, each {\"url\": \"/files/…\", \"name\": \"…\"}")
	}
	if len(list) > maxFilesPerValue {
		return nil, fmt.Errorf("a Files & media value holds at most %d files (got %d)", maxFilesPerValue, len(list))
	}
	items := make([]filesItem, 0, len(list))
	for i, el := range list {
		// Strict: only url and name. A misspelt key ("URL", "file") would
		// otherwise store a value the interface cannot show.
		dec := json.NewDecoder(bytes.NewReader(el))
		dec.DisallowUnknownFields()
		var it filesItem
		if err := dec.Decode(&it); err != nil {
			return nil, fmt.Errorf("file %d is not {\"url\": \"/files/…\", \"name\": \"…\"}", i+1)
		}
		items = append(items, it)
	}
	return items, nil
}

// storedFileName gives the stored name behind a /files/ address, or "" when the
// address is not a plain upload of this instance.
func storedFileName(url string) string {
	name, ok := strings.CutPrefix(url, "/files/")
	if !ok || !publicFileName(name) {
		return ""
	}
	return name
}

// checkFilesValue refuses a value that is not a list of this workspace's
// uploads. workspaceID is the workspace of the row the value is written to.
//
// A file with no index entry yet is accepted: an upload made without a page
// (MCP upload_file without page_id) has no workspace until a row carries it.
// A file whose entry names another workspace is refused, and so is a file
// that does not exist: the cell would show a broken image.
func (s *Server) checkFilesValue(workspaceID string, raw json.RawMessage) error {
	items, err := parseFilesValue(raw)
	if err != nil {
		return coded("invalid_files_value", err.Error())
	}
	for i, it := range items {
		name := storedFileName(it.URL)
		if name == "" {
			return coded("invalid_files_value",
				fmt.Sprintf("file %d: %q is not a file uploaded to this nigari (an address /files/<name>)", i+1, it.URL))
		}
		if fi, err := os.Stat(filepath.Join(s.dataDir, "files", name)); err != nil || fi.IsDir() {
			return coded("invalid_files_value", fmt.Sprintf("file %d: %q does not exist", i+1, it.URL))
		}
		var ws sql.NullString
		err := s.db.QueryRow(`SELECT workspace_id FROM files WHERE file_name = ?`, name).Scan(&ws)
		if err == nil && ws.Valid && ws.String != "" && ws.String != workspaceID {
			return coded("invalid_files_value",
				fmt.Sprintf("file %d: %q belongs to another workspace", i+1, it.URL))
		}
	}
	return nil
}

// checkFilesProps checks every Files & media key of a props object or patch
// written to a row of collectionID. Keys of other types pass untouched.
func (s *Server) checkFilesProps(collectionID, workspaceID string, props map[string]json.RawMessage) error {
	if len(props) == 0 || collectionID == "" {
		return nil
	}
	ids := s.filesPropIDs(collectionID)
	for k, v := range props {
		if !ids[k] {
			continue
		}
		if err := s.checkFilesValue(workspaceID, v); err != nil {
			return err
		}
	}
	return nil
}

// checkRowFiles is checkFilesProps for an existing row: it finds the row's
// database and workspace itself.
//
// Every property write of every row comes through here, so it costs one
// short lookup: the row's workspace, and its database's schema only when the
// schema mentions the files type at all. A database without a Files & media
// property, which is nearly every one, stops there.
//
// On the read pool, against the rule for short lookups: this one runs before
// every row write, and on the one writer connection it took a turn in the
// queue each time. Five agents writing at once measured +32% at p95
// (BenchmarkStoragePropertyWriteBurst, p=0.004, 6 runs); with the check off
// the difference was gone. A committed schema read a moment early is all it
// needs: a type change racing the write is not a gate the check can be.
func (s *Server) checkRowFiles(rowID string, props map[string]json.RawMessage) error {
	if len(props) == 0 {
		return nil
	}
	var ws, schemaJSON string
	if err := s.rdb.QueryRow(`SELECT p.workspace_id,
			CASE WHEN c.schema LIKE '%"files"%' THEN c.schema ELSE '' END
		FROM pages p LEFT JOIN collections c ON c.page_id = p.parent_id
		WHERE p.id = ?`, rowID).Scan(&ws, &schemaJSON); err != nil || schemaJSON == "" {
		return nil // no files property, or the caller reports the missing page
	}
	var schema []map[string]any
	if json.Unmarshal([]byte(schemaJSON), &schema) != nil {
		return nil
	}
	for _, p := range schema {
		if t, _ := p["type"].(string); t != "files" {
			continue
		}
		id, _ := p["id"].(string)
		if v, ok := props[id]; ok && id != "" {
			if err := s.checkFilesValue(ws, v); err != nil {
				return err
			}
		}
	}
	return nil
}

// checkRowFilesJSON is checkRowFiles for props sent as raw JSON. Anything
// that is not an object is left to the caller's own error.
func (s *Server) checkRowFilesJSON(rowID string, raw json.RawMessage) error {
	var props map[string]json.RawMessage
	if json.Unmarshal(raw, &props) != nil {
		return nil
	}
	return s.checkRowFiles(rowID, props)
}

// recordRowFiles records the row as the carrier of every file its Files &
// media values hold (plan D3), so the file list shows the file under the row,
// counts it as used and moves it with the row's workspace. Called from
// reindexPage, which every write of a row's props already runs, so no door
// can store a value without it. Returns the stored names it recorded.
//
// A file taken out of a value keeps its entry, as a file whose block was
// deleted does: undo and version restore bring the value back.
func (s *Server) recordRowFiles(rowID, collectionID, props string) []string {
	// Most rows hold no upload at all: no schema read for them.
	if collectionID == "" || !strings.Contains(props, "/files/") {
		return nil
	}
	ids := s.filesPropIDs(collectionID)
	if len(ids) == 0 {
		return nil
	}
	var m map[string]json.RawMessage
	if json.Unmarshal([]byte(props), &m) != nil {
		return nil
	}
	var out []string
	for k, v := range m {
		if !ids[k] {
			continue
		}
		items, err := parseFilesValue(v)
		if err != nil {
			continue // a value written before the type changed; not ours
		}
		for _, it := range items {
			if name := storedFileName(it.URL); name != "" {
				s.recordFile(name, rowID, it.Name)
				out = append(out, name)
			}
		}
	}
	return out
}

// checkFilesFilterOp refuses a condition on a Files & media property that asks
// anything but whether it holds files (FR-006e). "is" a file, "contains" a
// name or "gt" a list compare the stored JSON as text: the answer would look
// like a filter and mean nothing. An empty op is is_not_empty here, as
// rowFilter.where reads it without a value.
func checkFilesFilterOp(schema []map[string]any, label, prop, op string) error {
	for _, p := range schema {
		if id, _ := p["id"].(string); id != prop {
			continue
		}
		if t, _ := p["type"].(string); t != "files" {
			return nil
		}
		switch op {
		case "", "is_empty", "is_not_empty":
			return nil
		}
		return fmt.Errorf("%s: %q is a Files & media property; it filters with is_empty or is_not_empty only, not %q", label, prop, op)
	}
	return nil
}

// filesMarkdown writes a Files & media value as Markdown links, the uploaded
// name as the text: "[plan.pdf](/files/ab12….pdf), [photo.jpg](/files/…)".
// A value in any other shape writes nothing, as the cell shows nothing.
func filesMarkdown(raw json.RawMessage) string {
	items, err := parseFilesValue(raw)
	if err != nil {
		return ""
	}
	esc := strings.NewReplacer(`\`, `\\`, "[", `\[`, "]", `\]`)
	parts := make([]string, 0, len(items))
	for _, it := range items {
		name := storedFileName(it.URL)
		if name == "" {
			continue
		}
		label := it.Name
		if label == "" {
			label = name
		}
		parts = append(parts, "["+esc.Replace(label)+"](/files/"+name+")")
	}
	return strings.Join(parts, ", ")
}
