---

description: "Tasks for safe upgrades"
---

# Tasks: Safe upgrades

**Input**: `specs/008-safe-upgrades/` (plan.md, spec.md, research.md, data-model.md, contracts/)

**Tests**: required (salt.md). The refusal paths: a newer database, a failed step, a failed copy, a held lock.

**Issues**: parent #263; T001–T026 are #289–#314, in order.

**Delivery**: one pull request.

## Format: `[ID] [P?] [Story] [surface] Description`

---

## Phase 1: Setup

- [x] T001 [backend] Add `github.com/pressly/goose/v3` v3.29.0 with `go get` (go.mod/go.sum through Go tooling); confirm against v3.29.0 the API the plan names (`NewProvider`, `DialectSQLite3`, `WithGoMigrations`, `NewGoMigration`, `GoFunc{RunTx,RunDB}`, `HasPending`, `GetDBVersion`); record binary size and module count before/after with `CGO_ENABLED=0`; `scripts/licenses.mjs` for the new notices (`go mod download all` first, then revert `go.sum` if it changed beyond `go get`)
- [x] T002 [test] Write the first fixture `server/testdata/upgrade/step-0.db` with today's `main` (before any step exists): a small seeded workspace (two pages, a database with rows and a chart view, a comment, a file reference, searchable text), plus `server/testdata/upgrade/README.md` saying how each fixture is made

---

## Phase 2: Foundational (blocks every story)

- [x] T003 [backend] `server/db.go`: `ensureColumn` takes an `execer` (`*sql.DB` or `*sql.Tx`); `openDB` keeps only opening and configuring the connection; the schema work moves unchanged into `baseSchema(tx)` in new `server/upgrade_steps.go` as step 1
- [x] T004 [backend] New `server/upgrade.go`: `upgradeDB(db, dataDir)` builds the goose provider from the step list and runs `Up`; `UpgradeRefusal{Code, Sentence}`; `schema_meta.version` written after the check (FR-008); `audit` once per start that ran steps; log lines naming each step run
- [x] T005 [backend] `server/server.go` `New` and `server/import_csv.go` `FixNotionRows` open through `openDB` + `upgradeDB`, before the read pool opens
- [x] T006 [test] `server/upgrade_test.go`: `TestUpgradeFromNoStep` (a database without a step number ends at step 1 with exactly today's tables, columns and indexes, compared against `step-0.db` upgraded) and `TestUpgradeStepOneIsFrozen` (hash of `schema` and step 1's column list; message "add a new step instead")

**Checkpoint**: every existing database starts through step 1 and nothing else changes.

---

## Phase 3: User Story 1: a running instance keeps everything (P1) 🎯 MVP

- [ ] T007 [US1] [test] `TestUpgradeFixtures`: every `server/testdata/upgrade/step-*.db`, copied to a temp dir, opened with `New`, keeps pages, rows, views, comments, files and search results, and ends at the newest step
- [ ] T008 [US1] [perf] `BenchmarkStartNoPending` in `server/storage_bench_test.go`: `openDB` + `upgradeDB` on a database at the newest step, against today's `openDB` (SC-002); budget from the PR's CI run into `specs/002-storage-engine/research.md`

---

## Phase 4: User Story 2: a copy before anything changes (P1)

- [ ] T009 [US2] [backend] `copyBeforeUpgrade` (only when a step is pending, read with plain SQL as plan P3 says, not `HasPending`, which writes; `VACUUM INTO salt.db.before-step-<n>`; log line with the restore command) and `pruneCopies` (newest 3 by step); a failed copy refuses with `upgrade_copy_failed` and the database's size, before any step
- [ ] T010 [P] [US2] [backend] `server/backup.go` `Backup` leaves `salt.db.before-step-*` and `upgrade.lock` out
- [ ] T011 [US2] [test] Copy taken only when a step is pending, named after it, the fourth prunes the oldest, the copy opens; a read-only data directory refuses with `upgrade_copy_failed` and runs no step

---

## Phase 5: User Story 3: a failed step changes nothing (P1)

