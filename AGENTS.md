# Working on salt.md

salt.md is a self-hosted workspace for documents and databases, open to people
and agents alike: one Go binary, one SQLite file, the React frontend embedded.
These instructions are for every coding agent that opens this repository.

## This project is documented in salt.md — use it at every step

When the instance below is reachable (a local session), use it as described.
A cloud session cannot reach `localhost:8420`: skip the `working_on`/`note`
calls and put what they would have carried in the commit body or the pull
request instead.

Decisions and documentation live at http://localhost:8420, workspace
**Workspace** (`f6526406952b1c9b154760df965df59a`), reachable over MCP. Work
status lives on the GitHub Projects board (see "How work flows").

- **Before starting anything that takes more than a moment:**
  `working_on(page_id, agent, label, note)`, and `done: true` when finished.
  Label the task's GitHub issue `in-progress` at the same time; the board
  follows (see "How work flows").
- **While working:** `note(page_id, text)` for what a write-up loses — the
  approach you dropped, the surprise, why not the obvious road. One line,
  written as it happens.
- **Decisions go in `docs/decisions.md`, with the reasoning, including the
  options rejected** (newest first). A decision explained only in chat is lost
  when the chat is. The repository, not the workspace, because cloud agent
  sessions cannot reach a local instance, and every agent can reach the repo.
- **Read first.** `search` and `get_page` are cheap; a second page about
  something that already has one is worse than none.
- **The workspace has its own rules** — `get_workspace()` returns them and they
  outrank this block.

## Principles — a change that breaks one is wrong, however well it works

- **One binary, no external services.** No database server, cache, queue or
  object store. `CGO_ENABLED=0` must keep building.
- **English source.** Code, comments and UI text are English; the UI text is
  also the translation key. German anywhere in the source fails the build.
- **Derive, do not remember.** Anything that can be checked against the code is
  checked by a script in `web/scripts/check-*.mjs`. When you add a rule that
  matters, add the check that enforces it.
- **Agent parity.** Whatever a person can do in the interface, an agent can do
  over MCP, with the same checks — unless it is on the deliberate closed list
  (`not_available_via_mcp` in `server/mcp_workspace.go`).
- **Comments explain why.** The codebase explains its reasoning in comments,
  including the bug a rule exists to prevent. Keep that style.

## Layout

| Path | What lives there |
| --- | --- |
| `main.go` | Entry point; embeds `web/dist` |
| `server/` | Everything server-side, one package. Routes in `server.go` |
| `server/mcp.go` | MCP transport, the `mcpTools` list, the `mcpCall` dispatcher and its gates |
| `server/mcp_*.go` | MCP tools by domain (pages, db, schema, history, workspace…) |
| `server/workspaces.go` | `canRead`, `canWrite`, `credentialMayEnter` — the permission gates |
| `web/src/` | React 18, Mantine, BlockNote, Yjs. `i18n.ts` (`t()`), `format.ts` (all dates and numbers) |
| `web/src/locales/` | `de.json` (required), `es.json` (reported) |
| `web/scripts/` | The check gate, icon build, wiki screenshots |
| `web/tests/` | Playwright regressions against a throwaway instance |
| `wiki/` | User documentation, checked against the code |
| `desktop/` | Electron shell around a server you run |

## Commands

```sh
make build                                   # frontend + backend, frontend embedded
SALT_DATA=/tmp/salt-dev SALT_ADDR=:8420 go run .   # backend for development
cd web && npx vite                           # frontend dev server
go test ./...                                # Go tests
cd web && npm run check                      # tsc + every check-*.mjs (also runs inside npm run build)
npm test --prefix web/tests                  # browser regressions (needs Playwright, see web/tests/README.md)
scripts/agent-gate.sh                        # what an agent must pass before it stops
```

## Every change touches its surfaces — and the list of surfaces grows

A capability is something a person or agent can do (rename a page, add a
property, share a view). When you add or change one, go through every surface
and either change it or state why it does not apply. The full list is the
registry, `.specify/memory/surfaces.md`; every plan's Surfaces table has a row
for each entry, and `check-surfaces.mjs` fails a plan that skips one. The core
nine, which the registry starts from:

1. **Domain logic and gates** — permission (`canRead`/`canWrite`), workspace
   gate (`credentialMayEnter`), validation, `audit(...)`, `fireWebhook(...)`.
2. **REST route** in `server.go`, behind the right middleware (`auth`,
   `sessionOnly` for anything administrative).
3. **MCP tool** — same checks as REST, in the tool's own path. Returned page
   content goes through `wrapUntrusted`. Read scope may not mutate.
4. **UI** — the component, light and dark, keyboard path.
5. **Translations** — every new string through `t('…')`, German in `de.json`.
6. **Wiki** — the page that describes the screen or tool; `mcp-tools.md` for
   tools; retake screenshots the change makes stale.
7. **Tests** — Go tests for logic and gates (MCP via `callTool`), a Playwright
   spec for interaction bugs.
8. **Performance** — new queries are indexed; nothing scans every page per
   request.
9. **The manifest** — `capabilities.json` names every route and MCP tool and
   says what agents may do with each capability. `check-parity.mjs` fails on a
   route or tool it does not know, and on a closed capability a token can
   reach. A new parity gap must be named there and `gapBudget` raised in the
   same pull request, where a reviewer sees it. `parity_property_test.go`
   checks that REST and MCP agree on access; add a pair of acts for a new
   capability.

Beyond these, the registry holds the concepts later features have to respect:
today the **design system** (spec 001: build from `web/src/ui/` and tokens, no
new literals) and **storage budgets** (spec 002: benchmark a new hot-path query
against its p95 budget).

**When a feature introduces such a concept, add it to the registry in the same
pull request** — with what a later feature has to check against it — so the next
plan answers for it without anyone having to remember. Think about it at
`/speckit-specify` already: a request that brings a new concept (a component
layer, a budget, a credential type, an event) is a request to extend the list.

The history of this repo shows what happens when a surface is skipped: checks
added on the REST side and missing on the MCP side, found later one by one.

## Definition of done

- `scripts/agent-gate.sh` passes (Go tests for touched packages, `npm run check`).
- Every surface above is changed or explicitly ruled out in the pull request.
- The pull request links its issue (`Closes #N`) and explains why the change
  was needed, not only what it does.

## How work flows

- Features go through Spec Kit: `/speckit-specify`, `/speckit-clarify`,
  `/speckit-plan`, `/speckit-tasks`, then `/speckit-implement`. Specs live in
  `specs/NNN-name/`; the constitution is `.specify/memory/constitution.md`.
- `tasks.md` is the source of truth for tasks. Issues on the board mirror it and
  are created only by `/speckit-github-taskstoissues`, as sub-issues of the
  feature's issue, titled `T001: …`, with the task's `surface:*` label. Then
  write `**Issues**: parent #N` in `tasks.md` (`check-tasks.mjs` enforces it).
- **Nobody moves cards.** `board-sync.yml` derives every issue's Status:
  closed → Done, an open PR that closes it → In review, label `in-progress` →
  In progress, label `spec` → Spec, a task of a feature → Ready, else Backlog.
  A task ticked in `tasks.md` on `main` closes its issue. So: label
  `in-progress` when you start, tick the task in the PR that does it, and list
  every task issue it finishes as `Closes #N` (closing the feature issue does
  not close its sub-issues).
- Small fixes can skip the spec: an issue, a branch, a pull request.

## Commits

Commits in this fork are authored by the agent that made them (git's own
`user.name`/`user.email` in the session, e.g. `Claude <noreply@anthropic.com>`),
with a `Claude-Session:` trailer, so the history shows who wrote what. The
fork's CI skips the CLA check. Upstream's CLA bot does match the commit author
to a signature, and an agent's address belongs to no GitHub account: anything
offered to upstream (`saltmd/salt.md`) is re-committed with the owner as author
first (`neatlittlemacapps`,
`60575307+neatlittlemacapps@users.noreply.github.com`).

The subject line is a sentence that says what changed, readable without the
diff ("A board refuses a grouping it cannot make columns from"). The body says
why it was wrong before. Pull requests to upstream (`saltmd/salt.md`) need a
signed CLA and, for anything large, an issue first.
