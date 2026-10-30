package server

import (
	"archive/tar"
	"compress/gzip"
	"database/sql"
	"fmt"
	"io"
	"os"
	"path/filepath"
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

// A backup made by nigari holds nigari.db. Restoring it into nigari must give
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
	if err := Restore(dir, archive); err != nil {
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
