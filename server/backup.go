package server

import (
	"archive/tar"
	"compress/gzip"
	"database/sql"
	"errors"
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
//
// It returns the report "nigari restore" prints: which upgrade step the
// archive's database is at and what the next start does with it (spec 008,
// FR-009). An archive newer than this release is refused before anything in
// dataDir is replaced: restoring it would only produce a data directory the
// next start refuses (upgrade_refused), with the database that was there gone.
func Restore(dataDir, src string) (string, error) {
	return restoreWith(dataDir, src, NewestStep())
}

// restoreWith is Restore with the newest step as an argument, so tests can
// restore an archive as a later or an earlier release would.
func restoreWith(dataDir, src string, newest int64) (string, error) {
	// salt.db counts as an existing database too: restoring nigari.db beside
	// it would leave two, and the next start refuses that (rename_conflict).
	for _, name := range []string{DBFile, oldDBFile} {
		if fileExists(filepath.Join(dataDir, name)) && Env("RESTORE_FORCE") == "" {
			return "", fmt.Errorf("%s/%s already exists; set NIGARI_RESTORE_FORCE=1 to overwrite", dataDir, name)
		}
	}
	created := !fileExists(dataDir)
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return "", err
	}
	// First pass: the database alone, into a temporary file beside its final
	// place (so the rename below stays on one file system), to read its step
	// before anything is replaced.
	snap, err := extractDB(dataDir, src)
	if snap != "" {
		defer os.Remove(snap)
	}
	if err != nil {
		if created {
			os.Remove(dataDir) // only if still empty
		}
		return "", err
	}
	report := "The backup holds no database; only its files were restored."
	if snap != "" {
		tables, step, err := inspectDB(snap)
		if err != nil {
			os.Remove(snap)
			if created {
				os.Remove(dataDir)
			}
			return "", fmt.Errorf("read the backup's database: %w", err)
		}
		if step > newest {
			os.Remove(snap)
			if created {
				os.Remove(dataDir)
			}
			return "", fmt.Errorf("this backup is at upgrade step %d, but this nigari (%s) only knows steps up to %d. Nothing was restored. Restore it with the nigari release that made it, or a newer one", step, Version, newest)
		}
		report = restoreReport(tables, step, newest)
	}

	// Second pass: everything else. Only now is anything in dataDir replaced.
	if err := extractFiles(dataDir, src); err != nil {
		return "", err
	}
	if snap != "" {
		// Drop stale WAL/SHM so the restored DB isn't mixed with old journal state.
		os.Remove(filepath.Join(dataDir, DBFile+"-wal"))
		os.Remove(filepath.Join(dataDir, DBFile+"-shm"))
		if err := os.Rename(snap, filepath.Join(dataDir, DBFile)); err != nil {
			return "", err
		}
		// Forced over a salt.md data directory: the old database goes now that
		// the archive's is safely written, or the two would sit side by side.
		// Not before: a missing or broken archive must not cost the old one.
		for _, side := range []string{"", "-wal", "-shm"} {
			os.Remove(filepath.Join(dataDir, oldDBFile+side))
		}
		// Copies taken before upgrades of the database just replaced are not
		// copies of this one. Left behind, the next start would prune the copy
		// it takes for this database as "older" than theirs (they are by step
		// number), and the maintenance view would list them as this
		// database's. The restore was forced over that database; its copies go
		// with it, and the report says so.
		if old := listCopies(filepath.Join(dataDir, DBFile)); len(old) > 0 {
			for _, c := range old {
				os.Remove(c.path)
			}
			if len(old) == 1 {
				report += " Removed the copy taken before an upgrade of the database it replaced."
			} else {
				report += fmt.Sprintf(" Removed %d copies taken before upgrades of the database it replaced.", len(old))
			}
		}
	}
	return report, nil
}

// restoreReport says what the next start does with a restored database at
// step, for a release whose newest step is newest. The copy is named because
// the next start takes one before the first pending step (copyBeforeUpgrade).
func restoreReport(tables int, step, newest int64) string {
	switch {
	case tables == 0:
		return "The backup's database is empty; the next start sets it up."
	case step == newest:
		return fmt.Sprintf("The backup is at upgrade step %d, the newest this release knows. The next start uses it as it is.", step)
	case step == 0:
		return fmt.Sprintf("The backup was made before upgrade steps existed (no step yet). The next start brings it to step %d, after taking a copy of it.", newest)
	default:
		return fmt.Sprintf("The backup is at upgrade step %d. The next start brings it to step %d, after taking a copy of it.", step, newest)
	}
}

// archiveName is an archive entry's path inside dataDir, refused when it
// would land outside it, with salt.db read as nigari.db: a backup made by
// salt.md holds salt.db, and it restores as nigari.db, since an archive is
// data a person keeps, not a name the running app answers to (spec 011,
// FR-009).
func archiveName(name string) (string, error) {
	// Guard against path traversal in a malicious archive.
	clean := filepath.Clean(name)
	if strings.HasPrefix(clean, "..") || filepath.IsAbs(clean) {
		return "", fmt.Errorf("unsafe path in archive: %s", name)
	}
	if clean == oldDBFile {
		clean = DBFile
	}
	return clean, nil
}

// eachEntry calls fn for every entry of the gzip'd tar at src.
func eachEntry(src string, fn func(name string, r io.Reader) error) error {
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
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
		name, err := archiveName(hdr.Name)
		if err != nil {
			return err
		}
		if err := fn(name, tr); err != nil {
			return err
		}
	}
}

// errFoundDB stops the first pass once the database is out: Backup writes it
// as the first entry, and reading the uploads behind it twice would double a
// restore's time for nothing.
var errFoundDB = errors.New("database found")

// extractDB writes the archive's database to a temporary file in dataDir and
// returns its path, or "" when the archive holds none.
func extractDB(dataDir, src string) (string, error) {
	snap := ""
	err := eachEntry(src, func(name string, r io.Reader) error {
		if name != DBFile {
			return nil // tar skips the rest of the entry itself
		}
		f, err := os.CreateTemp(dataDir, ".restore-*.db")
		if err != nil {
			return err
		}
		snap = f.Name()
		_, err = io.Copy(f, r)
		// CreateTemp makes the file 0600; the database the restore replaces was
		// 0644, as os.Create makes it, and a reader in the same group (a backup
		// job, a second user) must keep reading it.
		if err == nil {
			err = f.Chmod(0o644)
		}
		if cerr := f.Close(); err == nil {
			err = cerr
		}
		if err == nil {
			err = errFoundDB
		}
		return err
	})
	if errors.Is(err, errFoundDB) {
		err = nil
	}
	return snap, err
}

// extractFiles writes every entry but the database into dataDir.
func extractFiles(dataDir, src string) error {
	if err := os.MkdirAll(filepath.Join(dataDir, "files"), 0o755); err != nil {
		return err
	}
	return eachEntry(src, func(name string, r io.Reader) error {
		if name == DBFile {
			return nil
		}
		target := filepath.Join(dataDir, name)
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		f, err := os.Create(target)
		if err != nil {
			return err
		}
		_, err = io.Copy(f, r)
		if cerr := f.Close(); err == nil {
			err = cerr
		}
		return err
	})
}
