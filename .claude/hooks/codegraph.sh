#!/usr/bin/env bash
# SessionStart: a code graph of this repository that matches the checkout
# (CodeGraph, https://github.com/colbymchenry/codegraph; .claude/rules/codegraph.md
# says how to use it, docs/decisions.md why it is here).
#
# Cloud sessions only. A cloud session may start on a fresh machine, with no
# CodeGraph, no Claude wiring and no index, or on one restored from an earlier
# session, with all three possibly out of date. So every step checks before it
# acts, and a step that is already done costs a second, not a rebuild:
#
#   1. the CLI, at the pinned version (npm, the package's own install route);
#   2. Claude Code's MCP entry and permission (`codegraph install`, global:
#      ~/.claude.json and ~/.claude/settings.json, never files in the repo);
#   3. the index in .codegraph/ (machine-local, ignored through
#      .git/info/exclude, never committed): built when missing, synced when
#      `codegraph status` finds files changed since it was built, rebuilt from
#      scratch only when a sync fails.
#
# On a person's own computer it does nothing: installing a global tool there
# is their decision. And it never fails the session: CodeGraph is a help, not
# a requirement, so a step that goes wrong is reported and the session starts.
set -uo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

VERSION=1.6.2
root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"
cd "$root" || exit 0
# Anonymous usage counts leave the machine unless switched off; off for every
# command this script runs, and saved as the setting below.
export CODEGRAPH_TELEMETRY=0

say() { echo "CodeGraph: $*"; }
warn() { echo "CodeGraph: $*" >&2; }

if [ "$(codegraph version 2>/dev/null)" != "$VERSION" ]; then
  npm install -g "@colbymchenry/codegraph@$VERSION" >/dev/null 2>&1 || { warn "install of $VERSION failed; continuing without it"; exit 0; }
fi
codegraph telemetry off >/dev/null 2>&1

if ! grep -q '"codegraph"' "$HOME/.claude.json" 2>/dev/null; then
  # Written now, read by Claude Code when it starts its MCP servers: on a
  # machine where this is the first run, the MCP tool may only arrive with the
  # next session. The CLI below works either way.
  codegraph install --target=claude --location=global --yes >/dev/null 2>&1 || warn "could not wire the MCP server; the codegraph CLI still works"
fi

# The installer also registers `codegraph prompt-hook` on every message, which
# matches the message's words against symbol names and pastes what it finds:
# a chat line with the word "graph" in it brought in the app's GraphView. The
# owner turned it off (2026-11-01); the graph is queried when a task needs it
# (.claude/rules/codegraph.md). The installer has no flag for this, so the
# one entry is taken out of the global settings it wrote, every start, since
# `codegraph upgrade` rewrites them.
python3 - "$HOME/.claude/settings.json" <<'PY' || warn "could not switch the prompt hook off"
import json, sys
path = sys.argv[1]
try:
    s = json.load(open(path))
except (OSError, ValueError):
    sys.exit(0)
groups = s.get("hooks", {}).get("UserPromptSubmit", [])
kept = []
for g in groups:
    g["hooks"] = [h for h in g.get("hooks", []) if h.get("command", "").strip() != "codegraph prompt-hook"]
    if g["hooks"]:
        kept.append(g)
if kept != groups:
    if kept:
        s["hooks"]["UserPromptSubmit"] = kept
    else:
        del s["hooks"]["UserPromptSubmit"]
        if not s["hooks"]:
            del s["hooks"]
    json.dump(s, open(path, "w"), indent=2)
PY

exclude="$(git rev-parse --git-path info/exclude)"
grep -qxF '.codegraph/' "$exclude" 2>/dev/null || echo '.codegraph/' >>"$exclude"

if [ ! -f .codegraph/codegraph.db ]; then
  codegraph init --yes >/dev/null 2>&1 || { warn "indexing failed"; exit 0; }
  how="built"
elif codegraph status 2>/dev/null | grep -q 'Index is up to date'; then
  how="already current"
elif codegraph sync >/dev/null 2>&1; then
  how="synced with the checkout"
else
  codegraph index --force >/dev/null 2>&1 || { warn "the index is out of date and could not be rebuilt"; exit 0; }
  how="rebuilt"
fi

stats="$(codegraph status 2>/dev/null | awk '/Files:|Nodes:|Edges:/ {sub(":", "", $1); printf "%s%s %s", (n++ ? ", " : ""), $2, tolower($1)}')"
say "index $how ($stats). The live MCP server keeps it in sync while you edit; check with \`codegraph status\`."
say "use it at every step, specifying and planning included: \`codegraph explore \"<symbols or question>\"\`, \`codegraph impact <symbol>\`, \`codegraph callers <symbol>\` (or the codegraph_explore MCP tool) before grep or reading files (.claude/rules/codegraph.md). A plan records what it found in its CodeGraph section."
