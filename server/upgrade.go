package server

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/pressly/goose/v3"
)

// UpgradeRefusal is a start-up the server declines, with a machine-readable
// code (upgrade_refused, upgrade_failed, upgrade_copy_failed, upgrade_busy)
// and the sentence the log and the refusal page show (contracts/refusal.md).
type UpgradeRefusal struct {
	Code     string
	Sentence string
}

func (r *UpgradeRefusal) Error() string { return r.Sentence }

// upgradeDB brings the database at path to the newest step (spec 008) and
// returns the steps it ran, oldest first: none when it was already there, and
// none either for a new file, which step 1 creates rather than upgrades. An
// empty data directory is not an upgrade, and the activity log should not say
// it was one.
//
// It runs on a pool of its own, closed before it returns, never on the writer:
// goose holds one connection for the whole run, and a step that runs outside a
// transaction (a table rebuild, plan P5) needs a second one. On the writer,
// which has exactly one (openDB), such a step would wait forever
// (TestGooseRunDBStepNeedsASecondConnection).
func upgradeDB(path string) ([]int64, error) {
	return upgradeWith(path, upgradeSteps())
}

// upgradeWith is upgradeDB with the step list as an argument, so tests can
// run steps that fail, rebuild a table or come after the real ones.
func upgradeWith(path string, steps []*goose.Migration) ([]int64, error) {
	newest := steps[len(steps)-1].Version
	// Everything before the refusal is read-only: a release that declines a
	// database must leave it exactly as it found it (FR-007, SC-004).
	tables, stored, err := inspectDB(path)
	if err != nil {
		return nil, fmt.Errorf("upgrade: %w", err)
	}
	if stored > newest {
		return nil, refuseNewer(path, stored, newest)
	}
	pending := tables > 0 && stored < newest
	if pending {
		unlock, err := takeUpgradeLock(filepath.Dir(path))
		if err != nil {
			return nil, err
		}
		defer unlock()
	}

	db, err := sql.Open("sqlite", writerDSN(path))
	if err != nil {
		return nil, err
	}
	defer db.Close()
	db.SetMaxOpenConns(2)
	if pending {
		// Read again under the lock: another process may have run the same
		// steps between the read above and the lock.
		if stored, err = storedStep(db); err != nil {
			return nil, fmt.Errorf("upgrade: %w", err)
		}
		pending = stored < newest
	}
	// A new file has nothing to lose, so no copy; an existing one gets its
	// copy before the first pending step touches it (FR-005).
	if pending {
		if err := copyBeforeUpgrade(db, path, stored+1); err != nil {
			return nil, err
		}
	}

	// The global registry is filled by goose.AddMigration in init functions;
	// nigari never uses it, and a stray registration must not become a step.
	p, err := goose.NewProvider(goose.DialectSQLite3, db, nil,
		goose.WithDisableGlobalRegistry(true), goose.WithGoMigrations(steps...))
	if err != nil {
		return nil, fmt.Errorf("upgrade: %w", err)
	}
	results, err := p.Up(context.Background())
	var partial *goose.PartialError
	if errors.As(err, &partial) {
		results = partial.Applied
	}
	var ran []int64
	for _, r := range results {
		if r.Error == nil {
			ran = append(ran, r.Source.Version)
			log.Printf("upgrade: step %d done in %s", r.Source.Version, r.Duration.Round(time.Millisecond))
		}
	}
	if partial != nil && partial.Failed != nil {
		// goose ran the step in its own transaction and rolled it back; the
		// version table still names the last step that succeeded, so the next
		// start begins with the failed step again (FR-004).
		n := partial.Failed.Source.Version
		sentence := fmt.Sprintf("Upgrade step %d failed: %v. The database is as it was before that step (at step %d).",
			n, partial.Err, n-1)
		if copied := fmt.Sprintf("%s.before-step-%d", path, stored+1); tables > 0 {
			sentence += fmt.Sprintf(" A copy from before the upgrade is at %s.", copied)
		}
		sentence += " Fix the cause and start nigari again."
		return ran, &UpgradeRefusal{Code: "upgrade_failed", Sentence: sentence}
	}
	if err != nil {
		return ran, fmt.Errorf("upgrade: %w", err)
	}
	if tables == 0 {
		ran = nil
	}

	// What release last wrote this file, for an operator reading it. Written
	// after the steps (and, once it exists, after the refusal check), so a
	// release that declines a database never stamps itself on it (FR-008).
	if _, err := db.Exec(`INSERT INTO schema_meta (key, value) VALUES ('version', ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value`, Version); err != nil {
		return ran, fmt.Errorf("upgrade: record version: %w", err)
	}
	return ran, nil
}

// NewestStep is the newest upgrade step this release knows: what "nigari
// version" prints beside the release, and what the admin's maintenance view
// compares the database's step with.
func NewestStep() int64 {
	steps := upgradeSteps()
	return steps[len(steps)-1].Version
}

