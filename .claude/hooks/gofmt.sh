#!/usr/bin/env bash
# PostToolUse on Edit|Write: gofmt the Go file Claude just changed.
#
# Skips a file that is already unformatted in the last commit, so a one-line
# change does not arrive with an unrelated reformat of the whole file (see
# .claude/rules/claude-code.md). Never blocks: formatting is a convenience, and
# the gate is where an unformatted file actually fails.
set -uo pipefail

file="$(jq -r '.tool_input.file_path // empty')"
[[ "$file" == *.go && -f "$file" ]] || exit 0
command -v gofmt >/dev/null || exit 0

root="$(git -C "$(dirname "$file")" rev-parse --show-toplevel 2>/dev/null)" || exit 0
rel="${file#"$root"/}"
if git -C "$root" cat-file -e "HEAD:$rel" 2>/dev/null \
   && [[ -n "$(git -C "$root" show "HEAD:$rel" | gofmt -l 2>/dev/null)" ]]; then
  exit 0
fi
gofmt -w "$file" 2>/dev/null || true
exit 0
