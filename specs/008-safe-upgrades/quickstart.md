# Quickstart: checking safe upgrades by hand

1. Build `main` before this feature, start it on a fresh data directory, add a page and a
   database, stop it. (That is what `step-0.db` holds.)
2. Build this feature and start it on the same directory. The log says step 1 ran and
   names `salt.db.before-step-1`; the page and the database are there.
3. Start it again: no step runs, no new copy.
4. Set the step number higher than the binary knows
   (`sqlite3 salt.db "INSERT INTO goose_db_version (version_id, is_applied) VALUES (99, 1)"`),
   start: the log and `http://localhost:8420` show the `upgrade_refused` sentence; the
   file's checksum is unchanged.
5. `salt backup` → `salt restore` into an empty directory: the restore says the archive's
   step and that the next start upgrades it (or that this release is too old).
6. Admin → Settings → Maintenance: step, newest, last upgrade, copies.
