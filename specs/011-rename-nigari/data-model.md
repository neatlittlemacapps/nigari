# Data model: old names

No table or column changes. The "entity" of this feature is the **old name**: a
name something outside the code may still use, with its new name and how v2.0.0
meets it (spec, Key Entities). This table is the source for `storageMove.ts`,
`CheckOldEnv`, the `check-names.mjs` allowlist, the wiki's § "Updating from
salt.md", and the v2.0.0 release notes (FR-010). Counts measured 2026-10-29.

Treatments:
- **moved**: carried over once, automatically;
- **refused**: start-up stops with a sentence naming the new name;
- **gone**: no longer answered; the release notes say what to do;
- **kept**: deliberately keeps the old name, with the reason.

## Environment variables

`CheckOldEnv` treats every `SALT_<X>` in the environment the same way, whether or not the server reads it, so a typo or an installer variable is caught too.

| Old | New | Read by | Treatment |
|---|---|---|---|
| `SALT_ADDR`, `SALT_DATA`, `SALT_MEMORY_MB`, `SALT_RESTORE_FORCE`, `SALT_TLS_CERT`, `SALT_TLS_KEY`, `SALT_TRASH_DAYS`, `SALT_UPDATE_CHECK` | `NIGARI_*` | server (`Env`, `server/ops.go`) | refused alone; ignored with a log line beside its new name |
| `SALT_IMPORT_ALLOW_PRIVATE` | `NIGARI_IMPORT_ALLOW_PRIVATE` | server (`server/ingest.go`) | same |
| `SALT_VERSION`, `SALT_REPO`, `SALT_NO_START`, `SALT_NO_SERVICE` | `NIGARI_*` | `install.sh` | the installer refuses the same way |
| `SALT_VERSION` | `NIGARI_VERSION` | `vite.config.ts`, `release.yml`, `Dockerfile` (build) | renamed; build-time only |
| the other 20 (`SALT_SEED_*`, `SALT_SHOOT_*`, `SALT_TEST_*`, `SALT_TRANSLATE_MODEL`, `SALT_FMT_BUNDLE`, `SALT_WRITE_UPGRADE_FIXTURE`, `SALT_PROXY`, `SALT_TITLE`/`DAY`/`REGION`/`LANG`/`FOOT` and the `SALT_DEMO__`/`SALT_VERSION__` placeholders) | `NIGARI_*` | development scripts, tests, the HTML export's script | renamed; inside names |

## Browser

| Old | New | Treatment |
|---|---|---|
| cookies `salt_session`, `salt_oauth`, `salt_mail_oauth` | `nigari_session`, `nigari_oauth`, `nigari_mail_oauth` | gone: expired when seen; sign in again (FR-008) |
| `localStorage` `salt-ws`, `salt-notes-mode`, `salt-tabs`, `salt-sidebar-collapsed`, `salt-theme`, `salt-font`, `salt-recents`, `salt-prefs`, `salt-comments-open`, `salt-structure-open` | `nigari-…` | moved (FR-007) |
| `localStorage` prefixes `salt-update-seen-`, `salt-sec-`, `salt:ui:` | `nigari-update-seen-`, `nigari-sec-`, `nigari:ui:` | moved, key by key |
| `localStorage` `salt-locale`; prefixes `salt:view:`, `salt:scroll:`, `salt:hscroll:` | none | already legacy; removed (the existing code that removes them moves into `storageMove.ts`) |
| service-worker cache `salt-shell-v1` | `nigari-shell-v1` | gone: the activate handler deletes every other cache |
| DOM events `salt:toast`, `salt:navigate`, … | `nigari:…` | inside names; nothing outside listens |

## Server, files and network

