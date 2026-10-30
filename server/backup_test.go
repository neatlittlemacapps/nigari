package server

import (
	"archive/tar"
	"compress/gzip"
	"database/sql"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

// A backup taken while the server keeps writing must still be one consistent
// file: every page committed before the snapshot started is in it, the file
// passes an integrity check, and nothing depends on a -wal sidecar the archive
// does not carry. Nothing covered Backup before; the driver bump in spec 002
// (FR-002) needs this to show that VACUUM INTO still behaves on the new SQLite.
func TestBackupDuringWritesIsConsistentAndSelfContained(t *testing.T) {
	s := testServer(t)
	ws := newID()
	if _, err := s.db.Exec(`INSERT INTO workspaces (id, name, created_at) VALUES (?, 'Backup', ?)`, ws, now()); err != nil {
		t.Fatalf("workspace: %v", err)
	}
	insert := func(i int) error {
		_, err := s.db.Exec(`INSERT INTO pages (id, title, icon, content, props, position, created_at, updated_at,
			workspace_id, visibility, type) VALUES (?, ?, '', '[]', '{}', 0, ?, ?, ?, 'workspace', 'doc')`,
			newID(), fmt.Sprintf("Page %d", i), now(), now(), ws)
		return err
	}
	// Committed before the backup starts: these must all be in the snapshot.
	const before = 200
	for i := 0; i < before; i++ {
		if err := insert(i); err != nil {
			t.Fatalf("insert: %v", err)
		}
	}

	// Keep writing while Backup runs, through the server's own connection.
	stop := make(chan struct{})
	var wg sync.WaitGroup
	wg.Add(1)
	var writeErr error
	go func() {
		defer wg.Done()
		for i := before; ; i++ {
			select {
			case <-stop:
				return
			default:
			}
			if err := insert(i); err != nil {
				writeErr = err
				return
			}
		}
	}()
	dest := filepath.Join(t.TempDir(), "backup.tar.gz")
	err := Backup(s.dataDir, dest)
	close(stop)
	wg.Wait()
	if err != nil {
		t.Fatalf("Backup: %v", err)
	}
	if writeErr != nil {
		t.Fatalf("write during backup: %v", writeErr)
	}

	// Unpack the archive and look at what it holds.
	out := t.TempDir()
	f, err := os.Open(dest)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	gz, err := gzip.NewReader(f)
	if err != nil {
		t.Fatalf("gzip: %v", err)
	}
	tr := tar.NewReader(gz)
	var names []string
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatalf("tar: %v", err)
		}
		names = append(names, hdr.Name)
		if hdr.Name != DBFile {
			continue
		}
		db, err := os.Create(filepath.Join(out, DBFile))
		if err != nil {
			t.Fatal(err)
		}
		if _, err := io.Copy(db, tr); err != nil {
			t.Fatal(err)
		}
		db.Close()
	}
	for _, n := range names {
		if n == DBFile+"-wal" || n == DBFile+"-shm" {
			t.Fatalf("archive carries a journal sidecar %q; the snapshot must stand alone", n)
		}
	}

	snap, err := sql.Open("sqlite", "file:"+filepath.Join(out, DBFile)+"?mode=ro")
	if err != nil {
		t.Fatal(err)
	}
	defer snap.Close()
	var check string
	if err := snap.QueryRow(`PRAGMA integrity_check`).Scan(&check); err != nil || check != "ok" {
		t.Fatalf("integrity_check = %q, %v", check, err)
	}
	var n int
	if err := snap.QueryRow(`SELECT COUNT(*) FROM pages WHERE workspace_id = ?`, ws).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n < before {
		t.Fatalf("snapshot holds %d pages, want at least the %d committed before the backup", n, before)
	}
}

