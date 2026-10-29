---

description: "Tasks for the fork's own releases"
---

# Tasks: The fork's own releases

**Input**: `specs/009-fork-releases/` (plan.md, spec.md)

**Tests**: the gate's `check-release.mjs`; the first real release after the merge checks SC-001.

**Issues**: parent #265; T001–T004 are #284–#287, in order.

**Delivery**: one pull request. T001 and T002 were built before this spec was written
(commit `443db7c`) and reviewed against it (plan, "Review of the first implementation").

## Format: `[ID] [P?] [Story] [surface] Description`

---

## Phase 1: Releases (US1, US2, US4)

- [x] T001 [US1] [backend] `.github/workflows/release.yml`: on push to `main` (and `v*` tags), work out the next `v<line>.N` from the fork's tags (line from `server/backup.go`), feed it to `SALT_VERSION` and `-X salt/server.Version`, publish with `tag_name`/`target_commitish`, `prerelease: false`, `make_latest: "true"`, `concurrency: release`; call `docker.yml` (now `workflow_call`, image `ghcr.io/${{ github.repository }}`); `desktop.yml` `make_latest: "false"`; `Makefile` one `VERSION` from `git describe` for both halves

## Phase 2: Pointing at the fork (US1, US3)

- [x] T002 [P] [US1] [wiki] `install.sh` `REPO="${SALT_REPO:-neatlittlemacapps/salt.md}"`; `server/update.go` `updateRepo`; README, `wiki/self-hosting.md` (release rule, `SALT_REPO`), `wiki/getting-started.md`, `wiki/domain.md`, `docs/what-it-does.md`, `docker-compose.yml`, `deploy/salt.container`; `docs/decisions.md` (the version rule)

## Phase 3: Keeping it (FR-008, FR-009)

- [x] T003 [test] New `web/scripts/check-release.mjs` in `npm run check`: fork name from `updateRepo` and not upstream's; `install.sh` default; image name; no upstream install line in README, wiki, docs, deployment files; one version for both halves in `release.yml`, `Makefile`, `Dockerfile`; server releases latest, desktop never
- [x] T004 [P] [wiki] `wiki/self-hosting.md`: the two one-time GitHub settings (workflow write permission; making the image public)

---

## Dependencies

- T003 checks what T001 and T002 built. T004 is independent.
