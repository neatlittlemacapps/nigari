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
func (s *Server) checkRowFiles(rowID string, props map[string]json.RawMessage) error {
	if len(props) == 0 {
		return nil
	}
	var parent, ws string
	if err := s.db.QueryRow(`SELECT COALESCE(parent_id, ''), workspace_id FROM pages WHERE id = ?`, rowID).Scan(&parent, &ws); err != nil {
		return nil // the caller reports the missing page
	}
	return s.checkFilesProps(parent, ws, props)
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
