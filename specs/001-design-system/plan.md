# Implementation Plan: Build the interface from a design system

**Branch**: `001-design-system` | **Date**: 2026-10-26 | **Spec**: [spec.md](spec.md) | **Issue**: #87

**Input**: Feature specification from `/specs/001-design-system/spec.md`

## Summary

Encode today's look (`theme.css`: paper and ink, one accent) as DTCG 2025.10 tokens in
`web/tokens/`. An in-repo script generates `web/src/tokens.css` and checks WCAG contrast.
Build a component layer in `web/src/ui/` on Base UI 1.9.0, styled only through those
tokens. Lock progress with ratchets in `web/tokens/budgets.json`, enforced by
`check-tokens.mjs`. Prove it in a dev-only catalogue, tested visually and with axe in both
themes.

This feature introduces a concept every later UI change must respect, so it adds **Design system** to the surfaces registry.

Delivery is in batches (FR-016). **Batch 1**, the scope of this plan's tasks, covers
tokens, build, check, catalogue, `Button`, `IconButton`, `Dialog`, `AlertDialog`,
`Field`/`Input`, `Checkbox`, `Select` and `Switch`, plus migrating the settings dialog
and its Webhooks tab in `AdminSettings.tsx` (User Story 1; `Checkbox` added at task time,
see tasks.md). Menus, toasts and the remaining migration follow as
later batches, each with its own tasks.

## Technical Context

**Language/Version**: Go 1.27 (server, one package `server/`), TypeScript 5.6 + React 18 (`web/src/`)

**Primary Dependencies**: Go standard library and pure-Go SQLite; Mantine, BlockNote and Yjs in the frontend. New dependencies:
- `@base-ui/react` 1.9.0, exact pin: headless behaviour for focus, keyboard and ARIA (FR-007; research P1).
- `@axe-core/playwright` 4.14.0, dev dependency of `web/tests` only (research P7).

**Storage**: One SQLite file, one writer plus a read-only pool (#84), schema in `server/db.go`. Schema change: none.

**Testing**: `npm run check` (tsc and the check scripts, plus the new `check-tokens.mjs`); Playwright in `web/tests/` (plus `catalog.mjs` with baselines and axe); existing regressions must stay green.

**Target Platform**: One static binary (`CGO_ENABLED=0`), Linux/macOS/Windows; browser, desktop shell, MCP clients.

**Performance Goals**: the main chunk grows by at most 60 KB gzip over the 528,706 B baseline on `main` at `2a28bc4` (research P8, corrected). No layout or interaction gets slower; Base UI portals replace hand-positioned popovers.

**Constraints**: no external services; no Tailwind or CSS framework; English source with `t()`; components hold no text of their own.

**Scale/Scope**:
- Batch 1: 8 components and 1 screen migrated.
- The whole feature: 24 dialogs, 356 raw buttons, 133 hex and 148 rgb(a) literals, 34 font sizes, 13 radii, 24 z-index values.

## Constitution Check

- I. One binary, no external services: ✅ two npm packages (one dev-only). The catalogue is not built into the binary.
- II. Agent parity: ✅ not a capability; nothing a person can do changes.
- III. Gates are one function: ✅ no access decision is touched.
- IV. Derive from code: ✅ `check-tokens.mjs` and its budgets enforce the rules, and contrast is checked by the build.
- V. English source: ✅ components take translated text from callers; new accessible names go through `t()` with German added.
- VI. Every surface, every time: ✅ see the table below.
- VII. Measured, not assumed: ✅ bundle baseline and cap, literal counts measured and ratcheted.

Re-checked after Phase 1 design: unchanged.

## Surfaces

| Surface | Changes | Owner |
|---------|---------|-------|
| Domain logic and gates (`canRead`/`canWrite`, `credentialMayEnter`, validation, `audit`, `fireWebhook`) | No change: presentation only | backend |
| Schema and queries (`server/db.go`, indexes, `ensureColumn`) | No change | backend |
| REST routes (`server/server.go`, middleware) | No change. Public pages already link the app stylesheet (research P2) | backend |
| MCP tools (`server/mcp*.go`, descriptions, `wrapUntrusted`, read-scope refusal) | No change: no capability added or removed | mcp |
| Closed-to-agents list (`not_available_via_mcp`) | No change | mcp |
| UI components (`web/src/…`, light + dark, keyboard) | New: `web/tokens/*.tokens.json`, `web/src/tokens.css` (generated), and `web/src/ui/` with Button, IconButton, Dialog, AlertDialog, Field/Input, Checkbox, Select, Switch, plus a README. `theme.css` token block replaced by the generated aliases. BlockNote's Mantine theme mapped from the tokens (FR-011). The webhook dialog in `AdminSettings.tsx` is rebuilt from components. The catalogue lives in `web/catalog.html` and `web/catalog/` (amended at task time: outside `src/`, see tasks.md) | ui |
| Translations (`t()`, `de.json` required, `es.json`) | Any new accessible names (for example a dialog's "Close") go through `t()`, with German. Most already exist | i18n |
| Server error codes (`web/src/serverErrors.ts`) | No change | i18n |
| Wiki (`wiki/*.md`, `mcp-tools.md`, stale screenshots) | Retake the screenshots of the migrated webhook dialog, plus any `check-wiki.mjs` lists as stale. User-facing text unchanged | wiki |
| Tests (Go incl. refusal paths, Playwright spec, check scripts) | New:<br>- `check-tokens.mjs` (literal and component ratchets), in `npm run check`;<br>- contrast failure in `build-tokens.mjs`;<br>- `web/tests/catalog.mjs` (baselines and axe, both themes);<br>- keyboard test for the migrated dialog.<br>Existing Playwright regressions must stay green | test |
| Performance (query plans, payload size, per-request work) | `check-bundle.mjs` enforces `bundleGzip` after `vite build` in CI; per-subpath imports | perf |
| Manifest | No change: no route or tool | mcp |
| Design system | This feature creates it: tokens, `web/src/ui/`, catalogue, budgets. It enters the registry (`.specify/memory/surfaces.md`) with this plan | ui |
| Storage budgets | No change: no query added or changed | perf |

**Parity statement**: not a capability. Agents are unaffected, and no route or tool changes.

## Project Structure

### Documentation (this feature)

```text
specs/001-design-system/
├── spec.md, research.md (incl. plan-time decisions P1–P9)
├── plan.md, data-model.md, quickstart.md
├── contracts/components.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

**Files touched (batch 1)**:
- **Tokens:** `web/tokens/primitives.tokens.json`, `semantic.tokens.json`, `component.tokens.json`, `budgets.json`.
- **Scripts:** `web/scripts/build-tokens.mjs`, `check-tokens.mjs`, `check-bundle.mjs`.
- **Styles:** `web/src/tokens.css` (generated); `web/src/theme.css` (token block → generated); `web/src/main.tsx` (import order).
- **Components:** `web/src/ui/*.tsx`, `*.css`, `README.md`.
- **Catalogue:** `web/catalog.html`, `web/catalog/*`, `web/vite.catalog.config.ts`.
- **Migrated screen and package files:** `web/src/components/AdminSettings.tsx`; `web/package.json` (Base UI, `check` script); `web/package-lock.json` (through `npm install` only).
- **Tests:** `web/tests/catalog.mjs`, `web/tests/catalog-baselines/`, `web/tests/package.json`.
- **Rules and docs:** `.claude/rules/frontend.md`, wiki screenshots.

## Complexity Tracking

None. The two new dependencies are justified in research P1 and P7. The constitution asks for a stated reason, not a violation entry.
