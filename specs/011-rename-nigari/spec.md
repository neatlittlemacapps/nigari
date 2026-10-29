# Feature Specification: The fork becomes nigari

**Feature Branch**: `claude/serene-planck-ie0e6w`

**Created**: 2026-10-29

**Status**: Draft

**Issues**: to be filed

**Input**: Owner, 2026-10-29: "we are too far gone from the original salt to
ever contribute back … how about entirely replacing salt with salty and
basically consider this an official forked version?" Options offered: A keep
the name, B rename the product but keep internal names, C rename everything.
Owner: "C. Rename everything, internals too"; the name: first "salty.md",
then, after checking it: “go with "nigari"”. Specified
now, built after spec 008 (its data-file rename runs under spec 008's lock).

## Clarifications

### Session 2026-10-29

- Q: How long do the old names keep working? → A: Not at all; they stop with
  the first nigari release (owner: "Q1 immediately"). Data still moves once
  (database file, browser preferences); an old `SALT_*` variable refuses the
  start with a sentence rather than being ignored, because an ignored
  `SALT_DATA` would start on an empty directory and look like lost data.
- Q: Does the first nigari release continue v1.6.x or start v2.0.0? → A:
  v2.0.0 (owner: "Q2 B").
- Q (from the plan): take spec 008's copy before renaming the database file?
  → A: no; the rename changes no byte, and a copy doubles the disk needed
  (owner: "No copy"). FR-004 updated.
- Q (from the plan): desktop app id `io.github.neatlittlemacapps.nigari`, a
  reverse domain the owner controls? → A: yes (owner).

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

### User Story 1 - The product is called nigari (Priority: P1)

A person opens the app, the website, the docs, the installer or the release
page and sees **nigari** everywhere: the title bar, the sign-in screen, the
About screen, the emails it sends, the desktop app, the wiki. Nothing calls it
salt.md, except the line that says where it comes from.

**Why this priority**: It is the feature.

**Independent Test**: Install a release, go through sign-up, the main screens,
settings and an export; no visible text says "salt.md" except the origin line.

**Acceptance Scenarios**:

1. **Given** the interface in English, German or Spanish, **When** a person
   uses it, **Then** every mention of the product says nigari.
2. **Given** the About screen and the README, **When** a person reads them,
   **Then** they say that nigari is a modified version of salt.md
   (`saltmd/salt.md`), since when, and under which licence, with a link to the
   source.
3. **Given** the release page, the installer and the container image, **When**
   a person installs, **Then** they get `nigari` binaries and a `nigari`
   image, with install commands that say so.
4. **Given** an agent connecting over MCP, **When** it reads the server's name
   and instructions, **Then** they say nigari.

---

### User Story 2 - An existing install updates without losing anything (Priority: P1)

An admin runs salt.md v1.6.x on a data directory with its `salt.db`. They
update to nigari v2.0.0. It starts on the same data: the database file is
renamed once, with the copy before it that spec 008 takes, and every page,
row, comment and file is there. Preferences a browser stored under the old
names come along once. What does **not** come along are the old names
themselves: the owner chose no transition ("Q1 immediately"), so from v2.0.0
nothing answers to `SALT_*`, the old cookies, the old webhook header or the
`salt` command.

**Why this priority**: A rename must never cost data. The old names going at
once is the owner's choice; losing content with them is not.

**Independent Test**: Start v2.0.0 on the spec 008 fixture `step-0.db`
(written by salt.md v1.6.10); it starts, the content is there, and the
database is now `nigari.db`.

**Acceptance Scenarios**:

1. **Given** a data directory with `salt.db`, **When** v2.0.0 starts,
   **Then** it is renamed to `nigari.db` once, before the upgrade steps and
   under their lock (spec 008), and the data is unchanged.
2. **Given** preferences in old browser-storage keys (theme, tabs, sidebar,
   recent pages, language…), **When** the new interface first loads, **Then**
   it moves them to the new keys once and removes the old ones.
3. **Given** a `salt-workspace.json` export from an older release, **When** it
   is imported, **Then** it is accepted: an export is a file a person keeps,
   not a name the running app answers to.

---

### User Story 3 - An old name fails loudly, never silently (Priority: P1)

The admin's service file still sets `SALT_DATA=/srv/salt`. If v2.0.0 simply
ignored it, it would start on an empty default data directory, and the admin
would see an empty workspace and think the data was gone. Instead v2.0.0
refuses to start and says, in one sentence, which old variables it found and
what they are called now. Everything else old fails in the plainest way it
can, and the release notes list each one.

**Why this priority**: With no transition, the danger is an old name being
ignored without a word. The refusal turns the worst case into a one-line fix.

**Independent Test**: Start v2.0.0 with `SALT_DATA` set and no `NIGARI_DATA`;
it refuses, naming `SALT_DATA` → `NIGARI_DATA`, and touches nothing.

**Acceptance Scenarios**:

1. **Given** any `SALT_*` variable set and its `NIGARI_*` name not set,
   **When** v2.0.0 starts, **Then** it refuses to start with a sentence naming
   each old variable and its new name, and writes nothing to the data
   directory.
2. **Given** both `SALT_X` and `NIGARI_X` set, **When** it starts, **Then** it
   uses `NIGARI_X` and logs one line that `SALT_X` is ignored.
3. **Given** a browser with an old session cookie, **When** it makes its first
   request, **Then** the person is asked to sign in again (sessions are not
   carried over; the release notes say so).
4. **Given** a webhook receiver that checks `X-Salt-Signature`, **When**
   v2.0.0 sends a webhook, **Then** it carries the new header only; the release
   notes name the header to switch to.
5. **Given** a cron job calling `salt backup`, **When** the binary is now
   `nigari`, **Then** the old command no longer exists; the installer and the
   release notes say to use `nigari backup`.
6. **Given** the desktop app installed as salt.md, **When** a nigari desktop
   app is installed, **Then** it is a new app to the operating system; it asks
   for the server address once.

### Edge Cases

- **Upstream merges**: pulling fixes from `saltmd/salt.md` gets harder; every
  renamed line conflicts. The fork stops tracking upstream as a matter of
  course; a fix from there is ported by hand when wanted.
- **The repository rename** (`neatlittlemacapps/salt.md` →
  `neatlittlemacapps/nigari`) is done by the owner on GitHub; GitHub
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
- **Version number**: the first nigari release is **v2.0.0** (owner: "Q2 B");
  the release rule of spec 009 (next patch on `server.Version`'s major.minor)
  continues on the 2.0 line from there.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every user-visible mention of the product (interface in every
  language, emails, sign-in, About, MCP server name and instructions, desktop
  app, wiki, README, website source material, install and release text) MUST
  say nigari.
- **FR-002**: The README and the About screen MUST say that nigari is a
  modified version of salt.md, since when, under AGPL-3.0, with a link to the
  source; `LICENSE` and the original copyright notices MUST stay unchanged.
- **FR-003**: The binary, the container image, the release assets, the
  installer, the desktop app and the Go module MUST carry the new name.
- **FR-004**: The database file MUST be renamed from `salt.db` to `nigari.db`
  once, before spec 008's upgrade steps and under their lock, after a WAL
  checkpoint so no committed change is left behind; with both files present,
  start-up MUST refuse and change nothing. No copy is taken: the rename changes
  no byte (owner, 2026-10-29: "No copy").
- **FR-005**: No old name MUST keep working from v2.0.0: no `SALT_*`
  variable, old cookie, old webhook header or `salt` command is accepted
  (owner: no transition).
- **FR-006**: A `SALT_*` variable set without its `NIGARI_*` name MUST stop
  start-up with one sentence naming each old variable and its new name, before
  anything is written; set beside its new name, it MUST be logged as ignored.
- **FR-007**: Old browser-storage keys MUST be moved to the new keys once, on
  the first load of the new interface, and the old keys removed.
- **FR-008**: Sessions are not carried over; people sign in again once, and the
  release notes MUST say so.
- **FR-009**: Imports MUST accept exports made under the old name.
- **FR-010**: The release notes of v2.0.0 MUST list every old name with its
  new name and what happens to it (moved, refused with a sentence, or gone).
- **FR-011**: The first nigari release MUST be v2.0.0, and releases continue
  on the 2.0 line under spec 009's rule.
- **FR-012**: The desktop app MUST be renamed and get a new app id; it asks for
  the server address once.
- **FR-013**: The code MUST contain no "salt" name except the origin notice,
  licence texts, history documents, the refusal and storage-move code that
  names the old names, and the upgrade step; a build check MUST fail on a new
  one.
- **FR-014**: Translations of every changed string MUST be updated (German
  required, Spanish reported).

### Key Entities

- **Old name**: a name a running install or something outside it may still
  use (variable, cookie, header, storage key, file, command, app id), with its
  new name, and how v2.0.0 meets it: moved once, refused with a sentence, or
  simply gone (and named in the release notes).
- **Origin notice**: the statement that nigari is a modified salt.md.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An install of salt.md v1.6.10 updated to the first nigari
  release starts on the first try with all its data (tested from the spec 008
  fixture), once its `SALT_*` variables are renamed as the refusal sentence
  says.
- **SC-002**: 0 visible mentions of salt.md in the interface, in any language,
  apart from the origin notice.
- **SC-003**: 0 pages, rows, comments, files or browser preferences lost by
  the update; signing in again once is expected.
- **SC-004**: The build check finds 0 old names outside the allowed places in
  v2.0.0.
- **SC-005**: An old `SALT_*` variable is never silently ignored: 100% of them
  lead to the refusal sentence or, beside its new name, a log line.

## Agent parity and other surfaces

- **MCP**: the server name and instructions change; tools and their behaviour
  do not. An agent configured by URL keeps working.
- **Stored data**: the database file name is an upgrade step (spec 008), so
  the registry's Stored data surface applies.
- **Release and installer** (spec 009): asset names, image name, repository
  name in `install.sh` and the update check.
- **Registry**: no new concept, unless the plan finds "a name outside the
  code depends on" worth a surface of its own (FR-013's check suggests it).

## Assumptions

- Built after spec 008, which provides the upgrade step, its copy and its
  refusal.
- The owner renames the GitHub repository by hand when the pull request is
  ready; the plan says exactly when and how, since the release workflow and
  the update check read the repository name.
- "nigari" is free to use: the owner checks domain, GitHub name and
  trademarks; nothing in this spec checked them.
- The website and its domain, if any, are outside this repository.
