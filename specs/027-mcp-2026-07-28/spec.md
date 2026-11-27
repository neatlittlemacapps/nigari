# Feature Specification: nigari speaks MCP 2026-07-28, and agents gain tasks, confirmations and skills

**Feature Branch**: `claude/hopeful-wozniak-gw9g8v`

**Created**: 2026-11-27

**Status**: Draft

**Issues**: #1034

**Input**: Owner, 2026-11-27: "research mcp 2 and figure out how we could
implement support for it and what new features we could foresee in nigari",
then "Create all required tickets and start this work up to the specified
issues." The research is in epic #1034. "MCP 2" is the informal name for
the MCP specification revision dated 2026-07-28, which was finalized on that
date. On 2026-11-24 Claude made Tasks and Elicitation generally available and
put Skills over MCP in public beta.

## Context

From the code graph (`codegraph explore` on `handleMCP`, `mcpCall`,
`mcpTools`, `isMCPTool`, `currentUser`, `handleOAuthRegister`,
`handleAuthorizationServerMetadata`, `startIngest`, `ingestRegistry`,
2026-11-27) and the source:

- **One door, already nearly stateless.** `handleMCP` (`server/mcp.go`)
  serves `/mcp` and `/mcp/{token}`. It accepts POST only, keeps no session,
  sends no `Mcp-Session-Id`, opens no GET stream and refuses JSON-RPC
  batches. Each call is authorised on its own through `currentUser`. That is
  the model the 2026-07-28 revision prescribes, so the change is mainly in
  what the request and the answer carry, not in how state is kept.
- **Only the legacy handshake is understood.** `initialize` echoes the
  client's version (default `2025-06-18`) and returns `serverInfo` with
  icons, `capabilities: {tools: {}}` and the workspace-rules `instructions`.
  `ping`, `tools/list` and `tools/call` follow. Every other method gets
  -32601, and any `notifications/*` gets 202. A 2026-07-28 client that
  sends a stateless `tools/call` today reaches `tools/call` and works by
  accident. It never learns the server's capabilities, and nigari never
  checks the version it asked for.
- **All gates live in `mcpCall`.** These include read-only scope, idempotency
  keys per credential, `canRead`/`canWrite`, `credentialMayEnter`, presence
  touch and `wrapUntrusted`. Tool errors come back as `isError` text results,
  not JSON-RPC errors. Nothing here changes. A new protocol era has to reach
  the same function.
- **Long work already exists, in memory.** `import_url` starts an ingest job
  (`startIngest`) held in `ingestRegistry`, which is a map in memory that
  keeps the last 20 jobs. `get_import_status` polls it. A restart loses every
  job. The Tasks extension requires that a task be stored durably before the
  reply is sent.
- **The OAuth server is our own** (`oauth_provider.go`). It provides
  protected-resource and authorization-server metadata, Dynamic Client
  Registration (`/oauth/register`), PKCE S256 only, a consent screen,
  `resource` binding, refresh and revocation. It does not have Client ID
  Metadata Documents, an `iss` parameter on the authorization response, or
  a 403 `insufficient_scope` answer. A read-only token's write attempt is a
  tool error inside a 200.
- **The tool list is static and the same for everyone.** `mcpTools` is one
  slice, and a read token is refused per call rather than shown fewer tools.
  This makes the list publicly cacheable as long as that stays true.
- **Agent playbooks live in prose.** The workspace-rules convention sits in
  the `initialize` instructions, and the how-to lives in long tool
  descriptions. That text is in an agent's context on every turn, whether it
  needs it or not.

## Clarifications

### Session 2026-11-27

