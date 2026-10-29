# Research: the fork becomes nigari

Inventory measured on 2026-10-29 with `git grep` on `main` `aa5d13b` plus this
branch. Each decision below says what was chosen, why, and what was turned down.

## R1. Old environment variables refuse the start

- **Decision**: `CheckOldEnv(os.Environ())` runs first in `main`. For every `SALT_<X>`:
  - with no `NIGARI_<X>` set, it goes into one refusal sentence, and the process exits with status 2;
  - with `NIGARI_<X>` set, the new one is used and one log line says the old one is ignored.

  It applies to any `SALT_` prefix, not only the 9 the server reads.
- **Why**: the clarification ("Q1 immediately") with the refusal as the safety. An ignored `SALT_DATA` would start on `./data`, an empty workspace that looks like lost data. Checking every prefix also catches an installer variable or a typo that a list would miss, at no cost.
- **No listener while refused**: spec 008's refusal page needs an address, and the address may be the old `SALT_ADDR` itself. The sentence goes to the log, which is where a service's failure is read (`journalctl`, `docker logs`). The desktop shell reports "could not reach the server".
- **Turned down**: reading `SALT_*` as a fallback (that would be a transition, which the owner declined). Refusing only on `SALT_DATA` (the other variables fail more quietly but just as wrongly: a TLS key ignored means plain HTTP).

## R2. The database file moves before the upgrade steps, without a copy

- **Decision**: `moveOldDatabase(dataDir)` runs under spec 008's `upgrade.lock`, before `upgradeDB`:
  1. checkpoint the WAL into `salt.db` (`PRAGMA wal_checkpoint(TRUNCATE)`);
  2. rename `salt.db` → `nigari.db`;
  3. remove the empty `-wal`/`-shm`;
  4. rename the pre-upgrade copies.

  Both files present → refused with `rename_conflict`, nothing changed.
- **Why**: a rename changes no byte in the database. The WAL is the risk: it holds committed pages not yet in `salt.db`, so renaming `salt.db` alone would drop them, and leaving `salt.db-wal` beside `nigari.db` would orphan them. A checkpoint first, by SQLite itself, makes the main file complete. `rename(2)` on one filesystem is atomic.
- **No copy before (owner, 2026-10-29: "No copy"; FR-004 updated)**: spec 008's copy exists to undo a step that changes bytes; this move changes none, and can be undone by renaming back. A copy would double the disk needed on a large instance, and it could fail on a full disk for no benefit.
- **Turned down**:
  - **a goose step**: a step runs inside the database and cannot rename its own file;
  - **opening `salt.db` under its old name forever**: that keeps an old name;
  - **a copy anyway**: offered to the owner, who declined it.

## R3. No new upgrade step

- **Decision**: the move is not step 2. The step count stays at 1, so `check-upgrades.mjs` needs no fixture.
- **Why**: steps are what changes inside the file (spec 008, Stored data). SC-001 is still tested from `step-0.db`, copied in as `salt.db`.

## R4. Browser storage moves in one module before the first render

- **Decision**: `web/src/storageMove.ts` lists the 10 keys and 3 prefixes (data-model.md) and is the first import in `main.tsx`, a module with a side effect: imports run in order, and `i18n.ts` reads `salt-prefs` when it loads, so a call in `main.tsx`'s body would come too late. Per key: copy only if the new key is absent, then remove the old. The 4 legacy names already removed by `pageUiState.ts` and `i18n.ts` move into it, so old names live in one file. Every access is in `try`, like the existing code: Safari's private mode throws.
- **Why**: before the first render, so the theme and language apply on the first paint. Copy-if-absent makes running it twice harmless.
- **Turned down**: moving each key where it is read, which spreads old names over 8 files; a one-time flag, which is another key to keep.

## R5. Old cookies: gone, and expired when seen

- **Decision**: new names. A request carrying `salt_session`, `salt_oauth` or `salt_mail_oauth` gets a `Set-Cookie` with `Max-Age=0` for it, so it does not linger until its expiry.
- **Why**: FR-008 says sign in again. Carrying a session over would be a transition. Expiring costs one header, once per browser.

## R6. Webhook header

- **Decision**: `X-Nigari-Signature` only. Same `sha256=` format, same secret.
- **Why**: FR-005. Sending both would be a transition. The release notes and `wiki/webhooks.md` name the switch.

## R7. Archives: write new, read both

- **Decision**: plan P4.
- **Why**: FR-009. An archive is a file a person keeps, so reading the old manifest name is not answering to an old name, it is reading old data. The same holds for a backup tar holding `salt.db`.

## R8. Calendar feed ids change

- **Decision**: `PRODID`, the `UID` suffix, the calendar name and the file name say nigari.
- **Why**: the server publishes calendars as subscription feeds (`/ics/…`). A subscribed client replaces the feed's contents on each refresh, so changed UIDs show the same events, not duplicates. A file someone imported by hand once would duplicate only if imported again.
- **Turned down**: keeping `@salt.md` UIDs forever, an old name for a risk that only applies to re-imported files.

## R9. The desktop app is a new app

