#!/usr/bin/env bash
# Keeps the board in step with the issues: puts every issue on the board, fills
# its Surface field from its surface:* label, and sets its Status from what
# GitHub already knows about it.
#
#   scripts/board-sync.sh 47          # one issue (and its parent, if it has one)
#   scripts/board-sync.sh --pr 52     # the issues pull request 52 closes
#   scripts/board-sync.sh --all       # every issue, open or closed
#
# Run by .github/workflows/board-sync.yml on issue and pull request events, on
# a schedule, and by hand (Actions → Board sync → Run workflow). Needs:
#   GH_TOKEN       a classic token with the `project` and `repo` scopes. The
#                  workflow's own GITHUB_TOKEN cannot reach a user's Project.
#   BOARD_PROJECT  the Project's number (from its URL: …/projects/<number>)
#   BOARD_FIELD    the single-select field to fill (default: Surface)
# It also copies the board's Priority field onto a priority:N label (see below).
#   GITHUB_REPOSITORY  owner/repo (set by Actions)
#
# Why Surface: the surface lives on the issue as a label, because labels are
# what /speckit-github-taskstoissues can set and what shows on the issue
# itself. The board groups by a field, and GitHub cannot fill a field from a
# label. A Surface field holds one value and an issue can carry several labels:
# the first label in the FIELD's option order wins.
#
# Why Status is derived, not set by hand: on 2026-10-26 spec 003's twenty task
# issues were still open and in the wrong column a day after the feature had
# merged. Moving cards was a step everyone (people and agents) had to remember,
# and an agent in a cloud session cannot reach the board at all. The rule, first
# match wins:
#   closed                                  → Done
#   an open pull request will close it      → In review
#   labelled in-progress                    → In progress
#   has sub-issues, one closed or underway  → In progress
#   has sub-issues                          → Ready
#   labelled spec                           → Spec
#   is a sub-issue (a task of a feature)    → Ready
#   anything else                           → Backlog
# Starting work is therefore one label (`in-progress`), which an agent can set
# over the GitHub tools; everything else follows from issues and pull requests.
#
# Note: no apostrophes inside ${var:?message}. In bash the quote opens a string
# inside the expansion and swallows the rest of the script; that is what made
# every run of the first version fail with "unbound variable".
set -euo pipefail

: "${GH_TOKEN:?set GH_TOKEN to a token with the project scope}"
: "${BOARD_PROJECT:?set BOARD_PROJECT to the number of the board}"
field_name="${BOARD_FIELD:-Surface}"
repo="${GITHUB_REPOSITORY:?set GITHUB_REPOSITORY to owner/repo}"
owner="${repo%%/*}"
name="${repo#*/}"

project_query='
  query($owner: String!, $number: Int!, $field: String!) {
    OWNER(login: $owner) { projectV2(number: $number) { id
      surface: field(name: $field) { ... on ProjectV2SingleSelectField { id options { id name } } }
      status: field(name: "Status") { ... on ProjectV2SingleSelectField { id options { id name } } } } }
  }'
# A user's board first, then an organisation's.
project_json="$(gh api graphql -f owner="$owner" -F number="$BOARD_PROJECT" -f field="$field_name" \
  -f query="${project_query/OWNER/user}" 2>/dev/null || true)"
if [[ -z "$(jq -r '.data.user.projectV2.id // empty' <<<"$project_json")" ]]; then
  project_json="$(gh api graphql -f owner="$owner" -F number="$BOARD_PROJECT" -f field="$field_name" \
    -f query="${project_query/OWNER/user: organization}")"
fi
project_id="$(jq -r '.data.user.projectV2.id // empty' <<<"$project_json")"
[[ -n "$project_id" ]] || { echo "board-sync: project #$BOARD_PROJECT not found for $owner" >&2; exit 1; }
surface_field="$(jq -r '.data.user.projectV2.surface.id // empty' <<<"$project_json")"
surface_options="$(jq -c '.data.user.projectV2.surface.options // []' <<<"$project_json")"
status_field="$(jq -r '.data.user.projectV2.status.id // empty' <<<"$project_json")"
status_options="$(jq -c '.data.user.projectV2.status.options // []' <<<"$project_json")"
[[ -n "$surface_field" ]] || echo "::warning::board-sync: no single-select field \"$field_name\"; Surface not synced"
[[ -n "$status_field" ]] || echo "::warning::board-sync: no single-select field \"Status\"; Status not synced"

