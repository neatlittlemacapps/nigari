# Implementation Plan: nigari speaks MCP 2026-07-28, and agents gain tasks, confirmations and skills

**Branch**: `claude/hopeful-wozniak-gw9g8v` | **Date**: 2026-11-27 | **Spec**: [spec.md](spec.md) | **Issue**: #1034

**Input**: Feature specification from `/specs/027-mcp-2026-07-28/spec.md`

## Summary

`handleMCP` learns a second era. A request that carries
`_meta["io.modelcontextprotocol/protocolVersion"]` (2026-07-28) is answered
statelessly with the new envelope: `resultType`, cacheable lists,
header checks, new error codes and `server/discover`. `initialize` keeps
the legacy behaviour. Both eras end in the same `mcpCall`, so no gate moves.
Four abilities are built on top:

- **Elicitation**: confirmable acts answer `input_required` with a signed
  request state.
- **Tasks**: `import_url`'s job is stored in a SQLite table and exposed
  through `tasks/get`, `tasks/update` and `tasks/cancel`.
- **Skills**: the agent skill that `GET /api/skill` already generates,
  built-in and per workspace, is served through `skills/list` and
  `skills/get`.
- **OAuth**: Client ID Metadata Documents, `iss` on authorization
  responses, and 403 `insufficient_scope`.

The work ships in five pull requests, one per phase, in that order.

## Technical Context

**Language/Version**: Go (`server/`). The only frontend change is
`OAuthConsent.tsx` (phase 2).

**Primary Dependencies**: none new. JSON-RPC stays hand-written. No MCP SDK
is added, because it would be the first dependency in this path and the
hand-written handler is about 150 lines.

**Storage**: one new table, `mcp_tasks` (phase 4), added by an upgrade step.
OAuth clients from a metadata URL reuse `oauth_clients`, with the URL as the
`id` and a new `metadata_fetched_at` column (phase 2).

**Testing**: Go tests through a new `mcpRequest(t, s, u, era, method,
params)` helper beside `callTool`, so every existing tool test can run in
both eras. The parity test (`TestAgentParityHoldsForEveryCredentialShape`)
gets a second pass per era. A restart test for tasks. No Playwright spec,
except the consent screen in phase 2.

**Target Platform**: unchanged (one binary, `CGO_ENABLED=0`).

**Performance Goals**: the 2026-07-28 era adds no measurable time per call
(SC-006). A benchmark calls `get_page` through both eras.

**Constraints**:
- The legacy era must answer byte for byte as today. Its existing tests
  are the guard.
- Header comparison follows the spec's encoding rule (`=?base64?…?=`).
- Fetches for client metadata go through `safeDial`/`blockedIP`, the same
  guard as `import_url` and webhooks.

**Scale/Scope**: 5 phases. Phase 6 of the epic (resources and
subscriptions, MCP Apps, file uploads) is out of scope (spec Decisions).

## CodeGraph

- `codegraph explore "mcp transport protocolVersion initialize mcpCall mcpTools session"`:
  - `handleMCP` has 3 callers in `server.go`, which are the `/mcp` and
    `/mcp/{token}` routes.
  - `mcpCall` has 9 callers in `mcp.go` and is the only place where
    read-scope, idempotency, `canRead`/`canWrite` and `credentialMayEnter`
    run. So both eras must end there (D2), and no gate may be copied.
  - `isMCPTool` and `mcpTools` are used by `handleMCP` and the read-only
    test. `tools/list` returns one static slice, so its cache scope can be
    public (D4).
- `codegraph explore "import_url get_import_status import job … handleOAuthRegister handleAuthorizationServerMetadata"`:
  - `startIngest` → `ingestRegistry.add` keeps jobs in a map capped at
    `ingestKeepJobs` (20), so a restart loses them. Tasks need a table (D6).
  - `handleOAuthRegister` and `handleAuthorizationServerMetadata` have one
    route each. The metadata has no
    `authorization_response_iss_parameter_supported` or
    `client_id_metadata_document_supported`.
- `codegraph explore "safeHTTPClient public host fetch webhook dial private address startIngest fetch"`:
  - `ingestHTTPClient` → `safeDial` → `blockedIP` is the public-host guard,
    and `TestBlockedIP` and `TestWebhookRefusesInternalAddresses` test it.
  - `ingestHTTPClient` has one caller today. Phase 2 makes it the second
    caller's client too, which is why it moves to a shared helper (D9).
- `codegraph explore "mcpGetWorkspace rules workspace templates list kind templates mcpList"`
  and the source of `server/skill.go`:
  - `buildSkill(u, base, chosen)` already generates the agent skill
    (SKILL.md and its files) from what the caller may see: workspaces
    narrowed by `credentialMayEnter`, with their rules. `GET /api/skill`
    serves it as a zip.
  - Skills over MCP serve the same documents, so both doors call one
    function (D8). This is the main thing the graph changed in the plan: the
    spec assumed new playbook files.
