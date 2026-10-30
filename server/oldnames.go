package server

import (
	"database/sql"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// The fork was salt.md until v2.0.0 and is nigari from then on (spec 011).
// The owner chose no transition: from v2.0.0 nothing answers to an old name.
// This file is where the old names still live, because something has to meet
// them once: data under an old name is moved, and an old name that would
// otherwise be ignored without a word is refused with a sentence instead.
// check-names.mjs allows the old names here and nowhere else in the server.

const oldEnvPrefix = "SALT_"

// CheckOldEnv looks for environment variables that still carry their
// salt.md names. It runs first in main, before any variable is read.
//
// The case it exists for: a service file with SALT_DATA=/srv/salt. Ignoring
// it would start on ./data, an empty workspace, and the admin would think the
// data was gone. So a SALT_X without NIGARI_X refuses the start, naming every
// such variable and its new name. A SALT_X beside its NIGARI_X is harmless:
// the new one is used and the old one gets a line in the log.
//
// Every SALT_ prefix counts, not only the variables the server reads: one the
// installer read, or a typo, is as wrong under the old name.
func CheckOldEnv(environ []string) (ignored []string, refusal error) {
	set := map[string]bool{}
	for _, kv := range environ {
		if name, _, ok := strings.Cut(kv, "="); ok {
			set[name] = true
		}
	}
	var renames []string
	for _, kv := range environ {
		name, _, ok := strings.Cut(kv, "=")
		if !ok || !strings.HasPrefix(name, oldEnvPrefix) {
			continue
		}
		newName := "NIGARI_" + strings.TrimPrefix(name, oldEnvPrefix)
		if set[newName] {
			ignored = append(ignored, name+" is ignored: "+newName+" is set. Remove "+name+" where it is set.")
			continue
		}
		renames = append(renames, name+" → "+newName)
	}
	if len(renames) > 0 {
		return ignored, errors.New("nigari did not start: these variables still have their salt.md names: " +
			strings.Join(renames, ", ") +
			". Rename them where they are set (service file, compose file, shell) and start again. Nothing was changed.")
	}
	return ignored, nil
}

// oldDBFile is the database's name before v2.0.0.
const oldDBFile = "salt.db"

// moveOldDatabase renames a salt.md data directory's database to its nigari
// name, once, before the upgrade steps run (spec 011, FR-004, plan P2). It
// returns how many files it moved: 0 when there was nothing to move.
//
// A rename changes no byte of content, so no copy is taken first (owner: "No
// copy"). Two things could lose data, and both are ruled out before the
// rename: committed pages still in salt.db-wal, which renaming salt.db alone
// would leave behind, and another process still holding the file.
//
// With both salt.db and nigari.db present nothing is chosen for the admin:
// the start is refused and both files stay as they are.
func moveOldDatabase(dataDir string) (int, error) {
	oldPath := filepath.Join(dataDir, oldDBFile)
	newPath := filepath.Join(dataDir, DBFile)
	if !fileExists(oldPath) {
		return 0, nil
	}
	if fileExists(newPath) {
		return 0, renameConflict()
	}
	unlock, err := takeUpgradeLock(dataDir)
	if err != nil {
		return 0, err
	}
	defer unlock()
	// Again under the lock: another process may have moved it meanwhile.
	if !fileExists(oldPath) {
		return 0, nil
	}
	if fileExists(newPath) {
		return 0, renameConflict()
	}

	// Leaving WAL mode folds every committed page into salt.db and removes
	// salt.db-wal and salt.db-shm, and SQLite allows it only when no other
	// connection has the file open, idle ones included: each connection holds
	// a lock on the shared index for as long as it lives. A checkpoint alone
	// would not tell: an idle salt.md left running (an orphaned compose
	// container, an overlapping restart) blocks nothing, and renaming the file
	// under it would lose what it writes next. Its journal mode comes back to
	// WAL when the writer opens nigari.db (writerDSN).
	db, err := sql.Open("sqlite", "file:"+oldPath+"?_pragma=busy_timeout(2000)")
	if err != nil {
		return 0, fmt.Errorf("rename: open %s: %w", oldDBFile, err)
	}
	var mode string
	err = db.QueryRow(`PRAGMA journal_mode=DELETE`).Scan(&mode)
	db.Close()
	if err != nil || mode != "delete" {
		return 0, &UpgradeRefusal{Code: "upgrade_busy", Sentence: "nigari did not start: another process still has " +
			oldDBFile + " open (an old salt.md still running?), so it cannot be renamed safely. Stop it and start again. Nothing was changed."}
	}
	for _, side := range []string{"-wal", "-shm"} {
		if fileExists(oldPath + side) {
			return 0, fmt.Errorf("rename: %s%s is still there after leaving WAL mode; nothing was renamed", oldPath, side)
		}
	}
	if err := os.Rename(oldPath, newPath); err != nil {
		return 0, fmt.Errorf("rename: %s to %s: %w", oldDBFile, DBFile, err)
	}
	moved := 1
	copies, _ := filepath.Glob(oldPath + ".before-step-*")
	for _, c := range copies {
		if err := os.Rename(c, newPath+strings.TrimPrefix(c, oldPath)); err == nil {
			moved++
		}
	}
	msg := "rename: " + oldDBFile + " is now " + DBFile
	if moved > 1 {
		msg += fmt.Sprintf(" (and %d copies from earlier upgrades)", moved-1)
	}
	log.Print(msg + ". Nothing inside it changed.")
	return moved, nil
}

// renameDetail is the activity log's detail for the start that moved the
// database (kept here, not in server.go, which is not gofmt-clean).
func renameDetail(moved int) string {
	return fmt.Sprintf("%s → %s, %d file(s)", oldDBFile, DBFile, moved)
}

// manifestFile is a workspace archive's manifest; oldManifestFile is what
// salt.md called it. Archives are files people keep, so imports and the
// blueprint library read both (spec 011, FR-009).
const (
	manifestFile    = "nigari-workspace.json"
	oldManifestFile = "salt-workspace.json"
)

// readManifest returns the archive's manifest under either name, nil if it
// has none.
func readManifest(fsys fs.FS) []byte {
	for _, name := range []string{manifestFile, oldManifestFile} {
		if b, err := fs.ReadFile(fsys, name); err == nil {
			return b
		}
	}
	return nil
}

// oldCookies are salt.md's cookie names with the path each was set on; a
// cookie is only cleared on the path it was set with.
var oldCookies = []struct{ name, path string }{
	{"salt_session", "/"},
	{"salt_oauth", "/api/oauth/"},
	{"salt_mail_oauth", "/api/admin/mail-oauth/"},
}

// expireOldCookies clears the salt.md cookies a request still carries
// (spec 011, FR-008, research R5). They sign nobody in: sessions are not
// carried over, people sign in once more. Cleared, they do not ride along on
// every request until they expire on their own, months later.
func expireOldCookies(w http.ResponseWriter, r *http.Request) {
	for _, c := range oldCookies {
		if _, err := r.Cookie(c.name); err == nil {
			http.SetCookie(w, &http.Cookie{Name: c.name, Value: "", Path: c.path, MaxAge: -1, HttpOnly: true})
		}
	}
}

func renameConflict() error {
	return &UpgradeRefusal{Code: "rename_conflict", Sentence: "nigari did not start: this data directory holds both " +
		oldDBFile + " and " + DBFile + ", and it will not choose between them. Keep the one with your data, move the other out of the directory, and start again. Nothing was changed."}
}

func fileExists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}
