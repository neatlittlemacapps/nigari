package server

import (
	"context"
	"database/sql"
	"fmt"
	"log"
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

	// The global registry is filled by goose.AddMigration in init functions;
	// salt.md never uses it, and a stray registration must not become a step.
	p, err := goose.NewProvider(goose.DialectSQLite3, db, nil,
		goose.WithDisableGlobalRegistry(true), goose.WithGoMigrations(upgradeSteps()...))
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
