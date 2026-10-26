#!/usr/bin/env bash
# Closes the issue of every task ticked in a spec's tasks.md, and prints the
# numbers it closed (one per line) so the caller can sync them to the board.
#
#   scripts/tasks-sync.sh                 # every specs/*/tasks.md
#   scripts/tasks-sync.sh specs/002-storage-engine/tasks.md
#
# Run by .github/workflows/board-sync.yml when a tasks.md changes on main.
# Needs GH_TOKEN (issues: write) and GITHUB_REPOSITORY.
#
# Why: tasks.md is the source of truth for tasks, and its issues mirror it.
# A feature's pull request says "Closes #<feature>", and GitHub does not close
# sub-issues with their parent. Spec 003 merged with all twenty tasks ticked
# and all twenty issues still open. The mapping is read from the issues
# themselves: the tasks.md line `**Issues**: parent #N …` names the feature
# issue, and each sub-issue's title starts with its task ID (`T001: …`), as
# /speckit-github-taskstoissues writes them. Task IDs repeat across specs, so
# matching is only ever done among one parent's sub-issues.
#
# Only closes. A task unticked after its issue closed is a decision for a
# person, so it is reported, not reopened.
set -euo pipefail

: "${GH_TOKEN:?set GH_TOKEN to a token that may close issues}"
repo="${GITHUB_REPOSITORY:?set GITHUB_REPOSITORY to owner/repo}"
owner="${repo%%/*}"
name="${repo#*/}"

files=("$@")
[[ ${#files[@]} -gt 0 ]] || mapfile -t files < <(ls specs/*/tasks.md 2>/dev/null)

for file in "${files[@]}"; do
  parent="$(grep -m1 -oE '^\*\*Issues\*\*:.*parent #[0-9]+' "$file" | grep -oE '[0-9]+$' || true)"
  if [[ -z "$parent" ]]; then
    echo "tasks-sync: $file names no parent issue, skipped" >&2
    continue
  fi
  ticked="$(grep -oE '^- \[[xX]\] T[0-9]{3,}' "$file" | grep -oE 'T[0-9]+' || true)"
  open_ids="$(grep -oE '^- \[ \] T[0-9]{3,}' "$file" | grep -oE 'T[0-9]+' || true)"

  subs="$(gh api graphql -f owner="$owner" -f name="$name" -F number="$parent" -f query='
    query($owner: String!, $name: String!, $number: Int!) {
      repository(owner: $owner, name: $name) { issue(number: $number) {
        subIssues(first: 100) { nodes { number title state } } } }
    }' -q '.data.repository.issue.subIssues.nodes[] | [.number, (.title | capture("^\\[?(?<id>T[0-9]{3,})\\b").id // ""), .state] | @tsv')"

  while IFS=$'\t' read -r number id state; do
    [[ -n "$id" ]] || continue
    if [[ "$state" == "OPEN" ]] && grep -qx "$id" <<<"$ticked"; then
      gh issue close "$number" --repo "$repo" --reason completed \
        --comment "$id is ticked in \`$file\` on main." >/dev/null
      echo "$number"
    elif [[ "$state" == "CLOSED" ]] && grep -qx "$id" <<<"$open_ids"; then
      echo "::warning::tasks-sync: #$number ($id) is closed but not ticked in $file" >&2
    fi
  done <<<"$subs"
done
