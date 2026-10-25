# Quickstart: validate find-and-replace edits

Prerequisites: `go`, Node, Playwright as in `web/tests/README.md`.

1. **Go tests** — `go test ./server -run 'Edit|Parity|CredentialAudit'`
   Expect: the scenarios of US1/US2/US4 pass, including every refusal leaving the page
   byte-identical, and the parity run with the `edit` act.
2. **By hand over MCP** (instance from `AGENTS.md` → Commands):
   - create a page with "Launch is on 3 March" once; `write_content` mode `edit` → page
     reads "10 March", `revisions` lists the earlier state, attributed to the agent.
   - quote text present twice → error names 2 matches; page unchanged.
3. **Open editor** — `npm test --prefix web/tests -- find-replace-reload`
   Expect: an editor typing in paragraph 1 while an edit lands in paragraph 5 reloads;
   the page contains the edit; the typed text is in the page or its history (FR-008).
4. **Gate** — `scripts/agent-gate.sh` green; `check-parity.mjs` knows the new route.