// upgradeCopy is one pre-upgrade copy as the maintenance view lists it.
type upgradeCopy struct {
	Name    string `json:"name"`
	Size    int64  `json:"size"`
	TakenAt string `json:"takenAt"`
}

// upgradeState is the admin's view of upgrades (contracts/rest.md): the
// database's step, the newest this release knows, when the newest applied
// step ran (empty if none ever did), and the copies kept beside the database,
// newest first. One query and one directory listing, read when the admin
// opens maintenance, never per request.
func upgradeState(db *sql.DB, path string) map[string]any {
	step, lastAt := int64(0), ""
	if s, err := storedStep(db); err == nil && s > 0 {
		step = s
		// goose writes tstamp as SQLite's datetime('now'): UTC, no zone. The
		// driver hands back a time for the TIMESTAMP column, or the text.
		var ts any
		if db.QueryRow(`SELECT tstamp FROM goose_db_version WHERE is_applied AND version_id = ? ORDER BY id DESC LIMIT 1`, s).Scan(&ts) == nil {
			switch v := ts.(type) {
			case time.Time:
				lastAt = v.UTC().Format(time.RFC3339)
			case string:
				if t, err := time.Parse("2006-01-02 15:04:05", v); err == nil {
					lastAt = t.Format(time.RFC3339)
				}
			}
		}
	}
	copies := []upgradeCopy{}
	matches, _ := filepath.Glob(path + ".before-step-*")
	type found struct {
		c    upgradeCopy
		step int
	}
	var list []found
	for _, m := range matches {
		n, err := strconv.Atoi(strings.TrimPrefix(m, path+".before-step-"))
		fi, statErr := os.Stat(m)
		if err != nil || statErr != nil {
			continue // not ours, or gone since the listing
		}
		list = append(list, found{upgradeCopy{filepath.Base(m), fi.Size(), fi.ModTime().UTC().Format(time.RFC3339)}, n})
	}
	sort.Slice(list, func(i, j int) bool { return list[i].step > list[j].step })
	for i := 0; i < len(list) && i < keepCopies; i++ {
		copies = append(copies, list[i].c)
	}
	return map[string]any{"step": step, "newest": NewestStep(), "lastAt": lastAt, "copies": copies}
}

// stepsDetail is the activity log's detail for a start that ran steps.
func stepsDetail(ran []int64) string {
	if len(ran) == 1 {
		return fmt.Sprintf("step %d", ran[0])
	}
	return fmt.Sprintf("steps %d to %d", ran[0], ran[len(ran)-1])
}

// storedStep is the step a database is at, read with plain SQL: goose's own
// GetDBVersion and HasPending create goose_db_version when it is missing
// (TestGooseReadsCreateTheVersionTable), and the reads before a refusal must
// leave the file as it was. 0 for a database no step has run on yet.
func storedStep(db *sql.DB) (int64, error) {
	var n int
	if err := db.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'goose_db_version'`).Scan(&n); err != nil {
		return 0, err
	}
	if n == 0 {
		return 0, nil
	}
	var v int64
	err := db.QueryRow(`SELECT COALESCE(MAX(version_id), 0) FROM goose_db_version WHERE is_applied`).Scan(&v)
	return v, err
}

// keepCopies is how many pre-upgrade copies stay beside the database: enough
// to go back past a release or two, not a growing pile of full-size files.
const keepCopies = 3

// copyBeforeUpgrade writes the copy a person goes back to if step n or a later
// one turns out wrong (FR-005), then keeps the newest keepCopies. A copy that
// cannot be written stops the start before any step: an upgrade without its
// way back is the thing this feature exists to prevent.
func copyBeforeUpgrade(db *sql.DB, path string, n int64) error {
	dest := fmt.Sprintf("%s.before-step-%d", path, n)
	// VACUUM INTO refuses an existing file; one left from an earlier attempt
	// at the same step is replaced.
	os.Remove(dest)
	if _, err := db.Exec(`VACUUM INTO ?`, dest); err != nil {
		os.Remove(dest)
		var size int64
		if fi, statErr := os.Stat(path); statErr == nil {
			size = fi.Size()
		}
		return &UpgradeRefusal{Code: "upgrade_copy_failed", Sentence: fmt.Sprintf(
			"No upgrade step ran: the copy of the database (%.1f MB) could not be written to %s: %v. Free space there and start nigari again.",
			float64(size)/1e6, filepath.Dir(path), err)}
	}
	// The -wal and -shm files belong to the database as it is now; left beside
	// a restored copy, SQLite would replay the newer log onto the older file.
	log.Printf("upgrade: copy of the database before step %d written to %s. To go back to it, stop nigari and run: cp %q %q && rm -f %q %q",
		n, dest, dest, path, path+"-wal", path+"-shm")
	pruneCopies(path)
	return nil
}

// pruneCopies removes all but the newest keepCopies pre-upgrade copies of the
// database at path, newest by step number.
func pruneCopies(path string) {
	matches, _ := filepath.Glob(path + ".before-step-*")
	type copyFile struct {
		path string
		step int
	}
	var copies []copyFile
	for _, m := range matches {
		n, err := strconv.Atoi(strings.TrimPrefix(m, path+".before-step-"))
		if err != nil {
			continue // not ours
		}
		copies = append(copies, copyFile{m, n})
	}
	sort.Slice(copies, func(i, j int) bool { return copies[i].step > copies[j].step })
	for i := keepCopies; i < len(copies); i++ {
		if err := os.Remove(copies[i].path); err == nil {
			log.Printf("upgrade: removed the oldest copy %s (%d are kept)", copies[i].path, keepCopies)
		}
	}
}

// inspectDB reads, without writing anything, how many tables the database at
// path has (0 for a new or missing file) and which step it is at.
func inspectDB(path string) (tables int, step int64, err error) {
	if fi, err := os.Stat(path); err != nil || fi.Size() == 0 {
		return 0, 0, nil
	}
	// Even a read-only connection creates -wal and -shm beside a database in
	// WAL mode, and a refused start must not leave files behind. Without a
	// -wal file every change is already in the database file, so it can be
	// read as immutable, which creates nothing. With one, a process may be
	// using it right now and its log must be read; those files exist already.
	dsn := "file:" + path + "?mode=ro&_pragma=busy_timeout(5000)"
	if _, err := os.Stat(path + "-wal"); os.IsNotExist(err) {
		dsn = "file:" + path + "?immutable=1"
	}
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return 0, 0, err
	}
	defer db.Close()
	if err := db.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type = 'table'`).Scan(&tables); err != nil {
		return 0, 0, err
	}
	step, err = storedStep(db)
	return tables, step, err
}

