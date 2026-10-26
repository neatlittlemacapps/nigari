# Feature Specification: Edit page content by find-and-replace

**Feature Branch**: `003-find-replace-edits`

**Created**: 2026-10-25

**Status**: Draft

**Input**: User description: "Edit page content by find-and-replace (issue #13). An agent changes one passage of a page by naming the exact text to replace and its replacement, instead of rewriting the whole body."

**Issue**: #13

## Background

An agent can add to a page (at the end or the start) or replace the whole body. To fix one
sentence it must read the page, rewrite all of it, and send it back. Three things go wrong
with that today:

- Everything it did not mean to change is retyped, so any slip in the copy changes the page.
- Any outside write discards the live editing session: people who have the page open are
  disconnected and reloaded with the new text (their unsaved keystrokes are kept in the page
  history, not lost, but the interruption is real). A one-word fix interrupts everyone.
- The history records "the whole page changed" when one word did.

Notion's API offers exactly this operation (search-and-replace edits that must match once),
which is why it is on the board as a Notion-inspired feature.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An agent corrects one passage without rewriting the page (Priority: P1)

An agent asked to "fix the date in the launch plan" names the sentence as it appears on the
page and the corrected sentence, and only that passage changes.

**Why this priority**: it is the feature. Everything else refines it.

**Independent Test**: on a page with known text, request one edit; read the page back; only
the named passage differs, and the page history shows the edit.

**Acceptance Scenarios**:

1. **Given** a page containing the passage "Launch is on 3 March" exactly once, **When** an agent asks to replace it with "Launch is on 10 March", **Then** the page contains the new passage, the rest of the page is unchanged character for character, and the agent is told one edit was applied.
2. **Given** the same page, **When** the agent sends several edits in one request, **Then** they are applied in order, each against the result of the previous one, and either all are applied or none.
3. **Given** a successful edit, **When** a person opens the page history, **Then** the state before the edit is there to restore, and the edit is attributed to the agent.

---

### User Story 2 - An ambiguous or stale edit is refused, with a reason the agent can act on (Priority: P1)

An agent quotes text that appears twice, or that someone changed a moment ago, and nothing
is changed; the answer says why and how to fix the request.

**Why this priority**: a find-and-replace that guesses is worse than a full rewrite. Refusal
is what makes the operation safe.

**Independent Test**: request edits whose quoted text matches zero times and twice; the page is
unchanged and each answer names the count.

**Acceptance Scenarios**:

1. **Given** a passage that appears twice, **When** an agent asks to replace it without saying "all", **Then** nothing changes and the answer says it matched 2 times and to quote more surrounding text or to ask for all occurrences.
2. **Given** a passage that does not appear, **When** an agent asks to replace it, **Then** nothing changes and the answer says it matched 0 times and to read the page again.
3. **Given** an edit that would remove a link to a sub-page or an embedded database, **When** the agent has not explicitly allowed that, **Then** nothing changes and the answer names what would have been removed.
4. **Given** "replace all occurrences", **When** the passage appears 3 times, **Then** all three change and the answer says 3.

---

### User Story 3 - People editing the page are not interrupted (Priority: P2)

Two colleagues are writing in the page while an agent corrects a typo further down. Their
editing session carries on.

**Why this priority**: it is the most visible improvement for people working beside agents.
Per FR-008 it ships in two steps: this feature keeps today's reload; the uninterrupted
session is a follow-up.

**Independent Test**: keep an editor open and typing while an agent applies an edit; observe
the editor's session and the final text.

**Acceptance Scenarios**:

1. **Given** a person typing in paragraph 1, **When** an agent edits paragraph 5, **Then** the person's text and the agent's edit both end up in the page; the person's editor reloads with the new text and any unsaved keystrokes are kept in the page history (FR-008).
2. *(Follow-up, not this feature)* **Given** the same situation, **When** live delivery lands, **Then** the person's session is not interrupted.

---

### User Story 4 - The same edit over the REST API (Priority: P3)

A script uses the same operation over the REST API, with the same rules.

**Why this priority**: parity between the doors (`capabilities.json`, constitution II).

**Independent Test**: the same requests over REST and MCP give the same results and refusals.

**Acceptance Scenarios**:

1. **Given** the same page and credential, **When** the same edit is sent over REST and over MCP, **Then** both are allowed or both refused, with the same reason.

