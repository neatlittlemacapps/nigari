package server

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Spec 028 PR 2: files in public forms, and a shared database's files. The
// refusals are what matter: an anonymous visitor uploads, so every way an
// upload could reach someone, or stay forever, is tried here.

type formFixture struct {
	*filesFixture
	form  string // the form's token
	other string // another database's form token
}

func newFormFixture(t *testing.T) *formFixture {
	t.Helper()
	f := newFilesFixture(t)
	f.s.db.Exec(`UPDATE collections SET views = ? WHERE page_id = ?`, `[{"id":"form","name":"Form","type":"form"}]`, f.db)
	other := f.s.makeCollection(t, f.ws, f.uid, "Other", `[{"id":"scan","name":"Scan","type":"files"}]`)
	f.s.db.Exec(`UPDATE collections SET views = ? WHERE page_id = ?`, `[{"id":"form","name":"Form","type":"form"}]`, other)
	return &formFixture{filesFixture: f, form: formShareFor(t, f, f.db), other: formShareFor(t, f, other)}
}

func formShareFor(t *testing.T, f *filesFixture, col string) string {
	t.Helper()
	rec := requestAs(t, f.s, f.cookie, "POST", "/api/collections/"+col+"/form-share", `{}`)
	var out struct {
		Token string `json:"token"`
	}
	if rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &out) != nil || out.Token == "" {
		t.Fatalf("form share: %d %s", rec.Code, rec.Body.String())
	}
	return out.Token
}

type formUpload struct {
	URL, Name, Claim string
}

// upload posts one file to a public form, from the given address.
func (f *formFixture) upload(t *testing.T, token, ip, name string, data []byte) (*httptest.ResponseRecorder, formUpload) {
	t.Helper()
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	fw, _ := mw.CreateFormFile("file", name)
	fw.Write(data)
	mw.Close()
	req := httptest.NewRequest("POST", "/api/public/form/"+token+"/upload", &body)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.RemoteAddr = ip + ":1234"
	rec := httptest.NewRecorder()
	f.s.ServeHTTP(rec, req)
	var out struct{ URL, Name, Claim string }
	json.Unmarshal(rec.Body.Bytes(), &out)
	return rec, formUpload{out.URL, out.Name, out.Claim}
}

