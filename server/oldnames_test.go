package server

import (
	"archive/zip"
	"bytes"
	"database/sql"
	"errors"
	"io/fs"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
)

// Spec 011 FR-006: an old variable on its own refuses, naming its new name;
// beside its new name it is ignored with a line. Every SALT_ counts.

func TestOldEnvRefusesAlone(t *testing.T) {
	_, err := CheckOldEnv([]string{"HOME=/root", "SALT_DATA=/srv/salt"})
	if err == nil || !strings.Contains(err.Error(), "SALT_DATA → NIGARI_DATA") || !strings.Contains(err.Error(), "Nothing was changed.") {
		t.Fatalf("want a refusal naming SALT_DATA → NIGARI_DATA, got %v", err)
	}
}

func TestOldEnvListsEveryOldName(t *testing.T) {
	_, err := CheckOldEnv([]string{"SALT_DATA=/srv/salt", "PATH=/bin", "SALT_ADDR=:80"})
	if err == nil || !strings.Contains(err.Error(), "SALT_DATA → NIGARI_DATA, SALT_ADDR → NIGARI_ADDR") {
		t.Fatalf("want both names, in the environment's order, got %v", err)
	}
}

func TestOldEnvIgnoredBesideNew(t *testing.T) {
	ignored, err := CheckOldEnv([]string{"SALT_DATA=/x", "NIGARI_DATA=/srv/nigari"})
	if err != nil {
		t.Fatalf("an old name beside its new one must not refuse: %v", err)
	}
	if len(ignored) != 1 || !strings.HasPrefix(ignored[0], "SALT_DATA is ignored: NIGARI_DATA is set.") {
		t.Fatalf("want one ignored line, got %q", ignored)
	}
}

func TestOldEnvNoneSet(t *testing.T) {
	ignored, err := CheckOldEnv([]string{"NIGARI_DATA=/srv/nigari", "HOME=/root", "BASALT_X=1"})
	if err != nil || len(ignored) != 0 {
		t.Fatalf("no old names: want nothing, got %q, %v", ignored, err)
	}
}

// Spec 011 FR-004: salt.db becomes nigari.db once, before the steps.

