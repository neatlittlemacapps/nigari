# MCP: write_content, mode "edit"

New arguments on the existing tool (no new tool):

```json
{ "page_id": "…", "mode": "edit",
  "edits": [ { "old": "Launch is on 3 March", "new": "Launch is on 10 March", "all": false } ],
  "allow_removals": false }
```

- `markdown` is not required when `mode` is `edit`; passing it with `edit` is refused.
- Success text: `Applied 1 edit to page <id>: 1 replacement.` (counts per edit, never the page).
- Refusals are tool errors with the same codes and remedies as REST, e.g.
  `Edit 1 matched 2 times. Quote more of the surrounding text, or set "all": true.`
- Description gains one sentence: prefer `edit` to `replace` for changing part of a
  page — it leaves the rest untouched and is refused rather than guessing.
- Gates: as every `write_content` call (`mcpCall` mutating + `page_id` gates).
- Audit: the generic MCP entry (`agent`), detail = the success text.
