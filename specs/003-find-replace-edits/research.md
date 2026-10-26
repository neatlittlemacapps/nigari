# Research: Edit page content by find-and-replace

Each entry: decision, why, what was rejected. Read against `spec.md`.

## R1. Where the match runs: the page's Markdown, block by block

- **Decision**: render the stored body (`pages.content`, BlockNote JSON) to Markdown with
  the renderer `get_page` already uses (`blocksToMarkdown` in `server/export.go`), while
  recording the character span of every top-level block. Find the quote in that text,
  map the match to the run of top-level blocks it touches, and convert only those blocks
  back: prefix of the first block + replacement + suffix of the last, through
  `mdToBlocks`. Every block outside the run keeps its stored JSON byte for byte.
- **Why**: agents quote what `get_page` showed them (spec, Assumptions). Rewriting the
  whole page through Markdown would lose what Markdown cannot carry — block ids (comments
  anchor to them, `comments.block_id`), colours, column layouts, table-of-contents and
  sub-page blocks — on every edit, which breaks SC-001.
- **Rejected**: matching inside the JSON text runs (an agent cannot see run boundaries,
  and a quote across `**bold**` would never match); a full Markdown round trip (lossy,
  above); a new text form just for editing (a second representation to keep in step).

## R2. Blocks that do not survive a round trip are refused, not rewritten

- **Decision**: a match may only touch blocks whose Markdown converts back to the same
  block. Layout and generated blocks (`columnList`, `column`, `toc`, `subpages`) and any
  block whose render → parse → render is not stable are off limits; an edit touching one
  is refused with `edit_unsupported_block`, naming the block type.
- **Why**: the alternative is silently flattening a layout the agent never saw.
- **Rejected**: best-effort conversion with a warning (a warning does not undo damage).

## R3. Block ids are kept where the block count allows

- **Decision**: when the replaced run turns into new blocks, the new blocks take the old
  ids in order, up to the smaller of the two counts. A one-sentence fix inside one
  paragraph therefore keeps the paragraph's id and the comments on it.
- **Why**: otherwise every edit orphans the comments on the edited block.
- **Rejected**: fresh ids always (orphans comments); diffing blocks by content (guesswork).

## R4. One shared function, two doors

- **Decision**: `editPageContent(u, pageID, req) (editResult, error)` in
  `server/cap_edits.go`. REST (`POST /api/pages/{id}/edits`) and MCP
  (`write_content` with `mode: "edit"`) both call it; gates stay where every write has
  them (`canWrite` + `credentialMayEnter` + read-scope refusal + trash).
- **Why**: constitution III; the `cap_*.go` prefix is the shared-layer convention
  (`server/ops.go` is taken).
- **Rejected**: a new MCP tool `edit_content` (the catalogue is kept small on purpose,
  `server/mcp_merged.go`; `write_content` is already "write Markdown into a page");
  carrying edits in `PATCH /api/pages/{id}` (that body takes BlockNote JSON, and its
  `content` field already means "replace").

## R5. Atomicity and concurrent agents

- **Decision**: read, apply every edit in memory, then one `UPDATE … SET content = ?,
  updated_at = ?, doc_gen = doc_gen + 1 WHERE id = ? AND doc_gen = ? AND trashed_at IS
  NULL` with the generation that was read. Zero rows → the page changed underneath:
  answer `edit_stale` ("read the page again"). Nothing partial is ever written.
- **Why**: FR-002 and the "two agents" edge case. The generation check makes the second
  agent fail loudly instead of applying a quote to text it never read. With one SQLite
  connection a transaction would also serialise, but the guard keeps the read outside
  the transaction (snapshot and canWrite run on `s.db`, which would block inside one).
- **Rejected**: retrying automatically on a stale generation (the quote may no longer
  mean what the agent meant).

## R6. History: force the snapshot for this write

- **Decision**: take the "before" snapshot with the throttle bypassed for this write
  (a `snapshotRevisionNow` beside `snapshotRevision`, or a flag), attributed to the
  caller.
- **Why**: `snapshotRevision` skips when the newest revision is under 2 minutes old
  (`revisionThrottle`). Two edits a minute apart would leave the state between them in
  no revision, which breaks FR-005 ("the state before the edit is there to restore").
- **Rejected**: changing the throttle for every writer (the editor's autosave relies on it).

## R7. Protection of sub-page links and embedded databases

- **Decision**: compare the replaced run with its replacement: page ids from `pageLink`
  inline content (`extractLinks`) and `collectionId`s of `database` blocks. Any id present
  before and absent after is a removal; refused with `edit_removes_link` unless
  `allow_removals: true`, and the answer lists the titles the caller may read (ids only
  for the rest).
- **Why**: FR-004; a deleted mention silently breaks backlinks, a deleted database block
  silently hides a database.

## R8. Open editors: reload, as today (FR-008, decision C)

- **Decision**: after the write, `resetYjsDoc` as every outside write does; the
  generation bump makes stale autosaves land in history (`keepRefusedCopy`, `docgen.go`).
  Live delivery into running sessions is follow-up #26.
- **Why**: the user chose C. Live delivery needs the server to build and send a Yjs
  update, which it does not do today (collab.go only relays) — a feature of its own.

## R9. Limits

- **Decision**: at most 100 edits per request; quote and replacement each at most the
  content-write size limit; an empty quote is refused (`edit_empty_quote`).
- **Why**: bounded work per request (constitution VII) and no "match everywhere" by an
  empty string.

## Found on the way (not in scope, reported)

- `appendMarkdownToPage` snapshots AFTER the write (the new state, author "agent") and
  fires no `page.updated` webhook; `mcpPrependMarkdown` fires none either. FR-011 keeps
  those modes unchanged, so this is a separate issue, not this feature.