- `codegraph explore "mcpSetSharing set_trashed recursive delete_view mcpWorkspace from_workspace"`:
  the confirmable acts are branches of `mcpCall`'s `run` switch
  (`set_trashed`, `set_sharing`, `delete_view`, `workspace` with
  `from_workspace`). The confirmation check goes in front of those branches,
  after the gates (D7).
- Source read after the graph: `capabilities.json` lists `/mcp` and
  `/mcp/{token}` under `infrastructure.transport`. Protocol methods are not
  tools, so `check-parity.mjs` is not affected, and `mcpTools` does not grow.
- After implementing, per `.claude/rules/codegraph.md`: run `codegraph
  callers` on `mcpCall` (still the only gate path), on the new era
  dispatcher and on `buildSkill` (2 callers: REST and MCP).

## Design decisions

- **D1. Era per request, chosen in one function.** `mcpEra(r, req)` returns
  `legacy` or `v20260728`:
  - `initialize` means legacy.
  - `_meta` carrying the protocol version means modern.
  - Neither means legacy, so the clients that skip `initialize` today keep
    working.
  - An unknown modern version gets -32022 with `data.supported`.

  The two answer writers are `rpcResult` (legacy, unchanged) and
  `rpcResultV2`, which adds `resultType` and puts `serverInfo` in `_meta`.
  *Turned down*: a `/mcp2` endpoint, because every existing connector would
  need editing.
- **D2. Both eras call `mcpCall` unchanged.** The modern path only parses a
  different envelope and writes a different one. Tool errors stay `isError`
  results in both eras. *Turned down*: a per-era tool dispatcher, the
  one-door check history that constitution III forbids.
- **D3. Header checks come before auth is spent on the body.** For a modern
  request, `MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name` are decoded
  and compared with the body right after parsing. A mismatch gets HTTP 400
  with -32020, and no tool runs. Legacy requests are not checked, because
  their clients do not send these headers.
- **D4. Cache hints.**
  - `tools/list` and `server/discover`: `cacheScope: "public"`, `ttlMs`
    3,600,000. The list is the same for every credential, and a read token
    is refused per call.
  - `skills/list` and `skills/get`: `"private"`, 300,000. They depend on
    the credential (D8).
  - The tool list order is the slice order, which is already fixed.
- **D5. `server/discover` replaces what `initialize` carries.** Its answer
  holds the supported versions, capabilities (`tools`, `resources`, and
  `extensions` for `io.modelcontextprotocol/tasks` and
  `io.modelcontextprotocol/skills`), `serverInfo` with icons, and the
  workspace-rules instructions. One function builds the parts both answers
  share, so the instructions text exists once.
- **D6. Tasks live in `mcp_tasks`.** Columns: id, user_id, token_kind,
  token_workspaces, kind (`import`), status, result JSON, error,
  created_at, expires_at. It has an index on `(user_id, id)`.
  - The ingest runner writes progress to the row instead of to
    `ingestRegistry`. `get_import_status` reads the row, so legacy and
    modern see one truth.
  - At start, rows still `working` become `failed` with "interrupted by a
    restart".
  - Expiry is 24 hours after the task ends. Expired rows are deleted in
    the start-up housekeeping pass, beside `deleteExpiredSessions`, and
    whenever a new task is created. There is no daily loop to reuse.
  - Ownership compares all three credential fields, the same key that the
    idempotency cache uses (see `mcpCall`).

  *Turned down*: keeping the map and adding persistence on the side, which
  would leave two sources for one job.
