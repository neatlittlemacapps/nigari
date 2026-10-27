---
paths:
  - "server/**/*.go"
  - "main.go"
---

# Go server

- **One writer connection** (`s.db`, `SetMaxOpenConns(1)` in `db.go`). A
  query on `s.db` run inside an open `s.db` cursor or transaction waits for a
  connection that never comes, and the whole server stops. Drain and close a
  cursor before any per-row work, including `canRead` checks.
- **A small read-only pool** (`s.rdb`, `openReadDB` in `db.go`) for long
  analytical reads only: a database's rows, rollups, grouped counts. They run
  under `withReadLimit` (`cap_limits.go`). Writes, reads inside a transaction
  and short lookups stay on `s.db`. The cursor rule applies inside the pool
  too: it has `readPoolSize` connections, not unlimited ones.
- **Schema changes** go into the `schema` constant in `db.go` as
  `CREATE TABLE/INDEX IF NOT EXISTS`, and new columns on existing tables through
  `ensureColumn`. There is no migration framework; an existing instance must
  start on the new binary without a manual step.
- **Every new query that filters or joins** gets an index, or a comment saying
  why the table stays small. Check it with `EXPLAIN QUERY PLAN`.
- **Gates, in this order:** the person's right (`canRead` / `canWrite`), then
  the credential (`credentialMayEnter(u, workspaceID)`). Administrative routes
  use `sessionOnly` — agents never reach them. Never decide access from
  `TokenScope` alone; the credential's own workspace list is the marker.
- **Errors** go out through `httpError` / `httpErrorCode`: an English sentence
  plus a machine-readable code. The browser translates the code
  (`web/src/serverErrors.ts`), so a new user-facing code needs an entry there.
- **Side effects of a write:** `audit(actorType, …)` — `"human"` or `"user"`
  for people, `"agent"` for MCP calls, so the activity log keeps them apart —
  and `fireWebhook(event, pageID)` where a page changed.
- **Content written from outside the editor** (REST content, MCP
  `write_content`, restore, import) must bump the document generation — read
  the long comment in `docgen.go` before touching that path.
- **Time** is `now()` (UTC, RFC 3339). Dates for display are the frontend's job.
- **No new dependencies** without a reason in the pull request; nothing that
  needs cgo or an external service.
- A file that is already unformatted in the last commit is not reformatted in
  a feature change (see `CLAUDE.md`).
