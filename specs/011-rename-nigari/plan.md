# Implementation Plan: The fork becomes nigari

**Branch**: `claude/pensive-turing-plu40r` | **Date**: 2026-10-29 | **Spec**: [spec.md](spec.md) | **Issue**: none yet (filed with the tasks)

**Input**: Feature specification from `/specs/011-rename-nigari/spec.md`

## Summary

Every name the product carries changes from salt / salt.md to **nigari**, internals
included (owner: option C), with no transition (owner: "Q1 immediately"), first release
**v2.0.0** (owner: "Q2 B"). The work splits into three kinds of change. The full list of
old names is in [data-model.md](data-model.md):

1. **Inside names**, which nothing outside the code sees: the Go module, identifiers,
   DOM event names, comments, the export page's script variables. These are renamed and
   nothing more.
2. **Outside names**, which something outside this code depends on: environment
   variables, cookies, the webhook header, browser storage, the database file, the
   command, service files, the image, the desktop app id and URL scheme, the calendar
   feed, archives. Each gets one of three treatments:
   - **moved** once: the database file, browser storage, the installer's systemd service;
   - **refused** with a sentence: `SALT_*` variables;
   - **gone**: cookies (sign in again), the header, the `salt` command. Each one is named
     in the release notes.
3. **Words people read**: the interface in three languages, emails, the MCP server name
   and instructions, the wiki (36 pages, 31 screenshots), README, install and release
   text. Plus the origin notice AGPL-3.0 requires.

A new check, `check-names.mjs`, keeps old names out from then on (FR-013).

## Technical Context

**Language/Version**: Go 1.27 (server, one package `server/`), TypeScript 5.6 + React 18 (`web/src/`)

**Primary Dependencies**: Go standard library + pure-Go SQLite; Mantine, BlockNote, Yjs in the frontend. New dependencies: none.

**Storage**: One SQLite file, renamed `salt.db` → `nigari.db` by a one-time move before the upgrade steps run (research R2). Schema change: none. No new upgrade step, so `check-upgrades.mjs` needs no new fixture.

**Testing**: `go test ./...` (`testServer`, `callTool`, the spec 008 fixture `step-0.db`), `npm run check` (tsc + check scripts, new `check-names.mjs`), Playwright in `web/tests/` (browser storage move).

**Target Platform**: One static binary (`CGO_ENABLED=0`), Linux/macOS/Windows; browser, desktop shell, MCP clients

**Performance Goals**: no request gets slower.
- The variable check reads the environment once at start.
- The database move runs once per data directory, and costs one WAL checkpoint and one rename.
- The storage move costs 14 `localStorage` reads per page load, then nothing once moved.
- `BenchmarkStorageStart` stays within its 2 ms budget (research P3).

**Constraints**: No external services. English source strings as translation keys. Agent parity except the closed list in `server/mcp_workspace.go`. `LICENSE`, `CLA.md` and `THIRD-PARTY-NOTICES.md` are protected and unchanged.

**Scale/Scope**: 270 tracked files mention "salt" (measured 2026-10-29: web 89, server 66, wiki 36, specs 33, root 14, desktop 8, docs 7, .github 5, deploy 3, .specify 3, .devcontainer 3, scripts 2, .claude 1). There are 33 distinct `SALT_*` names, of which 9 are read by the server and 3 by the installer. Also: 3 cookies, 1 header, 14 browser-storage keys or prefixes plus 3 legacy prefixes, and 17 interface strings (the spec measured 11; spec 008 added the upgrade sentences).

## Constitution Check

- I. One binary, no external services ✅: names only; nothing new runs.
- II. Agent parity ✅: no capability changes. Agents see the new server name and instructions (`initialize`), and the skill download is renamed `nigari/`. No tool and no gate changes.
- III. Gates are one function ✅: no gate changes. Cookie names are constants used by the one session check.
- IV. Derive from code ✅: `check-names.mjs` enforces FR-013 with a per-file budget that only goes down. `check-release.mjs` keeps reading the repository from `server/update.go`.
- V. English source ✅: the 17 changed strings go through `t()` with German and Spanish. The variable refusal is a log sentence, written before any language is known, like spec 008's refusal.
- VI. Every surface, every time ✅: Surfaces below. New registry row: **Outside names**.
- VII. Measured, not assumed ✅: the counts above were measured on 2026-10-29. Binary size, the start benchmark and the uid in the image are measured in the pull request.

