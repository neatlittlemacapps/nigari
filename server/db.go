package server

import (
	"database/sql"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
)

const schema = `
CREATE TABLE IF NOT EXISTS pages (
	id TEXT PRIMARY KEY,
	parent_id TEXT REFERENCES pages(id) ON DELETE CASCADE,
	title TEXT NOT NULL DEFAULT '',
	icon TEXT NOT NULL DEFAULT '',
	content TEXT NOT NULL DEFAULT '[]',
	position REAL NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	trashed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_pages_parent ON pages(parent_id);
-- remove_diacritics 2 folds ä→a, ü→u, ß→ss before indexing (i18n-ok: the
-- folded characters are the subject). Together with the prefix search this
-- removes a large part of German inflection on its own: the plural of
-- "Vertrag" is stored as "vertrage" and "vertrag*" reaches it.
-- Changes here need a new ftsVersion in searchindex.go.
CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
	id UNINDEXED, title, body,
	tokenize = "unicode61 remove_diacritics 2"
);
-- Passages of a page (W110): the search unit below the page. Hangs off pages
-- by cascade; chunks_fts is carried along by hand, because a virtual table
-- knows no foreign keys.
CREATE TABLE IF NOT EXISTS page_chunks (
	id TEXT PRIMARY KEY,
	page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
	workspace_id TEXT NOT NULL DEFAULT '',
	ord INTEGER NOT NULL DEFAULT 0,
	heading TEXT NOT NULL DEFAULT '',
	text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chunk_page ON page_chunks(page_id);
CREATE INDEX IF NOT EXISTS idx_chunk_ws ON page_chunks(workspace_id);
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
	chunk_id UNINDEXED, title, heading, text,
	tokenize = "unicode61 remove_diacritics 2"
);
CREATE TABLE IF NOT EXISTS settings (
	key TEXT PRIMARY KEY,
	value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
	id TEXT PRIMARY KEY,
	email TEXT NOT NULL UNIQUE,
	name TEXT NOT NULL,
	color TEXT NOT NULL DEFAULT '#2f7d4f',
	password_hash TEXT NOT NULL,
	is_admin INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
	token_hash TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	created_at TEXT NOT NULL,
	expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS api_tokens (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	name TEXT NOT NULL,
	token_hash TEXT NOT NULL UNIQUE,
	created_at TEXT NOT NULL,
	last_used_at TEXT
);
CREATE TABLE IF NOT EXISTS oauth_clients (
	id TEXT PRIMARY KEY,
	secret_hash TEXT NOT NULL DEFAULT '',
	name TEXT NOT NULL,
	redirect_uris TEXT NOT NULL DEFAULT '[]',
	created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_codes (
	code_hash TEXT PRIMARY KEY,
	client_id TEXT NOT NULL,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	redirect_uri TEXT NOT NULL,
	challenge TEXT NOT NULL,
	scope TEXT NOT NULL DEFAULT 'read',
	workspaces TEXT NOT NULL DEFAULT '',
	resource TEXT NOT NULL DEFAULT '',
	expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_grants (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	client_id TEXT NOT NULL,
	refresh_hash TEXT NOT NULL UNIQUE,
	scope TEXT NOT NULL DEFAULT 'read',
	workspaces TEXT NOT NULL DEFAULT '',
	resource TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL,
	last_used_at TEXT,
	last_used_ip TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS oauth_access (
	token_hash TEXT PRIMARY KEY,
	grant_id TEXT NOT NULL REFERENCES oauth_grants(id) ON DELETE CASCADE,
	expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS collections (
	page_id TEXT PRIMARY KEY REFERENCES pages(id) ON DELETE CASCADE,
	schema TEXT NOT NULL DEFAULT '[]',
	views TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS yjs_state (
	page_id TEXT PRIMARY KEY REFERENCES pages(id) ON DELETE CASCADE,
	snapshot BLOB,
	seq INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS yjs_updates (
	page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
	seq INTEGER NOT NULL,
	data BLOB NOT NULL,
	PRIMARY KEY (page_id, seq)
);
CREATE TABLE IF NOT EXISTS file_texts (
	file_name TEXT PRIMARY KEY,
	page_id TEXT REFERENCES pages(id) ON DELETE CASCADE,
	text TEXT NOT NULL
);
-- The file index (W125): one row per uploaded file, so that "every document
-- for this customer" is a query rather than a walk through every page's block
-- JSON. It is DERIVED and rebuildable — like the search index, and for the
-- same reason: the truth is the block on the page plus the byte on disk, and
-- an index that claims otherwise would rot. filesVersion drives the rebuild.
--
-- page_id is the carrier page (NULL once the page is gone); display_name is
-- the name a person recognises, which the stored file name deliberately is
-- not (uploads are stored under an opaque id).
CREATE TABLE IF NOT EXISTS files (
	file_name TEXT PRIMARY KEY,
	page_id TEXT REFERENCES pages(id) ON DELETE SET NULL,
	workspace_id TEXT,
	display_name TEXT NOT NULL DEFAULT '',
	ext TEXT NOT NULL DEFAULT '',
	size INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_files_page ON files(page_id);
CREATE INDEX IF NOT EXISTS idx_files_ws ON files(workspace_id);
-- Which agent says it is working on which page (W126).
--
-- Deliberately a CLAIM, not a fact: an agent names itself, because nothing in
-- the token says which one it is — a token belongs to a human. account_id is
-- the part that is verified, and both are shown together.
--
-- last_seen is refreshed by any call from that account, so an agent working
-- inside salt.md stays fresh without doing anything. It does NOT expire the
-- entry: an agent has no clock and cannot wake itself to say "still here", so
-- an entry that vanished after ten minutes would erase a three-hour job. It
-- only fades in the interface, and a sweep removes what has been silent for
-- half a day.
CREATE TABLE IF NOT EXISTS agent_presence (
	page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
	account_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	agent TEXT NOT NULL DEFAULT 'generic',
	label TEXT NOT NULL DEFAULT '',
	note TEXT NOT NULL DEFAULT '',
	started_at TEXT NOT NULL DEFAULT '',
	last_seen TEXT NOT NULL DEFAULT '',
	expected_minutes INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY (page_id, account_id, agent)
);
CREATE INDEX IF NOT EXISTS idx_presence_page ON agent_presence(page_id);
CREATE INDEX IF NOT EXISTS idx_presence_seen ON agent_presence(last_seen);
-- The raw trail (see notelog.go). Append-only by rule, not by grant: there is
-- no UPDATE and no single-row DELETE anywhere in the code, only a whole-page
-- clear a person triggers. agent is a claim, exactly like presence's; the
-- author is the verified half and both are shown together.
CREATE TABLE IF NOT EXISTS page_notes (
	id TEXT PRIMARY KEY,
	page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
	author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
	author_name TEXT NOT NULL DEFAULT '',
	agent TEXT NOT NULL DEFAULT '',
	label TEXT NOT NULL DEFAULT '',
	body TEXT NOT NULL,
	created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_page_notes_page ON page_notes(page_id, created_at);
-- Signing in to the desktop app through the real browser (desktop_auth.go).
-- One row per sign-in in flight, alive for five minutes. The code is stored
-- HASHED, like every other credential here: a dump of this table must not be a
-- set of usable sign-ins. The challenge is stored in the clear on purpose —
-- it is a digest, and its whole job is to be compared against one.
CREATE TABLE IF NOT EXISTS desktop_auth (
	challenge TEXT NOT NULL,
	code_hash TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS favorites (
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
	position REAL NOT NULL DEFAULT 0,
	PRIMARY KEY (user_id, page_id)
);
CREATE TABLE IF NOT EXISTS links (
	source_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
	target_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
	PRIMARY KEY (source_id, target_id)
);
CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_id);
CREATE TABLE IF NOT EXISTS workspaces (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS workspace_members (
	workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	role TEXT NOT NULL DEFAULT 'member',
	PRIMARY KEY (workspace_id, user_id)
);
-- The organisation is the level ABOVE the workspaces: today exactly one row
-- (this instance), so that "who owns the instance" is a query rather than an
-- assumption. org_members deliberately mirrors workspace_members — if this
-- ever becomes a hosted multi-tenant version, org_id is already the barrier
-- and the work is narrowing queries rather than a rebuild.
CREATE TABLE IF NOT EXISTS organizations (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS org_members (
	org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	role TEXT NOT NULL DEFAULT 'member', -- owner | admin | member
	PRIMARY KEY (org_id, user_id)
);
-- Emergency access ("break-glass"): an owner can deliberately, temporarily
-- and with an audit trail gain read access to a workspace they do not belong
-- to. Without this route the only way in is the quiet back door (reset a
-- password, add yourself) — which is closed for exactly that reason.
CREATE TABLE IF NOT EXISTS break_glass (
	id TEXT PRIMARY KEY,
	workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	reason TEXT NOT NULL,
	created_at TEXT NOT NULL,
	expires_at TEXT NOT NULL,
	revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_break_glass_ws ON break_glass(workspace_id);
CREATE TABLE IF NOT EXISTS share_links (
	token_hash TEXT PRIMARY KEY,
	page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
	created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tag_colors (
	workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
	tag TEXT NOT NULL,
	color TEXT NOT NULL,
	PRIMARY KEY (workspace_id, tag)
);
CREATE TABLE IF NOT EXISTS audit_log (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	created_at TEXT NOT NULL,
	actor_type TEXT NOT NULL,
	actor_id TEXT NOT NULL,
	actor_name TEXT NOT NULL,
	action TEXT NOT NULL,
	page_id TEXT,
	workspace_id TEXT,
	detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_audit_ws ON audit_log(workspace_id, id);
CREATE INDEX IF NOT EXISTS idx_audit_page ON audit_log(page_id);
CREATE TABLE IF NOT EXISTS idempotency (
	key TEXT PRIMARY KEY,
	result TEXT NOT NULL,
	created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS schema_meta (
	key TEXT PRIMARY KEY,
	value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS app_settings (
	key TEXT PRIMARY KEY,
	value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS invites (
	token_hash TEXT PRIMARY KEY,
	email TEXT NOT NULL DEFAULT '',
	role TEXT NOT NULL DEFAULT 'member',
	workspace_id TEXT NOT NULL,
	created_at TEXT NOT NULL,
	expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS page_revisions (
	id TEXT PRIMARY KEY,
	page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
	created_at TEXT NOT NULL,
	author_id TEXT NOT NULL DEFAULT '',
	author_name TEXT NOT NULL DEFAULT '',
	title TEXT NOT NULL DEFAULT '',
	content TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rev_page ON page_revisions(page_id, created_at);
CREATE TABLE IF NOT EXISTS comments (
	id TEXT PRIMARY KEY,
	page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
	block_id TEXT NOT NULL DEFAULT '',
	author_id TEXT NOT NULL DEFAULT '',
	author_name TEXT NOT NULL DEFAULT '',
	body TEXT NOT NULL,
	created_at TEXT NOT NULL,
	resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_comment_page ON comments(page_id, created_at);
`