| Old | New | Treatment |
|---|---|---|
| `salt.db` (+ `-wal`, `-shm`) | `nigari.db` | moved before the steps, under the lock (plan P2) |
| `salt.db.before-step-<n>` | `nigari.db.before-step-<n>` | moved with it |
| both `salt.db` and `nigari.db` present | n/a | refused: `rename_conflict` |
| header `X-Salt-Signature` | `X-Nigari-Signature` | gone; release notes name it |
| API token prefix `salt_…` (`server/users.go`) | `nigari_…` for new tokens | **kept working**: a token is a secret a person holds, looked up by the hash of the whole value, never by its prefix; existing `salt_…` tokens keep signing agents in. Found while building T019 |
| command `salt` (`salt backup`, `salt restore`, `salt version`, `salt fix-notion-rows`) | `nigari …` | gone; the installer removes `/usr/local/bin/salt` when it moves a service |
| default backup file `salt-backup.tar.gz` | `nigari-backup.tar.gz` | renamed; `nigari restore` reads an archive holding `salt.db` |
| export manifest `salt-workspace.json`, field `saltVersion`, file `<name>.salt.zip` | `nigari-workspace.json`, `nigariVersion`, `<name>.nigari.zip` | written new; both read (FR-009) |
| calendar `PRODID:-//salt.md//Calendar//EN`, name `salt.md · …`, file `salt.ics` | `-//nigari//Calendar//EN`, `nigari · …`, `nigari.ics` | renamed (research R8) |
| calendar event `UID:…@salt.md` | unchanged | **kept**: an event's identity to subscribed calendars; changed, they re-create every event and lose people's alerts (research R8) |
| MCP `serverInfo.name` `salt.md`; skill folder `saltmd/` | `nigari`; `nigari/` | renamed; release notes tell agent users to re-download the skill |
| `User-Agent: salt.md/<v>` (update check, cloudflared, import) | `nigari/<v>` | renamed |
| default mail sender `salt@<host>` | `nigari@<host>` | renamed |
| systemd unit `salt.service`, user `salt`, `/var/lib/salt`, `/usr/local/bin/salt` | `nigari.service`, `nigari`, `/var/lib/nigari`, `/usr/local/bin/nigari` | moved by `install.sh` (plan P5); the `salt` user is left in place |
| `deploy/salt.service` (`/opt/salt`), `deploy/salt.container` | `deploy/nigari.service` (`/opt/nigari`), `deploy/nigari.container` | renamed; release notes: move `/opt/salt` by hand |
| volume `salt-data` (compose, Quadlet) | `salt-data` | **kept**: a new name is a new, empty volume |
| image `ghcr.io/neatlittlemacapps/salt.md` | `ghcr.io/neatlittlemacapps/nigari` | renamed through the repository; the old image keeps its tags and gets no new ones |
| release assets `salt-<os>-<arch>` | `nigari-<os>-<arch>` | renamed |
| repository `neatlittlemacapps/salt.md` | `neatlittlemacapps/nigari` | renamed by the owner; GitHub redirects the old URLs |
| website links `https://salt.md`, `/wiki/…`, `/demo/`, `/self-host/` (13) | the wiki in `neatlittlemacapps/nigari` (relative links in the README) | renamed; Website, demo and `llms.txt` links removed (research R16) |

## Desktop and code

| Old | New | Treatment |
|---|---|---|
| app id `md.salt.desktop`, product `salt.md`, package `salt-desktop` | `io.github.neatlittlemacapps.nigari`, `nigari`, `nigari-desktop` | renamed: a new app to the OS (FR-012) |
| URL scheme `salt://` (`desktopScheme`) | `nigari://` | renamed with the app; the fork never released a desktop app, so no installed one waits on `salt://` |
| Go module `salt`, `-X salt/server.Version` | `nigari`, `-X nigari/server.Version` | inside name |
| design-token extension namespace `md.salt.*` (`$extensions` in `web/tokens/*.tokens.json`, read by `build-tokens.mjs`) | `io.github.neatlittlemacapps.nigari.*` | inside name; found by `check-names.mjs` (T002), renamed with T025 |

## Kept on purpose

| Where | Why |
|---|---|
| `LICENSE`, `CLA.md`, `THIRD-PARTY-NOTICES.md`, copyright lines | AGPL-3.0: unchanged (FR-002) |
| the origin notice (README, About) | names salt.md and `saltmd/salt.md` by design |
| `specs/001`–`010`, older `docs/decisions.md` entries, `docs/handoffs/` | history |
| `server/testdata/upgrade/step-0.db` and its README | written by salt.md v1.6.10; the name says what it is |
| the old-name handling (`oldnames.go`, `storageMove.ts`, import and restore readers, cookie expiry, `install.sh`'s service move) | it exists to name them |
| the password salt (`server/users.go`) | the cryptographic word, not the product |
| volume `salt-data` | see above |
| `check-release.mjs`'s `UPSTREAM = 'saltmd/salt.md'` | it guards against installing from upstream |