- Q: What happens when a client that cannot ask the person makes a confirmable call? → A: The act runs, as it does today (owner, 2026-11-27, "Act as today"). Clients that can ask get the confirmation. Turned down: refusing the call, which would break these acts for older clients, and a per-workspace switch.
- Q: Which playbooks does nigari serve as skills? → A: Its own built-in playbooks, plus per-workspace skills made from each workspace's rules and database templates, which update when an admin changes them (owner, 2026-11-27, "Built-in + workspace"). Turned down: built-in only.
- Q: How long does the legacy `initialize` era stay? → A: Until every client in our test list (Claude, Claude Code, ChatGPT and the others we test) speaks 2026-07-28. It is then removed in a release of its own, with an entry in `docs/decisions.md` (owner, 2026-11-27). Turned down: keeping it indefinitely, and removing it at a fixed date.
- The epic's fourth question (does MCP Apps get its own epic?) is settled under Decisions: yes, with phase 6.

## Decisions

- **Serve both eras on one endpoint** (allowed by the 2026-07-28 lifecycle).
  A request that carries the per-request protocol version in `_meta` is
  answered under 2026-07-28. `initialize` selects the legacy behaviour.
  Turned down: a second endpoint (`/mcp2`), because every connector already
  configured would have to be changed by hand. Also turned down: dropping
  the legacy era now, because ChatGPT and other clients we test still send
  `initialize`.
- **One gate path for both eras.** Both eras call `mcpCall` unchanged.
  Turned down: a parallel dispatcher per era, which is exactly the
  "check on one door only" history that constitution III exists to stop.
- **Tasks are stored in SQLite, not in memory.** The spec requires durable
  creation, and nigari is one binary with one database file (constitution
  I). The in-memory ingest registry keeps serving `get_import_status` for
  legacy clients until the task store replaces it.
- **Phase 6 is out of this spec.** Pages as resources with subscriptions,
  MCP Apps (interactive views inside the client) and file uploads, which are
  still experimental, each change what a person sees or what nigari pushes.
  Each has its own issue: #1069 (resources and subscriptions), #1070 (MCP
  Apps epic) and #1071 (file uploads, waiting until the extension is no
  longer experimental). This spec keeps the
  extension mechanism they will plug into.
- **No new tools.** Every new ability is a protocol method or a different
  result shape for an existing tool. `mcpTools` stays the same size
  (`.claude/rules/mcp.md` keeps the list small).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A current client connects and works without falling back (Priority: P1)

A person adds nigari as a connector in a client that speaks MCP 2026-07-28
(Claude, Claude Code). The client asks nigari what it supports, sees the
current revision, and calls tools with no legacy handshake. Everything the
agent could do before, it can still do, with the same refusals.

**Why this priority**: This is the base the other stories build on. Without
it nigari cannot declare any extension, and a client that drops its legacy
fallback stops working.

**Independent Test**: Use a client (or a test) that speaks only 2026-07-28.
Discover, list the tools, and call a read tool and a write tool with a read
token and with a write token. Check that the answers and refusals match
those of the same calls through `initialize`.

**Acceptance Scenarios**:

1. **Given** a valid token, **When** the client asks the server to describe
   itself, **Then** the answer lists 2026-07-28 among the supported
   versions, nigari's name, version and icons, the tool capability, the
   workspace-rules instructions, and the extensions nigari supports.
2. **Given** a request that names an unsupported version, **When** it
   arrives, **Then** it is refused with the "unsupported protocol version"
   error, which lists the versions nigari supports.
3. **Given** a request whose routing headers disagree with its body (a
   different method or tool name), **When** it arrives, **Then** it is
   refused as a header mismatch and no tool runs.
4. **Given** a read-only token, **When** it calls a write tool under
   2026-07-28, **Then** it is refused exactly as under the legacy era, and
   nothing is written.
5. **Given** a client that still sends `initialize` (2025-06-18 or
   2025-11-25), **When** it connects, **Then** it works exactly as today.

---

### User Story 2 - An agent asks before it does something hard to undo (Priority: P2)

An agent is about to trash a page with its whole sub-tree, make a page
public, delete a view or copy a workspace. Instead of acting at once, nigari
asks the person through the client ("Trash 'Roadmap' and its 14 sub-pages?")
and acts only after they confirm.

**Why this priority**: This is the most visible safety gain for people who
let agents into their workspace, and Claude supports it today.

