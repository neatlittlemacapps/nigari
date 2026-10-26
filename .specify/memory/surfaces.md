# Surfaces

The places a feature can touch. Every plan's Surfaces table has one row per entry here
(constitution VI). Each row says what changes, or says why nothing does.
`web/scripts/check-surfaces.mjs` enforces this for every plan dated on or after an
entry's *Since* date.

**This list grows.** When a feature introduces a concept that later features must
respect, its plan adds the concept here in the same pull request. Examples of such
concepts: a design system, a latency budget, a new kind of credential, an event bus. The
new row says what a later feature has to check against the concept. From then on every
new plan answers it.

A surface is something every feature must answer for, not an area of the code. If a
concept only matters to one feature, it stays in that feature's plan.

| Surface | What a feature checks | Tag | Since | Introduced by |
| --- | --- | --- | --- | --- |
| Domain logic and gates | Permission (`canRead`/`canWrite`), workspace gate (`credentialMayEnter`), validation, `audit(...)`, `fireWebhook(...)`, in one function both doors call | backend | 2026-10-25 | constitution I–III |
| Schema and queries | `server/db.go` schema constant, `ensureColumn`, an index for every new filter or join, no query inside an open cursor | backend | 2026-10-25 | constitution VII |
| REST routes | Route in `server/server.go` behind the right middleware (`auth`, `sessionOnly`) | backend | 2026-10-25 | AGENTS.md |
| MCP tools | Same checks as REST in the tool's own path, `wrapUntrusted` on returned content, read scope may not mutate, description says when to use it and what it refuses | mcp | 2026-10-25 | constitution II |
| Closed-to-agents list | `not_available_via_mcp` in `server/mcp_workspace.go` and `wiki/agent-access.md` move together | mcp | 2026-10-25 | constitution II |
| UI components | The screen, light and dark, keyboard path | ui | 2026-10-25 | AGENTS.md |
| Translations | Every new string through `t()`, German in `de.json` | i18n | 2026-10-25 | constitution V |
| Server error codes | A new user-facing error code has an entry in `web/src/serverErrors.ts` | i18n | 2026-10-25 | `.claude/rules/go-server.md` |
| Wiki | The page describing the screen or tool, `mcp-tools.md` for tools, screenshots the change makes stale, `docs/what-it-does.md` when a capability changes | wiki | 2026-10-25 | constitution IV |
| Tests | Go tests for logic and the refusal path of every gate (MCP through `callTool`), a Playwright spec for interaction | test | 2026-10-25 | constitution III |
| Performance | Query plans, payload size, per-request work; nothing scans every page per request | perf | 2026-10-25 | constitution VII |
| Manifest | `capabilities.json` names every new route and tool; a new gap is named and `gapBudget` raised in the same PR; a new capability gets a pair of acts in `parity_property_test.go` | mcp | 2026-10-26 | parity manifest (`8e8a21c`) |
| Design system | UI is built from `web/src/ui/` components and token custom properties; no new colour, size, radius, shadow or `z-index` literal (`check-tokens.mjs` budgets only go down); a new component gets a catalogue section and a README entry; a new token pair gets a contrast check | ui | 2026-10-26 | spec 001 |
| Storage budgets | A new or changed query on a hot path gets a benchmark on the seeded workspace (`server/bench_world_test.go`) and stays within its p95 budget in `specs/002-storage-engine/research.md`; analytical reads go through the time limit | perf | 2026-10-26 | spec 002 |
