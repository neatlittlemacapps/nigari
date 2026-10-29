# Safe upgrades: how comparable software makes sure a new release can open old data

Research for issue #263 (epic: safe upgrades). Research only: no code changes,
no spec yet. Written 2026-10-28.

> **Decision, 2026-10-29:** the owner chose **option C** (a migration library) over the
> recommended B, and goose was taken (Go steps; golang-migrate runs SQL only). The
> reasoning is in `docs/decisions.md`. Everything below except the runner still stands:
> the backup, the refusal, the restore report, the fixtures and the check.

**The question** (owner): how does this type of software make sure that moving
to a newer release is always possible, for a running instance and for an older
backup restored into a newer release?

**Short answer.** The projects that do this well all do the same four things,
and salt.md does none of them yet:

1. **The database carries a number** saying which steps have already been
   applied to it.
2. **Steps are numbered, run in order, once each, inside a transaction**, and
   the number moves in the same transaction, so a failed step leaves the
   database exactly as it was.
3. **A binary refuses to open a database that is newer than it is**, with a
   sentence saying what to do, instead of carrying on and damaging it.
4. **CI opens databases written by earlier releases** with the new binary.

Most add a fifth: a copy of the database taken just before the steps run.

The recommendation (section 6) is to build these into salt.md by hand, in about
the size of today's `openDB`, using SQLite's own `PRAGMA user_version` as the
number, and no new dependency.

---

## 1. What salt.md does today (checked against the code at `4ee168c`)

| Claim in #263 | What the code says |
| --- | --- |
| `openDB` runs `CREATE … IF NOT EXISTS` and ~40 `ensureColumn` calls on every start | True. `server/db.go:394` `openDB` executes the `schema` constant, then **40** `ensureColumn(` call sites (counted with `grep -c`), one `CREATE TABLE IF NOT EXISTS webhooks`, one `CREATE INDEX IF NOT EXISTS`. Only additive. The steps are not in a transaction; each is idempotent, so a crash part-way is repaired by the next start. |
| Search and file indexes are versioned and rebuilt | True. `ftsVersion = "4"` (`server/searchindex.go:42`) and `filesVersion = "3"` (`server/files.go:39`) are stored in `settings`; a different value rebuilds the index. This is the only versioning pattern in the codebase today, and it is a good one for derived data. |
| `salt backup` / `salt restore` exist | True. `server/backup.go`: `Backup` snapshots with `VACUUM INTO` and tars the snapshot plus `files/`; `Restore` refuses to overwrite an existing database unless `SALT_RESTORE_FORCE` is set. Neither looks at what version the archive is. |
| No schema version | **Partly wrong, and the difference matters.** There is a `schema_meta` table (`server/db.go:286`), and every start writes `schema_meta.version = Version` (`server/db.go:627`). But (a) nothing ever reads it; (b) it is overwritten on every start, so an *older* binary started on a newer database erases the evidence that a newer one was there; (c) `make build` does not set `Version` (`Makefile:13` has `-ldflags="-s -w"` and no `-X`), so every build on the owner's Mac records `1.6.8`, the default in `server/backup.go:27`, whatever was pulled. It is a label, not a schema version. |
| No pre-upgrade backup | True. Nothing in `openDB` or `server.go` takes a copy. The wiki tells people to run `salt backup` by hand before replacing the binary (`wiki/self-hosting.md` § Updating). |
| No guard against an older binary | True. `PRAGMA user_version` is 0 on a fresh database (measured) and nothing compares anything at start. |
| No upgrade test | True. The only test that calls `openDB` directly is `server/import_zip_test.go:19`, on an empty file. No fixture database from an earlier release exists in the repository. |
| Data-reshaping changes have nowhere to live | True. The one data rewrite that exists is a hand-run command, `salt fix-notion-rows` (`main.go:60`), "run with the server stopped". |