**Independent Test**: Through a client that supports elicitation, call
`set_trashed` with `recursive`. Check that the first answer asks for
confirmation and nothing is trashed. Check that the retry with "yes" trashes
the tree, and the retry with "no" changes nothing.

**Acceptance Scenarios**:

1. **Given** a client that declared it can ask the person, **When** an agent
   calls one of the confirmable acts, **Then** nigari answers "input
   required" with a plain question naming what will happen, and nothing is
   changed yet.
2. **Given** that question, **When** the client retries with a confirmation,
   **Then** the act runs, under the same permission checks as a direct call.
3. **Given** that question, **When** the person declines, **Then** nothing
   changes and the agent is told the person declined.
4. **Given** a client that cannot ask, **When** the same call arrives,
   **Then** the act runs as it does today, under the same gates.
5. **Given** a confirmation retry, **When** the page changed in between
   (trashed already, permission lost), **Then** the retry is checked afresh
   and refused if it no longer may run.

---

### User Story 3 - A long import runs as a task the agent checks on later (Priority: P2)

An agent imports a large JSON source with `import_url`. nigari returns a task
at once. The agent carries on with other work and later reads the result:
how many records were written, and the errors. A restart of nigari in the
meantime does not lose the task's record.

**Why this priority**: The work already happens in the background. Tasks
make it a standard the client understands, and storing it durably fixes
jobs that a restart loses today.

**Independent Test**: Through a client that declares the Tasks extension,
start an import, poll the task, restart the server and poll again. Cancel
another one mid-way.

**Acceptance Scenarios**:

1. **Given** a client that declared Tasks, **When** it calls `import_url`,
   **Then** it gets a task handle with a suggested poll interval, and the
   task is stored before the answer is sent.
2. **Given** a task, **When** another credential (another person, or a
   narrower token of the same person) asks for it, **Then** it is "not
   found".
3. **Given** a running task, **When** the client cancels it, **Then** the
   import stops at the next record and the task ends as cancelled. Records
   already written stay.
4. **Given** a server restart during an import, **When** the client polls,
   **Then** the task reads as failed with the reason "interrupted by a
   restart". It does not read as running forever.
5. **Given** a client that did not declare Tasks, **When** it calls
   `import_url`, **Then** it gets today's `job_id` answer.

---

### User Story 4 - An agent loads nigari's how-to only when it needs it (Priority: P3)

An agent connected to nigari sees a short list of skills, such as "Working
in a nigari workspace" and "Building a database". It loads one only when the
task calls for it, instead of carrying every convention in its context on
every turn.

**Why this priority**: It saves context and makes agents better at using
nigari. Hosts support it only in beta, so it comes after the stories that
are generally available.

**Independent Test**: Through a client that declares Skills, list the skills,
fetch one, and read its files. Check that their content matches the
playbooks in the repository.

**Acceptance Scenarios**:

1. **Given** a client that supports Skills, **When** it lists them, **Then**
   it gets nigari's skills with a name and description each, and a
   freshness hint.
2. **Given** a skill, **When** the client fetches it and its files, **Then**
   each file's content and digest match what nigari ships.
3. **Given** the skill scope settled below, **When** it lists skills, **Then**
   it sees nigari's built-in skills, and one skill for each workspace the
   credential may enter that has rules or database templates.
4. **Given** a workspace closed to agents, or outside a token's workspace
   scope, **When** the client lists or fetches skills, **Then** that
   workspace's skill is neither listed nor readable ("not found").
5. **Given** an admin who changes a workspace's rules or adds a template,
   **When** the client next fetches that workspace's skill after its
   freshness window, **Then** it gets the new content with a new digest.

---

### User Story 5 - Signing in with a current client is safe without registration (Priority: P3)

A person connects a client that identifies itself with a client metadata URL
instead of registering. nigari reads the client's published name and
redirect addresses, shows them on the consent screen, and issues a grant
bound to that client. The authorization answer names nigari as its issuer,
so the client can detect a mix-up.

