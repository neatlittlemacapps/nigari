# Feature Specification: Every block an agent can see in Markdown, it can also write

**Feature Branch**: `claude/vigilant-babbage-bvoiel`

**Created**: 2026-10-27

**Status**: Draft

**Issues**: #160 (the fork's take on upstream saltmd/salt.md#84)

**Input**: User description: "Markdown spellings for the slash-menu blocks, for
agents: `> [!NOTE]`-style callouts, `<details>` toggles, `---`/`***`/`___`
dividers, `[[toc]]`, `[[subpages]]`, a bookmark when the label is the URL,
pandoc/Quarto `:::` fenced columns; round-trip tests; tool descriptions;
`wiki/editor-blocks.md`."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An agent writes the blocks a person makes from the slash menu (Priority: P1)

An agent asked to "write up the meeting with a warning box, a divider and a
collapsible section for the raw notes" writes Markdown, which is the only way it
writes a page. Today the warning box arrives as a quote, the divider as a line
reading `---`, and the collapsible section as a list item. With this feature
each arrives as the block a person would have picked from the slash menu.

**Why this priority**: it is the whole request. The editor has these blocks and
agents can't make them. Agent parity is a project principle.

**Independent Test**: write one page over MCP containing every spelling; open it
in the editor; each one is the real block.

**Acceptance Scenarios**:

1. **Given** Markdown `> [!WARNING]` followed by `> Mind the gap`, **When** an
   agent writes it, **Then** the page has a callout with the warning emoji and
   the text *Mind the gap*.
2. **Given** a line `---`, `***` or `___` on its own, **When** it is written,
   **Then** the page has a divider.
3. **Given** `<details><summary>Raw notes</summary>` … `</details>` with
   paragraphs inside, **When** it is written, **Then** the page has a toggle
   titled *Raw notes* with those paragraphs inside it, collapsed.
4. **Given** a line `[[toc]]` or `[[subpages]]`, **When** it is written,
   **Then** the page has a table of contents or a sub-pages list.
5. **Given** a paragraph that is only `<https://example.com>` or
   `[https://example.com](https://example.com)`, **When** it is written,
   **Then** the page has a bookmark of that address.
6. **Given** `:::: columns` holding two `::: column` sections, **When** it is
   written, **Then** the page has a two-column block with each section's blocks
   in its own column. `::: {.column width="70%"}` sets that column's width.

---

### User Story 2 - A page survives Markdown and back (Priority: P1)

A person exports a page to Markdown and imports it elsewhere, or an agent reads
a page with `get_page` and writes it back after a small change. Today callouts
come back as quotes, toggles as list items, dividers as text, and tables of
contents, sub-pages lists and columns disappear or are flattened. With this
feature the export writes the same spellings US1 reads, so the page comes back
as it was.

**Why this priority**: an agent always reads before it writes. If reading
loses a block, the next write deletes it, even when the agent changed one word.

**Independent Test**: a page with every block type, exported and imported
again, has the same blocks in the same order with the same content.

**Acceptance Scenarios**:

1. **Given** a page with a callout, a toggle with children, a divider, a table
   of contents, a sub-pages list, a bookmark and a two-column block, **When** it
   is exported to Markdown and the file imported, **Then** the new page has the
   same blocks, with the same props (emoji, url, column count and widths) and
   text.
2. **Given** the same page, **When** an agent reads it with `get_page` and
   writes the text back unchanged with `write_content` (replace), **Then** the
   page's blocks are unchanged.
3. **Given** the same page, **When** an agent makes a find-and-replace edit in
   one paragraph, **Then** the callout, toggle and columns around it are kept.
   Today they block such edits or come back changed.

---

### User Story 3 - Agents are told the spellings (Priority: P2)

An agent learns what it can write from the tool descriptions. Today they do not
mention any of these blocks. With this feature `write_content`, `create_page`
and `get_page` say, in one short list, how each block is spelled.

**Why this priority**: without it US1 works only for agents that already guess
GitHub's alert syntax and pandoc's columns.

**Independent Test**: the tool catalogue's descriptions name every spelling,
and the wiki's page about blocks lists them in its export table.

**Acceptance Scenarios**:

1. **Given** the tool catalogue, **When** an agent reads `write_content`,
   **Then** it finds one line per block type with its spelling.
2. **Given** `wiki/editor-blocks.md`, **When** a reader looks up what survives
   an export, **Then** the table shows the new spellings and the "does not
   survive" list no longer names callouts, dividers or bookmarks.

---

### Edge Cases

- **A quote that is not a callout.** `> text` stays a quote. Only a first line
  `> [!TYPE]` (NOTE, TIP, IMPORTANT, WARNING, CAUTION, any letter case) makes a
  callout. An unknown type stays a quote.
- **Older exports.** A file exported before this change spells a callout
  `> 💡 text`. A quote whose text starts with one of the callout emojis the
  editor offers is read as that callout, so old exports come back right.
