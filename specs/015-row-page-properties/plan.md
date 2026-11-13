# Implementation Plan: A row's page manages its database's properties

**Branch**: `claude/spec-015-row-properties` (spec and plan); the build gets its own branch | **Date**: 2026-11-13 | **Spec**: [spec.md](spec.md) | **Issue**: #582

**Input**: Feature specification from `/specs/015-row-page-properties/spec.md`

## Summary

A property's name on a row's page opens a menu: Rename, Edit property (a
small panel for that one property), Property visibility (Always show / Hide
when empty / Always hide), Duplicate property, Delete property. **+ Add a
property** sits under the list; hidden properties fold into "N more
properties".

- **Stored**: one optional key per property, `pageVisibility`, in the
  database's schema; absent = shown, so no upgrade step (R1).
- **Checked**: one server function for both doors, REST and `update_schema`
  (R2).
- **Interface**: the dialog's per-property fields move into
  `PropertyFields.tsx`, used by the dialog and the new panel (R4); delete's
  confirmation and view tidying move into `propertyDelete.ts` (R6); every
  row-page action applies one change to the freshly fetched schema (R5).
- **Agents**: no new tool; `update_schema` documents the key; one parity pair
  (R9).

One pull request (R10).

## Technical Context

**Language/Version**: Go 1.27 (`server/`); TypeScript 5.6 + React 18 (`web/src/`)

**Primary Dependencies**: none new. `ui/Menu`, `ui/Popover`, `dialog.tsx`
(`confirm`), lucide-react (`SlidersHorizontal`, `EyeDashed`, both present
in the installed version, unused by any menu function today).

**Storage**: no table, column or index. One optional key inside
`collections.schema` (R1).

**Testing**:
- Go (`server/propvisibility_test.go`): both values stored and returned by
  REST and `update_schema`; absent stays absent; a bad value refused on both
  doors with nothing stored; a schema save without the key leaves other
  properties' keys alone. Parity pair in `parity_property_test.go` (R9).
- Pure check `web/scripts/check-rowproperties.mjs` on `rowProperties.ts`:
  visibility placement (all three, empty and filled, the sticky set),
  duplicate (name, id, position, values not copied), add (unique id), one
  change applied to a schema that changed elsewhere keeps the other change.
  `check-propertydelete.mjs` on `propertyDelete.ts`: the tidying cases now
  inline in `SchemaEditor.save()`.
