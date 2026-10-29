package server

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/pressly/goose/v3"
)

// upgradeSteps is every change to what is stored, in order (spec 008). Each
// runs once per database, in its own transaction, and goose records its
// number in goose_db_version.
//
// A released step is never edited: a database that already ran it would not
// run it again, so an edit reaches new databases only and the two drift apart
// without anyone noticing. A change to the schema is a NEW step, with a
// fixture written just before it (server/testdata/upgrade/README.md).
// TestUpgradeStepOneIsFrozen holds step 1 to that.
//
// There are no down steps (FR-018): going back is restoring the copy taken
// before the step.
func upgradeSteps() []*goose.Migration {
	return []*goose.Migration{
		goose.NewGoMigration(1, &goose.GoFunc{RunTx: baseSchema}, nil),
	}
}

// baseSchema is step 1: the schema as every release before spec 008 left it,
// moved here unchanged from openDB. On a database those releases wrote it
// finds every table and column already there and changes nothing; on a new
// file it creates them. Its comments are the ones the columns were added with.
func baseSchema(ctx context.Context, tx *sql.Tx) error {
	if _, err := tx.Exec(schema); err != nil {
		return fmt.Errorf("migrate: %w", err)
	}
	if err := ensureColumn(tx, "pages", "type", `type TEXT NOT NULL DEFAULT 'doc'`); err != nil {
		return fmt.Errorf("migrate pages.type: %w", err)
	}
	if err := ensureColumn(tx, "pages", "props", `props TEXT NOT NULL DEFAULT '{}'`); err != nil {
		return fmt.Errorf("migrate pages.props: %w", err)
	}
	if err := ensureColumn(tx, "pages", "cover", `cover TEXT NOT NULL DEFAULT ''`); err != nil {
		return fmt.Errorf("migrate pages.cover: %w", err)
	}
	if err := ensureColumn(tx, "pages", "workspace_id", `workspace_id TEXT NOT NULL DEFAULT ''`); err != nil {
		return fmt.Errorf("migrate pages.workspace_id: %w", err)
	}
	if err := ensureColumn(tx, "pages", "owner_id", `owner_id TEXT NOT NULL DEFAULT ''`); err != nil {
		return fmt.Errorf("migrate pages.owner_id: %w", err)
	}
	if err := ensureColumn(tx, "pages", "visibility", `visibility TEXT NOT NULL DEFAULT 'workspace'`); err != nil {
		return fmt.Errorf("migrate pages.visibility: %w", err)
	}
	// Where a page's and a passage's entries sit in pages_fts and chunks_fts.
	// The FTS tables can only find an entry quickly by rowid: deleting by the
	// UNINDEXED id column read the whole index on every save (#75). See
	// reindexPage.
	if err := ensureColumn(tx, "pages", "fts_rowid", `fts_rowid INTEGER`); err != nil {
		return fmt.Errorf("migrate pages.fts_rowid: %w", err)
	}
	if err := ensureColumn(tx, "page_chunks", "fts_rowid", `fts_rowid INTEGER`); err != nil {
		return fmt.Errorf("migrate page_chunks.fts_rowid: %w", err)
	}
	// Search joins its hits to their passages by this column (#78). Created
	// here and not in the schema constant: the column itself only exists once
	// ensureColumn above has added it.
	if _, err := tx.Exec(`CREATE INDEX IF NOT EXISTS idx_chunk_fts_rowid ON page_chunks(fts_rowid)`); err != nil {
		return fmt.Errorf("migrate idx_chunk_fts_rowid: %w", err)
	}
	// Existing tokens predate scoping — default them to full write access so an
	// upgrade never silently downgrades a working integration.
	if err := ensureColumn(tx, "api_tokens", "scope", `scope TEXT NOT NULL DEFAULT 'write'`); err != nil {
		return fmt.Errorf("migrate api_tokens.scope: %w", err)
	}
	// Optional expiry on public share links (empty/NULL = never expires).
	if err := ensureColumn(tx, "share_links", "expires_at", `expires_at TEXT`); err != nil {
		return fmt.Errorf("migrate share_links.expires_at: %w", err)
	}
	// Pages marked as templates (instantiated via duplicate?fromTemplate=1).
	// What an agent changed, so it can be taken back. JSON, one object per
	// property: {"status":{"from":"offen","to":"erledigt"}}. Empty for every
	// action that is not a property change — the column is the difference
	// between a log that says something happened and one you can act on.
	if err := ensureColumn(tx, "audit_log", "changes", `changes TEXT NOT NULL DEFAULT ''`); err != nil {
		return fmt.Errorf("migrate audit_log.changes: %w", err)
	}
	if err := ensureColumn(tx, "pages", "is_template", `is_template INTEGER NOT NULL DEFAULT 0`); err != nil {
		return fmt.Errorf("migrate pages.is_template: %w", err)
	}
	// The database a template belongs to; empty for an ordinary page or a
	// workspace-wide template. Such a template is never a row of its database
	// (it has no parent), so nothing that lists rows can show it by accident.
	if err := ensureColumn(tx, "pages", "template_of", `template_of TEXT NOT NULL DEFAULT ''`); err != nil {
		return fmt.Errorf("migrate pages.template_of: %w", err)
	}
	// Page tags: a JSON array of short labels (Obsidian-style, workspace-scoped).
	if err := ensureColumn(tx, "pages", "tags", `tags TEXT NOT NULL DEFAULT '[]'`); err != nil {
		return fmt.Errorf("migrate pages.tags: %w", err)
	}
	// Optional Notion-style page description (shown under the title, toggleable).
	if err := ensureColumn(tx, "pages", "description", `description TEXT NOT NULL DEFAULT ''`); err != nil {
		return fmt.Errorf("migrate pages.description: %w", err)
	}
	// Workspace icon (emoji) + image (uploaded logo URL) for the workspace switcher.
	if err := ensureColumn(tx, "workspaces", "icon", `icon TEXT NOT NULL DEFAULT ''`); err != nil {
		return fmt.Errorf("migrate workspaces.icon: %w", err)
	}
	if err := ensureColumn(tx, "workspaces", "image", `image TEXT NOT NULL DEFAULT ''`); err != nil {
		return fmt.Errorf("migrate workspaces.image: %w", err)
	}
	// Workspace rules: working conventions a workspace admin writes down for
	// everyone — especially agents — working in the workspace. Every member
	// reads them; writing is admin-only and browser-only (sessionOnly), because
	// an agent that can rewrite its own guardrails has none.
	if err := ensureColumn(tx, "workspaces", "rules", `rules TEXT NOT NULL DEFAULT ''`); err != nil {
		return fmt.Errorf("migrate workspaces.rules: %w", err)
	}
	// A rules PROPOSAL: an agent (or member) may draft rules over MCP, but the
	// draft is inert — it becomes active only when a workspace admin applies it
	// in the browser. One slot per workspace; a new proposal replaces the old.
	if err := ensureColumn(tx, "workspaces", "rules_proposal", `rules_proposal TEXT NOT NULL DEFAULT ''`); err != nil {
		return fmt.Errorf("migrate workspaces.rules_proposal: %w", err)
	}
	if err := ensureColumn(tx, "workspaces", "rules_proposal_by", `rules_proposal_by TEXT NOT NULL DEFAULT ''`); err != nil {
		return fmt.Errorf("migrate workspaces.rules_proposal_by: %w", err)
	}
	if err := ensureColumn(tx, "workspaces", "rules_proposal_at", `rules_proposal_at TEXT NOT NULL DEFAULT ''`); err != nil {
		return fmt.Errorf("migrate workspaces.rules_proposal_at: %w", err)
	}
	// Optional password on public share links.
	if err := ensureColumn(tx, "share_links", "password_hash", `password_hash TEXT`); err != nil {
		return fmt.Errorf("migrate share_links.password_hash: %w", err)
	}
	// Share mode: '' / 'read' = read-only page view (default); 'form' = a public
	// form-submission link on a collection (anyone can create a row, no account).
	if err := ensureColumn(tx, "share_links", "mode", `mode TEXT NOT NULL DEFAULT ''`); err != nil {
		return fmt.Errorf("migrate share_links.mode: %w", err)
	}
	// Notes-list preview metadata, derived from content on save (notes.go).
	if err := ensureColumn(tx, "pages", "snippet", `snippet TEXT NOT NULL DEFAULT ''`); err != nil {
		return fmt.Errorf("migrate pages.snippet: %w", err)
	}
	if err := ensureColumn(tx, "pages", "thumb", `thumb TEXT NOT NULL DEFAULT ''`); err != nil {
		return fmt.Errorf("migrate pages.thumb: %w", err)
	}
	// The generation of the live document. Every write that REPLACES the body
	// from outside the editor (API, MCP, restore, import) moves it, in the same
	// statement as the content, and resets the CRDT doc. An editor's copy names
	// the generation it descends from, so the server can refuse a copy of a
	// document that has since been replaced (#79). See docgen.go.
	if err := ensureColumn(tx, "pages", "doc_gen", `doc_gen INTEGER NOT NULL DEFAULT 0`); err != nil {
		return fmt.Errorf("migrate pages.doc_gen: %w", err)
	}
	// API token workspace scope (empty = all the user's workspaces; else a
	// comma-separated allow-list of workspace ids the token may reach).
	if err := ensureColumn(tx, "api_tokens", "workspace_scope", `workspace_scope TEXT NOT NULL DEFAULT ''`); err != nil {
		return fmt.Errorf("migrate api_tokens.workspace_scope: %w", err)
	}
	// Where a token was last used from. A token that rides in a URL cannot be
	// kept secret, so the defence is noticing: "last used yesterday from an
	// address in another country" is a question somebody can actually answer.
	if err := ensureColumn(tx, "api_tokens", "last_used_ip", `last_used_ip TEXT NOT NULL DEFAULT ''`); err != nil {
		return fmt.Errorf("migrate api_tokens.last_used_ip: %w", err)
	}
	// What a workspace allows an AGENT to do — open (the default, unchanged) |
	// strict (signed-in connections only) | closed (none). Opt-in: an empty
	// value reads as open, so nothing changes for anybody who does not set it.
	if err := ensureColumn(tx, "workspaces", "agent_access", `agent_access TEXT NOT NULL DEFAULT ''`); err != nil {
		return fmt.Errorf("migrate workspaces.agent_access: %w", err)
	}
	// How the sidebar shows this workspace: split (Documents and Collections as
	// separate sections, the default) | mixed (one tree, a database sits where
	// it was filed). A documentation workspace wants the second — there the
	// databases genuinely belong under their document.
	if err := ensureColumn(tx, "workspaces", "tree_mode", `tree_mode TEXT NOT NULL DEFAULT ''`); err != nil {
		return fmt.Errorf("migrate workspaces.tree_mode: %w", err)
	}
	// TOTP two-factor auth (secret stored on setup, enforced once enabled).
	if err := ensureColumn(tx, "users", "totp_secret", `totp_secret TEXT NOT NULL DEFAULT ''`); err != nil {
		return fmt.Errorf("migrate users.totp_secret: %w", err)
	}
	if err := ensureColumn(tx, "users", "totp_enabled", `totp_enabled INTEGER NOT NULL DEFAULT 0`); err != nil {
		return fmt.Errorf("migrate users.totp_enabled: %w", err)
	}
	// W96: profile picture — an uploaded /files/ path, empty = initial+colour.
	if err := ensureColumn(tx, "users", "avatar", `avatar TEXT NOT NULL DEFAULT ''`); err != nil {
		return fmt.Errorf("migrate users.avatar: %w", err)
	}
	// W96: is this account's email confirmed? Existing accounts (created by
	// setup, invitation or OAuth) count as confirmed (DEFAULT 1). An email
	// changed BY THE ACCOUNT ITSELF sets this to 0 — and OAuth only signs in
	// over confirmed addresses, or somebody could claim a colleague's future
	// SSO identity by editing their own.
	if err := ensureColumn(tx, "users", "email_verified", `email_verified INTEGER NOT NULL DEFAULT 1`); err != nil {
		return fmt.Errorf("migrate users.email_verified: %w", err)
	}
	// W101: a workspace has an owner, not just members with roles — otherwise
	// there is no answer to "who does it fall to when the last one leaves" and
	// it can be left ownerless.
	if err := ensureColumn(tx, "workspaces", "owner_id", `owner_id TEXT NOT NULL DEFAULT ''`); err != nil {
		return fmt.Errorf("migrate workspaces.owner_id: %w", err)
	}
	// W102: an account's personal workspace — the place somebody can work
	// without anyone having to grant them access. Kept apart from owner_id,
	// because a shared workspace has an owner too.
	if err := ensureColumn(tx, "workspaces", "is_personal", `is_personal INTEGER NOT NULL DEFAULT 0`); err != nil {
		return fmt.Errorf("migrate workspaces.is_personal: %w", err)
	}
	// W102: "every new user gets this one". Until now every arrival landed
	// quietly in the OLDEST workspace — an assumption, not a decision. Now the
	// owner decides which workspaces (none, one, several) stand open to all.
	if err := ensureColumn(tx, "workspaces", "auto_join", `auto_join INTEGER NOT NULL DEFAULT 0`); err != nil {
		return fmt.Errorf("migrate workspaces.auto_join: %w", err)
	}
	// W105: deactivate an account instead of deleting it. For offboarding that
	// is the normal case — sign-in closed, sessions ended, but everything stays
	// attributable and nothing is orphaned. Deleting stays the deliberate
	// exception.
	if err := ensureColumn(tx, "users", "disabled", `disabled INTEGER NOT NULL DEFAULT 0`); err != nil {
		return fmt.Errorf("migrate users.disabled: %w", err)
	}
	// W114: outbound webhooks. Instance-wide and admin-managed: a hook is a
	// standing arrangement to call a foreign host, which is instance
	// configuration rather than content.
	if _, err := tx.Exec(`CREATE TABLE IF NOT EXISTS webhooks (
		id TEXT PRIMARY KEY,
		url TEXT NOT NULL,
		secret TEXT NOT NULL,
		events TEXT NOT NULL,
		active INTEGER NOT NULL DEFAULT 1,
		created_at TEXT NOT NULL,
		last_status TEXT,
		last_at TEXT
	)`); err != nil {
		return fmt.Errorf("create webhooks: %w", err)
	}
	// W112: language and time preferences, per account rather than per browser.
	// Empty means AUTOMATIC — follow the browser, which is what happened before
	// there was a setting and stays the default. prefs.go says why the absence
	// of a decision and the automatic mode share one representation.
	for _, c := range [][2]string{
		{"pref_language", `pref_language TEXT NOT NULL DEFAULT ''`},
		{"pref_region", `pref_region TEXT NOT NULL DEFAULT ''`},
		{"pref_timezone", `pref_timezone TEXT NOT NULL DEFAULT ''`},
		{"pref_clock", `pref_clock TEXT NOT NULL DEFAULT ''`},
		{"pref_week_start", `pref_week_start TEXT NOT NULL DEFAULT ''`},
		// "" is automatic (off); "on" opens rows in a new tab. Like every
		// other preference here, a TEXT column where "" means "never decided".
		{"pref_open_rows_new_tab", `pref_open_rows_new_tab TEXT NOT NULL DEFAULT ''`},
	} {
		if err := ensureColumn(tx, "users", c[0], c[1]); err != nil {
			return fmt.Errorf("migrate users.%s: %w", c[0], err)
		}
	}
	return nil
}