**Why this priority**: Registration (DCR) is deprecated in 2026-07-28 but
still works, so this is hardening, not a blocker.

**Independent Test**: Run the OAuth flow with a client ID that is an HTTPS
URL serving a metadata document. Check that the consent screen shows its
name, that an unregistered redirect is refused, and that the code response
carries `iss`.

**Acceptance Scenarios**:

1. **Given** a client ID that is a metadata URL on a public host, **When**
   the person starts sign-in, **Then** nigari fetches the document under
   the same public-host rule as `import_url`, and shows the client's name
   with its host on the consent screen.
2. **Given** a metadata URL on a private address, or a document whose
   `client_id` does not equal its URL, **When** sign-in starts, **Then** it
   is refused.
3. **Given** any authorization response, **When** it is sent, **Then** it
   carries nigari's issuer, and the server metadata says so.
4. **Given** a read-only token over HTTP, **When** it calls a write tool,
   **Then** the refusal names the missing scope, so a client can ask for a
   wider grant.

### Edge Cases

- A request carries both the legacy `initialize` and a modern `_meta`
  version: `initialize` wins (legacy era), as the lifecycle prescribes.
- A request carries neither (an old client that skipped `initialize`, as
  some do today): it is served as today, under the legacy era, so nothing
  that works now breaks.
- A header value that is not ASCII arrives encoded (`=?base64?…?=`): it is
  decoded before comparing.
- An idempotency key is reused across eras: the cached answer comes back.
  The key is per credential, not per era.
- An elicitation retry arrives with a forged or stale request state: nigari
  treats it as a fresh call. The state is signed, and it names the
  credential and the act.
- A task's owner token is revoked: its tasks become unreachable, and a
  running import stops.
- A skill file is changed in a new release: its digest changes, and a
  client's cache sees the new version within the freshness window.
- A client metadata URL is slow or huge: the fetch has a time and size
  limit, and the consent screen shows a plain error.

## Requirements *(mandatory)*

### Functional Requirements

*Protocol core (Story 1)*

- **FR-001**: The MCP endpoint MUST answer requests under revision 2026-07-28
  and under the legacy revisions it answers today (2025-06-18, 2025-11-25),
  on the same address, with the era chosen per request.
- **FR-002**: A self-description request MUST return the supported versions,
  server identity (name, version, icons), capabilities including declared
  extensions, the workspace-rules instructions, and a freshness hint.
- **FR-003**: Under 2026-07-28, every answer MUST say whether it is complete,
  needs input, or is a task. List answers MUST carry a freshness hint and a
  cache scope, and the tool list MUST come in a stable order.
- **FR-004**: Under 2026-07-28, a request whose protocol-version, method or
  name headers disagree with its body MUST be refused before any tool runs.
  An unsupported version MUST be refused with the list of supported
  versions.
- **FR-005**: Both eras MUST reach the same permission, credential,
  read-scope, idempotency, rate-limit and untrusted-content handling.
  Answers and refusals for the same call MUST be identical apart from the
  envelope.
- **FR-006**: Methods the 2026-07-28 revision removed (`ping`,
  `logging/setLevel`) MUST stay available to the legacy era only.

*Confirmations (Story 2)*

- **FR-007**: For a set of acts that are hard to undo (recursive trash, making
  a page public or sharing it by link, deleting a view, copying a workspace
  structure), nigari MUST ask the person through the client before acting,
  when the client declared it can ask.
- **FR-008**: The question MUST name the act and its reach in plain words
  (page title, number of sub-pages). The title is shown as untrusted text.
- **FR-009**: A confirmed retry MUST pass every gate again. Confirmation
  state MUST be bound to the credential and the exact act, and a forged or
  reused state MUST NOT authorise anything.
- **FR-010**: A client that cannot ask MUST get today's behaviour: the act
  runs under the same gates.

*Tasks (Story 3)*