- **A callout emoji with no alert type** (✅, 🔥, 📌): exported under the nearest
  type, with the emoji kept as the first character of the text, and read back
  as that emoji.
- **`---` right under a paragraph.** It is a divider here, not a setext
  heading. The importer has never read setext headings, and agents write `##`.
- **`<details>` without `<summary>`**: a toggle with an empty title. A
  `<details>` never closed: everything to the end of the text belongs to the
  toggle, as an editor would show it.
- **Nested toggles and blocks inside a column** (lists, code, a table, a
  callout): read and written recursively, like children of a list item.
- **Columns other than 2 or 3**: the editor makes 2 or 3. One section is a
  plain sequence of blocks. More than 3 keeps the first three and appends the
  rest's blocks to the third, losing nothing.
- **Widths that don't add up**: normalised by the rule the editor already uses
  (`columnWidths.ts`); unreadable widths mean equal columns.
- **A bare URL in a sentence** stays a link. Only a paragraph that is nothing
  but one link whose label is its address becomes a bookmark. A bare URL alone
  on a line stays a paragraph, as today, because agents paste those meaning
  "a link".
- **`[[toc]]` inside a sentence** is text. Only a line that is exactly the
  token counts.
- **Code blocks** keep everything inside them literally: a `:::` or
  `<details>` inside a fence is code.
- **Toggle headings** (a heading with the toggle switched on) keep today's
  spelling: an ordinary heading, children after it. Out of scope.
- **The embedded collection block** keeps today's spelling (a link labelled
  `Collection`). Its round trip is upstream saltmd/salt.md#100 and stays a
  separate change.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Markdown written by an agent (`write_content`, `create_page`), and
  Markdown imported by a person, MUST turn each spelling below into its block:

  | Block | Spelling |
  | --- | --- |
  | Callout | `> [!NOTE]` / `[!TIP]` / `[!IMPORTANT]` / `[!WARNING]` / `[!CAUTION]` on the first quote line, the text on the following `>` lines |
  | Toggle | `<details><summary>title</summary>` … `</details>` |
  | Divider | `---`, `***` or `___` alone on a line (three or more) |
  | Table of contents | `[[toc]]` alone on a line |
  | Sub-pages | `[[subpages]]` alone on a line |
  | Bookmark | a paragraph that is only `<url>` or `[url](url)` |
  | Columns | `:::: columns` with `::: column` sections, optional `{.column width="N%"}` |

- **FR-002**: The Markdown export, and `get_page`'s Markdown, MUST write each of
  these blocks in the same spelling, so that export → import reproduces the
  blocks (US2).
- **FR-003**: A callout's emoji MUST survive the round trip, including emojis
  that have no alert type of their own.
- **FR-004**: Anything inside a fenced code block MUST stay code.
- **FR-005**: Markdown that uses none of the spellings MUST convert exactly as
  today; every existing conversion test keeps passing unchanged.
- **FR-006**: The find-and-replace edit mode MUST treat the newly round-tripping
  blocks as stable, so an edit beside them is accepted and leaves them intact.
- **FR-007**: The tool descriptions of `write_content`, `create_page` and
  `get_page` MUST list the spellings in one short list.
- **FR-008**: `wiki/editor-blocks.md` MUST show the spellings in its export
  table and drop the round-trip losses this removes. `wiki/mcp-tools.md` MUST
  describe them for `write_content`.
- **FR-009**: The HTML export, public pages and the editor itself MUST be
  unaffected: this changes only the Markdown conversions.

### Key Entities

- **Block**: a node of a page body (type, props, inline content, children), as
  the editor stores it. No new block type is introduced.
- **Spelling**: the Markdown text one block type is written as and read from.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every block type a person can insert from the slash menu has a
  Markdown spelling an agent can write, except the two named out of scope
  (toggle heading, embedded collection). Today 6 of them have none.
- **SC-002**: A page holding one of every block type comes back from export →
  import with identical blocks, checked by a test, not by eye.
- **SC-003**: A `get_page` → `write_content` round trip of that page changes
  nothing.
- **SC-004**: Converting Markdown takes no noticeably longer: a 5,000-block
  page converts within 10% of today's time (measured).

## Assumptions

- GitHub's alert syntax (`> [!NOTE]`) is the spelling agents most often already
  know, and GitHub renders it, so exported files read well there too.
- Pandoc's fenced divs (`:::`) are the most widespread Markdown for columns
  (pandoc, Quarto, several static site generators). The spelling matters more
  than any one renderer showing it.
- `<details>` is HTML, but it is what GitHub and most Markdown viewers render
  as a collapsible section; Markdown has no native one.
- The emoji ↔ type mapping is: ℹ️ NOTE, 💡 TIP, 📌 IMPORTANT, ⚠️ WARNING,
  ❗ CAUTION. ✅ and 🔥 have no type of their own and travel as TIP and WARNING
  with the emoji kept.
