# Feature Specification: The fork's own releases

**Feature Branch**: `claude/handoff-continuation-4byisr`

**Created**: 2026-10-29

**Status**: Draft (written after a first implementation, which is reviewed against it)

**Issues**: #265

**Input**: Owner's issue #265, "Install cleanup": "Publish fork binaries on every push to
main, and install from the fork instead of saltmd." Installing today gives upstream v1.1.4
instead of the fork's build.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Installing gives the fork's newest build (Priority: P1)

The owner (or anyone they point at the fork) runs the one-line install command from the
fork's README. Today it downloads upstream's v1.1.4: the fork has no releases, and the
script is hard-wired to upstream. With this feature every merge into `main` publishes a
release of the fork, and the script installs the newest one.

**Why this priority**: it is the issue: the install command installs the wrong program.

**Independent Test**: after a merge, run the README's install command on a clean
machine. `salt version` prints the version of the release just published.

**Acceptance Scenarios**:

1. **Given** a merge into `main`, **When** the release run finishes, **Then** the fork
   has a release with binaries for Linux and macOS (x86-64 and arm64), Windows (x86-64)
   and a checksum file.
2. **Given** that release, **When** someone runs the README's install command, **Then**
   they get that build, and `salt version` matches the release's tag.
3. **Given** someone who wants upstream, **When** they set the repository to upstream's,
   **Then** the same script installs upstream's release.

---

### User Story 2 - The app never nags about a version it already is (Priority: P1)

The browser part and the server part of a build carry the same version, in a release and
in the owner's own `make build`. Today a local build is "dev" in the browser and "1.6.8"
on the server, so every page load says "a new version is available", and reloading never
clears it.

**Why this priority**: a message that is always there teaches people to ignore messages.

**Independent Test**: build locally and open the app: no "new version" message. The same
for a release.

**Acceptance Scenarios**:

1. **Given** a release or a local build, **When** the app is opened, **Then** no "a new
   version is available" message appears.

---

### User Story 3 - The admin is told about the fork's updates (Priority: P2)

An instance checks once a day whether a newer release exists, and tells the admin. Today it
asks upstream, so a fork instance is told about upstream's releases. With this feature it
asks the fork.

**Why this priority**: the notice exists today; this makes it point at the right place.

**Independent Test**: an instance on an older fork release, with the check on, shows the
newer fork release.

**Acceptance Scenarios**:

1. **Given** a newer fork release, **When** the daily check runs, **Then** the admin's
   notice names it and links to the fork's releases.
2. **Given** a desktop-app release published after the newest server release, **When** the
   check runs or the script installs "latest", **Then** both still find the server release.

---

### User Story 4 - The container image is the fork's (Priority: P2)

The Docker and Podman instructions pull the fork's image, built from the same release.

**Independent Test**: after a release, `docker run` with the README's image starts that
version.

**Acceptance Scenarios**:

1. **Given** a release, **When** its run finishes, **Then** an image tagged with the
   version and `latest` exists under the fork's account.

### Edge Cases

- **Two merges in quick succession** must not publish the same version twice.
- **Upstream's tags in the fork** (v1.1.2 to v1.1.4) must never be "latest"; every fork
  release sorts above them.
- **An upstream merge that moves the version line** (say to 1.7): the fork follows the new
  line, still above every earlier release.
- **A build not made from a released commit** (local changes, a branch): it says so in its
  version, and the update check treats it as unreleased rather than nagging.
- **A shared desktop/server repository**: desktop releases have their own tags and must
  never become the "latest" release.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every push to `main` MUST publish a release of the fork with the five
  binaries and a checksum file, as a full (not pre-) release marked latest.
- **FR-002**: Each release MUST get the next version on the fork's own line: the next
  patch after the highest fork release on the major.minor line the code declares (1.6
  today). Its form is plain `vX.Y.Z`, because the update check only treats that as a
  release.
- **FR-003**: The browser part and the server part of every build (release, image, local
  `make build`) MUST carry the same version.
- **FR-004**: The install script MUST install from the fork by default, and from another
  repository when asked.
- **FR-005**: The update check MUST ask the fork's releases.
- **FR-006**: The container image MUST be built for every release, under the fork's
  account, tagged with the version and `latest`.
- **FR-007**: Desktop releases MUST never be marked latest.
- **FR-008**: The README, the wiki and the deployment files MUST show the fork's install
  command and image. The CLA workflow stays upstream's (it only runs there).
- **FR-009**: A check in the build gate MUST fail when any of the above points back at
  upstream, or when a build can stamp two different versions into its two halves.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After a merge, the README's install command installs a build whose version
  equals the newest fork release, in one command.
- **SC-002**: Opening a released or locally built app shows the "new version" message 0
  times.
- **SC-003**: 0 places in the install script, the update check, the image name or the
  install docs point at upstream, enforced by the gate.

## Assumptions

- GitHub's "latest" release is the one marked latest by the release run (FR-001, FR-007).
- New container images on GitHub start private; making the image public is a one-time
  setting the owner changes (in the wiki).
- The repository allows its workflows to write releases and packages (a one-time setting;
  in the wiki).
