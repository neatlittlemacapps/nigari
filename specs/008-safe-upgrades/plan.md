# Implementation Plan: Safe upgrades

**Branch**: `claude/handoff-continuation-4byisr` | **Date**: 2026-10-29 | **Spec**: [spec.md](spec.md) | **Issue**: #263

**Input**: Feature specification from `/specs/008-safe-upgrades/spec.md`

## Summary

Start-up stops running a loose list of additive schema calls and runs **numbered upgrade
steps** instead, on **goose v3** (owner's choice, `docs/decisions.md` 2026-10-29). Step 1 is
today's `openDB` schema work, unchanged, so every existing database (no step number) takes
the same path. Around the runner, salt.md adds what goose does not provide:

- a refusal when the database is newer than the binary, before anything is written;
- a copy (`VACUUM INTO`) before the first pending step, the newest 3 kept;
- a refusal page served on the usual address when start-up is refused (FR-019);
- `salt restore` reporting the archive's step;
- fixture databases with an upgrade test, and a frozen step 1;
- the admin's view of all this.

Release naming (FR-015) is delivered with #265, which the owner put first.

## Technical Context

**Language/Version**: Go 1.27 (server, one package `server/`), TypeScript 5.6 + React 18 (`web/src/`)

**Primary Dependencies**: Go standard library + pure-Go SQLite; Mantine, BlockNote, Yjs in the frontend. New dependencies: **github.com/pressly/goose/v3** (v3.29.0; measured in the repo in T001: +79 modules in `go list -m all` (33 → 112), of which 5 are linked into the binary (goose, interpolate, go-retry, multierr, x/sync); +354,230 B once imported (33,914,395 → 34,268,625 B, `CGO_ENABLED=0`); its minimum versions raise x/crypto, x/net, x/sys, x/text and modernc.org/libc v1.77.1 → v1.78.0, sqlite stays v1.60.1). Reason: the owner chose a migration library (option C), and goose runs Go steps, which reshaping JSON inside columns needs.

**Storage**: One SQLite file. New: goose's version table `goose_db_version` (the step number, FR-001), created by goose in the same file. `schema_meta.version` stays, renamed in meaning to "last written by release" and written only after the refusal check (FR-008). No other schema change: step 1 *is* today's schema.

**Testing**: `go test ./...` (fixtures in `server/testdata/upgrade/`, the injected failing step, the refusal), `npm run check` (`check-upgrades.mjs`), Playwright for the maintenance screen and the refusal page.

**Target Platform**: One static binary (`CGO_ENABLED=0`), Linux/macOS/Windows; browser, desktop shell, MCP clients

**Performance Goals**: a start with no pending step stays within 5 ms of today's `openDB` on an existing database (research: 2.3–2.6 ms; SC-002), measured by a benchmark in CI. The copy before a pending step costs what `VACUUM INTO` costs (178 ms for 83 MB, research) and only when a step is pending.

**Constraints**: No external services. English source strings. Administration stays closed to agents. The upgrade runs before the HTTP server starts, so no request ever sees a half-upgraded database.

**Scale/Scope**: every existing instance and every backup ever made (all at "no step number"); databases up to the 100k-row bench world.

## Constitution Check

- I. One binary, no external services ✅: goose is a Go library compiled in; the copy is a file beside the database. The new dependency's reason is in `docs/decisions.md` and Technical Context.
- II. Agent parity ✅: upgrading happens at start-up, not through a capability. The admin view is administration, already on the closed list ("backup/restore, tunnel and instance settings"). The refusal answers agents with a machine-readable code (FR-019).
- III. Gates are one function ✅: `GET /api/admin/info` keeps its admin check; no new route.
- IV. Derive from code ✅: `check-upgrades.mjs` and `TestUpgrade*` enforce the step/fixture rule (FR-013); nothing rests on memory.
- V. English source ✅: the maintenance strings go through `t()`. The refusal page is rendered by the server before any account or language is known (like the log), so it is English with its machine-readable code; the desktop app and agents read the code.
- VI. Every surface, every time ✅: Surfaces below; a new registry row "Stored data".
- VII. Measured, not assumed ✅: the start-up benchmark, the copy time, the binary size and the module count are measured in the PR.

## Surfaces

| Surface | Changes | Owner |
|---------|---------|-------|
| Domain logic and gates (`canRead`/`canWrite`, `credentialMayEnter`, validation, `audit`, `fireWebhook`) | New `server/upgrade.go`: `upgradeDB(dataDir)` (refusal check → lock → copy → goose `Up` → "last written by"), `errUpgradeRefused{code, sentence}`, `copyBeforeUpgrade`, `pruneCopies`, `upgradeLock`. New `server/upgrade_steps.go`: the step list; step 1 = `baseSchema(tx)`, the body of today's `openDB` moved unchanged into a function taking `*sql.Tx` (`ensureColumn` takes an `execer`). `audit("system", "upgrade", …)` once per start that ran steps. No permission change. | backend |
| Schema and queries (`server/db.go`, indexes, `ensureColumn`) | `openDB` opens and configures the connection only; the schema moves into step 1. New table `goose_db_version` (goose's own). `schema_meta.version` written after the check (FR-008). From now on a schema change is a new step, never an edit to step 1 (frozen by `TestUpgradeStepOneIsFrozen`). | backend |
| REST routes (`server/server.go`, middleware) | No new route. `GET /api/admin/info` gains `upgrade: {step, newest, lastAt, copies[]}` (contracts/rest.md). While refused, `cmd`'s refusal handler answers every path: HTML page, or JSON `{error, code}` for `/api/` and `/mcp` (contracts/refusal.md). | backend |
| MCP tools (`server/mcp*.go`, descriptions, `wrapUntrusted`, read-scope refusal) | No change: upgrading is start-up, not a tool. While refused, `/mcp` answers 503 with code `upgrade_refused` or `upgrade_failed`, so an agent can say why the workspace is unreachable. | mcp |
| Closed-to-agents list (`not_available_via_mcp`) | No change: "backup/restore, tunnel and instance settings" already covers the admin view; `wiki/agent-access.md` unchanged. | mcp |
| UI components (`web/src/…`, light + dark, keyboard) | `AdminSettings.tsx` maintenance tab: a "Database upgrades" block (step, newest, last upgrade, copies with size and date). Read-only, no new interaction. Checked light and dark. | ui |
| Translations (`t()`, `de.json` required, `es.json`) | The maintenance block's strings. The refusal page is English by design (Constitution V above). | i18n |
| Server error codes (`web/src/serverErrors.ts`) | `upgrade_refused`, `upgrade_failed`: the app is not loaded while refused, but the desktop shell and a tab left open receive them from `/api/`; the entries keep a translated sentence for that tab. | i18n |
| Wiki (`wiki/*.md`, `mcp-tools.md`, stale screenshots) | `self-hosting.md` § Updating, § Backing up, § Restoring, § Reading the startup log, new § "If salt.md refuses to start"; `admin.md` maintenance; screenshot `admin-maintenance` retaken; `docs/what-it-does.md` one line. | wiki |
| Tests (Go incl. refusal paths, Playwright spec, check scripts) | Go: fixture upgrade (`TestUpgradeFixtures`), no-step database = step 1 result (`TestUpgradeFromNoStep`), failing step leaves bytes (`TestUpgradeFailedStepChangesNothing`), newer database refused with 0 bytes changed (`TestUpgradeRefusesNewerDatabase`), copy taken only when pending and pruned to 3, restore report, lock, step 1 frozen. Playwright: refusal page; maintenance block. `check-upgrades.mjs`. | test |
| Performance (query plans, payload size, per-request work) | Start-up only: `BenchmarkStartNoPending` against today's `openDB`; no per-request work added. `admin/info` reads the copies with one directory listing. | perf |
| Manifest (`capabilities.json`, `gapBudget`, parity acts) | No new route or tool; the `admin.instance` capability (closed) gains the upgrade view in its summary. `gapBudget` unchanged. | mcp |
| Design system (`web/src/ui/`, tokens, `check-tokens.mjs` budgets, catalogue) | The maintenance block reuses the tab's existing rows; no new literal. The refusal page is server HTML with inline styles from a tiny fixed sheet: counted against no budget (not in `web/src`), and kept to system colours so it reads in light and dark (`prefers-color-scheme`). | ui |
| Storage budgets (benchmarks on the seeded workspace, p95 budgets, read time limit) | `BenchmarkStartNoPending` gets a budget from the PR's CI run (p95 × 1.5) in `specs/002-storage-engine/research.md`. No query on a hot path changes. | perf |
| Page containers | No change: no page rendering changes. | ui |
| Aggregation | No change: no property type changes. | backend |
| Stored data | Introduced here: step 1 and the runner (`server/upgrade.go`, `server/upgrade_steps.go`), the first fixture `step-0.db`, `TestUpgradeStepOneIsFrozen`, `check-upgrades.mjs`, and the registry row itself. | backend |

**New concepts**: **Stored data**. Every later feature that changes what is stored (a table, a column, an index, a JSON shape inside a column) ships it as a new upgrade step with a fixture written just before it, and never edits an earlier step. Added to `.specify/memory/surfaces.md` (tag `backend`, since 2026-10-29), enforced by `check-upgrades.mjs` and `TestUpgradeStepOneIsFrozen`.

**Parity statement**: Upgrading is not a capability: it happens when the server starts, before anyone (person or agent) can connect. The admin's view of it is instance administration, closed to agents as "backup/restore, tunnel and instance settings" already is. While start-up is refused, agents get the same sentence as people, with a code (`upgrade_refused`, `upgrade_failed`).

## Project Structure

### Documentation (this feature)

```text
specs/008-safe-upgrades/
├── plan.md
├── research.md          # the #263 research, with the owner's decision on top
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── rest.md          # admin/info's upgrade block
│   └── refusal.md       # the refusal page and codes
└── tasks.md             # /speckit-tasks
```

### Source Code

**Files touched**:
- `go.mod`, `go.sum` (goose, through `go get`);
- `server/db.go` (`openDB` slimmed; `ensureColumn` takes an `execer`);
- new `server/upgrade.go`, `server/upgrade_steps.go`, `server/upgrade_test.go`, `server/testdata/upgrade/`;
- `server/server.go` (`New` calls `upgradeDB` first);
- `server/backup.go` (`Restore` reports the step; `Backup` leaves the copies out);
- `server/instance.go` (`admin/info`);
- `server/import_csv.go` (`FixNotionRows` opens through the same path);
- `main.go` (refusal handler, `salt version` prints the step);
- `web/src/components/AdminSettings.tsx`, `web/src/api.ts`, `web/src/serverErrors.ts`, `web/src/locales/*.json`;
- new `web/scripts/check-upgrades.mjs` (+ `package.json`);
- new `web/tests/upgrade-refusal.mjs`;
- `wiki/self-hosting.md`, `wiki/administration.md`, `docs/what-it-does.md`;
- `capabilities.json`, `.specify/memory/surfaces.md`;
- `specs/002-storage-engine/research.md`.

## Design decisions

- **P1. The runner.** `goose.NewProvider(goose.DialectSQLite3, db, nil, goose.WithGoMigrations(steps...))`, each step a `goose.NewGoMigration(n, &goose.GoFunc{RunTx: fn}, nil)`: Go functions in their own transaction, no down steps (FR-018). Checked against v3.29.0 in T001 and pinned by `server/upgrade_goose_test.go` (a failing step rolls back and the next start continues; a `RunDB` step runs). Use `goose.WithDisableGlobalRegistry(true)` so a stray `goose.AddMigration` in an `init` never becomes a step.
- **P2. Refusal before goose.** Read `MAX(version_id)` from `goose_db_version` if the table exists, and compare it with the newest step. goose does **not** guard this: measured in T001, a database with more steps than the binary knows gives `HasPending` false and an `Up` that runs nothing and returns no error (`TestGooseNewerDatabaseIsNotAnError`). The check is ours alone. It must use plain SQL (`sqlite_master`, then `MAX(version_id)`): goose's `GetDBVersion` and `HasPending` both create `goose_db_version` on a database without one (`TestGooseReadsCreateTheVersionTable`), so a refused start would otherwise change the file. `NewProvider` itself writes nothing. FR-007.
- **P3. Copy only when pending.** Pending = the version P2 read is below the newest step (not `provider.HasPending`, which writes goose's table before the copy is taken, P2); then `VACUUM INTO salt.db.before-step-<n>` beside the database, then prune to the newest 3. A failed copy (disk full) stops start-up before any step, and the sentence gives the database's size. FR-005.
- **P4. One process.** A lock file `upgrade.lock` in the data directory, created exclusively, holding the PID and the time, removed after the steps. A second process finding it refuses with code `upgrade_busy`. A lock older than 15 minutes is taken over (a crashed run), since a step is all or nothing and the version table says where it stopped. FR-010.
- **P5. Rebuilt tables.** A step that rebuilds a table runs `PRAGMA foreign_key_check` before returning; a non-empty result is the step's error. `foreign_keys` cannot change inside a transaction, so such a step runs with `goose.GoFunc{RunDB: …}` and its own `BEGIN`; the helper `rebuildTable` does it once, for every later step. FR-011. goose runs a `RunDB` step on the pool while it holds a connection of its own for the whole run (measured in T003, `TestGooseRunDBStepNeedsASecondConnection`), so on the writer's single connection it would wait forever: `upgradeDB` therefore opens its own pool of two on the file, runs the steps and closes it before `openDB` opens the writer.
- **P6. The refusal handler.** `server.New` returns `*UpgradeRefusal`; `main.go` logs the sentence and serves `server.RefusalHandler(r)` on the same address: `GET /` and every page → the HTML page (503); `/api/…` and `/mcp` → JSON `{error, code}` (503). The data directory is not touched. FR-019.
- **P7. Fixtures.** `server/testdata/upgrade/step-0.db`: written by today's `main` before any step exists, with a small seeded workspace (pages, a database with rows and a chart view, a comment, a file reference, search). Each later step N adds `step-<N-1>.db`, written by the code just before step N. `TestUpgradeFixtures` copies each to a temp dir, runs `New`, and checks content, views, search and the version. FR-012.
- **P8. Step 1 frozen.** `TestUpgradeStepOneIsFrozen` hashes `schema` plus the column list of step 1 and compares with the value recorded when step 1 was written. A change there fails with "add a new step instead". FR-013.
- **P9. The gate.** `check-upgrades.mjs` reads `server/upgrade_steps.go` and `server/testdata/upgrade/`: every step N > 1 needs `step-<N-1>.db`. A change to `server/db.go`'s `schema` constant without a new step fails too, by the frozen hash's Go test. FR-013.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| New dependency (goose, +79 modules in the graph, 5 linked, +354,230 B; measured in T001) | Owner's decision (option C) | The research's hand-written runner (option B) was offered and declined by the owner |