// execer is what ensureColumn needs: *sql.DB, or the *sql.Tx an upgrade step
// runs in.
type execer interface {
	Exec(query string, args ...any) (sql.Result, error)
	Query(query string, args ...any) (*sql.Rows, error)
}

// ensureColumn adds a column to an existing table if it is missing
// (SQLite has no ADD COLUMN IF NOT EXISTS).
func ensureColumn(db execer, table, column, ddl string) error {
	rows, err := db.Query(`PRAGMA table_info(` + table + `)`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var cid int
		var name, ctype string
		var notnull, pk int
		var dflt any
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dflt, &pk); err != nil {
			return err
		}
		if name == column {
			return nil
		}
	}
	_, err = db.Exec(`ALTER TABLE ` + table + ` ADD COLUMN ` + ddl)
	return err
}

// readPoolSize is how many analytical reads may run at once beside the
// writer. Small on purpose: each holds a SQLite connection and its page cache,
// and the reads it serves are bounded by readLimit anyway.
const readPoolSize = 4

// openReadDB opens the read-only pool for long analytical reads: a database's
// rows, rollups, grouped counts (#82) and search (#78).
//
// Why a second pool, after years of one connection: every read and write
// shared that connection, so a long read made every write wait. Measured in
// spec 002 (research P5), five agents' writes waited ~2.7 s at p95 behind
// back-to-back 100k-row reads, against an 8 ms budget; on a read-only
// connection beside the writer they took ~4 ms. WAL is what makes that safe:
// a reader works from a snapshot, and reader and writer never block each
// other.
//
// What stays on db, the writer:
//   - every write, and every read inside a transaction;
//   - short lookups (permissions, a page by id), so the rules about them do
//     not split in two;
//   - anything that must see a write the same request made before committing.
//
// A read here sees every committed write, so a client that saves and then
// reloads its rows sees its save. mode=ro makes a stray write fail instead of
// taking a second writer's lock; query_only makes that explicit per
// connection.
//
// The cursor rule still applies inside this pool: a query here while holding
// another of its cursors can exhaust readPoolSize under load. Drain first, as
// on the writer.
func openReadDB(path string) (*sql.DB, error) {
	dsn := fmt.Sprintf("file:%s?mode=ro&_pragma=busy_timeout(5000)&_pragma=query_only(1)", path)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(readPoolSize)
	// Fail at startup, not at the first chart.
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("open read pool: %w", err)
	}
	return db, nil
}

