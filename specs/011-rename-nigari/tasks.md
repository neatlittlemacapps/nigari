---

description: "Tasks for the rename to nigari"
---

# Tasks: The fork becomes nigari

**Input**: `specs/011-rename-nigari/` (plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md)

**Tests**: required (salt.md). The refusal paths: an old variable alone, both database files present, an old cookie, an old archive, an old browser key.

**Issues**: parent #327; T001–T035 are #328–#362, in order.

**Delivery**: **one pull request**. Every push to `main` is a release (spec 009), so a part merged on its own would ship a half-renamed v1.6.x. The owner renames the repository just before merging (research R12).

**Order**: the stories are numbered as in the spec, but built US3's refusal first (in Foundational), then US2, US3, US1. Renaming `Env` to `NIGARI_` without the refusal would silently ignore every existing `SALT_DATA`, and the data moves must exist before anything visible says nigari.

## Format: `[ID] [P?] [Story] [surface] Description`

---

## Phase 1: Setup

- [x] T001 [backend] Go module: `go.mod` `module salt` → `module nigari`; every `import "salt/server"` → `"nigari/server"` (`main.go`, `server/**`); ldflags `-X salt/server.Version` → `-X nigari/server.Version` in `Makefile`, `Dockerfile`, `.github/workflows/release.yml`, `.devcontainer/*`. `go build ./... && go test ./...` green. Record the `CGO_ENABLED=0` binary size before and after. `go.sum` must not change (protected; R10)
- [ ] T002 [test] New `web/scripts/check-names.mjs` + `web/scripts/names-allowlist.json` (`{path: {count, reason}}`), added to `npm run check`. Patterns from plan P8: `salt.md`, `saltmd`, `SALT_`, `salt_`, `salt-`, `salt:`, `salt/`, `salt://`, and `Salt`/`salt` as words. Skipped paths: `LICENSE`, `CLA.md`, `THIRD-PARTY-NOTICES.md`, `.github/cla-signatures.json`, `specs/001`–`010`, `docs/handoffs/`, `docs/decisions.md` (entries before the rename's), `server/testdata/upgrade/step-*.db`. It **reports only** until T031 makes it fail. Its own failing cases in the same file, as `check-build-tokens.mjs` does: a new name fails; a count above the allowlist fails; a count below it says to lower the allowlist

---

## Phase 2: Foundational (blocks every story)

- [ ] T003 [backend] Version: `server/backup.go` `Version = "2.0.0"`. `.github/workflows/release.yml` "Work out the version": a line with no tag releases `base` as is, and a line with tags releases last + 1 (R11). Update `web/scripts/check-release.mjs` if it encodes the old rule. A dry run of the shell step with no `v2.0.*` tag prints `v2.0.0`, and with tag `v1.6.11` on line 1.6 prints `v1.6.12`
- [ ] T004 [backend] Environment names: `server/ops.go` `Env` reads `NIGARI_` + name; `server/ingest.go` reads `NIGARI_IMPORT_ALLOW_PRIVATE`. Rename all 33 `SALT_*` names in data-model.md "Environment variables" to `NIGARI_*` wherever they are read or set: `vite.config.ts`, `vite.catalog.config.ts`, `web/scripts/*.mjs`, `web/tests/*.mjs`, `Dockerfile`, `docker-compose.yml`, `Makefile`, `.devcontainer/*`, `release.yml`, `server/export_html.go` (`SALT_TITLE`… → `NIGARI_TITLE`…), and the error and log texts that name them (`backup.go`, `memlimit.go`)
- [ ] T005 [backend] New `server/oldnames.go`: `CheckOldEnv(environ []string) (ignored []string, refusal error)` per contracts/refusal.md. Every `SALT_<X>` without `NIGARI_<X>` goes into one sentence, in environment order, joined by `, `. Each one beside its new name gives one "is ignored" line. `main.go` calls it before anything else (before `EnvOr("DATA", …)`); on refusal it logs the sentence and calls `os.Exit(2)`
- [ ] T006 [test] `server/oldnames_test.go`:
  - `TestOldEnvRefusesAlone`: `SALT_DATA` alone gives a refusal naming `SALT_DATA → NIGARI_DATA`;
  - `TestOldEnvListsEveryOldName`: two old names, in order;
  - `TestOldEnvIgnoredBesideNew`: no refusal, one ignored line;
  - `TestOldEnvNoneSet`: no output.

  Plus a `main`-level test (`SALT_TEST_CLI` pattern, renamed `NIGARI_TEST_CLI`) that the binary exits 2 and creates no `./data`. Mutation-check: drop the call in `main.go` and the test fails

**Checkpoint**: the code builds as `nigari`, reads only `NIGARI_*`, and no old variable is silently ignored.

---

## Phase 3: User Story 2 — an existing install updates without losing anything (P1)

**Goal**: a v1.6.10 data directory starts on v2.0.0 with everything in it.

**Independent test**: quickstart §2 and §4.

- [ ] T007 [US2] [backend] `server/server.go` `DBFile = "nigari.db"`. In `server/oldnames.go`, `moveOldDatabase(dataDir)` runs under `takeUpgradeLock`, before `upgradeDB`, from `New` and from `FixNotionRows` (spec 008 T005's two doors), per plan P2:
  1. if `salt.db` exists and `nigari.db` does not: open it, run `PRAGMA wal_checkpoint(TRUNCATE)`, close;
  2. rename `salt.db` → `nigari.db`;
  3. remove the emptied `salt.db-wal`/`salt.db-shm`;
  4. rename `salt.db.before-step-*` → `nigari.db.before-step-*`;
  5. write the log line from contracts/refusal.md and `audit("system", "rename", …)`.

  Both files present: return `*UpgradeRefusal{Code: "rename_conflict"}` with the contract's sentence, before writing anything. `pruneCopies`, the restore line and `backup.go`'s exclusions use `DBFile`, so they follow
- [ ] T008 [US2] [test] `server/oldnames_test.go`:
  - `TestRenameKeepsWALContent`: write a row to `salt.db` with `wal_autocheckpoint=0` and close without a checkpoint, so the row exists only in `-wal`; move; the row is in `nigari.db`. Mutation-check: skip the checkpoint and the test fails;
  - `TestRenameConflictChangesNothing`: the hashes of both files and the directory listing are unchanged, and the code is `rename_conflict`;
  - `TestRenameMovesCopies`;
  - `TestRenameFromFixture`: `step-0.db` copied in as `salt.db`, then the content checks of `TestUpgradeFixtures` (SC-001)
- [ ] T009 [US2] [i18n] `web/src/serverErrors.ts`: `rename_conflict` with its sentence, plus German in `de.json` (required) and Spanish in `es.json`
- [ ] T010 [P] [US2] [backend] Backups: `main.go` default file `nigari-backup.tar.gz`. `server/backup.go` `Restore` accepts an archive whose database entry is `salt.db` and writes it as `nigari.db`. `Backup` leaves `nigari.db.before-step-*` and `upgrade.lock` out (spec 008 T010's rule, under the new name)
- [ ] T011 [P] [US2] [test] `TestRestoreReadsOldArchive`: a tar holding `salt.db` restores to `nigari.db` with its content; the existing backup tests pass on the new names
- [ ] T012 [P] [US2] [backend] Workspace archives (plan P4):
  - `server/transfer.go` writes `nigari-workspace.json` with field `nigariVersion` and the file name `<name>.nigari.zip`, and reads `salt-workspace.json`/`saltVersion` when the new names are absent;
  - `server/library.go` reads both;
  - rename every `server/blueprints/**/salt-workspace.json` with `git mv`;
  - update `server/blueprints/README.md` and the `bad_archive` sentence
- [ ] T013 [P] [US2] [test] `TestImportReadsOldArchive`: an archive with `salt-workspace.json` and `saltVersion` imports; a new export carries `nigari-workspace.json`; the blueprint library loads every blueprint (`credential_audit_test.go`'s archive fixture moves to the new name, and an old-name case stays)
- [ ] T014 [US2] [ui] New `web/src/storageMove.ts`, from data-model.md "Browser":
  - the 10 keys and 3 prefixes move copy-if-absent, then the old key is removed;
  - the 4 legacy names (`salt-locale`, `salt:view:`, `salt:scroll:`, `salt:hscroll:`) are removed, and their handling moves out of `pageUiState.ts` and `i18n.ts`;
  - every access is inside `try`.

  It is the first import in `web/src/main.tsx` (R4). Every call site reads and writes the `nigari-…` keys (`App.tsx`, `i18n.ts`, `pageUiState.ts`, `IndexView.tsx`, `Sidebar.tsx`, `UpdateBanner.tsx`, `CommentsPanel.tsx`, `StructurePanel.tsx`). Service worker `web/public/sw.js`: `SHELL = 'nigari-shell-v1'`
- [ ] T015 [US2] [test] New `web/tests/storage-move.mjs`, added to `web/tests/package.json`'s `test` script:
  - seed `salt-theme=dark`, `salt-tabs`, `salt-recents`, `salt-prefs` and a `salt-sec-<id>`; load the app;
  - it renders dark with those tabs and recents; the `nigari-*` keys hold the values, and no `salt-*` key is left;
  - a second load changes nothing.

  Mutation-check: drop the import and the test fails
- [ ] T016 [US2] [backend] `install.sh` (plan P5, R13): `REPO` defaults to `neatlittlemacapps/nigari` through `NIGARI_REPO`; asset `nigari-<os>-<arch>`; binary `nigari`; its four variables renamed, with the refusal from contracts/refusal.md on `SALT_*`.

  The service move, as a function that takes a root prefix (`NIGARI_INSTALL_ROOT`, tests only):
  1. find `etc/systemd/system/salt.service`; stop and disable it;
  2. move `var/lib/salt` → `var/lib/nigari` (refuse if both exist);
  3. create user `nigari` and `chown` the directory;
  4. write `nigari.service` and remove `salt.service` and `usr/local/bin/salt`;
  5. print each step.

  Also: `Documentation=` link (R16), and the `./data/salt.db` note → `nigari.db`
- [ ] T017 [US2] [test] New `scripts/test-install-move.sh` runs `install.sh`'s move function against a temp root holding a fake `salt.service`, `/var/lib/salt/salt.db` and `/usr/local/bin/salt`, with `systemctl`, `useradd` and `chown` stubbed on `PATH`. It checks the moved directory, the new unit's `NIGARI_DATA=/var/lib/nigari`, the removed files, and the refusal when both directories exist. It runs in CI's `Build and test` job and in `scripts/agent-gate.sh`
- [ ] T018 [P] [US2] [backend] Containers (R14):
  - `Dockerfile`: user `nigari` with the uid the `salt` user has in the current image (measure with `docker run --entrypoint id ghcr.io/neatlittlemacapps/salt.md:latest`, or read Alpine's `adduser` default, and pin it with `-u`); `ENV NIGARI_ADDR=:8420 NIGARI_DATA=/data`; binary and `ENTRYPOINT` `nigari`;
  - `docker-compose.yml`: service `nigari`, image `ghcr.io/neatlittlemacapps/nigari`, volume **`salt-data` kept**, with a comment saying why;
  - `git mv deploy/salt.container deploy/nigari.container` (`Image=`, `ContainerName=nigari`, `Volume=salt-data:/data` kept);
  - `git mv deploy/salt.service deploy/nigari.service` (`/opt/nigari`, user `nigari`, `NIGARI_*`)

**Checkpoint**: an old data directory, backup, archive or browser arrives intact; an old service install moves.

---

## Phase 4: User Story 3 — an old name fails loudly, never silently (P1)

**Goal**: no old name works, and none fails without a word.

**Independent test**: quickstart §3, plus the tests below.

- [ ] T019 [US3] [backend] Cookies (R5): `server/users.go` `nigari_session`, `server/oauth*.go` `nigari_oauth`, `server/mail_oauth.go` `nigari_mail_oauth`. The session middleware sends `Set-Cookie: <old>=; Max-Age=0; Path=/` for each of the three old names a request carries (the old names live in `oldnames.go`)
- [ ] T020 [US3] [test] `TestOldCookiesAreExpired`: a request with `salt_session` is not signed in, and gets the three expiring `Set-Cookie`s only for the names it carried. The existing session, OAuth and mail tests pass on the new names
- [ ] T021 [P] [US3] [backend] Webhooks (R6): `server/webhooks.go` signs with `X-Nigari-Signature` only; `webhooks_test.go` checks the new header and that the old one is absent
- [ ] T022 [P] [US3] [backend] The command: `main.go` usage text and the `restore` usage say `nigari`; log lines `nigari <v> listening on …`

**Checkpoint**: an old variable refuses (T005), an old cookie signs out, the old header and command are gone.

---

## Phase 5: User Story 1 — the product is called nigari (P1)

**Goal**: everything a person or agent reads says nigari, except the origin notice.

**Independent test**: quickstart §1 and §6.

- [ ] T023 [US1] [mcp] `server/mcp.go`: `serverInfo.name` `nigari`, the instructions, the `import_url` description and `get_import_status`'s `next` ("Salt" → "nigari"), and the `claude mcp add … nigari …` comment. `server/skill.go`: the folder `saltmd/` → `nigari/` and the skill text. `capabilities.json` summaries that say Salt. `wiki/mcp-tools.md` follows in T028
- [ ] T024 [US1] [backend] Server text (data-model "Server, files and network"):
  - `server/ics.go`: `PRODID`, `UID` suffix `@nigari`, calendar name, `nigari.ics` (R8);
  - `User-Agent: nigari/<v>` in `update.go`, `tunnel_update.go` and `ingest.go`;
  - `admin.go`: sender `nigari@<host>`;
  - `mail_oauth.go`: the test mail's subject;
  - `desktop_auth.go`: `desktopScheme = "nigari"`;
  - `update.go`: `updateRepo = "neatlittlemacapps/nigari"`;
  - the refusal sentences in `upgrade.go` and `refusal.go`;
  - `memlimit.go` messages;
  - comments that call the product Salt or salt.md, in every `server/*.go`
- [ ] T025 [US1] [ui] Interface text:
  - `web/index.html` (`<title>`, `apple-mobile-web-app-title`), `web/public/manifest.webmanifest`, the `aria-label` in `web/public/logo.svg`, the comment in `web/public/sw.js`;
  - the 17 strings that name the product, in `web/src/**` (`t('…')` keys change, `Salt fonts` → `nigari fonts`);
  - DOM event names `salt:*` → `nigari:*` in every dispatch and listen;
  - checked in light and dark
- [ ] T026 [US1] [ui] Origin notice (FR-002): in the About/licences section of `web/src/components/AdminSettings.tsx` and in `README.md`, one statement that nigari is a modified version of salt.md (`saltmd/salt.md`) since 2026-10-29, under AGPL-3.0, with a link to the source. `LICENSE` and the copyright lines stay unchanged
- [ ] T027 [US1] [i18n] `web/src/locales/de.json` and `es.json`: the changed keys from T009, T025 and T026 move to their new English keys with German (required) and Spanish. Sonnet helper; Claude reviews every line before commit. `check-i18n.mjs` reports 0 untranslated
- [ ] T028 [US1] [ui] Desktop (R9):
  - `desktop/package.json`: `name` `nigari-desktop`, `productName` `nigari`, `appId` `io.github.neatlittlemacapps.nigari`, protocol `nigari`, `homepage` and author pointing at the repository;
  - `desktop/src/*`: scheme, window titles, the Help menu link (R16);
  - `desktop/README.md`; the link text in `.github/workflows/desktop.yml`;
  - regenerate `desktop/package-lock.json` with `npm install` in `desktop/`, never by hand
- [ ] T029 [US1] [wiki] Words:
  - all 36 `wiki/*.md`, `README.md` (relative wiki links; Website, demo and `llms.txt` links removed: R16), `CONTRIBUTING.md`, `AGENTS.md`, `.claude/rules/*.md`, `.claude/skills/steward/SKILL.md`, `docs/what-it-does.md`, `server/testdata/upgrade/README.md` (it says the fixture was written by salt.md);
  - new § "Updating from salt.md" in `wiki/self-hosting.md` (the data-model table, shortened);
  - the variable refusal and `rename_conflict` in `wiki/troubleshooting.md`; the header in `wiki/webhooks.md`.

  Sonnet helper for the pages that only change words; Claude writes the two new sections and reviews the rest. `check-wiki.mjs` green
- [ ] T030 [US1] [wiki] Screenshots: retake all 31 (`wiki/screenshots.json`) with the screenshot recipe (handoff, `node scripts/shoot-wiki.mjs`), then `.github/hero.png`. Sonnet helper; Claude looks at every image before commit (no `salt.md` left except the origin notice; no scratch path visible, #320)

**Checkpoint**: nothing visible says salt.md except the origin notice.

---

## Phase 6: Polish and cross-cutting

- [ ] T031 [test] `check-names.mjs` enforced: `names-allowlist.json` holds only the "Kept on purpose" rows of data-model.md, each with a count and a reason, and the check fails on anything else (SC-004). Mutation-check: add `salt.md` to a `web/src` string and it fails
- [ ] T032 [perf] `BenchmarkStorageStart` runs on `nigari.db` and its p95 stays within the 2 ms budget (`specs/002-storage-engine/research.md` P3) in the PR's CI run; record the binary size from T001 in the PR
- [ ] T033 [backend] `.specify/memory/surfaces.md` has the Outside names row (done with the plan); `docs/decisions.md` has the rename entry (done). Add the amendment pointer to the 2026-10-29 release entry: "amended by the rename entry above"
- [ ] T034 [test] Run quickstart §1–§6, `scripts/agent-gate.sh`, `npm test --prefix web/tests`, `/code-review`, `ux-ui-audit` (light and dark, desktop and phone) and `/security-review` (cookies and the desktop scheme change). Findings are fixed or get an issue
- [ ] T035 [wiki] The PR body carries:
  - the v2.0.0 release notes from contracts/release-notes.md, for the owner to paste;
  - the owner's steps in order (R12): PR green → rename the repository to `nigari` → merge → make the `nigari` package public;
  - after the merge, Claude checks quickstart §7

---

## Dependencies

- T001 → T002 → T003, T004 → T005 → T006 → everything after. T004 and T005 go in the same commit: `Env` must never read `NIGARI_` without the refusal.
- US2: T007 → T008, T009. T010–T013 [P] after T007. T014 → T015. T016 → T017. T018 [P].
- US3: T019 → T020. T021, T022 [P].
- US1: T023–T026 after US2 and US3, since they rename the strings those phases add. T027 after T009, T025 and T026. T028 [P]. T029 after T023–T026. T030 last in US1 (screenshots show the final text).
- Polish: T031 after everything that renames; T034 last before the PR; T035 with the PR.

## Parallel examples

- After T007: T010 (backups), T012 (archives) and T018 (containers) touch different files.
- In US1: T028 (desktop) beside T023–T025.
- Helpers (Sonnet): T027 (translations), T029's word-only pages, T030 (screenshots), each reviewed before commit.

## Implementation strategy

One branch, one pull request, built in the order above. Each phase ends green (`go test ./...`, `npm run check`) before the next starts, so a reviewer can follow it commit by commit. Nothing merges until the whole rename is in: the merge is the v2.0.0 release.