// A backup made by salt.md holds salt.db. Restoring it into nigari must give
// nigari.db with the same content (spec 011, FR-009), not a nigari.db the
// server would then have to rename, or ignore.
func TestRestoreReadsOldArchive(t *testing.T) {
	src, err := os.ReadFile(copyFixture(t, "step-0.db"))
	if err != nil {
		t.Fatal(err)
	}
	archive := filepath.Join(t.TempDir(), "nigari-backup.tar.gz")
	f, err := os.Create(archive)
	if err != nil {
		t.Fatal(err)
	}
	gz := gzip.NewWriter(f)
	tw := tar.NewWriter(gz)
	if err := tw.WriteHeader(&tar.Header{Name: oldDBFile, Mode: 0o644, Size: int64(len(src))}); err != nil {
		t.Fatal(err)
	}
	if _, err := tw.Write(src); err != nil {
		t.Fatal(err)
	}
	tw.Close()
	gz.Close()
	f.Close()

	dir := t.TempDir()
	if _, err := Restore(dir, archive); err != nil {
		t.Fatalf("restore: %v", err)
	}
	if fileExists(filepath.Join(dir, oldDBFile)) {
		t.Fatal("the restore wrote nigari.db")
	}
	got, err := os.ReadFile(filepath.Join(dir, DBFile))
	if err != nil || string(got) != string(src) {
		t.Fatalf("nigari.db is not the archive's database (%d of %d bytes, %v)", len(got), len(src), err)
	}
}

// Spec 011: "nigari backup" before nigari's first start, on a directory
// that still holds salt.db, backs that up (as nigari.db) and moves nothing.
func TestBackupReadsANotYetMovedDirectory(t *testing.T) {
	path := copyFixture(t, "step-0.db")
	dir := filepath.Dir(path)
	if err := os.Rename(path, filepath.Join(dir, oldDBFile)); err != nil {
		t.Fatal(err)
	}
	archive := filepath.Join(t.TempDir(), "b.tar.gz")
	if err := Backup(dir, archive); err != nil {
		t.Fatalf("backup of a salt.md directory: %v", err)
	}
	if !fileExists(filepath.Join(dir, oldDBFile)) || fileExists(filepath.Join(dir, DBFile)) {
		t.Fatal("the backup moved the database")
	}
	restored := t.TempDir()
	if _, err := Restore(restored, archive); err != nil {
		t.Fatal(err)
	}
	if !fileExists(filepath.Join(restored, DBFile)) {
		t.Fatal("the archive does not hold nigari.db")
	}
}

// Restoring beside a salt.db would leave two databases, which the next start
// refuses; so salt.db counts as an existing database for the overwrite guard.
func TestRestoreRefusesBesideSaltDB(t *testing.T) {
	src := copyFixture(t, "step-0.db")
	archive := filepath.Join(t.TempDir(), "b.tar.gz")
	if err := Backup(filepath.Dir(src), archive); err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, oldDBFile), []byte("old"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := Restore(dir, archive); err == nil || !strings.Contains(err.Error(), oldDBFile) {
		t.Fatalf("want a refusal naming salt.db, got %v", err)
	}
	if fileExists(filepath.Join(dir, DBFile)) {
		t.Fatal("the refused restore wrote nigari.db")
	}
}

