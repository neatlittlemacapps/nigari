---
paths:
  - "server/**/*_test.go"
  - "web/tests/**"
  - "web/scripts/check-*.mjs"
---

# Tests and checks

- **Go:** `testServer(t)` gives a fresh server on a temp directory;
  `signedIn(t, s, email)` an account and cookie; `callTool` an MCP call;
  `newScopeFixture(t)` the credential shapes for gate tests. Reuse them.
- **Test the refusal.** For anything gated, the test that matters is the one
  where the caller must NOT get in: other workspace, read scope, workspace
  closed to agents, strict workspace with a permanent token.
- **Name tests after the behaviour** and say in a comment which bug or rule
  they guard — the existing tests do.
- **Browser:** `web/tests/*.mjs` use `withFixture` from `fixture.mjs`, which
  builds and starts a throwaway instance with synthetic data. Never point a
  test at a real instance. Add new specs to the `test` script in
  `web/tests/package.json`.
- **Checks:** a `check-*.mjs` bundles one pure module with esbuild and asserts
  on it, no framework. New ones are added to `npm run check` in
  `web/package.json`.
- A failing test is fixed by fixing the code. Changing an assertion needs a
  sentence in the pull request on why the old expectation was wrong.
