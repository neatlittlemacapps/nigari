# Feature Specification: Safe upgrades

**Feature Branch**: `claude/handoff-continuation-4byisr`

**Created**: 2026-10-29

**Status**: Draft

**Issues**: #263 (epic)

**Input**: Owner's epic #263: "A running instance, or a restored older backup, moves to a
new release without breaking." Research first (`research.md`), then the owner chose the
research's option C on 2026-10-29: numbered upgrade steps run by a migration library
(goose, `docs/decisions.md`), with everything else the research recommended.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A running instance moves to a new release and keeps everything (Priority: P1)

The owner runs salt.md on a Mac with real content. They pull a new release and restart.
Today the new release adds missing tables and columns and nothing else. Nothing records
what the database has been through, so a release that has to reshape stored data (a view's
settings, a property's values) has nowhere to do it. With this feature the database carries
the number of the last upgrade step it received. On start, the new release runs exactly the
steps it is missing, in order, once each. The log says which steps ran.

**Why this priority**: it is the everyday case, and the one the owner asked for: "no
release ever breaking an existing database".

**Independent Test**: start a release on a data directory written by the release before
it. Every page, row, view, comment, file and search result is there afterwards, and the log
names the steps that ran.

**Acceptance Scenarios**:

1. **Given** a database written by the previous release, **When** the new release starts,
   **Then** it runs the missing steps in order, records the new step number, and every
   page, row, view, file and search result is unchanged.
2. **Given** a database already at the newest step, **When** the release starts again,
   **Then** no step runs, no copy is taken, and start-up takes no measurably longer than
   today.
3. **Given** any database salt.md has ever written (one without a step number),
   **When** the new release starts, **Then** it is treated as being before step 1, and
   step 1 gives it exactly what today's start-up gives it.

---

### User Story 2 - A copy is taken before anything changes (Priority: P1)

Before the first missing step runs, salt.md copies the database beside it and writes the
one command that puts the copy back into the log. If an upgrade surprises the owner, the
way back does not depend on them having remembered to run `salt backup` first.

**Why this priority**: an upgrade that can go wrong must be undoable by someone who is
not a developer.

**Independent Test**: start a new release on an older database. A copy named after the
step it was taken before sits in the data directory, and the command in the log restores it.

**Acceptance Scenarios**:

1. **Given** a database with steps pending, **When** the release starts, **Then** a
   complete copy is written before the first step runs, and the log names the copy and the
   command that restores it.
2. **Given** no steps pending, **When** the release starts, **Then** no copy is taken.
3. **Given** more copies than the number kept, **When** a new one is taken, **Then** the
   oldest are removed, so the data directory does not grow with every release.

---

### User Story 3 - A failed step changes nothing (Priority: P1)

A step can fail: an unexpected value in an old row, a full disk. Each step runs all or
nothing. If one fails, the database is exactly as it was before that step, salt.md does
not start serving, and it says in one sentence which step failed, why, and that the copy
from before the upgrade is there.

**Why this priority**: a half-done upgrade is worse than none, because nothing can tell
what state the data is in.

**Independent Test**: a test step that fails on purpose. The database's step number and
content are as before it, and start-up stops with the sentence.

**Acceptance Scenarios**:

1. **Given** a step that fails, **When** the release starts, **Then** that step's changes
   are undone, the step number stays at the last step that succeeded, the server does not
   start, and the message names the step, the reason and the copy.
2. **Given** the cause is fixed (disk space freed), **When** the release starts again,
   **Then** it continues from the step that failed.

---

### User Story 4 - An older release refuses a newer database (Priority: P1)

The owner tries a newer release, does not like it, and goes back to the older binary.
Today the older one opens the newer database as if nothing had happened. It cannot know
what the newer steps changed, so it may damage the data. With this feature the older
release refuses before it writes anything. It says which step the database is at, which
step it knows, and the two ways out: run the newer release again, or put back the copy
taken before the upgrade.

**Why this priority**: going back is the first thing anyone tries when an upgrade
disappoints, and it is the case that silently damages data today.

**Independent Test**: start a binary on a database whose step number is higher than any
step it knows. It exits without writing, and the sentence names both numbers and both ways
out.

**Acceptance Scenarios**:

1. **Given** a database at a higher step than the binary knows, **When** the binary
   starts, **Then** it writes nothing (the file is byte-for-byte unchanged) and exits with
   the sentence.
2. **Given** the same database, **When** the newer release starts again, **Then** it runs
   normally.

---

### User Story 5 - A restored older backup comes up to date by itself (Priority: P2)

The owner restores a backup made months ago into the current release. `salt restore`
says which step the backup is at and that the next start will bring it up to date (or
that this release is too old for it). The next start runs the same missing steps a running
instance would.

**Why this priority**: restoring an old backup is rarer than upgrading, and once Stories
1 to 4 exist it is the same path. What it adds is the restore report.

**Independent Test**: back up, apply a later step, restore the backup. `salt restore`
reports the older step number, and the next start runs the missing steps.

**Acceptance Scenarios**:

1. **Given** a backup at an older step, **When** it is restored, **Then** the restore
   says its step number and that the next start upgrades it.
2. **Given** a backup newer than the binary, **When** it is restored, **Then** the
   restore says this release is too old for it before replacing anything.
3. **Given** a backup made before this feature (no step number), **When** it is
   restored and started, **Then** it upgrades from the beginning, as in Story 1, scenario 3.

---

### User Story 6 - No release can change stored data without its step and its test (Priority: P2)

Whoever changes how data is stored (a person or an agent working on salt.md) must add
the upgrade step and a test database that proves it. A check in the build gate fails
otherwise. In CI, the test opens databases written by earlier releases (kept in the
repository, one per release from this feature on) with the new binary and checks pages,
rows, views, search and the step number.

**Why this priority**: Stories 1 to 5 hold for the steps that exist today. This story
keeps them true for every release after.

**Independent Test**: change the stored schema without adding a step. The gate fails
with a sentence that says what to add. Add the step and a fixture, and it passes.

**Acceptance Scenarios**:

1. **Given** a change to the stored schema with no new step, **When** the gate runs,
   **Then** it fails and says what to add.
2. **Given** a new step with no fixture written before it, **When** the gate runs,
   **Then** it fails and says what to add.
3. **Given** the fixtures of every earlier release, **When** the tests run, **Then** each
   upgrades to the newest step with its content intact.

---

### User Story 7 - The admin sees what the database has been through (Priority: P3)

The admin's maintenance screen shows the database's step number, the newest step this
release knows, when the last upgrade ran, and the copies taken before upgrades. `salt
version` prints the release and the step it supports. Builds report their real release,
not a fixed default.

**Why this priority**: useful when something goes wrong, but the log already says it.

**Independent Test**: after an upgrade, the maintenance screen shows the new step, the
time, and the copy. `salt version` matches.

**Acceptance Scenarios**:

1. **Given** an upgraded instance, **When** the admin opens maintenance, **Then** the
   step number, the time of the last upgrade and the copies are listed.
2. **Given** a build made from the repository, **When** `salt version` runs, **Then** it
   prints the release it was built from, not the fixed default it prints today.

---

### Edge Cases

- **Two starts at once on one data directory** (a second process started by mistake): only
  one may run the steps; the second waits or refuses, and never runs a step twice.
- **Not enough disk space for the copy**: no step runs. The message says how much space the
  copy needs.
- **A step that rebuilds a table** (a change `ALTER TABLE` cannot make): foreign keys are
  checked before the step is committed, and a broken reference fails the step instead of
  being committed.
- **A database the previous release left half-upgraded** (the process was killed mid-step):
  the step was all or nothing, so the database is at the last completed step, and the
  start continues from there.
- **Derived indexes** (search, files) keep their own version and rebuild as today. A step
  never needs to rebuild them by hand.
- **The desktop app** opens no data of its own (`desktop/README.md`). It shows the
  server's refusal page when the server refuses.
- **Data written by a newer release into JSON shapes the older release does not know**:
  covered by the refusal (Story 4). Expand/contract keeps the previous release able to
  read for one release where possible.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The database MUST record the number of the last upgrade step applied to it,
  inside the database file, so it travels with every copy and backup.
- **FR-002**: Upgrade steps MUST be numbered, run in order, once each, at start-up and
  before the server accepts requests. Each step runs in its own transaction with its
  number, so a step either completes and is recorded, or leaves no trace.
- **FR-003**: A database without a step number MUST be treated as before step 1. Step 1
  MUST be today's start-up schema work, unchanged, so every existing instance and backup
  takes the same path.
- **FR-004**: Steps MUST be able to reshape stored data (JSON inside columns, values,
  rebuilt tables), not only add tables and columns.
- **FR-005**: Before the first pending step, salt.md MUST write a complete copy of the
  database beside it. The copy is named after the step it precedes, and the log gives the
  command that restores it. The newest 3 copies are kept and older ones removed. No copy is
  taken when no step is pending.
- **FR-006**: A failed step MUST leave the database at the last completed step and stop
  start-up with one sentence naming the step, the reason and the copy.
- **FR-007**: A binary MUST refuse a database whose step number is higher than the newest
  step it knows, before writing anything, with a sentence giving both numbers and the two
  ways out (run the newer release; restore the copy taken before the upgrade).
- **FR-008**: The "last written by release" record MUST only be written after the refusal
  check has passed. Today every start overwrites it, so an older binary erases the evidence
  that a newer one ran.
- **FR-009**: `salt restore` MUST report the archive's step number. It says either that the
  next start will upgrade it, or that this release is too old for it, before replacing
  anything.
- **FR-010**: Only one process MUST run the steps on a data directory at a time.
- **FR-011**: A rebuilt table MUST pass a foreign-key check before its step commits.
- **FR-012**: The repository MUST keep one fixture database per release from this feature
  on, starting with one written by today's release before step 1 exists. The test suite
  MUST open each with the new release and check pages, rows, views, comments, search and
  the step number.
- **FR-013**: The build gate MUST fail when the stored schema or the step list changes
  without a new step and a new fixture, with a sentence saying what to add.
- **FR-014**: The admin maintenance screen MUST show the step number, the newest step the
  release knows, the time of the last upgrade and the copies kept. Administration stays
  closed to agents (session only, as today), and `not_available_via_mcp` says so.
- **FR-015**: Builds made from the repository MUST report the release they were built from
  (in the log, `salt version`, the refusal sentence and maintenance).
- **FR-016**: The wiki MUST describe updating and restoring as they now are: what the log
  shows, where the copies are, how to go back, and what the refusal means.
- **FR-017**: The surfaces registry MUST gain a row so every later plan answers for it:
  a change to stored data ships its step and its fixture.
- **FR-018**: Out of scope: steps that undo other steps (going back is restoring the copy),
  a continuous replica, upgrades while the server is serving, and moving between database
  engines.

### Key Entities

- **Upgrade step**: one numbered, ordered change to stored data, run once per database, all
  or nothing. Step 1 is today's start-up schema work.
- **Step number**: the last step a database has received, stored inside it.
- **Pre-upgrade copy**: a full copy of the database taken before the first pending step,
  named after that step, the newest 3 kept.
- **Fixture database**: a small database written by a specific release and kept in the
  repository, opened by every later release in the tests.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A database from every earlier release that has a fixture (at least the one
  from today's release) starts on the new release with 100% of its pages, rows, views,
  comments and search results intact, proven in automated tests on every pull request.
- **SC-002**: A start with no pending step is no slower than today. Today's `openDB` on an
  existing database measures 2.3 to 2.6 ms (research); the new start stays within 5 ms on
  the same machine.
- **SC-003**: An injected failing step leaves the database byte-for-byte as it was before
  that step in 100% of test runs.
- **SC-004**: A binary started on a newer database changes 0 bytes of it, and the owner can
  tell from the one sentence what to do, without reading code.
- **SC-005**: The copy taken before an upgrade restores, with the logged command, to a
  database that opens on the release it was taken from.
- **SC-006**: A change to the stored schema without a step and fixture fails the gate in
  100% of cases (a check, not a convention).

## Assumptions

- The migration runner is goose v3 (`docs/decisions.md`, 2026-10-29). Its version table
  holds the step number (FR-001). The refusal, the copy, the restore report, the fixtures
  and the check are salt.md's own, because goose provides none of them.
- 3 copies are kept (FR-005): enough to step back over the last few releases, small enough
  that the data directory does not grow without bound. The owner can change the number
  later.
- The copy is taken with SQLite's own copy (`VACUUM INTO`, as `salt backup` does). It took
  178 ms for an 83 MB database in the research.
- The release name comes from the repository's tags at build time. Builds that are not
  from a tagged commit report the commit.
- The desktop app needs nothing beyond showing the server's refusal page (it opens no data
  of its own).
