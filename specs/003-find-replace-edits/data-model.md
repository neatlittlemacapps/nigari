# Data model: Edit page content by find-and-replace

No schema change. Everything below is request/response shape and in-memory state.

## Edit

| Field | Type | Rule |
|---|---|---|
| `old` | string | required, non-empty, exact and case-sensitive, Markdown as `get_page` returns it |
| `new` | string | may be empty (deletes the passage) |
| `all` | bool | default false; false requires exactly one match |

## Edit request

| Field | Type | Rule |
|---|---|---|
| `page_id` | string | the page; write access, not trashed, workspace open to the credential |
| `edits` | Edit[] | 1–100, applied in order, each to the result of the previous |
| `allow_removals` | bool | default false; true lets an edit remove page mentions or embedded databases |

## Edit result

Success: `{ "applied": [n₁, n₂, …] }` — replacements per edit, never the page.

Refusal (nothing written):

| Field | Meaning |
|---|---|
| `code` | `edit_no_match`, `edit_ambiguous`, `edit_removes_link`, `edit_unsupported_block`, `edit_stale`, `edit_empty_quote`, `edit_too_many` |
| `edit` | index of the failing edit (0-based) |
| `matches` | match count, for `edit_no_match` / `edit_ambiguous` |
| `removed` | page/database references that would go, for `edit_removes_link` |
| `message` | English sentence with the remedy |

## In memory: rendered page

Rendered Markdown plus one span per top-level block `{start, end, blockIndex, editable}`.
A match `[a, b)` maps to the blocks whose spans overlap it; if any is not `editable` the
edit is refused (research R2).

## State transitions

`read (content, doc_gen)` → `apply edits in memory` → `check removals` →
`snapshot before (forced)` → `UPDATE … WHERE doc_gen = read` → `resetYjsDoc` →
`reindexPage` (search, links) → `pagesChanged` → `fireWebhook("page.updated")` → `audit`.