// writerDSN is how the writer and the upgrade open the file: WAL, foreign keys
// on, the same busy timeout.
func writerDSN(path string) string {
	return fmt.Sprintf("file:%s?_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)&_pragma=synchronous(NORMAL)", path)
}

// openDB opens the writer and configures it; it changes nothing in the file.
// The schema is upgradeDB's (upgrade.go), which must have run on the file
// first.
func openDB(path string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", writerDSN(path))
	if err != nil {
		return nil, err
	}
	// Single connection: one writer keeps SQLite trivially consistent and is
	// more than fast enough for a personal/team workspace.
	db.SetMaxOpenConns(1)
	return db, nil
}

func now() string { return time.Now().UTC().Format(time.RFC3339Nano) }

const welcomeContent = `[
 {"type":"paragraph","content":[{"type":"text","text":"Welcome to ","styles":{}},{"type":"text","text":"salt.md","styles":{"bold":true}},{"type":"text","text":": a fast, lightweight, open-source workspace for your notes, docs and ideas. 🧂","styles":{}}]},
 {"type":"heading","props":{"level":2},"content":[{"type":"text","text":"Everything is a block","styles":{}}]},
 {"type":"paragraph","content":[{"type":"text","text":"Type ","styles":{}},{"type":"text","text":"/","styles":{"code":true}},{"type":"text","text":" anywhere to insert headings, lists, quotes, code blocks, images, tables and more. Drag blocks by their handle to rearrange them.","styles":{}}]},
 {"type":"checkListItem","props":{"checked":true},"content":[{"type":"text","text":"Install salt.md","styles":{}}]},
 {"type":"checkListItem","props":{"checked":false},"content":[{"type":"text","text":"Create your first page (button in the sidebar)","styles":{}}]},
 {"type":"checkListItem","props":{"checked":false},"content":[{"type":"text","text":"Press Ctrl/Cmd + K to search everything","styles":{}}]},
 {"type":"heading","props":{"level":2},"content":[{"type":"text","text":"Your data stays yours","styles":{}}]},
 {"type":"bulletListItem","content":[{"type":"text","text":"Single binary, single SQLite file: trivial to back up","styles":{}}]},
 {"type":"bulletListItem","content":[{"type":"text","text":"Export any page, or your whole workspace, as Markdown","styles":{}}]},
 {"type":"bulletListItem","content":[{"type":"text","text":"Clean REST API: build your own clients on top","styles":{}}]}
]`

func (s *Server) seed() error {
	// A persistent marker (not the page count) decides whether to seed, so
	// a user who deletes everything doesn't get the welcome page back on restart.
	var seeded string
	err := s.db.QueryRow(`SELECT value FROM settings WHERE key = 'seeded'`).Scan(&seeded)
	if err == nil {
		return nil
	}
	if err != sql.ErrNoRows {
		return err
	}
	if _, err := s.db.Exec(`INSERT INTO settings (key, value) VALUES ('seeded', '1')`); err != nil {
		return err
	}
	var count int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM pages`).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	ts := now()
	id := newID()
	_, err = s.db.Exec(
		`INSERT INTO pages (id, parent_id, title, icon, content, position, created_at, updated_at) VALUES (?, NULL, ?, ?, ?, 1, ?, ?)`,
		id, "Welcome to salt.md", "🧂", welcomeContent, ts, ts,
	)
	if err != nil {
		return err
	}
	return s.reindexPage(id)
}
