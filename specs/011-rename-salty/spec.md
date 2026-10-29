# Feature Specification: The fork becomes salty.md

**Feature Branch**: `claude/serene-planck-ie0e6w`

**Created**: 2026-10-29

**Status**: Draft

**Issues**: to be filed

**Input**: Owner, 2026-10-29: "we are too far gone from the original salt to
ever contribute back … how about entirely replacing salt with salty and
basically consider this an official forked version?" Options offered: A keep
the name, B rename the product but keep internal names, C rename everything.
Owner: "C. Rename everything, internals too"; the name: "salty.md". Specified
now, built after spec 008 (its data-file rename is an upgrade step).

## Context

The fork has diverged from `saltmd/salt.md` and does not send work back
(owner, 2026-10-27). Under the same name, people mistake it for the original:
upstream's documentation, releases and support look as if they apply to it.
AGPL-3.0 allows a fork to take its own name; it requires that the licence and
the original copyright notices stay, that the modified version says it is
modified and when, and that network users can get the source.

"salt" runs deep (measured 2026-10-29): 256 tracked files mention it; 33
`SALT_*` environment variables; the login cookies `salt_session`,
`salt_oauth`, `salt_mail_oauth`; 18 browser-storage keys (`salt-theme`,
`salt-tabs`, …); the webhook signature header `X-Salt-Signature`; the export
file `salt-workspace.json`; the database file `salt.db`; the binary `salt`;
the Go module `salt`; the desktop app id `md.salt.desktop`; the container image
`ghcr.io/neatlittlemacapps/salt.md`; the repository
`neatlittlemacapps/salt.md`; 11 interface strings and 36 wiki pages. Several
of these are contracts with things outside this code: scripts and service files
that set `SALT_DATA`, browsers holding a session cookie, webhook receivers
checking a header, agents configured with a server name, a desktop app the
operating system knows by its id. Renaming them at once breaks every one.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The product is called salty.md (Priority: P1)

A person opens the app, the website, the docs, the installer or the release
page and sees **salty.md** everywhere: the title bar, the sign-in screen, the
About screen, the emails it sends, the desktop app, the wiki. Nothing calls it
salt.md, except the line that says where it comes from.

**Why this priority**: It is the feature.

**Independent Test**: Install a release, go through sign-up, the main screens,
settings and an export; no visible text says "salt.md" except the origin line.

**Acceptance Scenarios**:

1. **Given** the interface in English, German or Spanish, **When** a person
   uses it, **Then** every mention of the product says salty.md.
2. **Given** the About screen and the README, **When** a person reads them,
   **Then** they say that salty.md is a modified version of salt.md
   (`saltmd/salt.md`), since when, and under which licence, with a link to the
   source.
3. **Given** the release page, the installer and the container image, **When**
   a person installs, **Then** they get `salty` binaries and a `salty.md`
   image, with install commands that say so.
4. **Given** an agent connecting over MCP, **When** it reads the server's name
   and instructions, **Then** they say salty.md.

---

### User Story 2 - An existing install keeps working after the update (Priority: P1)

An admin runs salt.md v1.6.x from a service file with `SALT_DATA=/srv/salt`
and `SALT_ADDR=:8420`. They update to the first salty.md release. It starts on
the same data, with the same settings, and every person stays signed in. The
admin finds a line in the log saying which old names it found and what they
are now called; nothing breaks the day they update.

**Why this priority**: Option C renames internals; the upgrade must not cost
anyone their data, settings or sessions. That is what spec 008 is for.

**Independent Test**: Start the new release on a data directory and the
environment of v1.6.10 (the upgrade fixture of spec 008 plus `SALT_*`
variables); it starts, the content is there, and a browser with an old session
cookie and old stored preferences is still signed in with its preferences.

**Acceptance Scenarios**:

1. **Given** a data directory with `salt.db`, **When** the new release starts,
   **Then** it renames the database to `salty.db` as an upgrade step (with the
   copy before it that spec 008 takes), and the data is unchanged.
2. **Given** an environment that sets `SALT_DATA`, `SALT_ADDR` or any other
   `SALT_*` variable, **When** the new release starts, **Then** it uses each
   one as if the matching `SALTY_*` variable were set, and logs one line
   naming the old variables found and their new names.
3. **Given** both `SALT_X` and `SALTY_X` set, **When** it starts, **Then**
   `SALTY_X` wins and the log says so.
4. **Given** a browser with a `salt_session` cookie, **When** it makes its
   first request to the new release, **Then** the person is still signed in and
   the browser gets the new cookie in exchange; the same for the OAuth cookies
   in the middle of a sign-in.
5. **Given** preferences in old browser-storage keys (theme, tabs, sidebar,
   recent pages, language…), **When** the new interface loads, **Then** it
   moves them to the new keys once and the person sees their own settings.
6. **Given** a webhook receiver that checks `X-Salt-Signature`, **When** the
   new release sends a webhook, **Then** it sends the signature under both the
   old and the new header name.
7. **Given** a `salt-workspace.json` export from an older release, **When** it
   is imported, **Then** it is accepted as before.
8. **Given** the command `salt backup` in an admin's cron job, **When** the
   binary is now called `salty`, **Then** the release notes and the installer
   say how to keep the old command working (the installer leaves a `salt`
   link to `salty` when it replaces an existing `salt`).
9. **Given** the desktop app installed as salt.md, **When** it updates,
   **Then** it keeps its saved server and window settings.

---

### User Story 3 - The old names stop working at a known time (Priority: P2)

