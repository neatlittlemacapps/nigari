---
paths:
  - "server/mcp*.go"
  - "wiki/mcp-tools.md"
  - "wiki/agent-access.md"
---

# MCP tools

- **Parity with the interface.** A tool does what the matching REST route does,
  with the same validation. When you find a check on one side only, the fix is
  to make both call one function — not to copy the check across. The comment at
  the top of `mcp_pages.go` and the cover check in `mcpUpdatePageMeta` show why.
- **Gates.** `mcpCall` refuses mutating tools for read-scoped tokens and checks
  `credentialMayEnter` for `page_id` and `parent_id`. A tool that reaches pages
  any other way (a list, a search, a workspace id, ids inside its arguments)
  must check every page it touches itself. `credential_audit_test.go` holds the
  outsider shapes that must stay out; add your tool to it.
- **Untrusted content.** Anything a person wrote that you return (page text,
  titles in bulk, search passages, comments) goes through `wrapUntrusted`.
  Workspace rules use `wrapWorkspaceRules`; never mix the two.
- **Closed on purpose.** The `not_available_via_mcp` list in
  `mcp_workspace.go` is a decision, not a gap. Do not add tools for it; if a
  change moves the line, update that list and `wiki/agent-access.md` together.
- **The tool catalogue is read by agents.** Descriptions say when to use the
  tool, what it refuses and why, in full sentences. Prefer one tool with an
  `action` argument over several near-identical tools — the list is kept small
  on purpose (see `mcp_merged.go`).
- **Every tool name is checked against the wiki** by `check-wiki.mjs`: a new
  tool needs its section in `wiki/mcp-tools.md`, a removed one must leave it.
- **Tests** call `callTool(t, s, u, name, args)` against `testServer(t)`. Cover
  the refusal paths, not only the happy path.
