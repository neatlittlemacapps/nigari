#!/usr/bin/env bash
# Creates the GitHub Projects board that tracks work on this fork. Run it once,
# by hand, from your own machine:
#
#   gh auth refresh -s project      # the project scope is not in gh's default login
#   scripts/setup-board.sh                         # board for the repo of `origin`
#   scripts/setup-board.sh owner/repo "Board name"
#
# What it does:
#   1. turns on Issues (GitHub leaves them off for forks)
#   2. creates a Project and links it to the repository
#   3. adds the fields the workflow uses: Surface, Phase, Feature
#   4. creates one label per surface, so a task's surface shows on the issue too
#
# What it cannot do — GitHub's CLI has no command for these, so do them in the
# Project's settings afterwards (about two minutes):
#   - Status options: rename to Backlog, Spec, Ready, In progress, In review, Done
#   - Workflows: turn on "Auto-add to project" (filter: is:issue repo:<repo>)
#     and "Item closed" → Done
#   - Views: a Board grouped by Status, and a Table grouped by Feature
set -euo pipefail

repo="${1:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
title="${2:-nigari roadmap}"
owner="${repo%%/*}"

echo "Repository: $repo"
gh repo edit "$repo" --enable-issues

number="$(gh project create --owner "$owner" --title "$title" --format json -q .number)"
echo "Created project #$number"
gh project link "$number" --owner "$owner" --repo "${repo#*/}"

surfaces="backend,mcp,ui,i18n,wiki,test,perf"
gh project field-create "$number" --owner "$owner" --name "Surface" \
  --data-type SINGLE_SELECT --single-select-options "$surfaces"
gh project field-create "$number" --owner "$owner" --name "Phase" \
  --data-type SINGLE_SELECT --single-select-options \
  "1 Foundation,2 Manifest,3 Agents,4 Shared layer,5 CI"
gh project field-create "$number" --owner "$owner" --name "Feature" --data-type TEXT

IFS=, read -ra list <<<"$surfaces"
for s in "${list[@]}"; do
  gh label create "surface:$s" --repo "$repo" --color BFD4F2 \
    --description "Task touches the $s surface" --force
done
# The two labels scripts/board-sync.sh reads for Status; every other column
# follows from the issue's state and its pull requests.
gh label create "in-progress" --repo "$repo" --color FBCA04 \
  --description "Someone (person or agent) is working on this" --force
gh label create "spec" --repo "$repo" --color D4C5F9 \
  --description "Being specified (specs/NNN-name/), no tasks yet" --force

url="$(gh project view "$number" --owner "$owner" --format json -q .url)"
cat <<EOF

Board ready: $url
Finish in the Project's settings: Status options, the two workflows, the two
views (see the header of this script).
EOF
