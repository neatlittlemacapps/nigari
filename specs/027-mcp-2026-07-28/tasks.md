---
description: "Tasks for serving MCP 2026-07-28 beside the legacy era, with confirmations, tasks, skills and OAuth hardening, in five pull requests"
---

# Tasks: nigari speaks MCP 2026-07-28, and agents gain tasks, confirmations and skills

**Input**: `specs/027-mcp-2026-07-28/` (spec.md, plan.md). The research is in #1034.

**Tests**: required. Go tests for every gate's refusal path in both eras,
through the new `mcpRequest` helper. Each is mutation-checked: it fails with
its fix taken out.

**Issues**: parent #1034; tasks T001–T034 are #1035–#1068

**Delivery**: five pull requests, one per phase below, in order. Phase A
comes first. B to E depend only on A and may run as two streams
(`.claude/skills/steward/SKILL.md`).

## Format: `[ID] [P?] [Story] [surface] Description`

## Phase A: Protocol core, both eras (US1, P1) 🎯 MVP

- [x] T001 [US1] [test] `server/mcp_protocol_test.go` (new): the `mcpRequest(t, s, u, era, method, params)` helper beside `callTool`. It builds a legacy or a 2026-07-28 request, headers included, and runs it through `handleMCP`
- [x] T002 [US1] [mcp] `server/mcp_protocol.go` (new): `mcpEra(r, req)` per D1 (`initialize` or nothing means legacy, `_meta` version means modern, an unknown version gets -32022 with `data.supported`), header decoding with `=?base64?…?=`, and the -32020 header-mismatch check per D3
- [x] T003 [US1] [mcp] `server/mcp.go` `handleMCP`: dispatch by era. The modern writer adds `resultType` and `_meta` `serverInfo`. `ping` and `logging/setLevel` are legacy only (FR-006). Tool errors stay `isError` results, and both eras call `mcpCall` unchanged (D2)
- [x] T004 [US1] [mcp] `server/mcp.go`: `server/discover` (D5). One builder supplies `serverInfo` with icons, the capabilities and the instructions to both `initialize` and `server/discover`. `tools/list` and `server/discover` carry `ttlMs` and `cacheScope` (D4)
- [x] T005 [P] [US1] [test] Go: header mismatch on method, name and version; an unsupported version; a modern read token refused for a write tool; an idempotency key reused across eras; legacy answers unchanged byte for byte (golden answers for `initialize`, `tools/list` and one `tools/call`)
- [x] T006 [P] [US1] [test] `server/parity_property_test.go`: `TestAgentParityHoldsForEveryCredentialShape` runs its acts in both eras. `server/credential_audit_test.go` sends its outsider shapes in both eras
- [x] T007 [P] [US1] [perf] Benchmark `get_page` in both eras on the seeded workspace (`server/bench_world_test.go`). Record the numbers in the pull request (SC-006)
- [x] T008 [P] [US1] [wiki] `wiki/mcp-tools.md`: a protocol section (both eras, `server/discover`, cache hints, errors). `check-wiki.mjs` checks that each method `handleMCP` answers is named there (constitution IV)
- [x] T009 [US1] [backend] `.specify/memory/surfaces.md`: add the **Protocol era** surface (plan, New concepts). `capabilities.json` `infrastructure.transport` summary names the protocol methods. `docs/decisions.md`: an entry for serving both eras on one endpoint, with the options turned down

## Phase B: Authorization hardening (US5, P3)

- [x] T010 [US5] [backend] `server/safe_fetch.go` (new): move `ingestHTTPClient`, `safeDial` and `blockedIP`'s use out of `ingest.go` into one guarded client with per-call time and size limits. `import_url` and webhooks keep their behaviour (D9)
- [x] T011 [US5] [backend] Upgrade step in `server/upgrade_steps.go`: `oauth_clients.metadata_fetched_at`, with the fixture `server/testdata/upgrade/step-<N-1>.db` written first
- [x] T012 [US5] [backend] `server/oauth_provider.go`: a `client_id` that is an `https://` URL is fetched through the guarded client (5 s, 64 KB). The document's `client_id` must equal the URL and its `redirect_uris` must pass `validRedirectURI`. It is stored in `oauth_clients` and refreshed after 24 h. The metadata advertises `client_id_metadata_document_supported` (FR-018, FR-022)
- [x] T013 [US5] [backend] `server/oauth_provider.go`: every redirect from `/oauth/authorize`, errors included, carries `iss`. The metadata advertises `authorization_response_iss_parameter_supported` (FR-020)
- [x] T014 [US5] [mcp] `server/mcp.go`: a read token calling a write tool under the modern era gets HTTP 403 `insufficient_scope`, `scope="write"`, mapped from `mcpCall`'s typed error. The legacy era is unchanged (D10, FR-021)
- [x] T015 [P] [US5] [ui] `web/src/components/OAuthConsent.tsx`: a metadata-URL client shows its name and "from {host}", in light and dark, with existing `ui/` styles (FR-019)
- [x] T016 [P] [US5] [i18n] "from {host}" in `web/src/locales/de.json`, `es.json` and `nl.json`
- [x] T017 [P] [US5] [test] Go: a metadata URL on a private address, a mismatched `client_id`, an unlisted redirect, a slow or oversized document, `iss` on success and error redirects, DCR still works, and the 403 in the modern era only
- [x] T018 [P] [US5] [wiki] The connect pages describe metadata-URL clients. Retake the consent screenshot with `web/scripts/shoot-wiki.mjs`