One correction to the issue's scope: **the desktop app does not run a server.**
`desktop/README.md`: "A window onto a salt.md server you run. Not a local
instance". It never opens a data directory, so it needs nothing from this epic
beyond showing the server's refusal page if the server is refusing. (If a
bundled local server is ever added, it inherits everything below for free,
because the logic lives in `openDB`.)

### Measured on this container (4 cores, Go 1.27.2, modernc.org/sqlite v1.60.1 = SQLite 3.53.4)

| What | Result |
| --- | --- |
| `openDB` on a new, empty file | 90.6 ms |
| `openDB` again on the same file (5 runs) | 2.3–2.6 ms each |
| `ALTER TABLE pages ADD COLUMN …` on 20,000 pages | 1.2 ms |
| `VACUUM INTO` of a database with 20,000 pages of 2 KB body (83 MB file) | 178 ms |
| `ALTER TABLE … DROP COLUMN` | works in this SQLite |
| `ALTER TABLE ADD COLUMN`, `CREATE TABLE` and `PRAGMA user_version = 7` inside a transaction, then `ROLLBACK` | all three undone: column gone, table gone, `user_version` back to 0 |
| `PRAGMA user_version = 42`, then `VACUUM INTO` a copy | the copy reads 42 |

The last two rows are the facts the recommendation rests on: in SQLite, schema
changes and the version number are transactional together, and the number
travels inside every backup `salt backup` makes.

---

## 2. What SQLite itself provides and advises

