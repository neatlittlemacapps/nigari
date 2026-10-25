# Implementation Plan: Edit page content by find-and-replace

**Branch**: `003-find-replace-edits` | **Date**: 2026-10-25 | **Spec**: [spec.md](spec.md) | **Issue**: #13

**Input**: Feature specification from `/specs/003-find-replace-edits/spec.md`

## Summary

An agent or script changes one passage of a page by quoting it as `get_page` shows it and
giving the replacement. The server renders the body to Markdown with per-block spans,
finds the quote (exactly once, or all when asked), converts only the touched blocks back,
and keeps every other block byte for byte (research R1–R3). One shared function serves
REST (`POST /api/pages/{id}/edits`) and MCP (`write_content` mode `edit`). Open editors
reload as with every outside write (FR-008, decision C); live delivery is a follow-up.

## Technical Context

**Language/Version**: Go 1.27 (server, one package `server/`), TypeScript 5.6 + React 18 (`web/src/`)

**Primary Dependencies**: Go standard library + pure-Go SQLite; Mantine, BlockNote, Yjs in the frontend. New dependencies: none

**Storage**: One SQLite file, one connection (`SetMaxOpenConns(1)`), schema in `server/db.go`. Schema change: none

**Testing**: `go test ./...` (`testServer`, `callTool`, scope fixtures), `npm run check` (tsc + check scripts), Playwright in `web/tests/`

**Target Platform**: One static binary (`CGO_ENABLED=0`), Linux/macOS/Windows; browser, desktop shell, MCP clients

**Performance Goals**: one edit on a 5,000-block page under 50 ms server time (Go benchmark); no added query per block; request payload for a one-sentence fix under 1% of a full rewrite (SC-003)

**Constraints**: No external services. English source strings as translation keys. Agent parity except the closed list in `server/mcp_workspace.go`.

**Scale/Scope**: pages up to the existing content size limit; up to 100 edits per request

## Constitution Check

- I. One binary, no external services — ✅ no dependency, no schema change
- II. Agent parity — ✅ MCP and REST in the same change; extends `pages.update`
- III. Gates are one function — ✅ `editPageContent` shared; gates are the existing write gates
- IV. Derive from code — ✅ `check-parity.mjs` covers the new route; `check-wiki.mjs` the tool text
- V. English source — ✅ no UI strings; error sentences English
- VI. Every surface, every time — ✅ table below
- VII. Measured, not assumed — ✅ benchmark `BenchmarkEditLargePage`; no new query

Re-checked after Phase 1 design: unchanged.

## Surfaces

| Surface | Changes | Owner |
|---------|---------|-------|
| Domain logic and gates (`canRead`/`canWrite`, `credentialMayEnter`, validation, `audit`, `fireWebhook`) | New `server/cap_edits.go`: `editPageContent`, span renderer beside `renderBlocks` (`export.go`), removal check via `extractLinks` + `database` blocks, forced snapshot (`history.go`), generation-guarded UPDATE with `bumpDocGen`, then `resetYjsDoc`, `reindexPage`, `pagesChanged`, `fireWebhook("page.updated")`. Gates: existing `canWriteReq` / `mcpCall` write gates; trash refused | backend |
| Schema and queries (`server/db.go`, indexes, `ensureColumn`) | No change: reads and writes one `pages` row by primary key | backend |
| REST routes (`server/server.go`, middleware) | `POST /api/pages/{id}/edits` → `handleEditPage`, behind `auth`; audit `human` for sessions, `agent` for tokens | backend |
| MCP tools (`server/mcp*.go`, descriptions, `wrapUntrusted`, read-scope refusal) | `write_content`: `mode: "edit"`, `edits`, `allow_removals` in schema and description; `mcpWriteContent` calls `editPageContent`. Answers carry counts only, no page text, so no `wrapUntrusted` needed; refusal messages never echo the quote back beyond 80 characters | mcp |
| Closed-to-agents list (`not_available_via_mcp`) | No change: open to agents | mcp |
| UI components (`web/src/…`, light + dark, keyboard) | No change: a person's find-and-replace is out of scope; the editor's reload on `4001` already exists (`docgen.go`) | ui |
| Translations (`t()`, `de.json` required, `es.json`) | No change: no new UI string | i18n |
| Server error codes (`web/src/serverErrors.ts`) | No change: the browser never calls this route; codes reach scripts and agents only. Revisit if a UI caller appears | i18n |
| Wiki (`wiki/*.md`, `mcp-tools.md`, stale screenshots) | `wiki/mcp-tools.md` § write_content (mode `edit`, refusals); `wiki/api.md` the new route; no screenshot changes | wiki |
| Tests (Go incl. refusal paths, Playwright spec, check scripts) | `server/cap_edits_test.go`: US1 (one, several, atomic, history, attribution, untouched blocks byte-identical, block id kept), US2 (0, 2, all, removals, unsupported block, stale, empty, too many), gates (trash, read scope, outsider, private page). `credential_audit_test.go`: the new route and mode. `parity_property_test.go`: act `edit`. `BenchmarkEditLargePage`. Playwright `web/tests/find-replace-reload.mjs` (US3 scenario 1) | test |
| Performance (query plans, payload size, per-request work) | One SELECT + one UPDATE by primary key; rendering is linear in page size, measured by the benchmark; no per-block query | perf |

**Parity statement**: Agents can do this over MCP via `write_content` (mode `edit`), with
the same checks as `POST /api/pages/{id}/edits`; both call `editPageContent`.

**Manifest**: `capabilities.json` → `pages.update.rest` gains `POST /api/pages/{id}/edits`.
No new gap; `gapBudget` stays 11.

## Project Structure

### Documentation (this feature)

```text
specs/003-find-replace-edits/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/rest.md, contracts/mcp.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

**Files touched**: `server/cap_edits.go` (new), `server/cap_edits_test.go` (new),
`server/export.go` (span renderer), `server/history.go` (forced snapshot),
`server/server.go` (route — already unformatted at HEAD, no gofmt), `server/mcp.go`
(schema, description), `server/mcp_merged.go` (`mcpWriteContent`),
`server/credential_audit_test.go`, `server/parity_property_test.go`, `capabilities.json`,
`wiki/mcp-tools.md`, `wiki/api.md`, `web/tests/find-replace-reload.mjs` (new).

## Complexity Tracking

None.