- **D7. Confirmation is a gate in front of four acts, and only for clients
  that can ask.** If the client declared elicitation in its capabilities and
  the call is `set_trashed` with `recursive` and `trashed: true`,
  `set_sharing` making a page public or creating a link, `delete_view`, or
  `workspace` with `from_workspace`, then the first call returns
  `input_required` with one yes/no question.
  - The question names the act and its reach (title, number of sub-pages).
    The title is inside `wrapUntrusted`.
  - Its `requestState` is an HMAC over credential id, tool, arguments hash
    and expiry (10 minutes). It is signed with a random key that the
    server makes at start and keeps only in memory. nigari has no instance
    secret to reuse (`publicGrantMAC` signs with a share's password hash),
    and a restart only means that a pending question is asked again.
  - The retry carries `inputResponses` and the state, and runs every gate
    again (FR-009).
  - Without the elicitation capability nothing changes (owner,
    2026-11-27).
- **D8. Skills come from `buildSkill`, the generator `GET /api/skill`
  already uses.**
  - `skills/list` returns `nigari`, the built-in playbook, and one
    `nigari-<workspace-slug>` per workspace the credential may enter that
    has rules or database templates.
  - Each workspace skill holds the rules (through `wrapWorkspaceRules`) and
    a listing of its templates (through `wrapUntrusted`).
  - Files are served as `skill://<name>/<file>` through `resources/read`,
    with `sha256:` digests computed from the generated bytes.
  - `skillMain` is reworded so it reads correctly in both the zip and MCP,
    and the workspace part moves into the per-workspace skill.

  *Turned down*: new static playbook files, which would duplicate
  `skill.go`'s text and lose its per-instance facts.
- **D9. Client ID Metadata Documents use the import fetch guard.**
  - A `client_id` that is an `https://` URL is fetched with the shared
    guarded client (from `ingestHTTPClient`, moved to `safe_fetch.go`),
    with a 5-second limit and a 64 KB limit.
  - The document must have `client_id` equal to the URL, `client_name`,
    and `redirect_uris` that pass `validRedirectURI`.
  - It is stored in `oauth_clients` with the URL as id and refreshed when
    more than 24 hours old.
  - The consent screen shows the name and "from <host>".
  - The metadata adds `client_id_metadata_document_supported: true` and
    `authorization_response_iss_parameter_supported: true`. Every redirect
    from `/oauth/authorize`, errors included, carries `iss`.
- **D10. 403 for scope, over HTTP only.** A read token calling a write tool
  under the modern era gets HTTP 403 with `WWW-Authenticate: Bearer
  error="insufficient_scope", scope="write"`. The legacy era keeps today's
  `isError` result, because legacy clients do not expect a 403 mid-session.
  The check uses the same `mutating` decision as `mcpCall` and is not a
  second copy: `mcpCall` returns a typed error that the writer maps.

## Constitution Check

- I. One binary, no external services ✅: SQLite table, no dependency.
- II. Agent parity ✅: no capability moves. A person sees confirmations as
  dialogs in the UI already. Agents get them through the client.
- III. Gates are one function ✅: both eras call `mcpCall` (D2). The scope
  403 is mapped from `mcpCall`'s own error (D10). Skills use `buildSkill`
  for both doors (D8). Every gate gets a refusal test in both eras.
- IV. Derive from code ✅: a check that each protocol method `handleMCP`
  answers is named in `wiki/mcp-tools.md`'s protocol section (extending
  `check-wiki.mjs`).
- V. English source ✅: confirmation questions are English server text.
  Agents read them in English, as they read tool descriptions today. The
  consent screen's new strings go through `t()`.
- VI. Every surface, every time ✅: table below.
- VII. Measured, not assumed ✅: benchmark for both eras (SC-006).
  `EXPLAIN QUERY PLAN` for `mcp_tasks` lookups.

## Surfaces