## Surfaces

| Surface | Changes | Owner |
|---------|---------|-------|
| Domain logic and gates (`canRead`/`canWrite`, `credentialMayEnter`, validation, `audit`, `fireWebhook`) | `fireWebhook` signs with `X-Nigari-Signature` (R6). `server/oldnames.go` (new): `CheckOldEnv(environ)` builds the refusal sentence, and `moveOldDatabase(dataDir)` does the file move (R1, R2). `audit("system", "rename", …)` once, when the database moved. No permission change. | backend |
| Schema and queries (`server/db.go`, indexes, `ensureColumn`) | No change: no table, column or index changes. The file's name changes (`DBFile = "nigari.db"`), not what is in it. | backend |
| REST routes (`server/server.go`, middleware) | No new route. Cookie constants `nigari_session`, `nigari_oauth`, `nigari_mail_oauth`. The session middleware expires the three old cookies when a request carries them (`Max-Age=0`, R5). Archive and calendar downloads get new file names (R7, R8). | backend |
| MCP tools (`server/mcp*.go`, descriptions, `wrapUntrusted`, read-scope refusal) | `serverInfo.name` becomes `nigari`. The instructions, the descriptions that say "Salt" (`import_url`, `get_import_status`'s `next`), and the skill files (`saltmd/` → `nigari/`, `server/skill.go`) change. No tool's behaviour changes. | mcp |
| Closed-to-agents list (`not_available_via_mcp`) | No change: nothing opens or closes. | mcp |
| UI components (`web/src/…`, light + dark, keyboard) | Text only: title, manifest, logo `aria-label`, About and licences, update banner, "Salt fonts" → "nigari fonts". New `web/src/storageMove.ts` runs before React renders (R4). Service-worker cache `nigari-shell-v1`; the existing activate handler deletes the old cache. DOM event names `salt:*` → `nigari:*`. Checked in light and dark; no layout change. | ui |
| Translations (`t()`, `de.json` required, `es.json`) | The 17 keys that name the product change, with German and Spanish. `translate.mjs` reads `NIGARI_TRANSLATE_MODEL`. | i18n |
| Server error codes (`web/src/serverErrors.ts`) | New code `rename_conflict` (both `salt.db` and `nigari.db` present, R2), with a translated sentence for a tab left open. The three upgrade sentences that say "salt.md" change with their keys. | i18n |
| Wiki (`wiki/*.md`, `mcp-tools.md`, stale screenshots) | All 36 pages that mention salt. `self-hosting.md` gains § "Updating from salt.md", which is the old-names table. `troubleshooting.md` covers the variable refusal. All 31 screenshots are retaken (they show the name), plus `.github/hero.png`. `docs/what-it-does.md` and the README with the origin notice (FR-002). | wiki |
| Tests (Go incl. refusal paths, Playwright spec, check scripts) | Go: variable refusal and ignore-beside-new (`TestOldEnv*`). Database move: WAL content survives (row written without a checkpoint), both files present → refused with 0 bytes changed, copies renamed, SC-001 from `step-0.db`. Imports of `salt-workspace.json` and `saltVersion` archives (FR-009). Restore of a backup holding `salt.db`. Old cookies expired. Webhook header. Calendar `PRODID`/`UID`. Playwright: `storage-move.mjs` (old keys in, new keys and theme applied, old keys gone). `check-names.mjs` gets its own failing cases. | test |
| Performance (query plans, payload size, per-request work) | Per request: one cookie-name check for old cookies, already parsed. Per page load: `storageMove.ts`, 14 reads, then nothing once moved. No query changes. | perf |
| Manifest (`capabilities.json`, `gapBudget`, parity acts) | No change: no route or tool added or removed, and `gapBudget` stays 10. Summaries that say "Salt" are reworded. | mcp |
| Design system (`web/src/ui/`, tokens, `check-tokens.mjs` budgets, catalogue) | No change: text only; no new literal, component or token. The brand font keeps its files; only its label changes. | ui |
| Storage budgets (benchmarks on the seeded workspace, p95 budgets, read time limit) | No change to queries. `BenchmarkStorageStart` runs on `nigari.db` and stays within its 2 ms budget. The move itself runs once, not per start, and is timed in the test log. | perf |
| Page containers | No change: no page-level control. | ui |
| Aggregation | No change: no property type. | backend |
| Stored data | No new upgrade step. The file move happens before the steps, under the same lock, and changes no byte inside the database (R2, R3). `step-0.db` keeps its name: it describes salt.md v1.6.10, which wrote it. | backend |
| Outside names | Introduced here: [data-model.md](data-model.md) lists every outside name with its treatment, `check-names.mjs` enforces it, and the registry row is added. | backend |

**New concepts**: **Outside names**. A name that something outside this code depends on: an environment variable, cookie, header, browser-storage key, file name in the data directory, archive entry, command, service unit, image, app id, URL scheme or calendar id. A later feature that adds or changes one names it in its plan with one of three treatments: moved once, refused with a sentence, or gone and named in the release notes. Renaming one silently is never allowed. Added to `.specify/memory/surfaces.md` (tag `backend`, since 2026-10-29). `check-names.mjs` enforces the old salt names; a later rename adds its old name there.

**Parity statement**: No capability changes. An agent connected by URL keeps working; it sees the server name `nigari` in `initialize`. An agent configured with a server called `salt` (`claude mcp add … salt …`) still connects, because the name on the agent's side is a local label. The release notes tell people to rename that label.

## Project Structure

### Documentation (this feature)

```text
specs/011-rename-nigari/
├── plan.md
├── research.md          # R1–R15: how each outside name is met, and why
├── data-model.md        # the old-names table: old → new → treatment
├── quickstart.md        # update a v1.6.10 install to v2.0.0, end to end
├── contracts/
│   ├── refusal.md       # the variable refusal and rename_conflict
│   └── release-notes.md # the v2.0.0 notes skeleton (FR-010)
└── tasks.md             # /speckit-tasks
```

### Source Code

**Files touched** (by area; `check-names.mjs` gives the full list):
- `go.mod` (`module nigari`), every `import "salt/server"`, ldflags in `Makefile`, `Dockerfile`, `release.yml`. `go.sum` does not change: the module's own name is not in it.
- `server/server.go` (`DBFile`, cookie use), `server/users.go`, `server/oauth*.go`, `server/mail_oauth.go`, `server/webhooks.go`, `server/ics.go`, `server/transfer.go`, `server/library.go`, `server/blueprints/**/salt-workspace.json` (renamed), `server/backup.go` (`Version = "2.0.0"`, restore accepts `salt.db`), `server/ops.go` (`Env` reads `NIGARI_`), `server/ingest.go`, `server/memlimit.go`, `server/update.go` (`updateRepo`), `server/mcp*.go`, `server/skill.go`, `server/export_html.go`, `server/admin.go`, `server/desktop_auth.go` (scheme `nigari`), new `server/oldnames.go` + tests;
- `main.go` (refusal first, the `nigari` usage text, `nigari-backup.tar.gz`);
- `web/index.html`, `web/public/*`, `web/src/**` (strings, storage keys, events), new `web/src/storageMove.ts`, `web/src/main.tsx`, `web/src/locales/*.json`, `web/vite*.config.ts`, `web/scripts/*.mjs` (env names), new `web/scripts/check-names.mjs` (+ `package.json`), `web/tests/fixture.mjs`, new `web/tests/storage-move.mjs`;
- `install.sh` (asset, binary, service move: R13), `deploy/nigari.service`, `deploy/nigari.container`, `docker-compose.yml`, `Dockerfile`, `.devcontainer/*`;
- `desktop/package.json`, `desktop/src/*`, `desktop/README.md` (app id, scheme, name). `desktop/package-lock.json` is regenerated by `npm install`, never edited by hand;
- `.github/workflows/release.yml` (asset names, the version rule: R11), `web/scripts/check-release.mjs`;
- `README.md`, `CONTRIBUTING.md`, `AGENTS.md`, `.claude/rules/*`, `wiki/**`, `docs/what-it-does.md`, `docs/decisions.md` (new entry);
- `.specify/memory/surfaces.md` (Outside names).

**Not touched** (kept on purpose): `LICENSE`, `CLA.md`, `THIRD-PARTY-NOTICES.md`, `.github/cla-signatures.json`, `specs/0**` before 011, older entries in `docs/decisions.md`, `docs/handoffs/`, `server/testdata/upgrade/step-0.db`, commit history.

## Design decisions

The reasoning for each is in [research.md](research.md); these are the shapes.

- **P1. Refusal first.** `main` calls `server.CheckOldEnv(os.Environ())` before anything else, before reading `NIGARI_DATA` or opening a file. Any `SALT_<X>` without `NIGARI_<X>` adds a pair to one sentence, which is logged, and the process exits with status 2. With both set, `NIGARI_<X>` is used and one line says `SALT_<X>` is ignored. [contracts/refusal.md](contracts/refusal.md).
- **P2. The database moves before the steps.** In `upgradeDB`'s caller, `moveOldDatabase(dataDir)` runs under the upgrade lock (`upgrade.lock`, spec 008 P4):
  - If `salt.db` exists and `nigari.db` does not: open `salt.db`, run `PRAGMA wal_checkpoint(TRUNCATE)`, close, rename the file, remove the emptied `-wal`/`-shm`, rename `salt.db.before-step-*` → `nigari.db.before-step-*`, then log one line.
  - Both present: refuse with `rename_conflict`, changing nothing.
  - After the move, the spec 008 steps run on `nigari.db` as on any start.
- **P3. Browser storage moves once.** `storageMove.ts` holds the table from data-model.md. For each old key, or each key under an old prefix: if the new key is absent, copy the value, then remove the old key. It is the first import in `main.tsx`, so it runs before `i18n.ts` reads its cache and before the first render: the first paint already uses the moved theme and language.
- **P4. Archives read both names.** Exports write `nigari-workspace.json` (manifest field `nigariVersion`, file `<name>.nigari.zip`). Imports and the blueprint library accept `salt-workspace.json` and `saltVersion` too. `nigari restore` accepts an archive holding `salt.db` and writes `nigari.db`.
- **P5. The installer moves a service install.** If `/etc/systemd/system/salt.service` exists:
  - stop and disable it;
  - move `/var/lib/salt` → `/var/lib/nigari` when the latter does not exist (same filesystem, one `mv`);
  - create the `nigari` user and `chown` the directory;
  - write `nigari.service` with `NIGARI_*`;
  - remove `salt.service` and `/usr/local/bin/salt`;
  - print each step.

  The `salt` user is left in place: deleting a system account is not the installer's call.
- **P6. Container data stays where it is.** `docker-compose.yml` and `deploy/nigari.container` keep the volume name `salt-data`. A renamed volume is a new, empty one, which is exactly the "looks like lost data" case. It is an allowed old name in `check-names.mjs`, with that reason.
- **P7. Version and repository.** `server.Version = "2.0.0"`. `release.yml`'s rule gains one case: a line with no tag yet releases the base itself (v2.0.0, not v2.0.1). `updateRepo` and `install.sh` name `neatlittlemacapps/nigari`. The owner renames the repository right before merging (R12). Image names follow `github.repository`, so the image becomes `ghcr.io/neatlittlemacapps/nigari`.
- **P8. The check.** `check-names.mjs` scans tracked files for `salt` as a name: `salt.md`, `saltmd`, `SALT_`, `salt_`, `salt-`, `salt:`, `salt/`, `salt://`, `Salt` and `salt` as words. Paths that are history or licence are skipped. Every other occurrence must be on a per-file allowlist with a count and a reason (old-name handling, the password salt in `server/users.go`, the origin notice, the volume name). A count may only go down.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| An allowlist of old names inside `check-names.mjs` | FR-013 needs the old names to stay in a few places (moves, refusal, imports, the volume, the password salt) | A plain "no salt anywhere" check would forbid the very code that moves the data, and the cryptographic word "salt" |
