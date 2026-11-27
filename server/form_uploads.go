package server

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

// Files in public forms (spec 028, plan D8).
//
// A public form's link is all anyone needs to fill it in, without an account.
// So an upload through it is held apart from every other file until the
// submission that carries it claims it:
//
//   - POST /api/public/form/{token}/upload writes the file and a form_uploads
//     row, and answers a one-time claim. The file is in no workspace and in no
//     file index; /files/ serves only signed-in people, and nothing anonymous
//     serves it, so it reaches nobody.
//   - The submission sends the claims with its Files & media values. Only a
//     claim of this same form's database is accepted; the claimed rows go, and
//     reindexPage records the new row as the files' carrier.
//   - An upload nobody claims within formUploadTTL is removed, file and row
//     (cleanupFormUploads, on the maintenance tick).
//
// The signed-in form does none of this: it is a signed-in person creating a
// row, through /api/upload and POST /api/pages, which checkFilesValue guards.

// formUploadTTL is how long an upload waits for its submission. Claude's
// default (plan D8): long enough to fill in a long form, short enough that a
// link's visitors cannot keep files on the instance.
const formUploadTTL = 24 * time.Hour

// What may wait at once, so a form's link cannot fill the disk (code review:
// at the per-address rate alone, one address could park over a terabyte in a
// day, and a full disk stops every write on the instance). Claude's defaults:
// a database's form far more than a busy day of entries needs, the instance
// a small share of a modest server's disk.
const (
	formUploadsPerDatabase  = 100
	formUploadBytesPerDB    = 1 << 30 // 1 GiB
	formUploadBytesInstance = 4 << 30 // 4 GiB
)

// handlePublicFormUpload (POST /api/public/form/{token}/upload) takes one file
// for a public form. Counted per address with the form's own limiter, under a
// key of its own so a form with several files is not refused its submit.
func (s *Server) handlePublicFormUpload(w http.ResponseWriter, r *http.Request) {
	if !s.formRate.allow("upload|" + s.clientIP(r)) {
		httpErrorCode(w, 429, "form_upload_limit", "Too many files sent from this address. Please try again shortly.")
		return
	}
	colID, ok := s.resolveFormShare(r.PathValue("token"))
	if !ok {
		httpError(w, 404, "not found")
		return
	}
	if !s.formTakesFiles(colID) {
		httpError(w, 404, "not found")
		return
	}
	maxUploadSize := s.maxUploadBytes()
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize+1<<20)
	// At most 1 MiB of an anonymous request in memory; the rest goes to a
	// temporary file (code review: up to the size limit per request in RAM).
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) || strings.Contains(err.Error(), "too large") {
			httpError(w, http.StatusRequestEntityTooLarge, fmt.Sprintf("file too large: max %d MB", maxUploadSize>>20))
		} else {
			httpError(w, 400, "upload malformed")
		}
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		httpError(w, 400, "missing file field")
		return
	}
	defer file.Close()
	if header.Size > maxUploadSize {
		httpError(w, http.StatusRequestEntityTooLarge, fmt.Sprintf("file too large: max %d MB", maxUploadSize>>20))
		return
	}

	if !s.formUploadFits(colID, header.Size) {
		httpErrorCode(w, 429, "form_upload_full", "This form takes no more files for now. Please try again later.")
		return
	}

	name := newID() + sanitizeExt(header)
	path := filepath.Join(s.dataDir, "files", name)
	dst, err := os.Create(path)
	if err != nil {
		httpError(w, 500, "could not store the file")
		return
	}
	if _, err := io.Copy(dst, file); err != nil {
		dst.Close()
		os.Remove(path)
		httpError(w, 500, "could not store the file")
		return
	}
	dst.Close()
	claim := newID()
	if _, err := s.db.Exec(`INSERT INTO form_uploads (file_name, collection_id, claim, size, created_at) VALUES (?, ?, ?, ?, ?)`,
		name, colID, tokenHash(claim), header.Size, now()); err != nil {
		os.Remove(path)
		httpError(w, 500, "could not store the file")
		return
	}
	writeJSON(w, map[string]string{"url": "/files/" + name, "name": formFileName(header.Filename), "claim": claim})
}

// formUploadFits reports whether one more upload of size bytes stays within
// the caps on what may wait (formUploadsPerDatabase and the two byte caps).
// The waiting set is small by those very caps, so the sums stay cheap.
func (s *Server) formUploadFits(colID string, size int64) bool {
	var n, dbBytes, all int64
	s.db.QueryRow(`SELECT COUNT(*), COALESCE(SUM(size), 0) FROM form_uploads WHERE collection_id = ?`, colID).Scan(&n, &dbBytes)
	s.db.QueryRow(`SELECT COALESCE(SUM(size), 0) FROM form_uploads`).Scan(&all)
	return n < formUploadsPerDatabase && dbBytes+size <= formUploadBytesPerDB && all+size <= formUploadBytesInstance
}

