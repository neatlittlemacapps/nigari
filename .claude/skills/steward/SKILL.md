---
name: "steward"
description: "How work moves from a branch to main in this repository: one or two streams, who may touch which files, branch and label hygiene, the reviews before a pull request, and what happens after a merge. Read it before starting a stream, opening a pull request, or handling a CI or review event."
user-invocable: true
---

# Steward: how work reaches main here

The owner merges every pull request by hand and works from a phone. Nobody
moves cards; the board derives itself from labels, pull requests and ticked
tasks (`AGENTS.md`, "How work flows"). These rules keep that picture true
when more than one session works at once. They add to `AGENTS.md` and
`.claude/rules/`; where they say less, those win.

## Streams

The owner's rule (2026-10-29): **at most two streams.** Three or more were
rejected: the conductor cannot review that much, and the shared files below
collide.

- **Conductor** = Claude in the owner's session. Plans, reviews, opens and
  watches pull requests, and talks to the owner.
- **Helper** = one other session, started by the conductor for one spec or
  epic. It does not talk to the owner; questions go to the conductor.
- No second stream while a change runs across the whole repository (the
  rename, spec 011): it touches every file, so any parallel branch conflicts.

### Who may touch what

Each stream owns the files its plan names (the plan's project structure and
Surfaces table). Before starting a helper, the conductor checks the two
plans for files in common and gives each one to one stream only.

These files are shared by every feature. Each stream adds its own entries
and never rewrites or reorders anyone else's:

| File | Why it collides |
| --- | --- |
| `web/src/locales/de.json`, `es.json` | every new string |
| `capabilities.json` | every route and tool; `gapBudget` |
| `.specify/memory/surfaces.md` | a new concept |
| `docs/decisions.md` | newest first: both streams add at the top |
| `wiki/mcp-tools.md` | every tool |
| `server/mcp.go` (`mcpTools`), `server/server.go` (routes) | one list each |

A conflict in one of these is resolved by keeping both sides' entries. The
locale files are JSON objects: keep both keys, then `npm run check`.

### Branches and labels

- One branch per stream, named in the helper's first prompt. A stream never
  pushes to the other's branch, and never to `main`.
- Label the task issues `in-progress` when the stream starts them. Remove the
  label when the pull request merges: closed issues keep no `in-progress`.
- Tick each task in `tasks.md` in the pull request that does it, and list
  every task issue it finishes as `Closes #N` (closing a feature issue does
  not close its sub-issues).
- After any merge to `main`, the other stream merges `main` into its branch
  before its next push: a merge commit, never a rebase or force-push on a
  branch someone else may have checked out.

## Before a pull request is offered

1. `scripts/agent-gate.sh` passes. In a shallow clone, fetch `origin/main` and
   deepen first, or the gate decides nothing changed.
2. The reviews in `.claude/rules/claude-code.md` ran: `/code-review` always;
   `ux-ui-audit` for visible changes (light and dark); `/security-review` when
   sign-in, permissions or tokens change.
3. The conductor reviews a helper's diff before it is offered. The gate
   checks rules; it does not check that a German word means the right thing.
4. The conductor asks the owner before opening it ("Ready to continue with
   opening the PR?"), unless the owner just asked for it.

The pull request body says why the change was needed, lists every surface
as changed or ruled out, names the reviews that ran, and carries the
`Closes #N` lines. Every number in it was measured in the session that
writes it.

## After a pull request is opened

- Subscribe to its activity and set one check-in about 50 minutes later.
- CI red is work now: find the cause, fix and push. A rerun is for a job that
  died before any test ran, at most once.
- Review findings on our own pull requests: fix the small ones in the next
  push; answer the rest on their thread.
- Never enable auto-merge, skip a test, or work around a refused tool call;
  tell the owner the manual step instead.

## After a merge

1. Remove `in-progress` from every issue the pull request closed.
2. Check the release run (every push to `main` is a release): version,
   the five binaries and `SHA256SUMS.txt`, the image job.
3. Bring the working branch up to `main`. If it holds nothing beyond `main`,
   fast-forward it: `git push origin origin/main:refs/heads/<branch>`.
4. Tell the other stream to merge `main`.
