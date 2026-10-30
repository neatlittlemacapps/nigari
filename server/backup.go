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

	_ "modernc.org/sqlite"
)

// Version is the app/API version. Bump on any client/server contract change so
// a stale client can detect a mismatch (audit Q42).
// A release build sets it from the git tag via -ldflags
// "-X nigari/server.Version=..."; locally it stays at the default below.
// The frontend is stamped from the same string (NIGARI_VERSION → vite define),
// because two hand-kept numbers drift and the mismatch banner then fires
// forever.
//
// It is also the LAST thing to trust when asking what is running on a box: it
// is a string, and a mislabelled image proves nothing. Verify a deploy by
// behaviour — a route that answers, a marker in the bundle.
var Version = "2.0.0"

// Backup writes a consistent gzip'd tar of the workspace: the SQLite DB
// (snapshotted with VACUUM INTO so WAL contents are included) plus all uploads.
// Safe to run against a live instance (WAL allows a concurrent reader).
//
// Only the database and files/ go in, by name, never "everything in the data
// directory": the copies upgradeDB keeps beside the database
// (nigari.db.before-step-<n>, each the size of the database) and its lock file
// would otherwise multiply every archive's size for nothing (spec 008, T010).
func Backup(dataDir, dest string) error {
	dbPath := filepath.Join(dataDir, DBFile)
	if _, err := os.Stat(dbPath); err != nil {
		// A salt.md data directory nigari has not started on yet: the
		// careful admin backs it up before the first start. Read it where it
		// is, and write it into the archive under the new name. A backup
		// moves nothing (spec 011).
		if old := filepath.Join(dataDir, oldDBFile); fileExists(old) {
			dbPath = old
		} else {
			return fmt.Errorf("no database at %s", dbPath)
		}
	}
	// VACUUM INTO a temp file for a transactionally-consistent snapshot.
	snap := dest + ".db.tmp"
	os.Remove(snap)
	db, err := sql.Open("sqlite", "file:"+dbPath+"?_pragma=busy_timeout(10000)")
	if err != nil {
		return err
	}
	if _, err := db.Exec(`VACUUM INTO ?`, snap); err != nil {
		db.Close()
		return fmt.Errorf("snapshot: %w", err)
	}
	db.Close()
	defer os.Remove(snap)

	out, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer out.Close()
	gz := gzip.NewWriter(out)
	defer gz.Close()
	tw := tar.NewWriter(gz)
	defer tw.Close()

	if err := tarFile(tw, snap, DBFile); err != nil {
		return err
	}
	filesDir := filepath.Join(dataDir, "files")
	filepath.Walk(filesDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		rel, _ := filepath.Rel(dataDir, path)
		return tarFile(tw, path, filepath.ToSlash(rel))
	})
	return nil
}

func tarFile(tw *tar.Writer, path, name string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return err
	}
	hdr := &tar.Header{Name: name, Mode: 0o644, Size: info.Size()}
	if err := tw.WriteHeader(hdr); err != nil {
		return err
	}
	_, err = io.Copy(tw, f)
	return err
}

// Restore extracts a Backup archive into dataDir. Refuses to overwrite an
// existing DB unless NIGARI_RESTORE_FORCE is set, to prevent accidents.
func Restore(dataDir, src string) error {
	// salt.db counts as an existing database too: restoring nigari.db beside
	// it would leave two, and the next start refuses that (rename_conflict).
	for _, name := range []string{DBFile, oldDBFile} {
		if fileExists(filepath.Join(dataDir, name)) && Env("RESTORE_FORCE") == "" {
			return fmt.Errorf("%s/%s already exists; set NIGARI_RESTORE_FORCE=1 to overwrite", dataDir, name)
		}
	}
	// Forced over a salt.md data directory: the old database goes, or the
	// restored one would sit next to it.
	for _, side := range []string{"", "-wal", "-shm"} {
		os.Remove(filepath.Join(dataDir, oldDBFile+side))
	}
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	gz, err := gzip.NewReader(in)
	if err != nil {
		return err
	}
	defer gz.Close()
	tr := tar.NewReader(gz)
	if err := os.MkdirAll(filepath.Join(dataDir, "files"), 0o755); err != nil {
		return err
	}
	// Drop stale WAL/SHM so the restored DB isn't mixed with old journal state.
	os.Remove(filepath.Join(dataDir, DBFile+"-wal"))
	os.Remove(filepath.Join(dataDir, DBFile+"-shm"))
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
		// Guard against path traversal in a malicious archive.
		clean := filepath.Clean(hdr.Name)
		if strings.HasPrefix(clean, "..") || filepath.IsAbs(clean) {
			return fmt.Errorf("unsafe path in archive: %s", hdr.Name)
		}
		// A backup made by salt.md holds salt.db: it restores as nigari.db,
		// since an archive is data a person keeps, not a name the running
		// app answers to (spec 011, FR-009).
		if clean == oldDBFile {
			clean = DBFile
		}
		target := filepath.Join(dataDir, clean)
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		f, err := os.Create(target)
		if err != nil {
			return err
		}
		if _, err := io.Copy(f, tr); err != nil {
			f.Close()
			return err
		}
		f.Close()
	}
	return nil
}