// refuseNewer is the refusal for a database written by a newer release: this
// one would run nothing (goose sees no pending step and reports no error,
// TestGooseNewerDatabaseIsNotAnError) and then work on tables it does not
// know. It says both numbers and the two ways out (FR-007).
func refuseNewer(path string, stored, newest int64) *UpgradeRefusal {
	back := "restore a backup made before that upgrade with nigari restore <file>"
	if copies, _ := filepath.Glob(path + ".before-step-*"); len(copies) > 0 {
		best, bestStep := "", -1
		for _, c := range copies {
			if n, err := strconv.Atoi(strings.TrimPrefix(c, path+".before-step-")); err == nil && int64(n) <= newest+1 && n > bestStep {
				best, bestStep = c, n
			}
		}
		if best != "" {
			back = fmt.Sprintf("stop nigari and run cp %q %q && rm -f %q %q", best, path, path+"-wal", path+"-shm")
		}
	}
	return &UpgradeRefusal{Code: "upgrade_refused", Sentence: fmt.Sprintf(
		"This database is at upgrade step %d, but this nigari (%s) only knows steps up to %d. It has not been changed. Run the nigari release that upgraded it, or put back the copy taken before that upgrade: %s.",
		stored, Version, newest, back)}
}

// lockFile is present in the data directory only while steps run.
const lockFile = "upgrade.lock"

// staleLock is how old a lock may be before the next start takes it over: a
// process killed in the middle of a step leaves its lock behind, and a step is
// all or nothing, so the version table already says where it stopped. No step
// runs anywhere near this long.
const staleLock = 15 * time.Minute

// takeUpgradeLock makes sure only one process runs steps on a data directory
// (FR-010): the lock file is created exclusively, holding the PID and the
// time; a second process refuses with upgrade_busy. It is taken only when a
// step is pending, so an ordinary start never touches it.
func takeUpgradeLock(dir string) (unlock func(), err error) {
	path := filepath.Join(dir, lockFile)
	for attempt := 0; attempt < 2; attempt++ {
		f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
		if err == nil {
			fmt.Fprintf(f, "%d %s\n", os.Getpid(), time.Now().UTC().Format(time.RFC3339))
			f.Close()
			return func() { os.Remove(path) }, nil
		}
		if !errors.Is(err, os.ErrExist) {
			return nil, fmt.Errorf("upgrade: lock %s: %w", path, err)
		}
		fi, statErr := os.Stat(path)
		if statErr == nil && time.Since(fi.ModTime()) > staleLock && attempt == 0 {
			log.Printf("upgrade: taking over %s, left %s ago by a process that did not finish", path, time.Since(fi.ModTime()).Round(time.Second))
			os.Remove(path)
			continue
		}
		pid, since := "unknown", "an unknown time"
		if b, err := os.ReadFile(path); err == nil {
			if f := strings.Fields(string(b)); len(f) == 2 {
				pid, since = f[0], f[1]
			}
		}
		return nil, &UpgradeRefusal{Code: "upgrade_busy", Sentence: fmt.Sprintf(
			"Another nigari is upgrading this data directory (process %s, since %s). Wait for it to finish, or stop it.", pid, since)}
	}
	return nil, fmt.Errorf("upgrade: could not take %s", path)
}
