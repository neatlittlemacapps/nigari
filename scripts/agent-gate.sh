#!/usr/bin/env bash
# The gate an agent must pass before it may call its work done.
#
#   scripts/agent-gate.sh          # checks what changed against the base branch
#   scripts/agent-gate.sh --all    # checks everything, as CI does
#
# It runs the same checks a contributor runs (CONTRIBUTING.md), but only the
# halves a change can have broken, so it stays fast enough to run every time an
# agent stops. A gate that takes minutes gets switched off, and then it guards
# nothing. CI still runs everything on every pull request.
#
# Exit 0: green. Exit 1: red, with the failing output on stderr — that output is
# what the Stop hook hands back to the agent, so it says what to fix.
set -uo pipefail

root="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
cd "$root"

all=0
[[ "${1:-}" == "--all" ]] && all=1

# What changed: committed on this branch since it left the base, plus anything
# staged, unstaged or untracked. The base is main when it exists.
base="$(git merge-base HEAD origin/main 2>/dev/null || git merge-base HEAD main 2>/dev/null || git rev-parse HEAD)"
changed="$( { git diff --name-only "$base"; git ls-files --others --exclude-standard; } | sort -u )"

touches() { [[ $all -eq 1 ]] || grep -qE "$1" <<<"$changed"; }

if [[ $all -eq 0 && -z "$changed" ]]; then
  echo "gate: nothing changed"
  exit 0
fi

failed=0
report() { echo "gate: $1" >&2; failed=1; }

# ---- Go --------------------------------------------------------------------
if touches '\.go$|^go\.(mod|sum)$'; then
  # gofmt on changed files that were formatted at the base. A file that was
  # already unformatted there is not this change's business.
  while IFS= read -r f; do
    [[ "$f" == *.go && -f "$f" ]] || continue
    if git cat-file -e "$base:$f" 2>/dev/null && [[ -n "$(git show "$base:$f" | gofmt -l 2>/dev/null)" ]]; then
      continue
    fi
    if [[ -n "$(gofmt -l "$f")" ]]; then
      report "$f is not gofmt-formatted (run: gofmt -w $f)"
    fi
  done <<<"$changed"

  if ! out="$(go vet ./server/... 2>&1)"; then
    report "go vet failed:"; echo "$out" >&2
  fi
  # The root package embeds web/dist and cannot compile before a frontend
  # build, so it is tested only when one exists.
  pkgs=(./server/...)
  [[ -d web/dist ]] && pkgs+=(.)
  if ! out="$(go test "${pkgs[@]}" 2>&1)"; then
    report "go test failed:"; echo "$out" | grep -vE '^(ok|PASS|=== RUN|--- PASS)' | tail -80 >&2
  fi
fi

# ---- Frontend, translations, wiki ------------------------------------------
# check-wiki reads server/mcp.go and server.go too, so a server change that
# renames a tool or a route has to pass it as well.
if touches '^web/|^wiki/|^server/(mcp.*|server)\.go$'; then
  if [[ ! -d web/node_modules ]]; then
    echo "gate: installing web dependencies (npm ci)…"
    if ! out="$(npm ci --prefix web --no-audit --no-fund 2>&1)"; then
      report "npm ci failed:"; echo "$out" | tail -20 >&2
    fi
  fi
  if [[ -d web/node_modules ]] && ! out="$(npm run check --prefix web 2>&1)"; then
    report "npm run check failed:"; echo "$out" | grep -vE '^\s*(ok|note)\b' | tail -60 >&2
  fi
fi

if [[ $failed -ne 0 ]]; then
  echo "gate: RED — fix the causes above; do not weaken a check to pass it." >&2
  exit 1
fi
echo "gate: green"