- **`PRAGMA user_version`**: "an integer that is available to applications to
  use however they want. SQLite makes no use of the user-version itself." It
  lives at offset 60 of the database header, so it is part of the file, not a
  table. ([sqlite.org/pragma.html#pragma_user_version](https://www.sqlite.org/pragma.html#pragma_user_version))
- **`PRAGMA application_id`**: a 32-bit integer at offset 68 so that tools like
  `file(1)` can tell the file type. Optional; useful so `salt restore` can say
  "this is not a salt.md database" before unpacking. (same page)
- **What `ALTER TABLE` can and cannot do.** Rename a table, rename a column,
  add a column, drop a column (DROP COLUMN since 3.35.0,
  [release log](https://www.sqlite.org/releaselog/3_35_0.html)). An added column
  may not be PRIMARY KEY or UNIQUE, may not default to `CURRENT_TIMESTAMP`, and
  if NOT NULL needs a non-NULL default. DROP COLUMN fails if the column is
  indexed, in a foreign key, or used by a trigger or view.
  ([sqlite.org/lang_altertable.html](https://www.sqlite.org/lang_altertable.html))
- **Everything else is a table rebuild, the "12-step procedure"**: switch
  foreign keys off, begin, create `new_X`, copy, drop `X`, rename `new_X` to
  `X`, recreate indexes/triggers/views, run `PRAGMA foreign_key_check`, commit,
  switch foreign keys back on. SQLite warns to follow the order exactly:
  renaming the old table first "might corrupt references to that table in
  triggers, views, and foreign key constraints". (same page)
- **Foreign keys and transactions**: `PRAGMA foreign_keys` "is a no-op within
  a transaction". salt.md turns foreign keys on in the DSN
  (`server/db.go:395`), so a rebuild step must switch them off *before*
  beginning its transaction, on the same connection. salt.md's writer has one
  connection (`SetMaxOpenConns(1)`), which makes this straightforward.
  ([sqlite.org/pragma.html#pragma_foreign_keys](https://www.sqlite.org/pragma.html#pragma_foreign_keys))
- **`VACUUM INTO`** (since 3.27.0,
  [release log](https://www.sqlite.org/releaselog/3_27_0.html)): "the
  generated output database is a consistent snapshot of the original
  database", it does not take the write lock, and the target file must not
  exist. If interrupted by power loss the *copy* may be incomplete; the
  original is untouched. ([sqlite.org/lang_vacuum.html](https://www.sqlite.org/lang_vacuum.html))
  salt.md already uses it for `salt backup`.

---

## 3. How comparable software does it

| Project | Where the number lives | How steps run | Newer database, older binary | Backup before | Upgrade test |
| --- | --- | --- | --- | --- | --- |
| **Gitea / Forgejo** (Go, SQLite or server DB) | `version` table, one integer | Numbered Go functions, run on start | **Refuses to start**: "Your database (migration version: 294) is for a newer Gitea, you can not use the newer database for this old Gitea release (280). Gitea will exit to keep your database safe and unchanged. Please use the correct Gitea release, do not change the migration version manually (incorrect manual operation may lose data)." ([forum report](https://forum.gitea.com/t/gitea-1-22-to-1-21/9038)) | Left to the operator | **Yes: gzipped SQL dumps of real old releases** (`gitea-v1.5.3`, `v1.6.4`, `v1.7.0-rc3`, per database type) opened by the new binary in integration tests ([commit](https://gitea.psi.ch/gitea/gitea/commit/0081cd8dfe34bcd9182ccebb406000c17dcb8025), [dump file](https://gitea.psi.ch/gitea/gitea/src/commit/11a9ce6a2bf8fd405b7f30b4f2b53b031a7da50f/integrations/migration-test/gitea-v1.6.4.mysql.sql.gz)). Forgejo added its own `forgejo-v1.19.0` dumps after finding that the inherited ones skipped Forgejo's own steps ([commit](https://git.causa-arcana.com/forks/forgejo/commit/2c89d7f18c9493e720e0d06c4b2cd072445eff47)). |
| **Miniflux** (Go, PostgreSQL) | `schema_version` table | **135** Go functions in one slice; `schemaVersion = len(migrations)`; each in its own transaction, version written in the same transaction, rollback on error ([database.go](https://github.com/miniflux/v2/blob/main/internal/database/database.go), [migrations.go](https://github.com/miniflux/v2/blob/main/internal/database/migrations.go)) | **Not guarded**: the loop `for version := currentVersion; version < schemaVersion` simply does nothing, and `IsSchemaUpToDate` only complains about an *older* database. A counter-example worth not copying. | No | Not found in this pass |
| **PocketBase** (Go, SQLite, single binary: the closest relative) | `_migrations` table of applied file names | Go files each calling `m.Register(up, down)`; "New unapplied migrations are automatically executed when the application server starts"; callbacks get "a transactional `core.App`" ([docs](https://pocketbase.io/docs/go-migrations/)) | Not described in the docs | Not in the migration docs | Not described |
| **Home Assistant** (Python, SQLite by default) | `schema_changes` table, `SCHEMA_VERSION` constant | Numbered migrator classes; "live" migration (while running) only from schema 48 up, older databases migrate before start: "Home Assistant will not start until the upgrade is completed" ([migration.py](https://github.com/home-assistant/core/blob/dev/homeassistant/components/recorder/migration.py)) | **Refuses since 2025.1**: PR "Don't start recorder if a database from the future is used", because otherwise "the database may end up in an undefined state after downgrade" ([PR #134467](https://github.com/home-assistant/core/pull/134467)). A maintainer: "Reverting schema changes isn't supported" ([forum](https://community.home-assistant.io/t/can-i-downgrade-from-2023-4-x/557220)). | The recorder does not; the backup is a separate feature | Not checked |
| **Grafana** (Go, SQLite by default) | `migration_log` table, one row per named step | Named steps run on start if not yet logged ([forum](https://community.grafana.com/t/mysql-indexes-missing/46685)) | Not found | No | Not checked |
| **Vaultwarden** (Rust, SQLite) | Diesel's migration table | Applies missing migrations on start; skipping versions is fine ([forum](https://vaultwarden.discourse.group/t/upgrade-from-old-version/1681)) | Rollback = restore the pre-update copy ([Cloudron thread](https://forum.cloudron.io/topic/14812/vaultwarden-fails-to-start-after-update-db-migration-error-sso/11)) | Advised to the operator, not automatic | Not checked |
| **Android Room** (the most-used SQLite wrapper there is) | `PRAGMA user_version` | `Migration(from, to)` objects; a missing path throws `IllegalStateException` rather than guessing ([docs](https://developer.android.com/training/data-storage/room/migrating-db-versions)) | No path down = refuse, unless the app opts into data loss | — | **Exported schema per version kept in version control**; `MigrationTestHelper` builds the old schema, migrates, and validates; an "all migrations" test creates version 1 and migrates to the latest "to ensure that there's no discrepancy between a recently created database instance and an earlier instance that followed the defined migration paths". |

Not covered in this pass (named in #263, not researched further because the
pattern above was already consistent): Immich, Outline, Ghost (all on
PostgreSQL/MySQL with a migration library; their lessons are the same rows).

**What the table shows.**

- **Nobody supports going back.** Every project that says anything says: run
  the newer release, or restore the copy from before the upgrade. Down
  migrations exist in PocketBase and goose, but the operators' advice is still
  "restore the backup".
- **Refusing a newer database is a lesson learned late.** Home Assistant added
  it in 2025 after databases ended up "in an undefined state"; Miniflux still
  lacks it; Gitea's message is the model for wording.
- **Fixture databases from real releases is how breakage gets caught**, and
  Forgejo shows why they have to be *your* releases: inherited fixtures
  silently skipped Forgejo's own steps.
- **An integer counter (Gitea, Miniflux, Room) vs. a list of applied names
  (PocketBase, Grafana).** Names allow steps from parallel branches to land in
  any order; an integer is simpler and makes "this database is newer than me"
  a single comparison. salt.md has one main branch and one person merging, so
  ordering conflicts are rare and caught as a merge conflict on the same list.

### Patterns that keep releases from breaking existing data

- **Expand / contract.** Add the new column or shape, write both, read the new;
  remove the old one in a *later* release. Makes a single release always
  additive, and keeps the previous binary able to run on the database for one
  release. salt.md's `ensureColumn` is the "expand" half today; there is no
  "contract".
- **Forward-only.** All the projects above, in practice. Rollback is a restore.
- **Idempotent steps.** Today's `ensureColumn` is idempotent; inside a
  transaction with a version bump, idempotence becomes a safety net rather
  than the only protection.
- **JSON inside columns** (salt.md's views, property schemas and row props).
  Two options: rewrite every stored value in a numbered step, or upgrade on
  read. Upgrade-on-read leaves old shapes on disk forever, so every reader
  (Go, the frontend, agents reading raw JSON over MCP) needs to know every old
  shape. A step that rewrites once moves the cost to one place, and the upgrade
  test proves it.

---

## 4. Libraries vs. hand-written steps: measured cost

Measured by building a minimal `CGO_ENABLED=0` program that opens SQLite with
salt.md's driver (modernc.org/sqlite v1.60.1), then the same program also
importing each library. `go list -m all` counts the modules the build graph
pulls in (salt.md itself has 33 today).

| | Binary size | Modules in graph | Builds with `CGO_ENABLED=0` |
| --- | --- | --- | --- |
| Driver only | 9,661,867 B | 26 | yes |
| + pressly/goose v3.29.0 | 10,821,279 B (+1.16 MB) | 109 (+83) | yes |
| + golang-migrate v4.20.1 (sqlite + iofs) | 9,785,210 B (+0.12 MB) | 218 (+192) | yes |
| Hand-written (a slice of Go functions) | +0 | +0 | yes |

What a library would give salt.md: a transaction per step (Miniflux does this
with one loop over a slice, section 3), a version table (`user_version` is one pragma), a CLI
(salt.md has its own), down migrations (rejected, section 5). What it would
not give: a pre-upgrade backup, the refusal to open a newer database in
salt.md's wording, the fixture test, or the 12-step rebuild; those are written
by hand either way. Atlas (schema-diff based) was not measured; it works by
comparing a desired schema to the live one, which is the opposite of the
explicit, reviewable step list the rest of this document argues for.

---

## 5. Options for salt.md

Each option with what it gains, what it costs, and the effort. Effort is given
as the parts to build, not as days, because no estimate here has been measured.

### A. Keep today's additive `openDB`, add only a backup before start

- **Gains**: smallest change.
- **Costs**: none of the five gaps in #263 is closed except the backup. A
  reshaping change still has nowhere to live; an older binary still opens a
  newer database. Without a version, "pending steps" cannot be known, so the
  backup would be taken on *every* start (178 ms and a full copy of the file
  for an 83 MB database, measured).
- **Effort**: one function.
- **Rejected**: it does not answer the owner's question.

### B. Numbered Go steps, `PRAGMA user_version`, by hand (recommended)

- **Gains**: closes all five gaps; no dependency; one integer comparison
  answers both "what needs to run" and "is this database from the future";
  the number travels inside every `salt backup` archive (measured), so
  `salt restore` can say what version it is restoring and that the next start
  brings it up to date.
- **Costs**: salt.md owns the runner (the Miniflux shape: a loop, a
  transaction, a pragma). A rebuild step has to switch foreign keys off
  outside its transaction. `user_version` is invisible to anyone browsing the
  file with a table viewer; `schema_meta` can keep a human-readable copy.
- **Effort**: a runner; step 1 = today's `openDB` body (so an existing
  database, at `user_version` 0, gets exactly what it gets today); the
  refusal with its sentence; the pre-step snapshot; `salt restore` reporting
  the version; fixture databases and their test; a `check-*.mjs` that fails
  when the schema changes without a new step and fixture; wiki § Updating and
  § Restoring; a surfaces-registry row.

### C. Same, with goose or golang-migrate as the runner

- **Gains**: a known runner, down-migration support.
- **Costs**: +83 or +192 modules and up to +1.16 MB (measured, section 4) for
  the part that is easiest to write; their version tables replace
  `user_version`, so the number is no longer in the file header; the backup,
  refusal and fixtures are still hand-written.
- **Rejected**: the dependency buys the smallest part of the work.

### D. A table of applied step names (PocketBase / Grafana style)

- **Gains**: steps from parallel branches can merge in any order.
- **Costs**: "is this database newer than me" becomes "does it list a step I
  do not know", which works but is a set comparison rather than one number.
- **Rejected for now**: one integer is enough for a project with one main
  branch; a duplicate number from two branches shows up as a merge conflict
  in the step list or a failing test.

### E. Down migrations

- **Gains**: on paper, going back without a backup.
- **Costs**: every step written twice; the down path is the one nobody runs,
  so it is the one that breaks; a down step cannot bring back data a
  contracting up step removed. None of the projects above recommend it to
  their users.
- **Rejected**: going back is "restore the snapshot taken before the upgrade",
  which the automatic backup makes always possible.

### F. Litestream or another continuous replica

- **Gains**: point-in-time restore.
- **Costs**: "It runs as a separate background process" and replicates to
  object storage such as S3 ([litestream.io](https://litestream.io/how-it-works/)):
  an external process and an external service, against principle one.
- **Rejected** as part of salt.md; an operator can still run it beside it.

### G. Upgrade JSON shapes on read only

- **Rejected** as the rule (section 3): old shapes stay on disk forever and
  every reader, including agents reading over MCP, must know them all.
  Tolerant readers stay as a second line of defence, not the mechanism.

---

## 6. Recommendation

**Option B**, with these specifics, to be confirmed in `/speckit-specify`:

1. **The number is `PRAGMA user_version`**, set in the same transaction as the
   step. A database at 0 is "every database salt.md has written so far", and
   step 1 is today's additive `openDB` body, unchanged. Every existing
   instance and every existing backup upgrades through the same path.
2. **Steps are a Go slice, version = position**, each run in its own
   transaction, foreign keys switched off around the ones that rebuild a
   table, `PRAGMA foreign_key_check` before commit. Forward only.
3. **Before the first pending step, `VACUUM INTO`** a copy beside the data
   (`salt.db.before-vN`), and log the one command that restores it. Only when
   a step is pending, so ordinary restarts cost nothing extra.
4. **Refuse a newer database**, before any write, with a sentence in Gitea's
   spirit: which version the database is at, which this binary supports, and
   the two ways out (run the newer release, or restore the copy taken before
   the upgrade). Stop writing `schema_meta.version` unconditionally (today an
   older binary overwrites it); keep it as "last written by", set only after
   the version check passes.
5. **`salt restore` reads the archive's `user_version`** and says whether the
   next start will upgrade it, or that this binary is too old for it.
6. **Fixture databases**: one small database per release, written by that
   release, kept in the repository, each opened by the new binary in
   `go test`, checking pages, views, search and the version. Start with one
   built from the current `main` before step 1 exists, so the "version 0"
   case is pinned from the beginning.
7. **A check, not a promise**: a `check-*.mjs` (or Go test) that fails when
   the `schema` constant or the step list changes without a new fixture, and a
   surfaces-registry row: "a change to stored data ships its step and its
   fixture".
8. **Expand / contract as the house rule** for reshaping: a release adds; a
   later release removes, so the previous binary keeps working for one
   release, and the refusal only fires when it truly cannot.
9. **Fix the version stamp**: `make build` should set `Version` from
   `git describe`, or the logs and refusal messages will keep saying `1.6.8`
   on the owner's Mac.

Desktop: nothing to build (it does not open data); it already shows a page
when the server does not answer.

## Sources

- SQLite: [ALTER TABLE](https://www.sqlite.org/lang_altertable.html),
  [PRAGMA](https://www.sqlite.org/pragma.html),
  [VACUUM](https://www.sqlite.org/lang_vacuum.html),
  [3.27.0 release](https://www.sqlite.org/releaselog/3_27_0.html),
  [3.35.0 release](https://www.sqlite.org/releaselog/3_35_0.html)
- Gitea: [newer-database refusal, forum report](https://forum.gitea.com/t/gitea-1-22-to-1-21/9038),
  [migration test commit](https://gitea.psi.ch/gitea/gitea/commit/0081cd8dfe34bcd9182ccebb406000c17dcb8025),
  [fixture dump](https://gitea.psi.ch/gitea/gitea/src/commit/11a9ce6a2bf8fd405b7f30b4f2b53b031a7da50f/integrations/migration-test/gitea-v1.6.4.mysql.sql.gz)
- Forgejo: [run all Forgejo migrations in integration tests](https://git.causa-arcana.com/forks/forgejo/commit/2c89d7f18c9493e720e0d06c4b2cd072445eff47)
- Miniflux: [database.go](https://github.com/miniflux/v2/blob/main/internal/database/database.go),
  [migrations.go](https://github.com/miniflux/v2/blob/main/internal/database/migrations.go)
- PocketBase: [Go migrations](https://pocketbase.io/docs/go-migrations/)
- Home Assistant: [recorder migration.py](https://github.com/home-assistant/core/blob/dev/homeassistant/components/recorder/migration.py),
  [PR #134467](https://github.com/home-assistant/core/pull/134467),
  [downgrade forum thread](https://community.home-assistant.io/t/can-i-downgrade-from-2023-4-x/557220)
- Grafana: [forum, migration_log](https://community.grafana.com/t/mysql-indexes-missing/46685)
- Vaultwarden: [upgrade from old version](https://vaultwarden.discourse.group/t/upgrade-from-old-version/1681),
  [Cloudron migration-error thread](https://forum.cloudron.io/topic/14812/vaultwarden-fails-to-start-after-update-db-migration-error-sso/11)
- Android Room: [Migrate your Room database](https://developer.android.com/training/data-storage/room/migrating-db-versions)
- goose: [README](https://github.com/pressly/goose), [annotations](https://pressly.github.io/goose/documentation/annotations/)
- Litestream: [How it works](https://litestream.io/how-it-works/)
- Measurements in sections 1 and 4: run in this session against `4ee168c`;
  the throwaway programs were not committed.
