# CodeGraph: the code graph of this repository

A cloud session starts with a graph of the code built for the current checkout
(`.claude/hooks/codegraph.sh`; why, in `docs/decisions.md`). It holds the
functions, types, routes, imports and calls of the Go server and the frontend,
and the call paths between them, in `.codegraph/codegraph.db`: local to the
machine, never committed. The SessionStart message says whether it was built,
synced or already current. On a person's own computer it exists only if they
ran `codegraph init` themselves; no `.codegraph/` means skip this file.

Use it as a coding tool, not a curiosity:

- **While specifying and planning, too** (owner, 2026-11-02: "You should use
  codegraph also whilst speccing"). A spec's context, a plan's inventory and
  its Surfaces table come from the graph first (`codegraph explore`, `impact`,
  `callers` on the code the feature touches), then text search for strings.
  The plan says what the graph found. Spec 010's first draft skipped this and
  missed spec 001's planned menu batch and the raw-button ratchet.

- **Before a change that reaches past one function**, ask the graph how the
  area works: the MCP tool `codegraph_explore` (if it shows only as a name,
  load it with tool search), or the same from the shell, `codegraph explore
  "<symbols or question>"`. One call returns the source of the relevant
  symbols, the call paths between them and a blast radius.
- **Callers and impact over text search.** `codegraph callers <symbol>`,
  `codegraph callees <symbol>`, `codegraph impact <symbol>`, and
  `git diff --name-only | codegraph affected --stdin` for the tests a change
  reaches. A grep finds the word; the graph finds the call, including the
  hops grep cannot see (a component rendered, a callback, a REST route and
  its handler). This is what keeps a change from missing a surface: the MCP
  path beside the REST path, the second caller of a gate.
- **Then read the code itself.** The graph says where to look and what
  depends on what; the decision still rests on the source and the tests.
  Grep stays right for strings: translation keys, CSS classes, comments.
- **Never assume it is current.** `codegraph status` says "Index is up to
  date" or lists the files changed since; `codegraph sync` catches it up. The
  MCP server watches the files while it runs (2-second debounce), but a shell
  without it, a branch switch or a pull is caught only by a sync.
- **After a change that moved or renamed things**, run `codegraph status`
  (sync if it says so) and check the graph shows the change before relying on
  it for the next step, e.g. `codegraph callers <the new function>`.

Its numbers (files, nodes, edges) describe the index, not the product: a figure
for a document or pull request is still measured from the code (`AGENTS.md`).
