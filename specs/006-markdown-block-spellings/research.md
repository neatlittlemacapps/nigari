# Research: Markdown spellings for every block

## R1. Hand-written converter, not a Markdown library

**Decision**: Extend `mdToBlocks` and `renderBlocksMarked`.

**Rationale**: Both are hand-written and tuned to the blocks the editor stores
(page links, mermaid, tables, the edit spans of spec 003). A CommonMark library
would be a new dependency, change how every existing page converts (FR-005),
and still know nothing of callouts or columns.

**Alternatives considered**: goldmark plus extensions. Rejected for the reasons
above, and because constitution I asks for a reason for every dependency.

## R2. Containers: a pre-pass, then the line parser inside

**Decision**: `<details>…</details>` and `:::: columns` / `::: column` are found
by a scanner that walks the lines, skipping fenced code, tracking nesting by
depth. It cuts the text into "plain" runs and container runs. Plain runs go to
today's line parser unchanged. A container's inner text is parsed recursively
by the same function, and its blocks become:

- toggle: a `toggleListItem` whose content is the summary and whose children
  are the inner blocks;
- columns: a `columns` block, `count` = number of sections (2 or 3; see the
  spec's edge cases), `widths` from `{.column width="N%"}`. Each section's
  first block is the column, and its remaining blocks are that block's
  children, which is how the editor itself holds a column with more than one
  block (`blocks.tsx`, `ColumnsBlock`).

**Rationale**: Today's parser is a single pass over lines with a list stack. A
container that spans many lines and holds any block type is much simpler as a
pre-pass than as one more state in that loop, and running the plain parser
unchanged between containers is what guarantees FR-005.

**Alternatives considered**: a state for each container inside the main loop.
Rejected: nesting (a toggle in a column) would need a stack of states, and every
existing branch would have to learn to stop at `</details>` or `:::`.

## R3. Callout alerts and the emoji

**Decision**: `> [!TYPE]` on the first quote line, case-insensitive, TYPE one of
NOTE, TIP, IMPORTANT, WARNING, CAUTION. The following `>` lines are the text,
joined with a space (a soft break, as GitHub reads them). Mapping: ℹ️ NOTE,
💡 TIP, 📌 IMPORTANT, ⚠️ WARNING, ❗ CAUTION. ✅ exports as TIP and 🔥 as
WARNING, each with the emoji as the first character of the text. On the way back
in, a leading callout emoji in the text overrides the type's emoji and is
stripped. A quote whose text starts with a callout emoji and a space (today's
`> 💡 text` export) is read as that callout.

**Rationale**: GitHub renders the alert form, so exported files read well where
they are most often opened. The emoji rule makes every callout emoji round-trip
exactly (FR-003).

## R4. The round trip is the test

**Decision**: One table of every block type the renderer knows, each with its
stored props. Render → parse → render must give the same Markdown, and parse
must give the same block types and props. The same table drives the spec 003
`notEditable` check, so "editable" and "round-trips" stay one notion.

## R5. Find-and-replace edits

**Decision**:
- `toc` and `subpages` leave the hard-refused list in `notEditable`; `columnList`
  and `column` (the old paid-tier types) and `database` stay.
- `emoji`, `count` and `widths` join `editableProps`, since Markdown now
  carries them.

The existing three-part test (formatting, render stability, same types) then
decides, unchanged.

**Rationale**: the edit mode refuses what cannot round-trip. Once these blocks
can, refusing them would be a stale rule.

## R6. Bookmarks

**Decision**: A paragraph whose whole inline content is one link, with the label
equal to its href, or written `<https://…>`, becomes a `bookmark` with `url`.
The bookmark exports as `<url>`. A bare URL alone on a line stays a paragraph
(spec).

**Rationale**: `[url](url)` is what the export writes today, so old exports
come back right. `<url>` is CommonMark's own autolink and cannot be mistaken
for text.
