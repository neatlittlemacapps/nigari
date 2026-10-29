package server

import (
	"context"
	"database/sql"
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
	db, err := sql.Open("sqlite", writerDSN(path))
	if err != nil {
		return nil, err
	}
	defer db.Close()
	db.SetMaxOpenConns(2)
	var tables int
	if err := db.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type = 'table'`).Scan(&tables); err != nil {
		return nil, fmt.Errorf("upgrade: %w", err)
	}
	newest := steps[len(steps)-1].Version
	stored, err := storedStep(db)
	if err != nil {
		return nil, fmt.Errorf("upgrade: %w", err)
	}
	// A new file has nothing to lose, so no copy; an existing one gets its
	// copy before the first pending step touches it (FR-005).
	if tables > 0 && stored < newest {
		if err := copyBeforeUpgrade(db, path, stored+1); err != nil {
			return nil, err
		}
	}

	// The global registry is filled by goose.AddMigration in init functions;
	// salt.md never uses it, and a stray registration must not become a step.
	p, err := goose.NewProvider(goose.DialectSQLite3, db, nil,
		goose.WithDisableGlobalRegistry(true), goose.WithGoMigrations(steps...))
	if err != nil {
		return nil, fmt.Errorf("upgrade: %w", err)
	}
	results, err := p.Up(context.Background())
	var ran []int64
	for _, r := range results {
		if r.Error == nil {
			ran = append(ran, r.Source.Version)
			log.Printf("upgrade: step %d done in %s", r.Source.Version, r.Duration.Round(time.Millisecond))
		}
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
			"No upgrade step ran: the copy of the database (%.1f MB) could not be written to %s: %v. Free space there and start salt.md again.",
			float64(size)/1e6, filepath.Dir(path), err)}
	}
	// The -wal and -shm files belong to the database as it is now; left beside
	// a restored copy, SQLite would replay the newer log onto the older file.
	log.Printf("upgrade: copy of the database before step %d written to %s. To go back to it, stop salt.md and run: cp %q %q && rm -f %q %q",
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