// formTakesFiles reports whether a form's database has a Files & media field
// the form shows. Without one there is nothing to upload for, and the route
// would only be free storage for anyone holding the link.
func (s *Server) formTakesFiles(colID string) bool {
	var schemaJSON, viewsJSON string
	if s.db.QueryRow(`SELECT schema, views FROM collections WHERE page_id = ?`, colID).Scan(&schemaJSON, &viewsJSON) != nil {
		return false
	}
	var views []formView
	json.Unmarshal([]byte(viewsJSON), &views)
	hidden := map[string]bool{}
	found := false
	for _, v := range views {
		if v.Type == "form" {
			for _, h := range v.Hidden {
				hidden[h] = true
			}
			found = true
			break
		}
	}
	if !found {
		return false
	}
	for _, p := range parseFormSchema(schemaJSON) {
		if p.Type == "files" && !hidden[p.ID] {
			return true
		}
	}
	return false
}

// formFileName is the name a person chose, as a Files & media value may hold
// it: the base name, control characters left out, at most maxFileNameLen.
func formFileName(raw string) string {
	name := strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return -1
		}
		return r
	}, filepath.Base(raw))
	for utf8.RuneCountInString(name) > maxFileNameLen {
		_, size := utf8.DecodeLastRuneInString(name)
		name = name[:len(name)-size]
	}
	return name
}

// formHiddenFiles lists the files fields the form view hides.
func (s *Server) formHiddenFiles(colID string) map[string]bool {
	var schemaJSON, viewsJSON string
	if s.db.QueryRow(`SELECT schema, views FROM collections WHERE page_id = ?`, colID).Scan(&schemaJSON, &viewsJSON) != nil {
		return nil
	}
	var views []formView
	json.Unmarshal([]byte(viewsJSON), &views)
	hidden := map[string]bool{}
	for _, v := range views {
		if v.Type == "form" {
			for _, h := range v.Hidden {
				hidden[h] = true
			}
			break
		}
	}
	out := map[string]bool{}
	for _, p := range parseFormSchema(schemaJSON) {
		if p.Type == "files" && hidden[p.ID] {
			out[p.ID] = true
		}
	}
	return out
}

// errUnclaimed is a submission naming an upload it cannot claim: another
// form's, one already claimed or swept, or one never made.
var errUnclaimed = errors.New("unclaimed")

// claimFormFiles reads a Files & media value a public form submitted: a list
// of {url, name, claim}, each an upload of this form's database waiting with
// that claim. It returns the value to store and the uploads it claims.
// formClaim is one upload a submission spends: its stored name and the
// claim's hash, deleted together with the new row's insert.
type formClaim struct{ name, hash string }

func (s *Server) claimFormFiles(colID string, v any) ([]filesItem, []formClaim, error) {
	list, ok := v.([]any)
	if !ok || len(list) > maxFilesPerValue {
		return nil, nil, errUnclaimed
	}
	var items []filesItem
	var claimed []formClaim
	seen := map[string]bool{}
	for _, el := range list {
		m, ok := el.(map[string]any)
		if !ok {
			return nil, nil, errUnclaimed
		}
		url, _ := m["url"].(string)
		claim, _ := m["claim"].(string)
		name := storedFileName(url)
		if name == "" || claim == "" || seen[name] {
			return nil, nil, errUnclaimed
		}
		var stored string
		if s.db.QueryRow(`SELECT claim FROM form_uploads WHERE file_name = ? AND collection_id = ?`, name, colID).Scan(&stored) != nil {
			return nil, nil, errUnclaimed
		}
		if subtle.ConstantTimeCompare([]byte(stored), []byte(tokenHash(claim))) != 1 {
			return nil, nil, errUnclaimed
		}
		display, _ := m["name"].(string)
		seen[name] = true
		items = append(items, filesItem{URL: "/files/" + name, Name: formFileName(display)})
		claimed = append(claimed, formClaim{name: name, hash: stored})
	}
	return items, claimed, nil
}

// cleanupFormUploads removes uploads no submission claimed within
// formUploadTTL: the file, then its row. Run on the maintenance tick.
// Collected first, then removed: the cursor holds the one connection.
func (s *Server) cleanupFormUploads(at time.Time) int {
	cutoff := at.UTC().Add(-formUploadTTL).Format(time.RFC3339Nano)
	rows, err := s.db.Query(`SELECT file_name FROM form_uploads WHERE created_at < ?`, cutoff)
	if err != nil {
		return 0
	}
	var stale []string
	for rows.Next() {
		var name string
		if rows.Scan(&name) == nil {
			stale = append(stale, name)
		}
	}
	rows.Close()
	for _, name := range stale {
		// A file something now holds stays: a signed-in person may have put
		// a waiting upload's address into a row (checkFilesValue accepts a
		// file with no index entry), and the index records that row (code
		// review). Only the waiting record goes then.
		var held int
		s.db.QueryRow(`SELECT COUNT(*) FROM files WHERE file_name = ? AND page_id IS NOT NULL`, name).Scan(&held)
		if held == 0 && publicFileName(name) {
			os.Remove(filepath.Join(s.dataDir, "files", name))
		}
		s.db.Exec(`DELETE FROM form_uploads WHERE file_name = ?`, name)
	}
	if len(stale) > 0 {
		log.Printf("form uploads: removed %d that no submission claimed within %s", len(stale), formUploadTTL)
	}
	return len(stale)
}