- Playwright `web/tests/row-properties.mjs`: menu by click and keyboard;
  rename; edit (type change, an option); duplicate; delete with its
  confirmation; add; each visibility value and the fold; reader sees no
  menu; the same in a side peek. `property-confirm.mjs` keeps passing (the
  dialog's delete moved, not changed).

**Target Platform**: browser at desktop and phone widths; the desktop shell

**Performance Goals**: no new query. One `getCollection` before each
row-page change (a person's click, not a hot path). The page already loads
the config once.

**Constraints**: design system (`ui/` and tokens; budgets only go down);
menu icons (two new functions, R3); English source; `Editor.tsx` is over
1,400 lines, so `RowProperties` moves out into its own module.

**Scale/Scope**: 1 issue, 1 PR, 0 routes, 0 tools, 1 schema key, 1 error
code, 2 menu functions, about 15 strings.

## CodeGraph

Index checked with `codegraph status`: 445 files, 7,997 nodes, current with
the checkout (2026-11-13).

- **The row's page** (`codegraph explore "row page properties panel add
  property hidden properties RowProperties"`): `RowProperties`
  (`Editor.tsx:465`) has one caller, `PageHeader`; it loads the config with
  `getCollection`, saves values with `propsPatch` and options with a
  schema-only `putCollection`. It is rendered by the shared `Editor`, so a
  peek gets the change with no extra work (Page containers).
- **Where properties are edited** (`codegraph explore "ColHead header menu
  rename property type delete property confirm PropertyEditor duplicate"`,
  then `SchemaEditor` read in full): `SchemaEditor` (900 lines, one caller,
  `CollectionView`) edits the whole schema in a draft and saves once;
  `removeProp` (`:209`) holds #524's confirmation; `save()` (`:228`) tidies
  views after a removal and respects the lock; `changeType` (`:152`) keeps
  values (Q23). `renderConfig` (`:309`), `PersonConfig`, `WhereValue` and the
  options editor are the per-type fields R4 moves. Nothing duplicates a
  property today. `ColHead` (`TableColumnHead.tsx`) shows how a label opens
  a controlled `Menu` without stealing a drag (R3).
- **The server's doors** (`codegraph explore "handlePutCollection
  mcpUpdateSchema checkSchema propDef schema save validate audit"`):
  `handlePutCollection` (`collections.go:55`) stores a sent schema as raw
  JSON after the locked-view property check, without validating keys;
  `mcpUpdateSchema` (`mcp_schema.go:246`) merges maps through
  `normalizeSchema` and `saveCollection`. Both keep unknown keys, which is
  why R1 needs no storage code and R2 needs a new check on both.
- **Menu functions** (`menuIcons.ts` read): `rename`, `duplicate`, `delete`
  exist with the meanings R3 uses; `propertyVisibility` (Eye) is the view
  Settings' column visibility, a different function; `editProperties`
  (Rows3) is the whole dialog. `SlidersHorizontal` and `EyeDashed` are not
  used.
- **Not from the graph**: no wiki screenshot lists `Editor.tsx`,
  `SchemaEditor.tsx` or `PropertyValue.tsx` as a source (`screenshots.json`
  searched); `wiki/collections.md` "Rows are pages" is the page to extend;
  `gapBudget` 10.

## Constitution Check

- I. One binary, no external services: ✅ one key in an existing JSON column.
- II. Agent parity: ✅ `update_schema` sets everything the menu sets (R9); no
  new gap, `gapBudget` stays 10.
- III. Gates are one function: ✅ `checkPropertyVisibility` on both doors
  (R2); the database's `canWriteReq` stays the gate for schema writes.
- IV. Derive from code: ✅ pure modules with check scripts (R5, R6);
  specs stay lean (no data-model, contracts or quickstart: one optional key,
  no new route or tool, nothing a quickstart would add to the tasks).
- V. English source: ✅ strings through `t()`, de/es/nl.
- VI. Every surface: ✅ table below. No new registry row: row-page
  visibility matters to this feature only.
- VII. Measured: ✅ no new hot-path query.

Re-checked after design: unchanged.

## Surfaces

| Surface | Changes | Owner |
|---------|---------|-------|
| Domain logic and gates (`canRead`/`canWrite`, `credentialMayEnter`, validation, `audit`, `fireWebhook`) | `server/propvisibility.go` (new): `checkPropertyVisibility(schema)`, called by `handlePutCollection` (schema sent), `mcpUpdateSchema` (merged schema) and `mcpCreateDatabase` (a third door, found by `codegraph callers normalizeSchema` while writing the tasks). Gates unchanged: `canWriteReq` on the database for REST, the MCP write gate for `update_schema`. No audit change: an agent's `update_schema` is logged by `mcpCall`'s generic audit as today; a person's schema save over REST is not logged today, and this adds no new kind of save (a gap in the activity log worth its own issue, not this spec) | backend |
| Schema and queries (`server/db.go`, indexes, `ensureColumn`) | No change: no table, column or query | backend |
| REST routes (`server/server.go`, middleware) | No new route. `PUT /api/collections/{id}` refuses a bad `pageVisibility` with `400 invalid_property_visibility` | backend |
| MCP tools (`server/mcp*.go`, descriptions, `wrapUntrusted`, read-scope refusal) | `update_schema` and `create_database`: description and property shape name `pageVisibility` ("hide_empty" or "hide"; leave it out to show); refused values answered with the same sentence as REST. `get_collection` returns the key as stored. Read scope refused by the existing write gate | mcp |
| Closed-to-agents list (`not_available_via_mcp`) | No change: nothing closed. The fold is a person's momentary view, not a capability | mcp |
| UI components (`web/src/…`, light + dark, keyboard) | `RowProperties` moves out of `Editor.tsx` into `components/RowProperties.tsx` with the menu (R3), the Edit property panel (R4), **+ Add a property** and the fold (R7). `components/PropertyFields.tsx` (new) holds the per-property fields `SchemaEditor` uses today. `propertyDelete.ts` (R6) and `rowProperties.ts` (R5, R7) are pure. Light and dark; keyboard: the name is a button, the menu and panel through `ui/Menu`/`ui/Popover` (Escape closes, focus returns to the name) | ui |
| Translations (`t()`, `de.json`/`es.json`/`nl.json`) | About 15 strings (Edit property, Property visibility, Always show, Hide when empty, Always hide, Duplicate property, Add a property, the fold's two plural lines, "Hidden on row pages", the error sentence, …), de/es/nl, informal | i18n |
| Server error codes (`web/src/serverErrors.ts`) | `invalid_property_visibility` with its sentence | i18n |
| Wiki (`wiki/*.md`, `mcp-tools.md`, stale screenshots, `docs/what-it-does.md`) | `wiki/collections.md` "Rows are pages": the menu, the panel, visibility and the fold. `wiki/mcp-tools.md`: `update_schema`'s `pageVisibility`. `docs/what-it-does.md`: one line. No listed screenshot shows the row's page; a new shot of the menu is optional, not stale | wiki |
| Tests (Go incl. refusal paths, Playwright spec, check scripts) | See Technical Context. Refusal paths: bad value on both doors; a reader's page shows no menu; a writer of the row whose save the server refuses sees the toast and the page reloads. New tests mutation-checked | test |
| Performance (query plans, payload size, per-request work) | No new query. One `getCollection` before each change made from the menu; the schema grows by a few bytes per hidden property | perf |
| Manifest (`capabilities.json`, `gapBudget`, `parity_property_test.go`) | No new route or tool, so no new entry; `update_schema`'s note mentions row-page visibility. One parity pair (R9). `gapBudget` stays 10 | mcp |
| Design system (`web/src/ui/`, tokens, `check-tokens.mjs` budgets) | No new component: `ui/Menu`, `ui/Popover`, `Button`, `IconButton`. Tokens only. The fold line and **+ Add a property** are `Button variant="ghost"`. Moving fields out of `SchemaEditor` does not add raw buttons; budgets only go down | ui |
| Storage budgets (`bench_world_test.go`, p95 in spec 002 research) | No change: no hot-path query | perf |
| Page containers (full page, side peek, centre peek) | `RowProperties` is drawn by the shared `Editor` in all three; the Playwright spec checks a side peek. The panel and menu are portalled, so a peek does not clip them | ui |
| Aggregation (`server/aggregate.go`) | No change: no property type. Hiding on the row's page does not touch charts or counts | backend |
| Stored data (`server/upgrade_steps.go`) | No upgrade step: `pageVisibility` is optional and absent means shown, as `colOrder` (spec 012 R3); nothing stored is rewritten | backend |
| Outside names (env vars, cookies, storage keys, …) | No change: no new name outside the code; the fold uses no browser storage | backend |
| Menu icons (`ui/Menu`, `menuIcons.ts`, `check-menu-icons.mjs`) | A new menu on the row's page built with `ui/Menu`. Two new functions: `editProperty` (SlidersHorizontal), `rowPageVisibility` (EyeDashed), the three choices as `MenuValues`. `rename`, `duplicate`, `delete` reused with their meanings (R3) | ui |
| View lock (`checkViewsUnlocked`, `auditViewChanges`) | No new path writes views except delete, which uses `SchemaEditor`'s rule moved to `propertyDelete.ts`: while locked, the schema alone, and the server's `property_in_locked_view` refusal shown (R6) | backend |
| Cross-origin requests (`server/crossorigin.go`) | No change: no new route or socket; the `PUT` is judged by `ServeHTTP` as today | backend |
| Embedded views (`embedViews.ts`, `embedviews.go`) | No change: row-page visibility is not a view setting; an embed's views do not read it. Edit properties from an embed keeps spec 014's confirmation | ui |

**Parity statement**: everything the menu changes is a schema change an
agent makes with `update_schema`, with the same check.

**Manifest**: no new route or tool; one parity pair; `gapBudget` stays 10.

**Registry**: no new row.

## Project Structure

### Documentation (this feature)

```text
specs/015-row-page-properties/
├── spec.md
├── plan.md
├── research.md          # R1–R10
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

Skipped: `data-model.md` (one optional key, R1), `contracts/` (no new
route or tool; the `update_schema` key is in R9), `quickstart.md` (the
Playwright spec is the walk-through).

### Source Code (repository root)

```text
server/propvisibility.go (new), propvisibility_test.go (new)
server/collections.go          # handlePutCollection calls the check
server/mcp_schema.go, mcp.go   # mcpUpdateSchema calls it; update_schema description
server/parity_property_test.go
capabilities.json              # update_schema note
web/src/rowProperties.ts (new), web/scripts/check-rowproperties.mjs (new)
web/src/propertyDelete.ts (new), web/scripts/check-propertydelete.mjs (new)
web/src/components/PropertyFields.tsx (new)   # out of SchemaEditor
web/src/components/RowProperties.tsx (new)    # out of Editor.tsx
web/src/components/SchemaEditor.tsx, Editor.tsx
web/src/menuIcons.ts, web/src/serverErrors.ts, web/src/types.ts (PropDef.pageVisibility)
web/src/locales/{de,es,nl}.json
web/tests/row-properties.mjs (new), web/tests/package.json
wiki/collections.md, wiki/mcp-tools.md, docs/what-it-does.md
```

**Structure Decision**: new modules on both sides, because `Editor.tsx` and
`SchemaEditor.tsx` are long and the dialog and the row's page must share
the property fields and the delete rule.

**Order of work** (R10): server check and tests; the two moves out of
`SchemaEditor` with no visible change (existing specs pass); then the row's
page. **Streams**: one; nothing else open touches these files.

## Complexity Tracking

No violations.
