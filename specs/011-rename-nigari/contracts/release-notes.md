# Contract: the v2.0.0 release notes (FR-010)

The release workflow writes notes from the merged pull requests. For v2.0.0 the
owner pastes this text at the top of the release, so each old name is listed with
its new name and what happens to it. The table is [data-model.md](../data-model.md),
shortened to what a person outside the code meets.

```markdown
## salt.md is now nigari

This fork of salt.md (saltmd/salt.md) is now its own project, nigari. Same data,
same features, new name, and the old names stop with this release.

### Before you update

- **Rename your SALT_* variables to NIGARI_*** (service file, compose file, shell).
  nigari refuses to start while an old one is set without its new name, and says
  which; nothing is changed.
- **Webhook receivers**: check `X-Nigari-Signature` instead of `X-Salt-Signature`.
- **Scripts**: the command is `nigari` (`nigari backup`, `nigari restore`).

### What moves by itself

- `salt.db` becomes `nigari.db` on the first start.
- Theme, tabs, sidebar, recent pages and language in your browser.
- A Linux install made with install.sh: the installer moves the service,
  `/var/lib/salt` → `/var/lib/nigari`.

### What you do once

- **Sign in again**: sessions are not carried over.
- **Agents**: download the skill again (it is now `nigari/`); rename your MCP
  server label from `salt` if you like (the URL is unchanged).
- **Docker**: the image is `ghcr.io/neatlittlemacapps/nigari`. Keep your
  `salt-data` volume: the compose file still uses it. The compose service is
  called `nigari` now: run `docker compose up -d --remove-orphans`, or the old
  `salt` container keeps running beside it (nigari then refuses to start until
  it is gone).
- **deploy/salt.service users**: move `/opt/salt` to `/opt/nigari` and use
  `deploy/nigari.service`.

### Still read

Workspace exports and backups made by salt.md import and restore as before.
```
