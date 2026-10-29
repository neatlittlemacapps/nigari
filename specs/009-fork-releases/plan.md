# Implementation Plan: The fork's own releases

**Branch**: `claude/handoff-continuation-4byisr` | **Date**: 2026-10-29 | **Spec**: [spec.md](spec.md) | **Issue**: #265

**Input**: Feature specification from `/specs/009-fork-releases/spec.md`

## Summary

`release.yml` runs on every push to `main`. It works out the next `v1.6.N` from the fork's
own tags, builds the frontend and the five binaries with that one version, publishes the
release (the action creates the tag) as latest, and calls `docker.yml`, which is now
reusable, for the image under `ghcr.io/${{ github.repository }}`. The rest is pointing:
`install.sh`, `updateRepo`, the docs, the deployment files. Desktop releases are never
latest. `make build` stamps one version from `git describe` into both halves. A new
`check-release.mjs` keeps every one of these from drifting back.

This plan was written after a first implementation (commit `443db7c`). That code is
reviewed against the spec here; the review findings are tasks below.

## Technical Context

**Language/Version**: Go 1.27 (one constant), POSIX shell (install.sh, Makefile), GitHub Actions YAML, Node 22 (the check)

**Primary Dependencies**: no new code dependency. Actions: `softprops/action-gh-release@v2` (already used), `docker/*` (already used).

**Storage**: none.

**Testing**: `check-release.mjs` in `npm run check`; the release run itself on the first merge; `go test ./server -run Update`.

**Target Platform**: GitHub Actions, the install script on Linux/macOS, the image on linux/amd64 and arm64.

**Performance Goals**: N/A (CI only; one release run per merge, about as long as today's tag run).

**Constraints**: plain `vX.Y.Z` versions (`releaseVersion` in `server/update.go`); tags made by the release action itself (a `GITHUB_TOKEN` tag push starts no workflow); upstream's v1.1.x tags must never be latest.

**Scale/Scope**: one release per merge into `main`.

## Constitution Check

- I. One binary, no external services ✅: releases and images are built in CI; nothing runs beside the binary.
- II. Agent parity ✅: no capability changes; the update notice is admin-only as before.
- III. Gates are one function ✅: no gate changes.
- IV. Derive from code ✅: `check-release.mjs` enforces FR-003 to FR-009; the version line is read from `server/backup.go`, not written twice.
- V. English source ✅: no new UI string.
- VI. Every surface, every time ✅: table below.
- VII. Measured, not assumed ✅: the version computation was run locally against the fork's tags (none on 1.6 → v1.6.9; with v1.6.9 → v1.6.10). The first real release is checked against SC-001 in the pull request's follow-up.

## Surfaces

| Surface | Changes | Owner |
|---------|---------|-------|
| Domain logic and gates (`canRead`/`canWrite`, `credentialMayEnter`, validation, `audit`, `fireWebhook`) | `server/update.go`: `updateRepo` is the fork. No gate or validation changes. | backend |
| Schema and queries (`server/db.go`, indexes, `ensureColumn`) | No change: nothing stored changes. | backend |
| REST routes (`server/server.go`, middleware) | No change: `GET /api/update` answers as before, with the fork's link. | backend |
| MCP tools (`server/mcp*.go`, descriptions, `wrapUntrusted`, read-scope refusal) | No change: no tool reads releases. | mcp |
| Closed-to-agents list (`not_available_via_mcp`) | No change: the update notice is instance administration, already closed. | mcp |
| UI components (`web/src/…`, light + dark, keyboard) | No change to a component. The "new version" toast stops appearing on local builds because both halves carry one version (FR-003). | ui |
| Translations (`t()`, `de.json` required, `es.json`) | No change: no new string. | i18n |
| Server error codes (`web/src/serverErrors.ts`) | No change: no new code. | i18n |
| Wiki (`wiki/*.md`, `mcp-tools.md`, stale screenshots) | `self-hosting.md` (install, `SALT_REPO`, the release rule, the two one-time GitHub settings), `getting-started.md`, `domain.md`, `docs/what-it-does.md`; README; no screenshot shows these. | wiki |
| Tests (Go incl. refusal paths, Playwright spec, check scripts) | New `web/scripts/check-release.mjs` in `npm run check`: install.sh default repo, `updateRepo`, the image name, the README/wiki install lines, one version expression feeding both halves in `release.yml`, `Makefile` and `Dockerfile`, desktop never latest. Existing `TestUpdate*` still pass. | test |
| Performance (query plans, payload size, per-request work) | No change: no request path changes. | perf |
| Manifest (`capabilities.json`, `gapBudget`, parity acts) | No change: no route or tool. | mcp |
| Design system (`web/src/ui/`, tokens, `check-tokens.mjs` budgets, catalogue) | No change: no UI. | ui |
| Storage budgets (benchmarks on the seeded workspace, p95 budgets, read time limit) | No change: no query. | perf |
| Page containers | No change: no page rendering. | ui |
| Aggregation | No change: no property type. | backend |
| Stored data | No change: nothing stored changes, so no upgrade step. | backend |

**New concepts**: None that later features must answer for. The release rule lives in
`docs/decisions.md` and `check-release.mjs`.

**Parity statement**: Not a capability. Releases are built by CI; the update notice stays
admin-only and closed to agents, as before.

## Project Structure

**Files touched**:
- `.github/workflows/release.yml`, `docker.yml`, `desktop.yml`;
- `install.sh`, `Makefile`;
- `server/update.go`, `server/memlimit.go` (a comment);
- `README.md`, `docker-compose.yml`, `deploy/salt.container`;
- `wiki/self-hosting.md`, `getting-started.md`, `domain.md`, `docs/what-it-does.md`;
- `docs/decisions.md`;
- new `web/scripts/check-release.mjs` (+ `web/package.json`).

## Review of the first implementation against the spec

- FR-001 to FR-007: met by `443db7c`.
- FR-008: the wiki does not yet say how to make the image public, or how to allow the
  workflow to write releases (spec, Assumptions). → T004.
- FR-009: no check exists. → T003.
- Edge case "two merges in quick succession": `concurrency: release` queues the second
  run, and it reads tags after the first published, so it takes the next number. ✅
- Edge case "a build not made from a released commit": `git describe` gives
  `v1.6.N-k-gHASH`, which `releaseVersion` treats as unreleased. ✅

## Complexity Tracking

No violations.
