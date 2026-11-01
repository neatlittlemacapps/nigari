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