## Phase C: Confirmations through elicitation (US2, P2)

- [x] T019 [US2] [mcp] `server/mcp_elicit.go` (new): `requestState` signed with HMAC over credential id, tool, arguments hash and expiry (10 min), using a random key made at start and kept in memory. Verification rejects a forged, stale or reused state (D7, FR-009)
- [x] T020 [US2] [mcp] `server/mcp.go`: for a modern client that declared elicitation, `set_trashed` (recursive, trashing), `set_sharing` (public or link), `delete_view` (database or embed) and `workspace` with `from_workspace` answer `input_required` with one yes/no question. The question names the title (inside `wrapUntrusted`) and the reach. It is asked after every gate, and after `checkViewsUnlocked` for views. A client that cannot ask gets today's behaviour (FR-007, FR-008, FR-010)
- [x] T021 [US2] [backend] `audit`: a confirmed act is logged as the direct call is. A declined one is logged as `mcp.declined`, with the tool name
- [x] T022 [P] [US2] [test] Go, for each of the four acts: confirm runs it, decline changes nothing, a forged state and a state for other arguments are refused, a page trashed or a permission lost between ask and retry is refused, a locked view is refused before anyone is asked, and a client without elicitation runs as today
- [x] T023 [P] [US2] [wiki] `wiki/mcp-tools.md` (the confirmable acts) and `wiki/agent-access.md` (what a person is asked)

## Phase D: Tasks (US3, P2)

- [ ] T024 [US3] [backend] Upgrade step: the `mcp_tasks` table (D6) with indexes on `(user_id, id)` and `status`, fixture first. `EXPLAIN QUERY PLAN` for the lookups, recorded in the pull request
- [ ] T025 [US3] [backend] `server/ingest.go`: the runner writes progress to the task row instead of `ingestRegistry`, and `get_import_status` reads the row. The start-up pass marks rows still `working` as `failed` ("interrupted by a restart") and deletes expired rows, beside `deleteExpiredSessions` (FR-013)
- [ ] T026 [US3] [mcp] `server/mcp_tasks.go` (new): for a client that declared `io.modelcontextprotocol/tasks`, `import_url` returns `resultType: "task"` with `taskId`, status, `ttlMs` and `pollIntervalMs`, after the row is stored. Adds `tasks/get`, `tasks/update` (acknowledged; imports take no input) and `tasks/cancel`, which stops at the next record. Ownership compares user, token kind and token workspaces (FR-011, FR-012, FR-014)
- [ ] T027 [P] [US3] [test] Go: another person's and a narrower token's `tasks/get` and `tasks/cancel` get "not found"; cancel keeps the records already written; the restart test (SC-004); a client without the extension gets `job_id`; a revoked token's running import stops
- [ ] T028 [P] [US3] [wiki] `wiki/mcp-tools.md`: `import_url` as a task, and `get_import_status` for older clients

## Phase E: Skills over MCP (US4, P3)

- [ ] T029 [US4] [backend] `server/skill.go`: split `buildSkill` into the built-in `nigari` skill and one skill per workspace the credential may enter that has rules or database templates. Rules go through `wrapWorkspaceRules` and template listings through `wrapUntrusted`. `GET /api/skill` keeps serving the same content as a zip (D8)
- [ ] T030 [US4] [mcp] `server/mcp_skills.go` (new): for a client that declared `io.modelcontextprotocol/skills`, `skills/list`, `skills/get`, and `resources/read` for `skill://<name>/<file>`, with `sha256:` digests and `cacheScope: "private"`. An unknown skill or file gets -32602 (FR-015, FR-017)
- [ ] T031 [US4] [test] `web/scripts/check-skill.mjs` (new) or a Go test: every tool name in the built-in skill text exists in `mcpTools` (FR-016)
- [ ] T032 [P] [US4] [test] Go: a workspace closed to agents and one outside a token's scope are neither listed nor readable; a rules change changes the digest; the zip and MCP serve the same text
- [ ] T033 [P] [US4] [perf] Measure the initial instructions and descriptions before and after moving how-to text into the skill, and record it in the pull request (SC-005)
- [ ] T034 [P] [US4] [wiki] `wiki/mcp-tools.md`: skills. The page describing `GET /api/skill` names both ways to get the skill
