#!/usr/bin/env bash
# Stop and SubagentStop: an agent may not finish while the gate is red.
#
# Exit 2 hands the gate's output back to the agent and keeps it working. To
# avoid a loop that never ends — a check the agent cannot fix, a broken
# toolchain — it blocks at most three times in a row per session, then lets the
# agent stop and say what is still red.
set -uo pipefail

input="$(cat)"
session="$(jq -r '.session_id // "none"' <<<"$input")"
root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"

counter="${TMPDIR:-/tmp}/salt-gate-${session}"
tries="$(cat "$counter" 2>/dev/null || echo 0)"

if out="$("$root/scripts/agent-gate.sh" 2>&1)"; then
  rm -f "$counter"
  exit 0
fi

if (( tries >= 3 )); then
  rm -f "$counter"
  # Let the agent stop, and make sure the person sees that it stopped red.
  jq -n --arg out "$out" \
    '{systemMessage: ("The gate is still red after three attempts:\n" + ($out | .[-2000:]))}'
  exit 0
fi

echo $((tries + 1)) > "$counter"
echo "$out" >&2
exit 2