// rebuildTable changes a table in a way ALTER TABLE cannot (a column's type,
// a constraint, a dropped column with an index on it): SQLite's own recipe of
// creating the new table, copying the rows, dropping the old one and renaming
// the new (https://www.sqlite.org/lang_altertable.html, "other kinds of table
// schema changes"). A step that needs it runs as goose.GoFunc{RunDB: …} and
// calls this; every later step uses the one helper, so the recipe is written
// once.
//
// create makes "<table>_new"; copy fills it from <table>; after recreates the
// table's indexes and triggers, which the DROP took with it.
//
// Foreign keys must be off during the swap: with them on, dropping the old
// table would run its ON DELETE actions and empty the tables that refer to it.
// foreign_keys cannot change inside a transaction, so it is switched on the
// connection around one, and the references are checked with
// foreign_key_check before the commit: a row left pointing at nothing fails
// the step, and the transaction rolls the whole rebuild back (FR-011).
func rebuildTable(ctx context.Context, db *sql.DB, table, create, copy string, after ...string) error {
	conn, err := db.Conn(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()
	if _, err := conn.ExecContext(ctx, `PRAGMA foreign_keys = OFF`); err != nil {
		return err
	}
	// Back on for the connection, whatever happens: it returns to the pool.
	defer conn.ExecContext(context.WithoutCancel(ctx), `PRAGMA foreign_keys = ON`)
	tx, err := conn.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	stmts := append([]string{create, copy, `DROP TABLE ` + table, `ALTER TABLE ` + table + `_new RENAME TO ` + table}, after...)
	for _, q := range stmts {
		if _, err := tx.ExecContext(ctx, q); err != nil {
			return fmt.Errorf("rebuild %s: %w", table, err)
		}
	}
	rows, err := tx.QueryContext(ctx, `PRAGMA foreign_key_check`)
	if err != nil {
		return err
	}
	var broken []string
	for rows.Next() {
		var tbl, parent string
		var rowid sql.NullInt64
		var fkid int
		if err := rows.Scan(&tbl, &rowid, &parent, &fkid); err != nil {
			rows.Close()
			return err
		}
		broken = append(broken, fmt.Sprintf("%s row %d refers to a missing %s", tbl, rowid.Int64, parent))
	}
	rows.Close()
	if len(broken) > 0 {
		return fmt.Errorf("rebuild %s leaves %d broken reference(s): %s", table, len(broken), strings.Join(broken, "; "))
	}
	return tx.Commit()
}