The old names keep working through a transition so nobody breaks on update
day, and the release notes say when they stop. After that the code carries no
"salt" except the origin line, the licence and the history.

**Why this priority**: Option C asked for the internals renamed; keeping the
old names forever is option B in disguise.

**Independent Test**: Search the code of the release after the transition for
the old names; only the origin notice, the licence texts and the upgrade step
that renamed the database remain.

**Acceptance Scenarios**:

1. **Given** a release inside the transition, **When** an old name is used,
   **Then** it works and the log or the response says it is deprecated and
   until when.
2. **Given** the first release after the transition, **When** an old name is
   used, **Then** it no longer works and the log says what the new name is.
3. **Given** the transition length, [NEEDS CLARIFICATION: How long do the old
   names (`SALT_*` variables, old cookies, the old webhook header, the `salt`
   command link) keep working: a fixed number of releases, a date, or until the
   next major version?]

### Edge Cases

- **Upstream merges**: pulling fixes from `saltmd/salt.md` gets harder; every
  renamed line conflicts. The fork stops tracking upstream as a matter of
  course; a fix from there is ported by hand when wanted.
- **The repository rename** (`neatlittlemacapps/salt.md` →
  `neatlittlemacapps/salty.md`) is done by the owner on GitHub; GitHub
  redirects old URLs, so the update check and the installer of older releases
  keep finding new releases. The image under the old name stays where it is
  and gets no new tags.
- **Spec and decision documents, commit history, and upstream references**
  ("this fork's take on saltmd/salt.md#92") keep the old name: they describe
  the past.
- **Licence and notices**: `LICENSE` and the original copyright lines stay
  word for word.
- **A test, script or fixture** that names salt (e.g. `step-0.db`, written by
  salt.md v1.6.10) keeps describing what it is.
- **The database rename fails** (no permission in the data directory): start-up
  stops with a sentence saying so, as every failed step does (spec 008).
- **Two processes**, one old and one new release, on the same data directory:
  spec 008's lock and refusal handle it.
- **Version number**: [NEEDS CLARIFICATION: Does the first salty.md release
  continue the 1.6 line (v1.6.x) or start a new one (v2.0.0)?]

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every user-visible mention of the product (interface in every
  language, emails, sign-in, About, MCP server name and instructions, desktop
  app, wiki, README, website source material, install and release text) MUST
  say salty.md.
- **FR-002**: The README and the About screen MUST say that salty.md is a
  modified version of salt.md, since when, under AGPL-3.0, with a link to the
  source; `LICENSE` and the original copyright notices MUST stay unchanged.
- **FR-003**: The binary, the container image, the release assets, the
  installer, the desktop app and the Go module MUST carry the new name.
- **FR-004**: The database file MUST be renamed from `salt.db` to `salty.db`
  by an upgrade step of spec 008, with its copy before and its refusal rules.
- **FR-005**: Every `SALT_*` environment variable MUST be read as its
  `SALTY_*` name during the transition, the new name winning when both are
  set, with one log line naming what was found.
- **FR-006**: Old session and OAuth cookies MUST be accepted during the
  transition and exchanged for the new ones on first use, so nobody is signed
  out by the update.
- **FR-007**: Old browser-storage keys MUST be moved to the new keys once, on
  the first load of the new interface.
- **FR-008**: Webhooks MUST carry the signature under both the old and the new
  header name during the transition.
- **FR-009**: Imports MUST accept exports made under the old name.
- **FR-010**: The installer MUST leave a `salt` command pointing at `salty`
  when it replaces an existing install, for the transition.
- **FR-011**: The desktop app MUST keep its saved settings across the rename.
- **FR-012**: Each old name MUST stop working at the end of the transition,
  and the release notes MUST say when that is.
- **FR-013**: After the transition, the code MUST contain no "salt" name except
  the origin notice, licence texts, history documents and the upgrade step; a
  build check MUST fail on a new one.
- **FR-014**: Translations of every changed string MUST be updated (German
  required, Spanish reported).

### Key Entities

- **Old name**: a name a running install or something outside it may still
  use (variable, cookie, header, storage key, file, command, app id), with its
  new name and the release it stops working in.
- **Origin notice**: the statement that salty.md is a modified salt.md.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An install of salt.md v1.6.10 updated to the first salty.md
  release starts on the first try with its data, settings and signed-in
  sessions intact (tested from the spec 008 fixture and a v1.6.10
  environment).
- **SC-002**: 0 visible mentions of salt.md in the interface, in any language,
  apart from the origin notice.
- **SC-003**: 0 people signed out and 0 preferences lost by the update.
- **SC-004**: After the transition, the build check finds 0 old names outside
  the allowed places.

## Agent parity and other surfaces

- **MCP**: the server name and instructions change; tools and their behaviour
  do not. An agent configured by URL keeps working.
- **Stored data**: the database file name is an upgrade step (spec 008), so
  the registry's Stored data surface applies.
- **Release and installer** (spec 009): asset names, image name, repository
  name in `install.sh` and the update check.
- **Registry**: no new concept, unless the plan finds the "old name with a
  transition" pattern worth a surface of its own.

## Assumptions

- Built after spec 008, which provides the upgrade step, its copy and its
  refusal.
- The owner renames the GitHub repository by hand when the pull request is
  ready; the plan says exactly when and how, since the release workflow and
  the update check read the repository name.
- "salty.md" is free to use: the owner checks domain, GitHub name and
  trademarks; nothing in this spec checked them.
- The website and its domain, if any, are outside this repository.