func (f *formFixture) submit(t *testing.T, token, title, props string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest("POST", "/api/public/form/"+token+"/submit", strings.NewReader(`{"title":"`+title+`","props":`+props+`}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	f.s.ServeHTTP(rec, req)
	return rec
}

func filesJSON(ups ...formUpload) string {
	items := make([]map[string]string, len(ups))
	for i, u := range ups {
		items[i] = map[string]string{"url": u.URL, "name": u.Name, "claim": u.Claim}
	}
	b, _ := json.Marshal(items)
	return string(b)
}

func (f *formFixture) waiting() int {
	var n int
	f.s.db.QueryRow(`SELECT COUNT(*) FROM form_uploads`).Scan(&n)
	return n
}

func TestPublicFormUploadIsClaimedBySubmission(t *testing.T) {
	f := newFormFixture(t)
	rec, up := f.upload(t, f.form, "203.0.113.1", "site visit.png", []byte("png"))
	if rec.Code != 200 || up.Claim == "" || !strings.HasPrefix(up.URL, "/files/") {
		t.Fatalf("upload: %d %s", rec.Code, rec.Body.String())
	}
	// Nothing that holds the claim is stored: only its hash.
	var stored string
	f.s.db.QueryRow(`SELECT claim FROM form_uploads`).Scan(&stored)
	if stored == up.Claim || stored != tokenHash(up.Claim) {
		t.Errorf("the claim is stored as %q, want its hash", stored)
	}
	if rec := f.submit(t, f.form, "Visit", `{"media":`+filesJSON(up)+`}`); rec.Code != 200 {
		t.Fatalf("submit: %d %s", rec.Code, rec.Body.String())
	}
	var rowID, props string
	f.s.db.QueryRow(`SELECT id, props FROM pages WHERE parent_id = ? AND title = 'Visit'`, f.db).Scan(&rowID, &props)
	if !strings.Contains(props, up.URL) || !strings.Contains(props, "site visit.png") || strings.Contains(props, "claim") {
		t.Errorf("the row holds %s", props)
	}
	if f.waiting() != 0 {
		t.Error("the claimed upload is still waiting, and the sweep would delete a row's file")
	}
	var carrier, ws string
	f.s.db.QueryRow(`SELECT COALESCE(page_id, ''), COALESCE(workspace_id, '') FROM files WHERE file_name = ?`, storedFileName(up.URL)).Scan(&carrier, &ws)
	if carrier != rowID || ws != f.ws {
		t.Errorf("the file's carrier is %q in %q, want the new row in the form's workspace", carrier, ws)
	}
	// A claim is used once.
	if rec := f.submit(t, f.form, "Again", `{"media":`+filesJSON(up)+`}`); rec.Code != 400 || !strings.Contains(rec.Body.String(), "form_upload_unclaimed") {
		t.Errorf("a used claim was accepted again: %d %s", rec.Code, rec.Body.String())
	}
}

func TestPublicFormUploadRefusals(t *testing.T) {
	f := newFormFixture(t)
	_, mine := f.upload(t, f.form, "203.0.113.2", "a.pdf", []byte("pdf"))
	_, theirs := f.upload(t, f.other, "203.0.113.2", "b.pdf", []byte("pdf"))

	// Another form's upload, even with its right claim.
	if rec := f.submit(t, f.form, "Wrong form", `{"media":`+filesJSON(theirs)+`}`); rec.Code != 400 {
		t.Errorf("another form's upload was claimed: %d %s", rec.Code, rec.Body.String())
	}
	// The right upload with a made-up claim.
	forged := mine
	forged.Claim = newID()
	if rec := f.submit(t, f.form, "Forged", `{"media":`+filesJSON(forged)+`}`); rec.Code != 400 {
		t.Errorf("a forged claim was accepted: %d", rec.Code)
	}
	// A file of the workspace that never went through the form.
	if rec := f.submit(t, f.form, "Smuggled", `{"media":[{"url":"/files/`+f.own+`","name":"x","claim":"`+mine.Claim+`"}]}`); rec.Code != 400 {
		t.Errorf("a workspace file was smuggled into a public submission: %d", rec.Code)
	}
	var n int
	f.s.db.QueryRow(`SELECT COUNT(*) FROM pages WHERE parent_id = ? AND title IN ('Wrong form', 'Forged', 'Smuggled')`, f.db).Scan(&n)
	if n != 0 {
		t.Errorf("%d refused submission(s) still made a row", n)
	}

	// Over the instance's size limit.
	f.s.setSetting("max_upload_mb", "1")
	if rec, _ := f.upload(t, f.form, "203.0.113.3", "big.bin", make([]byte, 2<<20)); rec.Code != 413 {
		t.Errorf("an upload over the limit: %d", rec.Code)
	}
	f.s.setSetting("max_upload_mb", "50")

	// A form whose database has no Files & media field takes no files.
	plain := f.s.makeCollection(t, f.ws, f.uid, "Plain", `[{"id":"name","name":"Name","type":"text"}]`)
	f.s.db.Exec(`UPDATE collections SET views = ? WHERE page_id = ?`, `[{"id":"form","name":"Form","type":"form"}]`, plain)
	if rec, _ := f.upload(t, formShareFor(t, f.filesFixture, plain), "203.0.113.4", "a.pdf", []byte("pdf")); rec.Code != 404 {
		t.Errorf("a form without a files field took an upload: %d", rec.Code)
	}

	// The per-address limit: a burst, then refusals with their code.
	limited := false
	for i := 0; i < 20; i++ {
		rec, _ := f.upload(t, f.form, "203.0.113.9", "n.pdf", []byte("pdf"))
		if rec.Code == 429 {
			limited = strings.Contains(rec.Body.String(), "form_upload_limit")
			break
		}
	}
	if !limited {
		t.Error("20 uploads from one address in a row were all accepted")
	}
	// Another address is not held back by that one.
	if rec, _ := f.upload(t, f.form, "203.0.113.10", "n.pdf", []byte("pdf")); rec.Code != 200 {
		t.Errorf("another address was limited too: %d", rec.Code)
	}
}

// An upload nobody claims is gone after 24 hours, file and row; a newer one
// stays.
func TestUnclaimedFormUploadsAreSwept(t *testing.T) {
	f := newFormFixture(t)
	_, old := f.upload(t, f.form, "203.0.113.5", "old.pdf", []byte("pdf"))
	_, fresh := f.upload(t, f.form, "203.0.113.5", "fresh.pdf", []byte("pdf"))
	f.s.db.Exec(`UPDATE form_uploads SET created_at = ? WHERE file_name = ?`,
		time.Now().UTC().Add(-25*time.Hour).Format(time.RFC3339Nano), storedFileName(old.URL))
	if n := f.s.cleanupFormUploads(time.Now()); n != 1 {
		t.Errorf("swept %d uploads, want 1", n)
	}
	if _, err := os.Stat(filepath.Join(f.s.dataDir, "files", storedFileName(old.URL))); !os.IsNotExist(err) {
		t.Error("the old upload's file is still on disk")
	}
	if _, err := os.Stat(filepath.Join(f.s.dataDir, "files", storedFileName(fresh.URL))); err != nil {
		t.Error("the fresh upload's file was removed")
	}
	if f.waiting() != 1 {
		t.Errorf("%d uploads waiting, want the fresh one", f.waiting())
	}
}

// A shared database serves the files of the rows its shared table shows, and
// nothing else: not a private row's, not a trashed row's, not one waiting for
// a form, not another database's.
func TestSharedDatabaseServesOnlyItsVisibleRowsFiles(t *testing.T) {
	f := newFormFixture(t)
	visible := f.row
	private := f.s.makeRow(t, f.ws, f.uid, f.db, "Private", `{}`)
	trashed := f.s.makeRow(t, f.ws, f.uid, f.db, "Trashed", `{}`)
	pv := f.upload2(t, "private.png", private)
	tr := f.upload2(t, "trashed.png", trashed)
	for row, v := range map[string]string{visible: filesValue(f.own), private: filesValue(pv), trashed: filesValue(tr)} {
		if _, err := callTool(t, f.s, f.u, "set_properties", `{"page_id":"`+row+`","properties":{"media":`+v+`}}`); err != nil {
			t.Fatal(err)
		}
	}
	f.s.db.Exec(`UPDATE pages SET visibility = 'private' WHERE id = ?`, private)
	f.s.db.Exec(`UPDATE pages SET trashed_at = ? WHERE id = ?`, now(), trashed)
	_, pending := f.upload(t, f.form, "203.0.113.6", "pending.png", []byte("png"))

	token := shareForTest(t, f.s, f.cookie, f.db)
	get := func(name string) int {
		rec := httptest.NewRecorder()
		f.s.ServeHTTP(rec, httptest.NewRequest("GET", "/public/"+token+"/files/"+name, nil))
		return rec.Code
	}
	if code := get(f.own); code != 200 {
		t.Errorf("a shared row's file: %d", code)
	}
	for why, name := range map[string]string{"a private row's": pv, "a trashed row's": tr, "a waiting form upload": storedFileName(pending.URL), "another workspace's": f.foreign} {
		if code := get(name); code != 404 {
			t.Errorf("%s file was served: %d", why, code)
		}
	}
	// The shared table links the visible row's file under the share.
	if src := publicSource(t, f.s, token); !strings.Contains(src, "/public/"+token+"/files/"+f.own) {
		t.Error("the shared table does not link the row's file")
	}
	// Unshared, nothing.
	rec := httptest.NewRecorder()
	f.s.ServeHTTP(rec, httptest.NewRequest("GET", "/public/not-a-token/files/"+f.own, nil))
	if rec.Code != 404 {
		t.Errorf("a file under no share: %d", rec.Code)
	}
}

// upload2 stores a file indexed with a row of this workspace.
func (f *formFixture) upload2(t *testing.T, display, row string) string {
	return f.filesFixture.upload(t, display, row)
}