- [ ] T012 [US3] [backend] A failing step: its transaction rolled back, the step number left at the last success, `upgrade_failed` with the step, the reason and the copy; `rebuildTable` helper (foreign keys off around its own transaction, `PRAGMA foreign_key_check` before commit, FR-011)
- [ ] T013 [US3] [test] `TestUpgradeFailedStepChangesNothing` (an injected step that fails after a write: the file is byte-for-byte as before that step, SC-003; the next start continues from it) and a `rebuildTable` case with a broken reference

---

## Phase 6: User Story 4: an older release refuses a newer database (P1)

- [ ] T014 [US4] [backend] The check before goose: `MAX(version_id)` from `goose_db_version` against the newest step; `upgrade_refused` with both numbers, the release and the two ways out; nothing written (no `schema_meta`, no copy, no lock)
- [ ] T015 [US4] [backend] `upgradeLock` (`upgrade.lock`, exclusive create, PID and time, removed after; a second process refuses with `upgrade_busy`; older than 15 minutes is taken over)
- [ ] T016 [US4] [backend] `main.go` and new `server.RefusalHandler(r)`: the sentence in the log; every request answered 503, HTML page for pages, `{error, code}` for `/api/` and `/mcp` (contracts/refusal.md); nothing in the data directory touched
- [ ] T017 [US4] [test] `TestUpgradeRefusesNewerDatabase` (checksum unchanged, SC-004), `TestUpgradeLock`, `RefusalHandler` answers per contracts/refusal.md
- [ ] T018 [P] [US4] [test] Playwright `web/tests/upgrade-refusal.mjs`: a binary started on a newer database shows the sentence at `/` and the code at `/api/me` (in `web/tests/package.json`)
- [ ] T019 [P] [US4] [i18n] `web/src/serverErrors.ts`: `upgrade_refused`, `upgrade_failed`, `upgrade_copy_failed`, `upgrade_busy`, German and Spanish

---

## Phase 7: User Story 5: a restored backup upgrades itself (P2)

- [ ] T020 [US5] [backend] `server/backup.go` `Restore` reads the archive's step before replacing anything (salt.db extracted to a temp file first): "at step N; the next start brings it to M", or refuses "this release is too old for it"; `salt restore` prints it
- [ ] T021 [US5] [test] Backup, a later step, restore: the report names the older step and the next start upgrades; a newer archive is refused before anything is replaced; a pre-feature archive is "no step yet"

---

## Phase 8: User Story 6: the gate (P2)

- [ ] T022 [US6] [test] New `web/scripts/check-upgrades.mjs` in `npm run check`: every step N > 1 in `server/upgrade_steps.go` has `server/testdata/upgrade/step-<N-1>.db`; steps numbered 1…N without gaps; added to `web/package.json`

---

## Phase 9: User Story 7: the admin's view (P3)

- [ ] T023 [US7] [backend] `server/instance.go` `GET /api/admin/info` gains `upgrade {step, newest, lastAt, copies[]}` (contracts/rest.md); `salt version` prints the release and the newest step
- [ ] T024 [US7] [ui] `web/src/components/AdminSettings.tsx` maintenance tab: "Database upgrades" (step, newest, last upgrade, copies with size and date), light and dark; `web/src/api.ts`; German and Spanish

---

## Phase 10: Polish and cross-cutting

- [ ] T025 [P] [wiki] `wiki/self-hosting.md` (§ Updating, § Backing up, § Restoring, § Reading the startup log, new § "If salt.md refuses to start"), `wiki/administration.md` (maintenance), `docs/what-it-does.md`; screenshot `admin-maintenance` retaken
- [ ] T026 [P] [backend] `capabilities.json`: `admin.instance` summary names the upgrade view (closed, no new route)

---

## Dependencies

- T001 → T003 → T004 → T005 → everything after. T002 before T006 and T007.
- US1–US4 share `server/upgrade.go`: T009, T012, T014, T015 in that order. T016 needs T014.
- T020 needs T004. T022 needs T003. T023 needs T009. T024 needs T023.