### Edge Cases

- **Text inside formatting**: the agent quotes text as it reads it from the page (the same Markdown form the read operation returns), including markup such as `**bold**` or link syntax. A quote that splits a formatting mark is matched as written; if the result would be malformed, the edit is refused.
- **Text spanning blocks**: a quote may span several blocks (for example two paragraphs) when the agent quotes them as they read; the replacement may change the number of blocks.
- **Empty replacement**: allowed, and deletes the passage, under the same sub-page and database protection.
- **Very long pages**: an edit on a page of many thousands of blocks works without reading the page into the agent.
- **Trashed pages, read-only credentials, workspaces closed to agents, private pages of others**: refused exactly as other writes are.
- **Untrusted content**: the page text is user data; the operation never interprets it as instructions, and answers do not echo whole pages back.
- **Case**: matching is exact and case-sensitive.
- **Concurrent edits by two agents**: each request is atomic; the second sees the first's result or is refused because its quote no longer matches.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST let a caller with write access to a page replace an exact passage of its content with new content, by naming the passage as it reads it and the replacement.
- **FR-002**: A request MUST be able to carry several edits, applied in order, each to the result of the previous one, and MUST be atomic: all applied or none.
- **FR-003**: An edit MUST be refused, with nothing changed, when its passage matches zero times or more than once, unless the caller asked to replace all occurrences. The answer MUST state the number of matches and the remedy.
- **FR-004**: An edit MUST be refused when it would remove a link to a sub-page or an embedded database, unless the caller explicitly allows it in the request; the answer MUST name what would be removed.
- **FR-005**: A successful request MUST save the previous state in the page history and attribute the change to the caller (person or agent), as other writes do.
- **FR-006**: The answer MUST say how many replacements were made per edit and MUST NOT return the whole page.
- **FR-007**: The operation MUST apply the same permission and credential checks as every other write: page rights, workspace access for credentials, read-only scope, trash.
- **FR-008**: Open editing sessions on the page MUST be reloaded with the new text, as every outside write does today, with unsaved keystrokes kept in the page history. Delivering the edit live into running sessions (like a colleague's typing) is a follow-up feature, not part of this one.
- **FR-009**: The operation MUST be available to agents over MCP and to scripts over the REST API with identical behaviour, refusals and limits.
- **FR-010**: Search, backlinks, webhooks (`page.updated`) and the activity log MUST reflect the edited content as they do for other writes.
- **FR-011**: The existing ways to write content (append, prepend, replace all) MUST keep working unchanged.

### Key Entities

- **Edit**: a passage to find, its replacement, and whether all occurrences are meant.
- **Edit request**: an ordered list of edits for one page, plus whether removing sub-page links or embedded databases is allowed.
- **Edit result**: per edit, the number of replacements; or, on refusal, which edit failed, the match count and the remedy.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Correcting one sentence on a page takes one request and changes only that sentence: a character-level comparison of the page before and after shows differences only inside the replaced passage, in 100% of test cases.
- **SC-002**: An ambiguous or missing quote never changes a page: 0 changed pages across all refusal tests.
- **SC-003**: The data an agent sends to fix one sentence on a 5,000-word page is under 1% of what a full rewrite sends.
- **SC-004**: REST and MCP agree on every allow/refuse verdict for this operation in the parity property test.
- **SC-005**: Edits made while a person is typing never lose either the person's or the agent's text (the editor reloads, per FR-008).

## Assumptions

- Matching works on the page's Markdown form as returned by the read operation, because that is the form agents already see and quote.
- A person's own find-and-replace inside the editor is out of scope; people already edit text directly. It can be a separate feature.
- The request size limits that apply to other content writes apply here.
- This change extends an existing capability (`pages.update` in `capabilities.json`); it does not add a new parity gap.

## Clarifications

### Session 2026-10-25

- Q: During an agent's find-and-replace, do open editors keep running (A), reload as today (B), or B now and A later (C)? → A: **C**. This feature reloads open editors as other outside writes do; live delivery into running sessions is #26. Rejected: A now (needs server-side Yjs merging, much larger), B only (leaves the interruption with no plan).

## Out of Scope

- Delivering the edit live into open editing sessions without a reload (follow-up, see FR-008).

- Regular expressions or fuzzy matching.
- Editing database row properties (already covered by setting properties).
- A find-and-replace dialog for people in the editor.