- **FR-011**: For a client that declared the Tasks extension, `import_url`
  MUST return a task. Further long operations MAY follow under the same
  mechanism (recursive duplicate, a recursive export, bulk row writes #21).
- **FR-012**: A task MUST be stored durably before its handle is returned.
  It MUST be readable and cancellable only by the credential that started it
  (same person, same token kind and workspace scope). It MUST expire after
  a retention period.
- **FR-013**: A task running when the server stops MUST read as failed with
  a stated reason after the restart.
- **FR-014**: A client that did not declare Tasks MUST get today's answers,
  `get_import_status` included.

*Skills (Story 4)*

- **FR-015**: For a client that declared Skills, nigari MUST list and serve
  its skills, each with a name, description, files, digests and a freshness
  hint.
- **FR-016**: Skill content MUST come from files in the repository, embedded
  in the binary, and be checked by the build (a skill that names a tool that
  does not exist fails, as the wiki check does today).
- **FR-017**: Besides the built-in skills, nigari MUST offer one skill per
  workspace with rules or database templates. It MUST be listed and served
  only to a credential that may read that workspace (`canRead` on the
  workspace and `credentialMayEnter`). Its text MUST be marked as untrusted
  content, and the skill list MUST be cached privately, per credential.

*Authorization (Story 5)*

- **FR-018**: The OAuth server MUST accept a client ID that is an HTTPS
  metadata URL. It MUST fetch the document under the public-host rule with
  time and size limits, require the document's `client_id` to equal the
  URL, and allow only the redirect addresses it lists.
- **FR-019**: The consent screen MUST show a metadata-URL client's name
  together with its host, so a person can tell a look-alike apart.
- **FR-020**: Authorization responses MUST carry the issuer, and the server
  metadata MUST advertise that they do.
- **FR-021**: A credential refused for scope over HTTP MUST be told which
  scope it lacks, in the form the specification defines.
- **FR-022**: Dynamic Client Registration MUST keep working for clients that
  use it.

*Era support*

- **FR-023**: The legacy era MUST stay supported until every client in the
  test list speaks 2026-07-28. Its removal is a later release of its own,
  with a decision record, and is not part of this feature.

### Key Entities

- **Task**: a long operation started by one credential. It has a status
  (working, input required, completed, failed, cancelled), a result or
  error, creation and expiry times, and a suggested poll interval. It
  belongs to the person and to the credential's kind and workspace scope.
- **Skill**: a named playbook with a description and one or more files, each
  with a digest. A built-in skill ships with the binary. A workspace skill is
  made from that workspace's rules and templates and belongs to the
  workspace's access.
- **Client metadata document**: a client's self-published name and redirect
  addresses, fetched when sign-in starts and kept with the grant.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A client that speaks only 2026-07-28 completes every MCP test
  that today runs through `initialize`, with the same results.
- **SC-002**: Every existing MCP and parity test passes unchanged for the
  legacy era, and the parity test passes for both eras.
- **SC-003**: No confirmable act runs without the person's "yes" when the
  client can ask. Measured by tests for each act, for confirm, decline and
  forged state.
- **SC-004**: An import started as a task survives a restart as a readable
  record, in 100% of runs of the restart test.
- **SC-005**: An agent working through a skill instead of the long
  instructions starts with a smaller context. The initial instructions and
  descriptions shrink by a measured amount, recorded in the plan.
- **SC-006**: Answering under the new era adds no measurable time per call
  compared with the legacy era (benchmark in the plan).

## Assumptions

- The 2026-07-28 revision and its Tasks and Skills extensions do not change
  in an incompatible way before this ships. Tasks is Stable, and Skills
  (SEP-2640) is Final with hosts in beta.
- Claude and Claude Code are the reference clients for testing. ChatGPT and
  others stay on the legacy era until they move.
- Sampling, Roots and Logging are deprecated and nigari never offered them,
  so nothing is removed.
- The public-host fetch rule used by `import_url` and webhooks is the right
  one for client metadata URLs.
- No UI work beyond the consent screen (Story 5) and any wording the
  confirmation questions need.