// The case the checkpoint exists for: committed pages that live only in
// salt.db-wal, as a crash or a kill leaves them. Renaming salt.db alone would
// leave them in a WAL nothing opens again.
func TestRenameKeepsWALContent(t *testing.T) {
	live := t.TempDir()
	db, err := sql.Open("sqlite", writerDSN(filepath.Join(live, oldDBFile)))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	for _, q := range []string{
		`PRAGMA wal_autocheckpoint=0`,
		`CREATE TABLE notes (body TEXT)`,
		`INSERT INTO notes VALUES ('only in the WAL')`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	// Copy the files while the connection still holds them: what a crash leaves.
	dir := t.TempDir()
	for _, f := range []string{oldDBFile, oldDBFile + "-wal"} {
		b, err := os.ReadFile(filepath.Join(live, f))
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, f), b, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	if fi, _ := os.Stat(filepath.Join(dir, oldDBFile+"-wal")); fi == nil || fi.Size() == 0 {
		t.Fatal("setup: the copied WAL is empty, so this test would prove nothing")
	}

	if _, err := moveOldDatabase(dir); err != nil {
		t.Fatalf("move: %v", err)
	}
	for _, gone := range []string{oldDBFile, oldDBFile + "-wal", oldDBFile + "-shm"} {
		if fileExists(filepath.Join(dir, gone)) {
			t.Errorf("%s is still there after the move", gone)
		}
	}
	moved, err := sql.Open("sqlite", writerDSN(filepath.Join(dir, DBFile)))
	if err != nil {
		t.Fatal(err)
	}
	defer moved.Close()
	var body string
	if err := moved.QueryRow(`SELECT body FROM notes`).Scan(&body); err != nil || body != "only in the WAL" {
		t.Fatalf("the row that was only in the WAL: %q, %v", body, err)
	}
}

func TestRenameConflictChangesNothing(t *testing.T) {
	dir := t.TempDir()
	want := map[string]string{oldDBFile: "old", DBFile: "new"}
	for f, body := range want {
		if err := os.WriteFile(filepath.Join(dir, f), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	_, err := moveOldDatabase(dir)
	var r *UpgradeRefusal
	if !errors.As(err, &r) || r.Code != "rename_conflict" {
		t.Fatalf("want rename_conflict, got %v", err)
	}
	entries, _ := os.ReadDir(dir)
	if len(entries) != 2 {
		t.Fatalf("the refusal changed the directory: %v", entries)
	}
	for f, body := range want {
		if b, _ := os.ReadFile(filepath.Join(dir, f)); string(b) != body {
			t.Errorf("%s changed: %q", f, b)
		}
	}
}

func TestRenameMovesCopies(t *testing.T) {
	path := copyFixture(t, "step-0.db")
	dir := filepath.Dir(path)
	if err := os.Rename(path, filepath.Join(dir, oldDBFile)); err != nil {
		t.Fatal(err)
	}
	for _, n := range []string{"1", "2"} {
		if err := os.WriteFile(filepath.Join(dir, oldDBFile+".before-step-"+n), []byte("copy"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	moved, err := moveOldDatabase(dir)
	if err != nil || moved != 3 {
		t.Fatalf("want 3 files moved, got %d, %v", moved, err)
	}
	for _, n := range []string{"1", "2"} {
		if !fileExists(filepath.Join(dir, DBFile+".before-step-"+n)) || fileExists(filepath.Join(dir, oldDBFile+".before-step-"+n)) {
			t.Errorf("copy before step %s was not moved", n)
		}
	}
	if fileExists(filepath.Join(dir, lockFile)) {
		t.Error("the lock was left behind")
	}
}

// SC-001: a data directory written by salt.md v1.6.10 starts on nigari with
// its content, and its database is nigari.db from then on.
func TestRenameFromFixture(t *testing.T) {
	path := copyFixture(t, "step-0.db")
	dir := filepath.Dir(path)
	if err := os.Rename(path, filepath.Join(dir, oldDBFile)); err != nil {
		t.Fatal(err)
	}
	s, err := New(dir, fstest.MapFS{"index.html": {Data: []byte("<html></html>")}})
	if err != nil {
		t.Fatalf("New on a salt.md data directory: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	if fileExists(filepath.Join(dir, oldDBFile)) || !fileExists(filepath.Join(dir, DBFile)) {
		t.Fatal("the database was not renamed")
	}
	var uid string
	if err := s.db.QueryRow(`SELECT id FROM users WHERE email = 'fixture@example.test'`).Scan(&uid); err != nil {
		t.Fatalf("the fixture's account: %v", err)
	}
	res, err := callTool(t, s, &user{ID: uid, Name: "Test"}, "search", `{"query":"`+upgradeFixture.SearchWord+`"}`)
	if err != nil || !strings.Contains(res, upgradeFixture.Page) {
		t.Fatalf("search after the rename: %s, %v", res, err)
	}
	var n int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM audit_log WHERE action = 'rename'`).Scan(&n); err != nil || n != 1 {
		t.Errorf("want one rename entry in the activity log, got %d (%v)", n, err)
	}
}

// Spec 011 FR-009: a workspace archive salt.md exported (salt-workspace.json,
// saltVersion) still imports; a new export writes the nigari names.
func TestImportReadsOldArchive(t *testing.T) {
	s := testServer(t)
	uid, cookie := signedIn(t, s, "owner@example.test")
	u := &user{ID: uid, Name: "Test", IsAdmin: true}
	old := fstest.MapFS{
		oldManifestFile: {Data: []byte(`{"format":1,"saltVersion":"1.6.10","workspace":{"name":"Made by salt.md"}}`)},
		"pages.json":    {Data: []byte(`[]`)},
	}
	if _, err := s.importWorkspaceFS(u, old, importOptions{}); err != nil {
		t.Fatalf("an archive with salt-workspace.json: %v", err)
	}

	var ws string
	if err := s.db.QueryRow(`SELECT id FROM workspaces WHERE name = 'Made by salt.md'`).Scan(&ws); err != nil {
		t.Fatalf("the imported workspace: %v", err)
	}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/api/workspaces/"+ws+"/export", nil)
	req.Header.Set("Cookie", cookie)
	s.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("export: %d %s", rec.Code, rec.Body.String())
	}
	if cd := rec.Header().Get("Content-Disposition"); !strings.Contains(cd, ".nigari.zip") {
		t.Errorf("export file name: %q", cd)
	}
	zr, err := zip.NewReader(bytes.NewReader(rec.Body.Bytes()), int64(rec.Body.Len()))
	if err != nil {
		t.Fatal(err)
	}
	b, err := fs.ReadFile(zr, manifestFile)
	if err != nil || !strings.Contains(string(b), `"nigariVersion"`) || strings.Contains(string(b), "saltVersion") {
		t.Fatalf("the export's manifest: %s, %v", b, err)
	}
	if _, err := fs.ReadFile(zr, oldManifestFile); err == nil {
		t.Error("the export still writes salt-workspace.json")
	}
}

// Spec 011 FR-008: salt.md's session cookie signs nobody in, and the cookies
// it left are cleared on the path each was set with, only when sent.
func TestOldCookiesAreExpired(t *testing.T) {
	s := testServer(t)
	_, cookie := signedIn(t, s, "owner@example.test")
	tok := strings.TrimPrefix(cookie, sessionCookie+"=")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/api/me", nil)
	req.Header.Set("Cookie", "salt_session="+tok+"; salt_oauth=x")
	s.ServeHTTP(rec, req)
	if !strings.Contains(rec.Body.String(), `"authenticated":false`) {
		t.Fatalf("salt_session signed somebody in: %d %s", rec.Code, rec.Body.String())
	}
	cleared := map[string]string{}
	for _, c := range rec.Result().Cookies() {
		if c.MaxAge < 0 {
			cleared[c.Name] = c.Path
		}
	}
	if cleared["salt_session"] != "/" || cleared["salt_oauth"] != "/api/oauth/" {
		t.Errorf("want salt_session on / and salt_oauth on /api/oauth/ cleared, got %v", cleared)
	}
	if _, ok := cleared["salt_mail_oauth"]; ok {
		t.Error("a cookie the request did not carry was cleared")
	}

	// The new cookie still works, and clears nothing.
	rec = httptest.NewRecorder()
	req = httptest.NewRequest("GET", "/api/me", nil)
	req.Header.Set("Cookie", cookie)
	s.ServeHTTP(rec, req)
	if !strings.Contains(rec.Body.String(), `"authenticated":true`) {
		t.Fatalf("nigari_session does not sign in: %s", rec.Body.String())
	}
	for _, c := range rec.Result().Cookies() {
		if c.MaxAge < 0 {
			t.Errorf("a request without old cookies cleared %s", c.Name)
		}
	}
}

// An old salt.md left running on the same data directory (an orphaned
// compose container, an overlapping restart) holds salt.db open while idle.
// Renaming the file under it would lose what it writes next, and a WAL
// checkpoint does not notice an idle connection. The move refuses instead,
// and goes through once the other process is gone.
func TestRenameRefusesWhileTheFileIsOpen(t *testing.T) {
	path := copyFixture(t, "step-0.db")
	dir := filepath.Dir(path)
	old := filepath.Join(dir, oldDBFile)
	if err := os.Rename(path, old); err != nil {
		t.Fatal(err)
	}
	other, err := sql.Open("sqlite", writerDSN(old))
	if err != nil {
		t.Fatal(err)
	}
	var n int
	if err := other.QueryRow(`SELECT COUNT(*) FROM pages`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	// Idle now: no transaction open, the connection simply lives.
	_, err = moveOldDatabase(dir)
	var r *UpgradeRefusal
	if !errors.As(err, &r) || r.Code != "upgrade_busy" {
		other.Close()
		t.Fatalf("with salt.db open elsewhere: want upgrade_busy, got %v", err)
	}
	if !fileExists(old) || fileExists(filepath.Join(dir, DBFile)) {
		t.Fatal("the refused move renamed the file")
	}
	other.Close()
	if moved, err := moveOldDatabase(dir); err != nil || moved != 1 {
		t.Fatalf("after the other process closed: %d, %v", moved, err)
	}
}
