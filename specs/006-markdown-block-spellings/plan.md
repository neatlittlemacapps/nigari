# Implementation Plan: Every block an agent can see in Markdown, it can also write

**Branch**: `claude/vigilant-babbage-bvoiel` | **Date**: 2026-10-27 | **Spec**: [spec.md](spec.md) | **Issue**: #160

**Input**: Feature specification from `/specs/006-markdown-block-spellings/spec.md`

## Summary

The two Markdown converters, `mdToBlocks` (`server/mdimport.go`, used by
`write_content`, `create_page` and the importer) and `renderBlocksMarked`
(`server/export.go`, used by the export, `get_page` and find-and-replace edits),
learn one spelling per block that has none today: callout, toggle, divider,
table of contents, sub-pages, bookmark and columns (contracts/spellings.md).
The parser handles the multi-line ones as containers (research R2), the renderer
writes exactly what the parser reads, and a round-trip test holds the two to
each other (R4). Because find-and-replace edits accept only blocks that survive
the round trip, the new blocks become editable without touching that rule
beyond its prop list (R5).

## Technical Context

**Language/Version**: Go 1.27 (server, one package `server/`); no frontend code change

**Primary Dependencies**: Go standard library. New dependencies: none (no Markdown library; the converters stay hand-written, see R1)

**Storage**: No change. Blocks keep their stored shape; only their Markdown changes

**Testing**: `go test ./...`: table tests per spelling, a round-trip test over a page with every block type, the existing `mdimport`/`export`/`cap_edits` tests unchanged; `BenchmarkMarkdownLargePage`

**Target Platform**: One static binary (`CGO_ENABLED=0`)

**Performance Goals**: a 5,000-block page converts within 10% of today's time both ways (SC-004)

**Constraints**: Markdown without the new spellings converts byte for byte as today (FR-005). Code fences stay literal (FR-004)

**Scale/Scope**: seven spellings; toggle headings and the embedded collection are out of scope (spec)

## Constitution Check

- I. One binary, no external services: ✅ no dependency
- II. Agent parity: ✅ this IS a parity fix. Agents gain six block types a person has
- III. Gates are one function: ✅ one parser and one renderer serve every door; no gate changes
- IV. Derive from code: ✅ the round-trip test derives the renderer's output from the parser and back; `check-wiki.mjs` keeps the tool text honest
- V. English source: ✅ no UI strings; tool descriptions English
- VI. Every surface, every time: ✅ table below
- VII. Measured, not assumed: ✅ benchmark before and after (SC-004)

Re-checked after Phase 1 design: unchanged.

## Surfaces

| Surface | Changes | Owner |
|---------|---------|-------|
| Domain logic and gates (`canRead`/`canWrite`, `credentialMayEnter`, validation, `audit`, `fireWebhook`) | `mdToBlocks`: a pre-pass for containers (`<details>`, `:::`) and single-line tokens; callout alerts; dividers; bookmarks. `renderBlocksMarked`: the matching spellings. `notEditable` (`cap_edits.go`): `toc`/`subpages` leave the hard-refused list; `emoji`, `count`, `widths` join `editableProps`. No gate is touched: every door already writes through these functions after its own checks | backend |
| Schema and queries (`server/db.go`, indexes, `ensureColumn`) | No change: no query | backend |
| REST routes (`server/server.go`, middleware) | No new route. Import (`/api/import/*`) and export (`/api/pages/{id}/export`) gain the spellings through the converters | backend |
| MCP tools (`server/mcp*.go`, descriptions, `wrapUntrusted`, read-scope refusal) | `write_content`, `create_page`, `get_page` descriptions list the spellings (one shared constant, beside `diagramHint`). `get_page` output already goes through `wrapUntrusted` and keeps doing so | mcp |
| Closed-to-agents list (`not_available_via_mcp`) | No change | mcp |
| UI components (`web/src/…`, light + dark, keyboard) | No change: the editor already has every block; this changes only how they travel as Markdown | ui |
| Translations (`t()`, `de.json` required, `es.json`) | No change: no new UI string | i18n |
| Server error codes (`web/src/serverErrors.ts`) | No change: the parser never refuses, it falls back to paragraphs | i18n |
| Wiki (`wiki/*.md`, `mcp-tools.md`, stale screenshots) | `wiki/editor-blocks.md`: export table, "And back again" (losses removed), a short "Writing blocks as Markdown" list; `wiki/mcp-tools.md` § write_content; `docs/what-it-does.md` one line. Screenshots: `agents-connect` shows `server/mcp.go` and will be retaken by the script | wiki |
| Tests (Go incl. refusal paths, Playwright spec, check scripts) | `server/md_spellings_test.go`: per-spelling import table (each edge case of the spec), per-block export table, the round trip over every block type (SC-002), `get_page` → `write_content` replace leaves blocks unchanged (SC-003), a find-and-replace edit inside a callout and beside columns (FR-006). Existing converter tests run unchanged (FR-005). No Playwright spec: no interface change | test |
| Performance (query plans, payload size, per-request work) | Linear in the text, one extra pass for containers; `BenchmarkMarkdownLargePage` both ways, before and after, in the PR | perf |
| Manifest (`capabilities.json`, `gapBudget`, `parity_property_test.go`) | No route or tool added; no gap changes; no parity act (no new capability, a better existing one) | mcp |
| Design system (`web/src/ui/`, tokens, `check-tokens.mjs` budgets) | No change: no UI | ui |
| Storage budgets (`bench_world_test.go`, p95 in spec 002 research) | Not a hot path of spec 002; `BenchmarkMarkdownLargePage` recorded in the PR | perf |

**Parity statement**: agents gain, over `write_content` / `create_page`, the six blocks a
person inserts from the slash menu, and read them back in `get_page` in the same spelling.

**Manifest**: unchanged; no new gap; `gapBudget` stays 10.

## Project Structure

### Documentation (this feature)

```text
specs/006-markdown-block-spellings/
├── spec.md, plan.md, research.md, quickstart.md
├── contracts/spellings.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
server/
├── mdimport.go          # mdToBlocks: containers, alerts, dividers, tokens, bookmarks
├── md_spellings.go      # new: the spelling tables (alert ↔ emoji, tokens) and the container pre-pass
├── export.go            # renderBlocksMarked: the matching spellings
├── cap_edits.go         # notEditable / editableProps
├── mcp.go               # blockSpellingHint in three tool descriptions
└── md_spellings_test.go # new
wiki/editor-blocks.md, wiki/mcp-tools.md, docs/what-it-does.md
```

**Structure Decision**: one new file for what both directions share (the tables
and the container scanner), so the parser and the renderer cannot each grow
their own idea of a spelling.

## Complexity Tracking

None.