// A forced restore over a salt.md directory removes salt.db only once the
// archive's database is written: a broken archive must not cost the old one.
func TestForcedRestoreKeepsSaltDBWhenTheArchiveIsBroken(t *testing.T) {
	t.Setenv("NIGARI_RESTORE_FORCE", "1")
	dir := t.TempDir()
	old := filepath.Join(dir, oldDBFile)
	if err := os.WriteFile(old, []byte("old"), 0o644); err != nil {
		t.Fatal(err)
	}
	broken := filepath.Join(t.TempDir(), "broken.tar.gz")
	if err := os.WriteFile(broken, []byte("not a gzip file"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := Restore(dir, broken); err == nil {
		t.Fatal("a broken archive restored")
	}
	if b, _ := os.ReadFile(old); string(b) != "old" {
		t.Fatal("the failed restore removed salt.db")
	}

	src := copyFixture(t, "step-0.db")
	good := filepath.Join(t.TempDir(), "good.tar.gz")
	if err := Backup(filepath.Dir(src), good); err != nil {
		t.Fatal(err)
	}
	if _, err := Restore(dir, good); err != nil {
		t.Fatal(err)
	}
	if fileExists(old) || !fileExists(filepath.Join(dir, DBFile)) {
		t.Fatal("after a good forced restore, want nigari.db alone")
	}
}

// restoreArchiveOf backs up the database at path and returns the archive.
func restoreArchiveOf(t *testing.T, path string) string {
	t.Helper()
	archive := filepath.Join(t.TempDir(), "b.tar.gz")
	if err := Backup(filepath.Dir(path), archive); err != nil {
		t.Fatal(err)
	}
	return archive
}

// Spec 008, US5: a backup made at an older step restores with a report naming
// that step and the step the next start brings it to, and the next start runs
// exactly the missing steps. Backed up at step 1, restored by a release that
// knows step 2 (testSteps adds it).
func TestRestoreReportsAnOlderStepAndTheNextStartUpgrades(t *testing.T) {
	path := copyFixture(t, "step-0.db")
	if _, err := upgradeDB(path); err != nil {
		t.Fatal(err)
	}
	archive := restoreArchiveOf(t, path)

	dir := t.TempDir()
	report, err := restoreWith(dir, archive, 2)
	if err != nil {
		t.Fatal(err)
	}
	if want := "The backup is at upgrade step 1. The next start brings it to step 2"; !strings.HasPrefix(report, want) {
		t.Fatalf("report %q, want it to start %q", report, want)
	}
	ran, err := upgradeWith(filepath.Join(dir, DBFile), testSteps(2))
	if err != nil {
		t.Fatal(err)
	}
	if len(ran) != 1 || ran[0] != 2 {
		t.Fatalf("the next start ran steps %v, want [2]", ran)
	}
	if got := copiesOf(t, filepath.Join(dir, DBFile)); len(got) != 1 {
		t.Fatalf("want one copy taken before step 2, got %v", got)
	}
}

// Spec 008, US5 scenario 2: an archive newer than the release is refused
// before anything is replaced. The data directory holds a database (forced
// restore) and must come out byte for byte as it went in.
func TestRestoreRefusesANewerArchiveBeforeReplacingAnything(t *testing.T) {
	path := copyFixture(t, "step-0.db")
	if _, err := upgradeWith(path, testSteps(2)); err != nil {
		t.Fatal(err)
	}
	archive := restoreArchiveOf(t, path)

	t.Setenv("NIGARI_RESTORE_FORCE", "1")
	dir := filepath.Dir(copyFixture(t, "step-0.db"))
	if err := os.MkdirAll(filepath.Join(dir, "files"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "files", "kept.txt"), []byte("mine"), 0o644); err != nil {
		t.Fatal(err)
	}
	before := dirState(t, dir)
	_, err := restoreWith(dir, archive, 1)
	if err == nil || !strings.Contains(err.Error(), "upgrade step 2") || !strings.Contains(err.Error(), "up to 1") {
		t.Fatalf("want a refusal naming steps 2 and 1, got %v", err)
	}
	if after := dirState(t, dir); fmt.Sprint(after) != fmt.Sprint(before) {
		t.Fatalf("the refused restore changed the data directory:\nbefore %v\nafter  %v", before, after)
	}

	// Into a directory that did not exist: refused, and nothing left behind.
	fresh := filepath.Join(t.TempDir(), "new")
	if _, err := restoreWith(fresh, archive, 1); err == nil {
		t.Fatal("a newer archive restored into a new directory")
	}
	if fileExists(fresh) {
		t.Fatal("the refused restore left a directory behind")
	}
}

// Spec 008, US5 scenario 3: an archive from before upgrade steps existed has
// no step; the report says so, and the next start brings it to the newest.
func TestRestoreOfAPreStepArchiveSaysNoStepYet(t *testing.T) {
	archive := restoreArchiveOf(t, copyFixture(t, "step-0.db"))
	dir := t.TempDir()
	report, err := Restore(dir, archive)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(report, "no step yet") {
		t.Fatalf("report %q, want it to say no step yet", report)
	}
	ran, err := upgradeDB(filepath.Join(dir, DBFile))
	if err != nil {
		t.Fatal(err)
	}
	if len(ran) != 1 || ran[0] != 1 {
		t.Fatalf("the next start ran %v, want [1]", ran)
	}
}

// A backup at the newest step needs nothing at the next start, and says so.
func TestRestoreAtTheNewestStepSaysAsItIs(t *testing.T) {
	path := copyFixture(t, "step-0.db")
	if _, err := upgradeDB(path); err != nil {
		t.Fatal(err)
	}
	report, err := Restore(t.TempDir(), restoreArchiveOf(t, path))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(report, "uses it as it is") {
		t.Fatalf("report %q", report)
	}
}
