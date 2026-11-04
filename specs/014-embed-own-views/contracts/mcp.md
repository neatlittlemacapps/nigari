# Contract: MCP

No new tool (research R7). Tool count stays 34.

## get_page (changed)

For a document with embeds, after the wrapped Markdown, a list inside the
same untrusted wrapper:

```text
Embedded databases (use embed_id with get_collection, set_view and delete_view):
- embed_id 4f1c…: database "Tasks" (a1b2…), views: "Open work" (table, open), "By status" (board)
```

An embed whose database the caller cannot read is listed as
`embed_id …: a database you cannot read`, with no title and no views.

## get_collection (changed)

| Argument | Meaning |
|---|---|
| `embed_id` | with `page_id` the document: answer for that embed. The views are the embed's; the schema is the database's |

Refusals: no such embed in the document → "page … has no embedded database
with id …"; database unreadable → "database not found".

## set_view (changed)

| Argument | Meaning |
|---|---|
| `embed_id` | with `page_id` the document: create (no `view_id`) or update (`view_id`) a view of that embed |
| `copy_of` | create only, with `embed_id`: a database view's id to start from; the other arguments then change the copy |

- Same checks as a database view (`applyViewSpec`, `normalizeViews`) against
  the database's schema; `type: "form"` refused for an embed.
- Gate: `canWrite` on the document (the generic gate on `page_id`); `canRead`
  and `credentialMayEnter` on the database. Read scope refused (mutating).
- Writes the document: `snapshotRevision`, `pages.content`, `resetYjsDoc`,
  `pagesChanged`. Answers with the view id and "only this embed changed".
- An embed in the old shape is written in the new shape first (research R2).
- The database's views are never written.
- Description addition: "With embed_id, acts on the views of a database
  embedded in a document (page_id is then the document): they belong to the
  document and change nothing on the database. copy_of starts a view from one
  of the database's views."

## delete_view (changed)

`embed_id` as above. Removing an embed's last view → "an embed keeps at
least one view".

## embed_database (changed)

- Writes the new shape: with `view_id`, one copy of that view (FR-008);
  without, one table view (FR-002).
- Answer adds `embed_id`.

## create_page, create_rows (changed)

| Argument | Meaning |
|---|---|
| `embed` | `{page_id, embed_id}`: `view_id` then names a view of that embed, whose filters pin the new rows' values (spec 005), read from the document's stored content |

Gate: `canRead` and `credentialMayEnter` on `embed.page_id`, besides the
row's own gates. Unknown embed or view → refused before anything is
created.

## Not available

Nothing new on `not_available_via_mcp`: every embed view action a person
has, an agent has (SC-005). Property-change confirmations (FR-012) are for
people; `update_schema`'s description already says a change applies
everywhere.
