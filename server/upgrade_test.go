package server

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/pressly/goose/v3"
)

// copyFixture copies a fixture from server/testdata/upgrade into a temp dir:
// a test must never upgrade the committed file itself.
func copyFixture(t *testing.T, name string) string {
	t.Helper()
	src, err := os.Open(filepath.Join("testdata", "upgrade", name))
	if err != nil {
		t.Fatal(err)
	}
	defer src.Close()
	path := filepath.Join(t.TempDir(), DBFile)
	dst, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := io.Copy(dst, src); err != nil {
		t.Fatal(err)
	}
	if err := dst.Close(); err != nil {
		t.Fatal(err)
	}
	return path
}

// dbShape is what a database stores, as SQLite describes it: every table,
// index and trigger with the statement that makes it, and every column of
// every table. goose's own table is left out; it is the step counter, not
// salt.md's data.
func dbShape(t *testing.T, path string) string {
	t.Helper()
	db, err := sql.Open("sqlite", "file:"+path+"?mode=ro")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	rows, err := db.Query(`SELECT type, name, COALESCE(sql, '') FROM sqlite_master
		WHERE name <> 'goose_db_version' AND name NOT LIKE 'sqlite_%' ORDER BY type, name`)
	if err != nil {
		t.Fatal(err)
	}
	var lines, tables []string
	for rows.Next() {
		var typ, name, stmt string
		if err := rows.Scan(&typ, &name, &stmt); err != nil {
			t.Fatal(err)
		}
		// Whitespace collapsed: the search index code recreates its tables
		// with its own indentation (searchindex.go), the same table either way.
		lines = append(lines, typ+" "+name+": "+strings.Join(strings.Fields(stmt), " "))
		if typ == "table" {
			tables = append(tables, name)
		}
	}
	rows.Close()
	// ALTER TABLE ADD COLUMN rewrites the CREATE statement in sqlite_master, so
	// the columns are in the lines above already; listed again so a difference
	// reads as a column, not as a long statement.
	for _, tbl := range tables {
		cols, err := db.Query(`SELECT name, type, "notnull", COALESCE(dflt_value, '') FROM pragma_table_info(?)`, tbl)
		if err != nil {
			t.Fatal(err)
		}
		for cols.Next() {
			var name, typ, dflt string
			var notnull int
			if err := cols.Scan(&name, &typ, &notnull, &dflt); err != nil {
				t.Fatal(err)
			}
			lines = append(lines, "column "+tbl+"."+name+" "+typ+" notnull="+strconv.Itoa(notnull)+" default="+dflt)
		}
		cols.Close()
	}
	return strings.Join(lines, "\n")
}

func stepOf(t *testing.T, path string) int64 {
	t.Helper()
	db, err := sql.Open("sqlite", "file:"+path+"?mode=ro")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var v int64
	if err := db.QueryRow(`SELECT COALESCE(MAX(version_id), 0) FROM goose_db_version`).Scan(&v); err != nil {
		t.Fatal(err)
	}
	return v
}

// A database written before spec 008 has no step number. Step 1 is the schema
// those releases already applied, so it must bring such a database to step 1
// without changing anything it stores, and leave it exactly as a new database
// comes out of step 1. A difference here means step 1 is not today's schema.
func TestUpgradeFromNoStep(t *testing.T) {
	old := copyFixture(t, "step-0.db")
	before := dbShape(t, old)
	if _, err := upgradeDB(old); err != nil {
		t.Fatalf("upgrade step-0.db: %v", err)
	}
	if got := stepOf(t, old); got != 1 {
		t.Fatalf("step-0.db after the upgrade is at step %d, want 1", got)
	}
	if after := dbShape(t, old); after != before {
		t.Errorf("step 1 changed what a v1.6.10 database stores:\n%s", lineDiff(before, after))
	}

	fresh := filepath.Join(t.TempDir(), DBFile)
	if _, err := upgradeDB(fresh); err != nil {
		t.Fatalf("upgrade a new file: %v", err)
	}
	if a, b := dbShape(t, old), dbShape(t, fresh); a != b {
		t.Errorf("an upgraded v1.6.10 database and a new one differ:\n%s", lineDiff(a, b))
	}
}

// stepOneShape is the fingerprint of what step 1 creates on an empty file. It
// was recorded when step 1 was written (spec 008, T006) and never changes:
// databases that already ran step 1 will not run it again, so an edit to it
// would reach new databases only.
const stepOneShape = "25b99a931b53844377f1d7738661854fe9e6ab9a3cd97e80c3c30e9b194f133f"

func TestUpgradeStepOneIsFrozen(t *testing.T) {
	path := filepath.Join(t.TempDir(), DBFile)
	db, err := sql.Open("sqlite", writerDSN(path))
	if err != nil {
		t.Fatal(err)
	}
	p, err := goose.NewProvider(goose.DialectSQLite3, db, nil,
		goose.WithDisableGlobalRegistry(true), goose.WithGoMigrations(upgradeSteps()[0]))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := p.Up(context.Background()); err != nil {
		t.Fatal(err)
	}
	db.Close()
	sum := sha256.Sum256([]byte(dbShape(t, path)))
	if got := hex.EncodeToString(sum[:]); got != stepOneShape {
		t.Fatalf("step 1 now creates something else than when it was released (fingerprint %s, want %s). "+
			"A released step is never edited: put the change in a new step in upgrade_steps.go, with a "+
			"fixture written just before it (testdata/upgrade/README.md), and add a new step instead.",
			got, stepOneShape)
	}
}

// lineDiff lists the lines only one side has, so a failure names the table or
// column instead of printing two schemas.
func lineDiff(a, b string) string {
	in := func(s string) map[string]bool {
		m := map[string]bool{}
		for _, l := range strings.Split(s, "\n") {
			m[l] = true
		}
		return m
	}
	ma, mb := in(a), in(b)
	var out []string
	for _, l := range strings.Split(a, "\n") {
		if !mb[l] {
			out = append(out, "- "+l)
		}
	}
	for _, l := range strings.Split(b, "\n") {
		if !ma[l] {
			out = append(out, "+ "+l)
		}
	}
	return strings.Join(out, "\n")
}
