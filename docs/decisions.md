# Decisions

Decisions about how this fork is built and worked on, with the reasoning and the
options turned down. A decision explained only in a chat is lost when the chat is.
Newest first. A decision that changes gets a new entry pointing at the old one;
entries are not edited away.

---

## 2026-10-29 — Third-party notices list what the released binaries link, not the module graph

**Decision** (owner chose B, while adding goose for spec 008): `scripts/licenses.mjs`
lists the Go modules `go list -deps` reports for the main package, merged over every
`build <os> <arch>` target in `.github/workflows/release.yml`. Before, it listed
`go list -m all`, the whole module graph.

**Why**: goose v3.29.0 added 79 modules to the graph and only 5 to the binary; the rest
are its drivers for other databases. The old script would have added about 10,000 lines
of notices for code salt.md does not ship. It already listed 17 modules that never
shipped (the SQLite driver's code generator, test tools): 33 listed, 16 linked. The
notice has to travel with what ships (the script's own header), and that is what the
linker sees. The targets are read from the release workflow so a new platform cannot be
forgotten here.

**Turned down**:
- A. Keep `go list -m all`: no script change, but notices about ten times longer and
  mostly about code that is not in any download.
- One fixed platform: the linked set differs (go-isatty on darwin and windows only,
  google/uuid not on windows).

A module that only a test imports (goose until `server/upgrade.go` uses it) is not
listed; it is once the binary links it, the next time the script runs.

---

## 2026-10-29 — The fork releases every push to main, on its own 1.6 line

**Decision** (owner's issue #265, with the version rule left to us): every push to `main`
publishes a GitHub Release of this fork and its container image. Each gets the next patch
number on the line named by `server.Version`'s major.minor (1.6 today: v1.6.9, v1.6.10, …).
`install.sh`, the admin's update notice, the Docker image and the docs point at the fork.

**Why this rule**:
- The update check only treats plain `x.y.z` as a release (`server/update.go`), so
  build-metadata versions like `1.6.8+42` would make every instance silent about updates.
- Every fork release must sort above the upstream tags the fork carries (v1.1.2–v1.1.4),
  and the 1.6 line already does.
- If an upstream merge moves `server.Version` to a new major.minor, the fork follows that
  line from its patch + 1.

`make build` stamps the same version into the frontend and the server, from
`git describe`. Before, a local build was "dev" in the browser and "1.6.8" on the server.

**Turned down**:
- `server.Version` plus the run number: rejected by the update check, as above.
- Pushing a tag from one workflow for `release.yml` to react to: tags pushed with
  `GITHUB_TOKEN` start no other workflow, so the release job creates the tag and calls the
  image build itself.
- Marking these releases as prereleases: `/releases/latest` skips them.

---

## 2026-10-29 — Safe upgrades run on a migration library: goose

**Decision** (owner, shown the research's options for #263 with B recommended: "No, go with
c"): the numbered upgrade steps of spec 008 run on a migration library rather than a runner
written by hand. Of the two libraries the research measured, **pressly/goose v3** is used.
Research: `specs/008-safe-upgrades/research.md`.

**Why goose and not golang-migrate**: salt.md stores views, property schemas and row
values as JSON inside columns, and reshaping those needs steps written in Go. goose runs Go
functions as steps (and SQL files), each in a transaction. golang-migrate runs SQL files
only. Both build with `CGO_ENABLED=0` on salt.md's SQLite driver (measured).

**What it costs** (measured in the research, against a minimal program on the same driver):
+83 modules in the build graph and +1.16 MB of binary for goose (golang-migrate: +192
modules, +0.12 MB). Principle I asks a new dependency to state its reason: this entry is it.

**What changes from the research's recommendation**: the step number lives in goose's own
version table, not in `PRAGMA user_version`. The pre-upgrade copy, the refusal to open a
database newer than the binary, `salt restore` reporting the version, the fixture databases
and the check stay as recommended; goose provides none of them, so they are written here.

**Turned down**: option B, the same steps on a runner of our own (the research's
recommendation; the owner preferred a known library); golang-migrate (SQL steps only);
down migrations (going back is restoring the copy taken before the upgrade); Litestream
(an external process and service).

---

## 2026-10-28 — Mechanical tasks go to Sonnet helpers; judgement stays on Opus

**Decision** (owner: "can you hand off to sonnet if you think it is useful?" — yes, and
"capture that behaviour for other sessions"): a Claude Code session may hand a task to a
Sonnet subagent where that saves time or cost without risking quality. The rule is in
`.claude/rules/claude-code.md`, which every Claude Code session loads.

**Why**: nothing in the repository is tied to a model — the instructions, Spec Kit and the
gate behave the same on any — so the choice is about judgement. Translations, wiki text after
an existing page, screenshot retakes and test runs follow a pattern and the gate catches
slips; specs, plans, surfaces, new server logic, new primitives and gates do not.

**Turned down**: whole sessions on Sonnet for feature work (the thinking steps are where a
miss is not caught by a check); Haiku (too weak for this repository's rules).

---

## 2026-10-28 — Agents author their own commits in this fork

**Decision** (owner, asked whether to keep the owner as author or switch to Claude:
"Claude"): commits made by an agent carry the agent as author, not `neatlittlemacapps`.
`AGENTS.md` § Commits says so. Replaces the earlier rule (owner as author, agent in a
`Co-Authored-By:` trailer).

**Why**: the owner works on this fork, not upstream ("I don't care about pushing it back
to them"), and the fork's CI skips the CLA check, so the reason for the old rule — upstream's
CLA bot cannot match an agent's address to a signature — no longer applies to everyday
work. The session's own git identity is already the agent, so the history tells apart what a
person and what an agent wrote.

**Turned down**: keeping the owner as author (the history hides which work was the agent's,
and every session has to override git's configured identity).

**Still true**: anything offered to upstream is re-committed with the owner as author first.

---

## 2026-10-28 — Spec 004 grows a chart builder, modelled on Notion's

**Decision** (owner: "spec it and start the build", after a 20-screenshot walk-through of
Notion's chart flow): charts get five kinds (bar, horizontal bar, line, donut, number), five
`/` menu entries that put a chart into a document through the existing database block, one
settings panel (kind, data, sort, groups, palette, style), a tooltip, and Save chart as PNG.
Spec 004 US5, FR-018 to FR-029; research R13 to R17.

**How, and why that way**:
- A chart in a document is the database block showing a chart view (`local.viewId`, #26),
  not a new block: one way to put a database into a page, and agents already have
  `embed_database` (it gains `view_id`).
- Every setting is stored on the view, not the block, so one chart looks the same wherever
  it is embedded and an agent styles it with `set_view`.
- The settings panel is offered inside a document's database block too, for charts only:
  an exception to #22, because a chart inserted from the `/` menu has to be finished where
  it was inserted.
- Single-colour palettes have three shades per hue, not Notion's five: the lighter ones
  fail the 3:1 contrast rule (FR-015). Labels tell repeated shades apart.
- A new `ui/Popover` primitive carries the panel; the layer had none.

**Left out, with the reason** (spec FR-017): a second grouping, reference lines and axis
range (with stacked bars, later); Download SVG (Chart.js draws on a canvas); creating a new
database or importing a CSV from the picker; "Save for everyone"/"Reset" on filters, the
folding toolbar and "Lock views" (they change every view type: separate backlog items);
"Hide negative values", "Load limit", "Show data source title".

---

## 2026-10-28 — Spec 004: charts are drawn with Chart.js

**Decision** (owner): Chart.js 4.5.1, loaded only with a chart view. Supersedes "hand-drawn
SVG" in the spec 004 plan entry below.

**Why**: a mature library, with room for more chart types later (area, scatter, stacked).
The project rule is "a new dependency needs a stated reason", not "none": the "no new
dependency" in spec 004 was Claude's default, copied from issue #20, which Claude wrote.

**What it costs, and how it is met**: 60,694 B gzip (measured), kept out of the main
bundle in a lazy chunk; a canvas gives keyboard and screen readers nothing, so the chart
gets focusable group buttons, a summary and a table beside it (research R8); Chart.js's
options are built from the design tokens at draw time and rebuilt on a theme switch.

**Rejected**: hand-drawn SVG (Claude's recommendation), uPlot (no donut), Recharts and
ECharts (112 and 179 KB).

---

## 2026-10-28 — Spec 004 plan: charts aggregate on the server, drawn by hand

**Decision**:
- **One function, the rows query's WHERE.** `aggregateRows` groups in one SQL query over
  the WHERE extracted from the rows query, so a chart's numbers are the filtered table's.
  Formulas and rollups, which exist only in Go, take a measured second path.
- **Agents through `query_rows`** (`group_by`, `aggregate`), not a new tool.
- **Hand-drawn SVG**, lazy-loaded, colours as 12 chart tokens with a 3:1 contrast check.
- **At most 12 groups drawn**, the rest as "Other"; dates up to 400 periods.
- **A group's rows** are the ordinary rows query with one more filter, shown as a list
  that follows the view's Open pages in.
- **New registry row "Aggregation".**

**Why**: SC-002 (the chart equals the table) only holds when both read one WHERE; a
browser-side count is stopped by the 5-second limit exactly where charts matter; a chart
library adds 23–179 KB gzip for three shapes (measured, research R8), and the canvas
ones give a keyboard or screen reader nothing to hold.

**Rejected**: counting in the browser; a separate aggregate SQL builder; a new MCP tool;
a chart library; canvas (no focus or screen reader).

---

## 2026-10-28 — Upstream #85 (full width as its own column): not taken

**Decision**: the fork keeps full width as the page prop `_fullWidth`. Upstream
saltmd/salt.md#85 moves it to a column of its own; we do not follow.

**Why**:
- **Nothing to gain.** Upstream moves it out of the props so it cannot mix with database
  properties. Here only documents use it, and documents have no database properties.
- **Already open to agents.** `update_page full_width` sets it and `get_page` reports it,
  with tests (`mcp_appearance_test.go`, `page_width_test.go`).
- **It already travels.** Duplicate, templates, import/export, workspace blueprints and
  history copy props, so the setting goes with the page without any code knowing about
  it; that was the reason for the prop in the first place (`server/public.go`).
- **The cost would be real:** a schema column, a migration of existing values, every
  copy path taught the new column, the wiki and the tool changed, for no visible change.

**Rejected**: following upstream for its own sake (owner, 2026-10-27: implement the
maintainers' changes only when they make sense for us).

---

## 2026-10-27 — Spec 007: the centre peek is a panel of its own, not a Dialog

**Decision**: the centre peek is drawn by a new `ui/CenterPanel` (option A): modal, with
its own focus trap and Escape, sharing that behaviour with `ui/SidePanel`. It does not
join `useExclusiveModal`.

**Why**: the page inside a peek opens dialogs of its own (version history, share), and
the coordinator closes every other modal when one opens, so with `ui/Dialog` each of
them would have closed the peek. A separate panel keeps the app-wide one-modal rule
(#134) as it is.

**Rejected**:
- B: `ui/Dialog` and letting coordinated modals stack: changes that rule for every
  dialog in the app.
- C: no centre peek: story 4 of the spec undelivered.

---

## 2026-10-27 — Spec 007: a view chooses how its pages open

**Decision**:
- **A setting of each view**, `openIn` in the view's JSON: full page (missing, the
  default), side peek, centre peek. Agents set it with `set_view` `open_in` and read
  it from `get_collection`; one server function validates it for both doors.
- **A view's peek beats the account's "Open rows in new tab".** The account setting
  keeps deciding for views on full page; ⌘/Ctrl always opens a new tab.
- **The address carries the peeked row** (`?peek=`), so reload, copied links and
  Back behave as people expect.
- **The peek is the ordinary page editor** inside a new non-modal `ui/SidePanel`.
- **Side peek first; centre peek in a follow-up pull request**, behind a flag so no
  door stores a value nothing honours.
- **New registry row "Page containers"**: later page-level features must work in
  every container a page renders in.

**Why**:
- **Per view, not per account** (owner, 2026-10-27): a board for daily work and a
  table for bulk edits want different behaviour.
- **The peek beats the account preference** because someone chose it for this view
  on purpose; leaving the preference in charge of full-page views changes nothing
  for existing views.
- **The ordinary editor** keeps every page feature in the peek without a copy that
  drifts.

**Rejected**:
- The upstream maintainer's account-level side panel for saltmd/salt.md#92.
- A modal side panel (the view behind would be inert), and shrinking the view to
  make room (moves the columns and loses the scroll position).
- Peek state inside the collection view (lost on reload; two embedded views could
  each open one).

---

## 2026-10-27 — Spec 005: a new row takes what its view's filters pin down

**Decision**:
- **Only an armed "is" with exactly one value pins a value**, written in the
  property's stored form: a select option id, a number as a number, a box as
  true/false, a relative day as the date it means, lists for multiselect,
  relations and several people. Two filters naming different answers for one
  property pin nothing.
- **The server works the values out**, in `server/viewpins.go`, for every door:
  `POST /api/pages` and the template route (`viewId`), MCP `create_page` and
  `create_rows` (`view_id`).
- **Precedence: template, then view, then explicit values.**
- **"Does the row show?"** is answered with the rows query's own filter SQL.
  The interface shows a toast with an **Open** action when it doesn't.
- **Only the view's AND list counts.** Views store no OR groups.

**Why**:
- **One answer only.** A range or a set has no value to pick without guessing,
  and a guess stored as data stays.
- **The server.** A second copy of the filter rules in the browser would drift
  from the agent path, as the number and checkbox filters did (#95).
- **The view beats the template.** It is the one the person is looking at when
  they press **New**.
- **The same SQL.** The notice can never disagree with what the view then shows.
- **Measured cost:** +0.45 ms per create on the 1k-row seeded database.

**Rejected**: picking a value from a range or a set; pins computed in the
browser; a dialog instead of a toast; naming the view in the agent's answer
(its name is a person's text and would need `wrapUntrusted`).

## 2026-10-27 — Owner's answers: auto-merge, search, outside edits, column order, board drops

**Decision** (the owner, 2026-10-27):
- **Auto-merge on** for pull requests the agent opens. They merge once the
  required checks pass.
- **Search (#78): left as it is.** CI p95 is 122.8 ms and nobody has
  complained in real use. If search ever feels slow, the next step is
  `workspace_id` in `chunks_fts` (option b).
- **Outside writes into an open page (#26):** the open editor applies the
  change, not the server. This covers every outside write (edits, rewrites,
  agent writes). With no editor open, today's path stays.
- **Column order (#132): per view**, stored like column widths.
- **Board drops (#133): no manual order inside a column.** The view's sort
  decides, and the drop marker shows only the target column.
- **Peek views (upstream #92):** side peek first. Centre peek follows in its
  own pull request.

**Why**:
- **Auto-merge.** The owner works from a phone and merged within minutes
  anyway. The required checks are the gate either way.
- **Search.** Option a ranks fewer hits and option b changes the index. Neither
  is worth it without a measured problem.
- **Outside writes.** The editor already knows the document format, and the
  server would have to learn it to apply Yjs updates itself. One path for all
  outside writes means one behaviour to test.
- **Column order.** Widths are already per view, and each view serves its own
  job.
- **Board drops.** A manual order is a feature of its own: a stored position,
  conflicts with sort, and MCP parity. It can come later.
- **Peek.** Smaller pull requests are easier to test and review.

**Rejected**: #78 options a and b for now; a server-side Yjs apply for #26; a
column order shared by every view; a manual card order in board columns.

## 2026-10-27 — Design system batch 1: what the first screen decided

**Decision**: the first screen built from `web/src/ui/` is the instance
settings dialog, Webhooks tab included. That brings in:
- **`Checkbox` joins batch 1**, because the tab's events are checkboxes.
- **Removing a webhook stays one click.** No `AlertDialog` in front of it.
- **`Dialog` has no close button of its own.** Mounted means open; the footer's
  Cancel or Close is wrapped in `DialogClose`. A `returnFocus` ref covers a
  dialog opened from a menu item that disappears.
- **The catalogue lives in `web/catalog/`**, outside `src/`.
- **Today's dialog values (radius 16px, title 24px, layer 100) are component
  tokens.** They are not moved onto the scales yet.
- **The catalogue's screenshots are compared with the base branch, drawn on
  the same CI runner, and a difference is a warning.** No baselines are
  committed (spec FR-013 amended).

**Why**:
- **The screen.** The spec named "the webhook dialog" for US1. In the code it is
  a tab of the settings dialog, and three checkboxes are its only controls
  besides a text field and buttons.
- **Remove.** A confirmation would change behaviour, and this feature encodes
  the look and the behaviour rather than redesigning them.
- **No X.** Today's dialogs close through their footer, so an X would change
  every migrated screen.
- **The catalogue.** It is dev tooling: the translation check and the literal
  ratchet scan `src/` and should not count its demo labels.
- **Today's values.** The spec's edge case says old and new must look the same
  while the migration runs, so the old values stay until every dialog has moved.
- **What it fixed.** The migrated dialog fixed two bugs the old markup had: Tab
  walked out of it into the page, and closing it left focus on nothing.
- **The screenshots.** Committed baselines differed from CI's runner by about a
  thousand pixels per section with nothing changed: the runner draws text
  differently from any other machine. A reference drawn on the same runner
  differs only where something changed.

**Rejected**:
- **`Select` or `Switch` for the events** (the screen does not use them; they
  are built and proven in the catalogue instead).
- **A visually hidden close button** (an invisible focus stop for keyboard
  users).
- **Moving the dialog onto the type and radius scales now** (old and new
  dialogs would differ side by side).
- **The catalogue in `web/src/catalog/` with an exemption for each check.**
- **A looser pixel tolerance** (it cannot tell another machine's text from a
  real change).
- **Baselines committed by a CI bot** (its commits carry no CLA signature
  upstream).

## 2026-10-27 — Design tokens: light muted text darkened for AA, and the bundle baseline corrected

**Decision**: the token build checks every text colour against the surfaces it
sits on, in both themes, and fails below WCAG AA (spec 001, FR-004). Light
muted text (`--muted`) moves from `#7e7d78` to `#6f6e6a`: the same grey,
darkened just enough to reach 4.5:1 on the sidebar, the darkest light surface
(4.89:1 on the document). Nothing else in the look changes; light-mode muted
text in the wiki screenshots is the one visible difference. The radius scale is
built as `radius.scale.*` (`--radius-scale-sm`), because `--radius-sm` and
`--radius-lg` already name today's 7px and 14px. The bundle cap is 590,146 B
gzip: the main chunk on `main` (528,706 B) plus 60 KB.

**Why**: the first build measured `#7e7d78` at 3.95:1 on the document and
3.64:1 on the sidebar. It is used for hints and labels at body size, where AA
asks 4.5:1. Dark muted text already passes (4.78:1 or more). The plan's bundle
baseline, 790,888 B, was never reproduced: the raw size matched to the byte,
the gzip size did not, so it was a measuring mistake, and a cap on it would
have allowed 320 KB of growth instead of 60.

**Rejected**: declaring muted text "large or UI" (3:1) to pass. It is not;
the check would then guard nothing for the colour that needs it most. Keeping
`#7e7d78` with an exception and an issue (it ships a known AA failure behind a
green check). Renaming the legacy `--radius`, `--radius-sm` and `--radius-lg` (15 uses in
`theme.css` and the public pages' styles in `server/`; they move onto the
scale batch by batch).

## 2026-10-26 — A read-only pool beside the one writer connection

**Decision**: long analytical reads (a database's rows, rollups,
backrelations, grouped counts) run on `s.rdb`, a read-only pool of four
connections opened with `mode=ro`. Every write, every read inside a
transaction and the short permission lookups stay on `s.db`, the single writer
connection. Reads on the pool still stop after 5 s. Spec 002 research P5
changes from "measured, not built" to built; #82.

**Why**: measured, not assumed. Five agents' writes waited ~2.7 s at p95 behind
back-to-back 100k-row reads on the shared connection; the write budget is
8 ms. On the read pool the same writes take ~5 ms. WAL lets readers and the
writer run at once, and a read on the pool sees every committed write, so
saving and reloading still shows the save. `database/sql` does not serve
waiters in order, so a busy reader could keep winning the one connection; a
separate pool removes the contest.

**Rejected**: a read pool for every read (it would split the cursor rule
across all code for little gain; the short lookups are fast). A pool without
`mode=ro` (a stray write would take a second writer's lock instead of
failing). Waiting until charts (#20) land (they are the heaviest reads, and
the writes would already be suffering).

## 2026-10-26 — Storage budgets record today's speed; targets stay with issues

**Decision**: the latency budgets in spec 002 research P3 are the CI runner's
measured p95 × 1.5, as SC-002 says. That holds even where the measurement is
worse than the spec's guess: full-text search at 20k pages gets 301 ms (guess
50 ms) and `query_rows` at 10k rows gets 113 ms (guess 50 ms). The 50 ms targets
stay with #78 and #79, and a fix lowers its budget in the same PR.

**Why**: the registry's Storage budgets row holds every new or changed
hot-path query to its budget. A budget set below what the code does today would
fail every feature that touches search, however well that feature behaves, and
teach everyone to ignore budgets. Set from a measurement, it catches the next
slowdown. Making search fast is a separate piece of work, tracked in the issues.

**Rejected**: keeping 50 ms as the budget (every search-touching plan would
miss it, with nothing that plan could do about it). Measuring after the driver bump #80 (that would tie
this PR to #80; the bump only adds headroom, so the budgets are conservative).

## 2026-10-26 — Test branches in GitHub Codespaces

**Decision**: a dev container (`.devcontainer/`) builds the branch a codespace
is opened on and runs it on port 8420 with the wiki's invented content. The
owner tests from a phone browser, including pull requests before they merge.

**Why**: the owner works mostly from a phone and asked for a remote way to try
what has been built. A codespace needs nothing installed, keeps its address
private to the owner's GitHub account, and costs nothing within the monthly
allowance.

**Rejected**: a permanent hosted demo (a server to pay for and keep safe, and
a public address for an unreleased build). An `:edge` image to run locally:
useful, but not remote; it can follow later.

## 2026-10-26 — The board derives its columns; nobody moves cards

**Decision**: `board-sync.yml` sets every issue's Status from GitHub's own state: closed,
an open PR that closes it, the `in-progress` and `spec` labels, and whether it is a
feature's task. A task ticked in `tasks.md` on `main` closes its issue. A nightly run
catches anything no event reports.

**Why**: spec 003 merged with its twenty task issues still open, and no card had moved.
A feature PR's `Closes #13` does not close sub-issues, and moving cards was a step people
and agents had to remember. A cloud agent cannot reach the board at all, but it can set a
label.

**Rejected**: moving cards by hand, or by the agent (no board access from cloud
sessions). GitHub's built-in project workflows alone: they cover "closed → Done" and
"PR merged → Done", but not In review, In progress or a feature's progress through its
tasks.

## 2026-10-26 — The list of surfaces is a registry that grows with new concepts

**Context**: the owner's standing instruction is that every feature request is
thought through against every aspect of the code. When a request introduces a new
concept, such as the design system, that concept joins the list every later feature
is checked against.

**Decision**: `.specify/memory/surfaces.md` is the one list of surfaces, each with what
a feature checks and the date it was added. Every plan's Surfaces table has a row per
entry, and `check-surfaces.mjs` (in `npm run check` and the gate) fails a plan that
skips one or leaves it empty. A feature that introduces a concept adds it to the
registry in the same pull request. The first two added this way are the design
system (spec 001) and storage budgets (spec 002), along with the manifest, which had
been a loose line in each plan. Constitution VI now points at the registry (v1.1.0).

**Rejected**: keeping the list in the plan template only. A surface added later reached
the next plan only if its writer remembered, which is the failure the constitution
exists to prevent. Also rejected: asking older plans to answer surfaces that did not
exist when they were written, because a plan records what was considered at the time.

## 2026-10-25 — Find-and-replace edits reload open editors; live delivery comes later

**Context**: spec 003 (#13), FR-008. An agent's edit has to reach people who have the
page open.

**Decision**: option C. This feature reloads open editors, as every outside write does
today (unsaved keystrokes go into the page history, `docgen.go`). Delivering the edit
live into running sessions is follow-up #26.

**Rejected**: A, live delivery now. The server only relays Yjs updates (`collab.go`); it
would have to build and send them itself, which is a feature of its own. B alone. It
leaves the interruption in place with no plan to remove it.

## 2026-10-25 — Spec Kit for specs, a GitHub Projects board for tracking

**Decision**: features go through Spec Kit (github/spec-kit, pinned 1.2.3). `tasks.md`
is the source of truth. Issues on the board mirror it and are created by
`/speckit-github-taskstoissues`.

**Why**: the owner chose it. Specs keep the reasoning; the board keeps the status.

## 2026-10-25 — `AGENTS.md` is the shared instruction file; `CLAUDE.md` stays local

**Decision**: project instructions live in `AGENTS.md` and `.claude/rules/`. `CLAUDE.md`
remains gitignored.

**Why**: `.gitignore` excludes `CLAUDE.md` on purpose, because a committed one once
carried deployment details into the public repository.

**Rejected**: committing `CLAUDE.md`.

## 2026-10-25 — Agent parity is enforced by a manifest, a check and a property test

**Decision**: `capabilities.json` names every route and MCP tool. `check-parity.mjs`
(in `npm run check`) fails on anything the manifest does not know.
`parity_property_test.go` checks that REST and MCP give the same access verdicts. Gaps
are counted in `gapBudget`, which may only go down.

**Why**: checks used to be added on one door and found missing on the other.

**Rejected**: a generic code knowledge graph. Grep and a language server are enough at
about 70k lines, and the manifest is the graph that matters. In the Codebase-Memory
paper a graph used about 10× fewer tokens but answered correctly 83% of the time,
against 92% without one.

## 2026-10-25 — Shared capability code goes in `server/cap_*.go`

**Decision**: functions that REST and MCP both call live in `server/cap_*.go`.

**Why**: `server/ops.go` already exists (operational hardening), so `ops_*.go` would
mislead.

## 2026-10-25 — Workspace membership: no MCP tool; an admin's read-write token may manage members (#1, option B)

**Decision**: there is no MCP tool for membership. A workspace admin's read-write REST
token may manage members, as `wiki/workspaces.md` already documents. The README and
`whoami` say so. In `capabilities.json`, `workspaces.membership` is `tokenReachable`
with `"accepted": true`.

**Why**: what the wiki documented and what the code did disagreed. The owner chose to
keep the documented behaviour.

**Rejected**: A, closing the routes to tokens.

## 2026-10-25 — Keep SQLite (spec 002)

**Decision**: stay on SQLite (`modernc.org/sqlite`). Upgrade the driver and measure with
benchmarks.

**Rejected**: DuckDB. It needs cgo, which breaks `CGO_ENABLED=0` release builds. It
downloads extensions at runtime. Its optimistic concurrency produces conflicts when two
writers touch the same row.

## 2026-10-25 — Design system: DTCG tokens and a Base UI component layer (spec 001)

**Decision**: W3C/DTCG 2025.10 tokens, plus a component layer in `web/src/ui/` built on
Base UI (headless). BlockNote keeps `@blocknote/mantine` for now.

**Rejected**: Mantine as the app's component library. It is styled, and those styles
would be overridden everywhere. shadcn/ui, because it requires Tailwind.

## 2026-10-25 — Feature branches folded into the working branch

**Decision**: the four `feat/*` branches (full width, column presets, picker
descriptions, database templates) were merged into `parity-manifest`.

**Why**: the owner asked for the functionality to be in one place.

## 2026-10-25 — No agent teams yet

**Decision**: one agent at a time on this codebase for now.

**Why**: agent teams are experimental. Parallel agents would collide in the hotspot
files (`server/server.go`, `web/src/styles.css`) until those are split.