| Surface | Changes | Owner |
|---------|---------|-------|
| Domain logic and gates (`canRead`/`canWrite`, `credentialMayEnter`, validation, `audit`, `fireWebhook`) | No gate changes. The confirmation gate (D7) sits after them. Task ownership compares the credential key (D6). Workspace skills are filtered by `credentialMayEnter` as `buildSkill` already does. `audit` logs a confirmed act like the direct call, and logs `mcp.declined` when the person says no. | backend |
| Schema and queries (`server/db.go`, indexes, `ensureColumn`) | `mcp_tasks` with an index on `(user_id, id)` and on `status` for the start-up sweep. `oauth_clients.metadata_fetched_at`. Task writes go on the writer (`s.db`). | backend |
| REST routes (`server/server.go`, middleware) | No new route. `GET /.well-known/oauth-authorization-server` gains two fields. `GET /oauth/authorize` accepts metadata-URL client ids and adds `iss`. | backend |
| MCP tools (`server/mcp*.go`, descriptions, `wrapUntrusted`, read-scope refusal) | No new tool. New protocol methods: `server/discover`, `tasks/get`, `tasks/update`, `tasks/cancel`, `skills/list`, `skills/get`, `resources/read` (skill files only). `import_url`'s description mentions tasks. Question titles and skill content are wrapped (D7, D8). | mcp |
| Closed-to-agents list (`not_available_via_mcp`) | No change: no capability moves across the line. | mcp |
| UI components (`web/src/…`, light + dark, keyboard) | `OAuthConsent.tsx` shows a metadata-URL client's host under its name (D9), in light and dark. No other UI. | ui |
| Translations (`t()`, `de.json` and `nl.json` required, `es.json`) | "from {host}" on the consent screen in de/es/nl. | i18n |
| Server error codes (`web/src/serverErrors.ts`) | No change: the new codes are JSON-RPC codes read by clients, not by nigari's UI. | i18n |
| Wiki (`wiki/*.md`, `mcp-tools.md`, stale screenshots) | `wiki/mcp-tools.md`: a protocol section (eras, discover, tasks, confirmations, skills). `wiki/agent-access.md`: confirmations. The connect pages: metadata-URL clients. Retake the consent screenshot. `docs/what-it-does.md`: the agent abilities. | wiki |
| Tests (Go incl. refusal paths, Playwright spec, check scripts) | `mcpRequest` helper for both eras. The parity test in both eras. Header mismatch, unsupported version, read-scope 403 and legacy unchanged. Confirm, decline, forged state and stale state for each confirmable act. Task: owner only, cancel, restart. Skills: closed workspace absent, digest changes. CIMD: private address, mismatched `client_id`, unlisted redirect. `credential_audit_test.go` gets the new methods. | test |
| Performance (query plans, payload size, per-request work) | One header decode and one `_meta` parse per modern request. Benchmark in both eras (SC-006). `skills/get` generates only on request, and the client caches it privately. | perf |
| Manifest (`capabilities.json`, `gapBudget`, parity acts) | No change: protocol methods sit under `infrastructure.transport` (`/mcp`), and no tool or route is added. The `infrastructure.transport` summary names "MCP protocol methods (discover, tasks, skills)". | mcp |
| Design system (`web/src/ui/`, tokens, `check-tokens.mjs` budgets, catalogue) | The consent screen's host line uses existing `ui/` text styles and tokens. No new component. | ui |
| Storage budgets (benchmarks on the seeded workspace, p95 budgets, read time limit) | A task lookup by primary key is not a hot path over pages. It is benchmarked once with `EXPLAIN QUERY PLAN`. No page query changes. | perf |
| Page containers | No change: no page-level control. | ui |
| Aggregation | No change: no property type. | backend |
| Stored data | A new upgrade step creates `mcp_tasks` and adds `oauth_clients.metadata_fetched_at`, with a fixture `step-<N-1>.db` written first. Expand only. | backend |
| Outside names | No change: nothing is renamed. The new inbound headers and `skill://` URIs are names defined by the specification, not renames. | backend |
| Menu icons | No change: no menu. | ui |
| View lock | `delete_view` keeps calling `checkViewsUnlocked`. The confirmation comes before it, and a locked view is refused before anyone is asked. | backend |
| Cross-origin requests | No change: `/mcp` already carries its own credential, and no new GET streams data (`subscriptions/listen` is out of scope). | backend |
| Embedded views | `delete_view` with `embed_id` is confirmable like a database view, with the same question. | backend |
| Content actions | No change: no menu action. | ui |

**New concepts**: **Protocol era** joins the registry as a surface. A
later change to an MCP answer works in both eras, or says why one is left
out, and its test uses `mcpRequest` for both. This is added to
`.specify/memory/surfaces.md` in phase 1's pull request.

**Parity statement**: Every MCP tool works in both eras with the same
checks. A person has no counterpart to tasks, because imports in the UI
already run in the background. A person's confirmations are the UI's
existing dialogs.

## Project Structure

### Documentation (this feature)

```text
specs/027-mcp-2026-07-28/
├── spec.md
├── plan.md        # this file
├── checklists/requirements.md
└── tasks.md       # /speckit-tasks
```

No `research.md` (the research is in #1034, and the decisions are D1–D10
above), `data-model.md` (the one table is described in D6), `contracts/`
(the wire format is the published specification, linked from #1034, and
nigari adds no format of its own) or `quickstart.md` (it would repeat the
tasks).

### Source Code

**Files touched**:
- `server/mcp.go`: era dispatch, envelopes and discover, plus a new
  `server/mcp_protocol.go` for the header and era helpers.
- `server/mcp_tasks.go` (new), `server/ingest.go` and `server/upgrade_steps.go`.
- `server/mcp_elicit.go` (new).
- `server/skill.go` and `server/mcp_skills.go` (new).
- `server/oauth_provider.go` and `server/safe_fetch.go` (moved out of
  `ingest.go`).
- `web/src/components/OAuthConsent.tsx` and `web/src/locales/*.json`.
- Tests beside each.
- `wiki/mcp-tools.md`, `wiki/agent-access.md`, `capabilities.json` (summary
  only), `.specify/memory/surfaces.md` and `docs/decisions.md`.

**Order**: phase 1 (core) → 2 (OAuth) → 3 (confirmations) → 4 (tasks) → 5
(skills). Phases 2 to 5 depend only on phase 1, so after phase 1 they can run
as two streams (`steward`: at most two streams, in separate files).

## Complexity Tracking

None.