- **Decision** (owner confirmed, 2026-10-29): app id `io.github.neatlittlemacapps.nigari`, product name `nigari`, scheme `nigari://` (with `desktopScheme` in `server/desktop_auth.go`). `desktop/package-lock.json` is regenerated with `npm install` in `desktop/`.
- **Why**: FR-012. A reverse-DNS id needs a domain the owner controls; `github.io` under the owner's account is one, while `md.salt` was never the fork's. The fork never released a desktop app (no `desktop-v*` tag), so no installed app waits on `salt://`.
- **Turned down**: `md.nigari.desktop` (no such domain is the owner's); `app.nigari` (the owner has not checked that domain).

## R10. The Go module

- **Decision**: `module nigari`. Every `import "salt/server"` and the ldflags `-X salt/server.Version` change.
- **Why**: option C. `go.sum` holds dependencies, not the module's own name, so it does not change (it is protected anyway).

## R11. v2.0.0 needs one change to the version rule

- **Decision**: `server.Version = "2.0.0"`. In `release.yml`, a line with no tag releases the base as is; a line with tags releases last + 1, as before.
- **Why**: today's rule gives a line with no tag `base patch + 1`, so `2.0.0` would release **v2.0.1**. The `+ 1` existed because `1.6.8` was upstream's last release, and the fork had to sort above it (`docs/decisions.md`, 2026-10-29). No one has released 2.0.0, and the fork no longer follows upstream's versions. It goes into `docs/decisions.md` as an amendment.
- **Turned down**: `Version = "2.0.-1"` (not a version); pushing a `v2.0.0` tag by hand (a release the owner would have to make outside the merge).

## R12. The repository is renamed just before the merge

- **Decision**: the owner's steps, in this order:
  1. the PR is green;
  2. GitHub → repository → Settings → General → Repository name: `nigari` → Rename;
  3. merge;
  4. Claude checks the release and the image.
- **Why**: the image name is `ghcr.io/${{ github.repository }}` (`docker.yml`), so a merge before the rename would publish v2.0.0 as `…/salt.md`. `updateRepo` and `install.sh` already name `neatlittlemacapps/nigari` in the PR, and GitHub redirects old URLs. So:
  - a v1.6.x instance's update check (`/neatlittlemacapps/salt.md/releases/latest`) finds v2.0.0;
  - the old `curl …/salt.md/main/install.sh` fetches the new installer.
- **After**: the new `nigari` package on GHCR starts private, so the owner makes it public (Profile → Packages → nigari → Package settings → Change visibility → Public).
- **Turned down**: renaming after the merge (one release under the wrong image name); renaming first and waiting (open branches and the board follow the redirect either way, so nothing is gained by waiting).

## R13. The installer moves a systemd install

- **Decision**: plan P5. Without a `salt.service` it installs as new. If it finds `/var/lib/nigari` already there, it stops and says why, rather than choose between two data directories.
- **Why**: without it, running the new installer on a v1.6 server writes `nigari.service` pointing at an empty `/var/lib/nigari`, while the data sits in `/var/lib/salt`: the lost-data case again.
- **Turned down**: pointing `nigari.service` at `/var/lib/salt` (an old name forever); deleting the `salt` user (not the installer's call).

## R14. Container data keeps its volume name

- **Decision**: `salt-data` stays in `docker-compose.yml` and the Quadlet file, with a comment, on `check-names.mjs`'s allowlist. Inside the image, `NIGARI_ADDR`/`NIGARI_DATA`, the user `nigari`, `/data` unchanged. The task measures the `salt` user's uid in the current image and gives `nigari` the same one, so `/data` stays writable.
- **Why**: a renamed volume key in compose is a new, empty volume.
- **Turned down**: renaming the volume with `name: salt-data`, which still names the old volume, only less visibly.

## R15. The check

- **Decision**: plan P8, as a per-file budget, the repository's way (`check-tokens.mjs`).
- **Why**: the word "salt" also means the password salt, and history documents keep it. A blanket ban is impossible, and an unbounded allowlist would let names creep back.
- **Turned down**: a list of forbidden strings only (misses `Salt` as a word in a sentence); no check (FR-013).

## R16. Links to upstream's website point at the fork's own wiki

- **Decision** (owner, 2026-10-29: "A now"): the 13 links to `https://salt.md` (measured 2026-10-29) become links into the fork's own repository:
  - `README.md` (9): the wiki links become relative links (`wiki/self-hosting.md`), which GitHub renders. The Website and Live demo links are removed: the fork has neither. The `llms.txt` sentence is removed: that file is generated by upstream's site, and `wiki/` has none;
  - `desktop/src/main.js` (Help menu), `desktop/package.json` (`homepage`), `install.sh` (`Documentation=` in the service unit), `.github/workflows/desktop.yml` (the release text): `https://github.com/neatlittlemacapps/nigari/tree/main/wiki` or the repository URL.
- **Why**: those pages describe upstream's product, its releases and its demo, which is the confusion the rename exists to end. The wiki is already in this repository, and GitHub renders it with no hosting.
- **Turned down for now**: a GitHub Pages site built from `wiki/` (B) and a domain of the owner's (C). Either can come later as its own spec; the links then move once more.

