<!--
Sync Impact Report
- Version: 1.0.0 → 1.1.0 (2026-10-26): VI now points at the surfaces registry
  (.specify/memory/surfaces.md) and makes it grow with new concepts; asked for
  by the owner. Updated: plan-template override, tasks-template override,
  AGENTS.md, check-surfaces.mjs (new), plans 001 and 002.
- Version: template → 1.0.0 (first ratification)
- Principles added: I–VII
- Templates: .specify/templates/overrides/plan-template.md and tasks-template.md
  carry the Constitution Check and the Surfaces table for these principles
- Runtime guidance: AGENTS.md, .claude/rules/
-->

# nigari Constitution

## Core Principles

### I. One binary, no external services

nigari ships as one static Go binary (`CGO_ENABLED=0`) with the frontend embedded and
one SQLite file beside it. A feature MUST NOT require a database server, cache, queue,
object store or any other process. An existing instance MUST start on the new binary
without a manual migration step. New dependencies need a stated reason.

*Why:* installing, backing up and upgrading by copying files is the product.

### II. Agent parity

Whatever a person can do in the interface, an agent MUST be able to do over MCP, with
the same checks. The only exceptions are listed in `not_available_via_mcp`
(`server/mcp_workspace.go`) and documented in `wiki/agent-access.md`; moving the line
changes both. A credential never carries more than its person's access.

*Why:* agents are first-class users of this workspace, and a gap is either a missing
feature or a back door.

### III. Gates are one function

Access is decided by the shared gates — `canRead`/`canWrite` for the person,
`credentialMayEnter` for the credential, `sessionOnly` for administration. A check
MUST NOT exist on one entry point only; when REST and MCP need the same rule, both
call one function. Every gated change MUST be tested on its refusal path.

*Why:* the history of this codebase is checks added on one side and found missing on
the other, one route at a time.

### IV. Derive from code

What can be checked against the code MUST be checked by a script in the build gate
(`web/scripts/check-*.mjs`, Go tests), not remembered. Documentation that names tools,
routes or screens is verified by `check-wiki.mjs`; screenshots record the files they
show. A new rule that matters arrives with the check that enforces it.

*Why:* a convention without a check decays, and documentation that is wrong is
worse than none.

### V. English source

Code, comments and user-facing text are English. UI text goes through `t()` and is
the translation key; German (`de.json`) is required, other catalogues are reported.
Dates, numbers and sorting go through `format.ts`.

*Why:* translatability rots unless a failing build protects it.

### VI. Every surface, every time

A change names every surface in the registry (`.specify/memory/surfaces.md`) and
either changes it or states why it does not apply (the Surfaces table in each plan,
checked by `check-surfaces.mjs`). The registry grows: a feature that introduces a
concept later features must respect — a design system, a budget, a new kind of
credential — adds it there in the same pull request, so every plan after it answers
for it.

*Why:* a feature that works in the browser and is missing over MCP is half a feature,
and a concept that lives only in the feature that introduced it is forgotten by the
next one.

### VII. Measured, not assumed

New queries are indexed and checked with `EXPLAIN QUERY PLAN`. With one database
connection, nothing may query inside an open cursor or transaction. Claims about
speed come with a benchmark or a measurement, not an adjective.

*Why:* one blocked request is a blocked server.

## Constraints

- Licence AGPL-3.0. Contributions upstream (`saltmd/salt.md`) need a signed CLA and,
  for large changes, an issue first.
- Supported platforms: Linux and macOS on amd64 and arm64, Windows on amd64.
- Security reports go to dev@nigari, never to a public issue.

## Development Workflow

- Features: `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` (with Surfaces)
  → `/speckit-tasks` → `/speckit-github-taskstoissues` → `/speckit-implement`.
- `tasks.md` is the source of truth for tasks; issues on the board mirror it.
- Done means `scripts/agent-gate.sh` is green, every surface is handled, and the pull
  request links its issue and says why the change was needed.

## Governance

This constitution outranks other practice in this repository. Amendments are made by
a person, in a pull request that updates the version, says why, and updates the plan
and tasks overrides and `AGENTS.md` where they depend on the change. Versioning:
MAJOR for a removed or redefined principle, MINOR for a new one, PATCH for wording.

**Version**: 1.1.0 | **Ratified**: 2026-10-25 | **Last Amended**: 2026-10-26
