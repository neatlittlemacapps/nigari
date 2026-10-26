#!/usr/bin/env bash
# Copies an issue's surface:* label into the board's Surface field.
#
#   scripts/board-sync.sh 47          # one issue
#   scripts/board-sync.sh --all       # every issue that carries a surface label
#
# Run by .github/workflows/board-sync.yml when a label changes, and by hand
# (Actions → Board sync → Run workflow) to backfill. Needs:
#   GH_TOKEN       a classic token with the `project` and `repo` scopes. The
#                  workflow's own GITHUB_TOKEN cannot reach a user's Project.
#   BOARD_PROJECT  the Project's number (from its URL: …/projects/<number>)
#   BOARD_FIELD    the single-select field to fill (default: Surface)
#   GITHUB_REPOSITORY  owner/repo (set by Actions)
#
# Why: the surface lives on the issue as a label, because labels are what
# /speckit-github-taskstoissues can set and what shows on the issue itself.
# The board groups and filters by a field, and GitHub has no built-in way to
# fill a field from a label. Filling it by hand on a phone, issue by issue,
# was the alternative.
#
# A Surface field holds one value; an issue can carry several surface labels
# (a feature touching backend and mcp). The first label in the FIELD's option
# order wins, so the order of options in the board decides — put the surface
# you most want to see first. An issue with no surface label gets the field
# cleared, so removing the last label is reflected too.
set -euo pipefail

: "${GH_TOKEN:?set GH_TOKEN to a token with the project scope}"
: "${BOARD_PROJECT:?set BOARD_PROJECT to the board's number}"
field_name="${BOARD_FIELD:-Surface}"
repo="${GITHUB_REPOSITORY:?set GITHUB_REPOSITORY to owner/repo}"
owner="${repo%%/*}"
name="${repo#*/}"

# The project and its field. A user's board first, then an organisation's.
project_json="$(gh api graphql -f owner="$owner" -F number="$BOARD_PROJECT" -f field="$field_name" -f query='
  query($owner: String!, $number: Int!, $field: String!) {
    user(login: $owner) { projectV2(number: $number) { id
      field(name: $field) { ... on ProjectV2SingleSelectField { id options { id name } } } } }
  }' 2>/dev/null || true)"
if [[ -z "$(jq -r '.data.user.projectV2.id // empty' <<<"$project_json")" ]]; then
  project_json="$(gh api graphql -f owner="$owner" -F number="$BOARD_PROJECT" -f field="$field_name" -f query='
    query($owner: String!, $number: Int!, $field: String!) {
      user: organization(login: $owner) { projectV2(number: $number) { id
        field(name: $field) { ... on ProjectV2SingleSelectField { id options { id name } } } } }
    }')"
fi
project_id="$(jq -r '.data.user.projectV2.id // empty' <<<"$project_json")"
field_id="$(jq -r '.data.user.projectV2.field.id // empty' <<<"$project_json")"
[[ -n "$project_id" ]] || { echo "board-sync: project #$BOARD_PROJECT not found for $owner" >&2; exit 1; }
[[ -n "$field_id" ]] || { echo "board-sync: no single-select field \"$field_name\" on project #$BOARD_PROJECT" >&2; exit 1; }
options="$(jq -c '.data.user.projectV2.field.options' <<<"$project_json")"

sync_one() {
  local number="$1" issue_json issue_id labels item_id option_id=""
  issue_json="$(gh api graphql -f owner="$owner" -f name="$name" -F number="$number" -f query='
    query($owner: String!, $name: String!, $number: Int!) {
      repository(owner: $owner, name: $name) { issue(number: $number) { id
        labels(first: 50) { nodes { name } }
        projectItems(first: 20) { nodes { id project { id } } } } }
    }')"
  issue_id="$(jq -r '.data.repository.issue.id // empty' <<<"$issue_json")"
  [[ -n "$issue_id" ]] || { echo "  #$number: not an issue, skipped"; return; }
  labels="$(jq -c '[.data.repository.issue.labels.nodes[].name]' <<<"$issue_json")"
  item_id="$(jq -r --arg p "$project_id" '.data.repository.issue.projectItems.nodes[] | select(.project.id == $p) | .id' <<<"$issue_json" | head -1)"

  # The first option, in the field's order, whose surface:<option> label the
  # issue carries. Case-insensitive, so "UI" on the board matches surface:ui.
  option_id="$(jq -r --argjson labels "$labels" '
    [ .[] | select(("surface:" + (.name | ascii_downcase)) as $l | $labels | map(ascii_downcase) | index($l)) ]
    | first | .id // empty' <<<"$options")"

  if [[ -z "$item_id" ]]; then
    [[ -n "$option_id" ]] || { echo "  #$number: no surface label and not on the board, nothing to do"; return; }
    item_id="$(gh api graphql -f project="$project_id" -f content="$issue_id" -f query='
      mutation($project: ID!, $content: ID!) {
        addProjectV2ItemById(input: { projectId: $project, contentId: $content }) { item { id } }
      }' -q .data.addProjectV2ItemById.item.id)"
  fi

  if [[ -n "$option_id" ]]; then
    gh api graphql -f project="$project_id" -f item="$item_id" -f field="$field_id" -f option="$option_id" -f query='
      mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {
        updateProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $field,
          value: { singleSelectOptionId: $option } }) { projectV2Item { id } }
      }' >/dev/null
    echo "  #$number: $field_name = $(jq -r --arg id "$option_id" '.[] | select(.id == $id) | .name' <<<"$options")"
  else
    gh api graphql -f project="$project_id" -f item="$item_id" -f field="$field_id" -f query='
      mutation($project: ID!, $item: ID!, $field: ID!) {
        clearProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $field }) { projectV2Item { id } }
      }' >/dev/null
    echo "  #$number: $field_name cleared (no surface label)"
  fi
}

if [[ "${1:-}" == "--all" ]]; then
  # Every issue, open or closed, with at least one surface label.
  numbers="$(gh issue list --repo "$repo" --state all --limit 1000 --json number,labels \
    -q '.[] | select([.labels[].name | startswith("surface:")] | any) | .number')"
  for n in $numbers; do sync_one "$n"; done
else
  sync_one "${1:?issue number, or --all}"
fi
