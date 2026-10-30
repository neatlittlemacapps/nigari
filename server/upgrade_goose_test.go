package server

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/pressly/goose/v3"
)

// These tests pin the behaviour of goose v3.29.0 that spec 008 builds on
// (plan.md P1, P2). They test the library, not nigari: when a goose upgrade
// changes one of these, the upgrade runner's assumptions are wrong and must be
// revisited before the new version goes in.

func gooseTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", "file:"+filepath.Join(t.TempDir(), "goose.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func gooseTestProvider(t *testing.T, db *sql.DB, steps ...*goose.Migration) *goose.Provider {
	t.Helper()
	// The global registry is filled by goose.AddMigration in init functions;
	// nigari never uses it, and a stray registration must not become a step.
	p, err := goose.NewProvider(goose.DialectSQLite3, db, nil,
		goose.WithDisableGlobalRegistry(true), goose.WithGoMigrations(steps...))
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func gooseStep(n int64, fn func(ctx context.Context, tx *sql.Tx) error) *goose.Migration {
	return goose.NewGoMigration(n, &goose.GoFunc{RunTx: fn}, nil)
}

func gooseExec(stmt string) func(ctx context.Context, tx *sql.Tx) error {
	return func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, stmt)
		return err
	}
}

func gooseTableExists(t *testing.T, db *sql.DB, name string) bool {
	t.Helper()
	var n int
	if err := db.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?`, name).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n > 0
}

// A failing step leaves nothing of itself behind, the version stays at the
// last step that succeeded, and the next start continues from there (FR-004).
func TestGooseFailingStepRollsBack(t *testing.T) {
	ctx := context.Background()
	db := gooseTestDB(t)
	broken := errors.New("step 2 failed")
	one := gooseStep(1, gooseExec(`CREATE TABLE a (n INTEGER)`))
	failing := gooseStep(2, func(ctx context.Context, tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, `INSERT INTO a VALUES (1)`); err != nil {
			return err
		}
		return broken
	})
	if _, err := gooseTestProvider(t, db, one, failing).Up(ctx); !errors.Is(err, broken) {
		t.Fatalf("Up: want the step's error, got %v", err)
	}
	var rows int
	if err := db.QueryRow(`SELECT COUNT(*) FROM a`).Scan(&rows); err != nil {
		t.Fatal(err)
	}
	if rows != 0 {
		t.Fatalf("the failed step's insert survived: %d rows", rows)
	}
	p := gooseTestProvider(t, db, one, gooseStep(2, gooseExec(`INSERT INTO a VALUES (2)`)))
	if v, err := p.GetDBVersion(ctx); err != nil || v != 1 {
		t.Fatalf("version after the failure = %d, %v; want 1", v, err)
	}
	results, err := p.Up(ctx)
	if err != nil || len(results) != 1 || results[0].Source.Version != 2 {
		t.Fatalf("the next start should run step 2 only: %v, %v", results, err)
	}
}

// A database written by a newer release (more steps than this binary knows)
// is not an error to goose: nothing pending, Up runs nothing and succeeds.
// So the refusal (FR-007) cannot lean on goose; nigari has to compare the
// version itself, before any goose call.
func TestGooseNewerDatabaseIsNotAnError(t *testing.T) {
	ctx := context.Background()
	db := gooseTestDB(t)
	one := gooseStep(1, gooseExec(`CREATE TABLE a (n INTEGER)`))
	two := gooseStep(2, gooseExec(`CREATE TABLE b (n INTEGER)`))
	if _, err := gooseTestProvider(t, db, one, two).Up(ctx); err != nil {
		t.Fatal(err)
	}
	older := gooseTestProvider(t, db, one)
	pending, err := older.HasPending(ctx)
	if err != nil || pending {
		t.Fatalf("HasPending = %v, %v; want false, nil", pending, err)
	}
	results, err := older.Up(ctx)
	if err != nil || len(results) != 0 {
		t.Fatalf("Up on a newer database = %v, %v; want nothing run and no error", results, err)
	}
}

// Asking goose for the version, or whether anything is pending, on a database
// that has no version yet creates goose's version table: reads that write.
// NewProvider alone writes nothing. The refusal check therefore reads the
// version with plain SQL, so that a refused start leaves the file untouched
// (FR-007).
func TestGooseReadsCreateTheVersionTable(t *testing.T) {
	ctx := context.Background()
	reads := map[string]func(p *goose.Provider) error{
		"GetDBVersion": func(p *goose.Provider) error { _, err := p.GetDBVersion(ctx); return err },
		"HasPending":   func(p *goose.Provider) error { _, err := p.HasPending(ctx); return err },
	}
	for name, read := range reads {
		t.Run(name, func(t *testing.T) {
			db := gooseTestDB(t)
			p := gooseTestProvider(t, db, gooseStep(1, gooseExec(`CREATE TABLE a (n INTEGER)`)))
			if gooseTableExists(t, db, "goose_db_version") {
				t.Fatal("NewProvider created goose_db_version")
			}
			if err := read(p); err != nil {
				t.Fatal(err)
			}
			if !gooseTableExists(t, db, "goose_db_version") {
				t.Fatalf("%s no longer creates goose_db_version; the plan's P2 workaround may be unnecessary", name)
			}
		})
	}
}

// A step that must run outside a transaction (a table rebuild that turns
// foreign_keys off, plan P5) uses RunDB.
func TestGooseRunDBStepRuns(t *testing.T) {
	ctx := context.Background()
	db := gooseTestDB(t)
	step := goose.NewGoMigration(1, &goose.GoFunc{RunDB: func(ctx context.Context, db *sql.DB) error {
		_, err := db.ExecContext(ctx, `CREATE TABLE a (n INTEGER)`)
		return err
	}}, nil)
	if _, err := gooseTestProvider(t, db, step).Up(ctx); err != nil {
		t.Fatal(err)
	}
	if !gooseTableExists(t, db, "a") {
		t.Fatal("the RunDB step did not run")
	}
}

// goose holds one connection for the whole run and runs a RunDB step on the
// pool beside it. On nigari's writer (SetMaxOpenConns(1), db.go) such a step
// waits forever for a second connection. So the upgrade runs on a pool of its
// own with room for two (plan P5), never on the writer.
func TestGooseRunDBStepNeedsASecondConnection(t *testing.T) {
	db := gooseTestDB(t)
	db.SetMaxOpenConns(1)
	step := goose.NewGoMigration(1, &goose.GoFunc{RunDB: func(ctx context.Context, db *sql.DB) error {
		_, err := db.ExecContext(ctx, `CREATE TABLE a (n INTEGER)`)
		return err
	}}, nil)
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if _, err := gooseTestProvider(t, db, step).Up(ctx); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("a RunDB step on one connection: want it to wait until the deadline, got %v", err)
	}
	db.SetMaxOpenConns(2)
	if _, err := gooseTestProvider(t, db, step).Up(context.Background()); err != nil {
		t.Fatalf("with two connections: %v", err)
	}
}