# gh_retry CMD… — runs a gh call up to three times. GitHub answered a field
# mutation with "Something went wrong" twice on 2026-11-02, in two runs of
# --all, at different issues; the call is idempotent, so a retry is safe and a
# single hiccup no longer stops the run for every issue after it.
gh_retry() {
  local try
  for try in 1 2 3; do
    "$@" && return 0
    [[ $try -lt 3 ]] && { echo "  (GitHub error, retrying)" >&2; sleep $((try * 5)); }
  done
  return 1
}

# set_field ITEM FIELD OPTION_ID — clears the field when OPTION_ID is empty.
set_field() {
  local item="$1" field="$2" option="$3"
  if [[ -n "$option" ]]; then
    gh_retry gh api graphql -f project="$project_id" -f item="$item" -f field="$field" -f option="$option" -f query='
      mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {
        updateProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $field,
          value: { singleSelectOptionId: $option } }) { projectV2Item { id } }
      }' >/dev/null
  else
    gh_retry gh api graphql -f project="$project_id" -f item="$item" -f field="$field" -f query='
      mutation($project: ID!, $item: ID!, $field: ID!) {
        clearProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $field }) { projectV2Item { id } }
      }' >/dev/null
  fi
}

# sync_one NUMBER [no-parent] — syncs the issue, then its parent, whose Status
# depends on its sub-issues.
sync_one() {
  local number="$1" issue_json issue_id labels item_id surface_id status status_id parent
  issue_json="$(gh api graphql -f owner="$owner" -f name="$name" -F number="$number" -f query='
    query($owner: String!, $name: String!, $number: Int!) {
      repository(owner: $owner, name: $name) { issue(number: $number) { id state
        labels(first: 50) { nodes { name } }
        parent { number }
        subIssues(first: 100) { nodes { state labels(first: 20) { nodes { name } } } }
        closedByPullRequestsReferences(first: 10, includeClosedPrs: false) { nodes { state } }
        projectItems(first: 20) { nodes { id project { id }
          priority: fieldValueByName(name: "Priority") {
            ... on ProjectV2ItemFieldSingleSelectValue { name }
            ... on ProjectV2ItemFieldNumberValue { number }
            ... on ProjectV2ItemFieldTextValue { text } } } } } }
    }' 2>/dev/null || true)"
  issue_id="$(jq -r '.data.repository.issue.id // empty' <<<"$issue_json")"
  [[ -n "$issue_id" ]] || { echo "  #$number: not an issue, skipped"; return; }
  local issue
  issue="$(jq -c '.data.repository.issue' <<<"$issue_json")"
  labels="$(jq -c '[.labels.nodes[].name | ascii_downcase]' <<<"$issue")"
  item_id="$(jq -r --arg p "$project_id" '.projectItems.nodes[] | select(.project.id == $p) | .id' <<<"$issue" | head -1)"

  if [[ -z "$item_id" ]]; then
    item_id="$(gh api graphql -f project="$project_id" -f content="$issue_id" -f query='
      mutation($project: ID!, $content: ID!) {
        addProjectV2ItemById(input: { projectId: $project, contentId: $content }) { item { id } }
      }' -q .data.addProjectV2ItemById.item.id)"
  fi

  local report="  #$number:"
  if [[ -n "$surface_field" ]]; then
    # The first option, in the field's order, whose surface:<option> label the
    # issue carries. Case-insensitive, so "UI" on the board matches surface:ui.
    surface_id="$(jq -r --argjson labels "$labels" '
      [ .[] | select(("surface:" + (.name | ascii_downcase)) as $l | $labels | index($l)) ] | first | .id // empty' \
      <<<"$surface_options")"
    set_field "$item_id" "$surface_field" "$surface_id"
    report+=" $field_name=$(jq -r --arg id "$surface_id" '(.[] | select(.id == $id) | .name) // "—"' <<<"$surface_options")"
  fi

  if [[ -n "$status_field" ]]; then
    status="$(jq -r '
      def labelled($l): [.labels.nodes[].name | ascii_downcase] | index($l) != null;
      if .state == "CLOSED" then "Done"
      elif ([.closedByPullRequestsReferences.nodes[] | select(.state == "OPEN")] | length) > 0 then "In review"
      elif labelled("in-progress") then "In progress"
      elif (.subIssues.nodes | length) > 0 then
        (if ([.subIssues.nodes[] | select(.state == "CLOSED" or labelled("in-progress"))] | length) > 0
         then "In progress" else "Ready" end)
      elif labelled("spec") then "Spec"
      elif .parent != null then "Ready"
      else "Backlog" end' <<<"$issue")"
    status_id="$(jq -r --arg s "$status" '(.[] | select((.name | ascii_downcase) == ($s | ascii_downcase)) | .id) // empty' \
      <<<"$status_options")"
    if [[ -n "$status_id" ]]; then
      set_field "$item_id" "$status_field" "$status_id"
      report+=" Status=$status"
    else
      echo "::warning::board-sync: the Status field has no option \"$status\""
    fi
  fi
  # Priority is set by hand on the board and only read here, so that the run
  # log carries it: an agent in a cloud session cannot read the board's
  # fields, but it can read this log (Actions → Board sync → a --all run).
  local priority
  priority="$(jq -r --arg p "$project_id" '
    [.projectItems.nodes[] | select(.project.id == $p) | .priority // {} | (.name // .number // .text)]
    | map(select(. != null)) | first // "—"' <<<"$issue")"
  report+=" Priority=$priority"

  # The board's Priority goes onto the issue as a priority:N label, because a
  # label is what every tool shows: the issue page, the issue list, and the
  # GitHub tools of an agent that cannot read the board. The board's options
  # are "P1 - High", "P2 - Medium", "P3 - Low"; those, "P1", "1" and
  # "Priority 1" all become priority:1 (and so on), the labels the issues already carry;
  # any other value becomes priority:<value>. An issue with no Priority on the
  # board keeps the labels it has. Changing the field sends no event to this
  # workflow (a user's board has no projects_v2_item webhook), so a label
  # follows on the nightly run or a Run workflow.
  if [[ "$priority" != "—" ]]; then
    local wanted have
    wanted="priority:$(sed -E 's/^([Pp]riority[ ]*|[Pp])?([0-9]+)([^0-9].*)?$/\2/' <<<"$priority" | tr '[:upper:] ' '[:lower:]-')"
    have="$(jq -r '.[] | select(startswith("priority:"))' <<<"$labels")"
    for l in $have; do
      [[ "$l" == "$wanted" ]] || gh_retry gh api -X DELETE "repos/$repo/issues/$number/labels/$l" >/dev/null
    done
    if ! grep -qxF "$wanted" <<<"$have"; then
      gh_retry gh api -X POST "repos/$repo/issues/$number/labels" -f "labels[]=$wanted" >/dev/null
      report+=" (label $wanted)"
    fi
  fi
  echo "$report"

  parent="$(jq -r '.parent.number // empty' <<<"$issue")"
  if [[ -n "$parent" && "${2:-}" != "no-parent" ]]; then sync_one "$parent" no-parent; fi
}

case "${1:-}" in
  --all)
    # Every issue, open or closed. Parents are synced in their own turn.
    numbers="$(gh issue list --repo "$repo" --state all --limit 1000 --json number -q '.[].number')"
    for n in $numbers; do sync_one "$n" no-parent; done
    ;;
  --pr)
    pr="${2:?pull request number}"
    numbers="$(gh api graphql -f owner="$owner" -f name="$name" -F number="$pr" -f query='
      query($owner: String!, $name: String!, $number: Int!) {
        repository(owner: $owner, name: $name) { pullRequest(number: $number) {
          closingIssuesReferences(first: 50) { nodes { number } } } }
      }' -q '.data.repository.pullRequest.closingIssuesReferences.nodes[].number')"
    for n in $numbers; do sync_one "$n"; done
    ;;
  *)
    sync_one "${1:?issue number, --pr N, or --all}"
    ;;
esac
