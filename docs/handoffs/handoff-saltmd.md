# active-memory handoff: salt.md agentic setup and feature roadmap

**Handoff #8** · 2026-10-28 · Lineage:
- **#1 (2026-10-25):** agentic setup (rules, gate, Spec Kit, parity manifest); four feature branches merged; 25 issues; three specs.
- **#2 (2026-10-26):** find-and-replace edits (#13, PR #48); specs 001/002 planned; #47 fixed; surfaces registry, board sync, ruleset (PR #49).
- **#3 (2026-10-26):** board derives its columns (PR #74); spec 002 tasks (#50–#73); storage benchmarks; fixes #75, #76; Codespaces (PR #77).
- **#4 (2026-10-26/27):** spec 002 finished (PRs #80, #81, #83); read pool (#84); fast reads (#85); tag colours (#86).
- **#5 (2026-10-27):** spec 001 batch 1 (tasks #87–#126, PRs #127/#128/#129); spec 004 (charts) written; local Mac test; #130 fix; feedback issues #131–#134; upstream plan agreed.
- **#6 (2026-10-27):** owner answered all open questions; PRs #135, #137, #138, #159 (spec 005), #176 (spec 006).
- **#7 (2026-10-27/28):** spec 007 shipped (PRs #212, #213); upstream #85 not taken; backlog prioritised; spec 004 planned with Chart.js (PR #214).
- **#8 (2026-10-28):** owner's 20-screenshot Notion chart walk-through → spec 004 chart builder (US5, FR-018–031); charts parts 1+2 built and merged (PR #264); safe-upgrades epic #263 filed; "Each row" added to part 3 after the owner's bug report.

## 0. Instructions for Claude (read first)

You are continuing work from a previous chat. That chat is gone; this file is the complete context and the source of truth.

1. Read this whole file before replying.
2. Follow sections 3 (Style), 4 (Hard rules) and 5 (Corrections) in every reply, for the rest of this chat. They override your defaults.
3. Use the values in section 8 exactly. Never round, re-estimate, or "correct" them.
4. Do not suggest anything listed in section 7 (Changed / rejected) again unless the user brings it up.
5. Code word: Start every reply with exactly "Yes Boss!"
6. Your first reply: at most 5 lines covering the goal, the current state, and the next step (section 11). Mention any files from section 13 that were not attached. Ask the questions in section 12 if there are any. End with "Ready to continue with <next step>?" Then wait for the user's go.

## 1. Mission
- **Goal:** take salt.md (the user's fork) "to a higher level": many more features, built with an agentic setup that keeps the software's domains intact.
- **In the user's words:** "proper coding, holistic adjustments (think, when I add a feature, the system should also reason and tackle the fact that the mcp functionality might also need to follow), proper UI implementation, performance and testing".
- **Done looks like:** features flow spec → plan → tasks → board → implementation; each reaches every surface in the registry; gate and CI green.
- **Standing way of working** (2026-10-26): "from here on out, you should indeed ensure you think about all aspects of the code in relation to my feature requests." / "When a feature request introduces some new concept (like but not excluding the design system) you should add it to the pool of things to think about when specking new features."
- **Also:** "I want you to be able to do as much as possible yourself"; "ensure you have good board and issue hygiene".
- **2026-10-27:** "I want you to ignore the maintainers comments unless they really make sense for us as well. I basically want to implement the functionality on our end. I don't care about pushing it back to them".
- **2026-10-28 (current order of work):** finish charts (spec 004, part 3 left), then epic #263 (safe upgrades), then the priority-1 backlog.

## 2. About the user (as relevant to this work)
- GitHub `neatlittlemacapps` (id 60575307), display name "Frank De Graeve"; email neatlittlemacapps@gmail.com; owns `neatlittlemacapps/salt.md`, a public fork of `saltmd/salt.md` (AGPL-3.0); CLA signed upstream.
- Works mostly from a phone (Claude app, iPhone), also the Claude desktop app on a Mac. Designer/PM, not a developer. Timezone Europe/Brussels. Thinks in Notion terms (sent Notion screenshots as the reference for charts).
- Answers each step with a terse "Ok". Asks plain-language questions about technical terms; sometimes needs a concept re-explained in simpler words (e.g. what a chart's two dropdowns mean).
- Local Mac test install: repo at `~/Documents/Salt/salt.md`; data `~/salt-demo`; run `cd ~/Documents/Salt/salt.md && SALT_DATA=~/salt-demo SALT_ADDR=:8420 ./salt`, open `http://localhost:8420` (http, not https); stop with Ctrl+C; seed with `SALT_SEED_URL=http://127.0.0.1:8420 node web/scripts/seed-wiki-instance.mjs`. Update: `cd ~/Documents/Salt/salt.md && git checkout main && git pull && make build`. Backup before an update: `./salt backup`.
- GitHub settings: Actions on; auto-merge enabled in the repo; `BOARD_TOKEN` secret, `BOARD_PROJECT`=5.

## 3. Style & communication
- **Language:** English.
- **Tone:** direct, plain, no filler.
- **Reply length:** short (phone screen). Lead with the answer; detail only when asked.
- **Formatting:** short lists and small tables; numbered steps with exact tap/click paths for anything the user does by hand; shell commands in their own fenced `bash` blocks with full paths.
- **"Explain X":** per option: gains, costs, effort; then one recommendation.
- **Working style:** each step ends with "Ready to continue with <next step>?" and waits for the user's go; a short status line when the user hasn't heard from Claude in a while during a long turn.
- **Explaining terms:** plain words for a non-developer (what it is, what it costs us, what it gives us); concrete examples ("one bar per row: Rent 1,200 · Food 450").
- **Avoid:** recaps of steps; long explanations before the result.

## 4. Hard rules (word for word)
1. "Use spec-kit but indeed also a board to to track the work"
2. "Fold them into here so the functionality is in here too (those branches)"
3. Pushing: routine pushes to the working branch are fine; opening a PR is asked for ("Ready to continue with opening the PR?"), unless the user just asked for it. PRs get auto-merge (user: "yes"), but Claude cannot switch it on (classifier denial), so the user taps merge.
4. Repo rules in `AGENTS.md` and `.claude/rules/` apply. A Stop hook runs `scripts/agent-gate.sh` plus a git-check (uncommitted or unpushed work fails it; it forces a push even mid-feature).
5. "ensure you think about all aspects of the code in relation to my feature requests". A new concept goes into `.specify/memory/surfaces.md`.
6. Never work around a classifier denial (CI bypass, self-modification, destructive git, enabling auto-merge, deleting scheduled tasks). Tell the user and give them the manual step.
7. Commit authorship: before the first commit `git config user.name neatlittlemacapps` and `git config user.email 60575307+neatlittlemacapps@users.noreply.github.com`; trailers `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: …`.
8. "ensure you have good board and issue hygiene": label `in-progress` when starting (remove it when done); tick tasks in `tasks.md` in the PR that does them; `Closes #N` for every finished task issue; file an issue for every bug or finding; nobody moves cards.
9. After opening a PR: `subscribe_pr_activity`; one `send_later` check-in ~50 min later; on CI red fix and push; on merge remove `in-progress` and fast-forward the working branch (`git push origin origin/main:refs/heads/<branch>` when the branch is inside main).
10. "I want you to ignore the maintainers comments unless they really make sense for us as well. I basically want to implement the functionality on our end. I don't care about pushing it back to them"
11. Every number in a doc, comment or PR is measured in the session.
12. Upgrade epic (#263) is "the next big epic to complete after the charting", and starts with research ("at least do some research on how typically this type of software could ensure forward upgrades are indeed possible").

## 5. Corrections log
| # | Claude did | The user wanted |
|---|---|---|
| 1 | Told the user to run `/speckit-specify` in a separate session | Run Spec Kit steps directly |
| 2 | (self) Called token-reachable membership routes a hidden security issue | A docs contradiction; #1 option B |
| 3 | (self) Planned `server/ops_*.go` | `server/ops.go` exists → `cap_*.go` |
| 4 | (self) Counted 36 MCP tools | 34 |
| 5 | (self) Said de and es both required | Only `de.json` required; `es.json` reported |
| 6 | Treated "MCP must follow new features" as a fix | A way of working; grow the registry |
| 7 | (self) Invented a benchstat pseudo-version | Verified `v0.0.0-20261009192801-be2c69fb417e` |
| 8 | Pushed after the user merged #48 | Watch merge state; restart branch after a merge |
| 9 | Edited `AGENTS.md` during a rejected tool call | Wait for the user |
| 10 | Spec 003 merged with 20 task issues open | Issue and board hygiene (rule 8) |
| 11 | (self) Appended decisions at the bottom | `docs/decisions.md` is newest first |
| 12 | (self) `pkill -f <pattern>` killed its own shell | Kill by PID or `pgrep -x` |
| 13 | (self) Repeated #12 | `pgrep -x server.test \| xargs -r kill`; `timeout` on long probes |
| 14 | (self) Unmeasured figure in a GitHub comment | Every number measured in the session |
| 15 | (self) A test that passed with the bug present | Mutation-check every new test |
| 16 | (self) Guessed a CI regression cause | Measure the hypothesis first |
| 17 | (self) `gofmt -w` on an exempt file | gofmt only touched files; four exempt files |
| 18 | (self) `` `query_timeout` `` in the wiki | Write `` `"code": "query_timeout"` ``; never widen `ALLOWED_NON_TOOLS` |
| 19 | (self) Raw `go test` output to benchstat | Filter lines (`scripts/bench-compare.sh`) |
| 20 | (self) `git checkout -- web/src/theme.css` undid own edits | Back up a file before a test edit, restore from the backup |
| 21 | (self) Unmeasured "about 200 rules" for `--radius-sm` | Measured: 15 uses |
| 22 | (self) Unmeasured bundle baseline 790,888 B | Measured on main |
| 23 | (self) Committed catalogue baselines from the container | Reference drawn on the same CI runner |
| 24 | (self) `\s*` before a lookahead in `check-tokens.mjs` | Each lookahead carries its own `\s*` |
| 25 | (self) `git reset --hard` + force-push (blocked) | Fast-forward: `git push origin origin/main:refs/heads/<branch>` |
| 26 | (self) `setsid` in `.devcontainer/start.sh` failed on a Mac | `nohup` fallback (#130, PR #135) |
| 27 | (self) Told the user `localhost:8420` without http | Say `http://localhost:8420` |
| 28 | (self) A mutation `sed` removed opt-outs from 5 files; backup covered 2 | Back up every file a mutation touches |
| 29 | (self) `check-tokens` counted a `[role="dialog"]` selector | Find the panel by `[aria-modal="true"]`; never `token-ok` to dodge a counter |
| 30 | (self) A Playwright block that could never run | Delete vacuous test code |
| 31 | (self) Unmeasured "chart libraries add 40–90 KB gzip" | Measured sizes (section 8) |
| 32 | (self) Spec 004 called "no new runtime dependency" the user's; it was Claude's | Label Claude's defaults as defaults |
| 33 | (self) Gate said "nothing changed" in a shallow clone | Fetch `origin/main` and deepen before the gate |
| 34 | (self) Catalogue CI reference run timed out on a section main lacked | Skip a section the base lacks in `CATALOG_SHOTS_ONLY` runs |
| 35 | (self) `border-radius: 0` went over the radius budget | `border-radius: initial` |
| 36 | (self) SidePanel Escape blocked by a closed Select's listbox | Only on-screen elements count |
| 37 | (self) Catalogue Escape test flaked on a late tooltip | Wait until no `.ui-tooltip` |
| 38 | (self) Plan said a menu is "hidden for readers"; there is no role check | Shown to all; server refuses a reader's save |
| 39 | (self) Listed "Save for everyone/Reset" filters as "Now" for charts | It changes every view type → left out of charts; backlog via T048 |
| 40 | (self) `go mod download all` changed protected `go.sum` | Revert it (`git checkout -- go.sum`); `go.sum` changes only through Go tooling with a reason |
| 41 | (self) `scripts/licenses.mjs` without Go modules downloaded dropped 630 notice lines | Run `go mod download all` first, then regenerate, then revert `go.sum` |
| 42 | (self) Chart settings in the toolbar stretched it into a tall column (seen in the screenshot) | Settings in their own row above the chart; look at every screenshot before committing |
| 43 | (self) A chart with nothing to group by silently stayed a number chart, no "What to show" | FR-031: always show "What to show", every kind selectable, a sentence saying what to add |
| 44 | (self) Proposed "group by any property" as the fix | The user wanted one bar per row with its number ("Each row", FR-030) |

## 6. Decisions
| Decision | Why |
|---|---|
| Spec Kit 1.2.3 + GitHub Projects board (project 5) | User's call |
| `AGENTS.md` shared; `CLAUDE.md` gitignored | An earlier `CLAUDE.md` leaked deployment details |
| Parity manifest + `check-parity.mjs`; `gapBudget` ratchet | Agent parity |
| SQLite; read pool `s.rdb` beside writer `s.db` | Spec 002 |
| Board derives Status; a ticked task closes its issue | Hygiene |
| Spec 007 per-view `openIn`; centre peek = own `ui/CenterPanel` | User's choices |
| Spec 004 drawn with Chart.js 4.5.1, lazy chunk | User: "I choose chartjs" |
| Spec 004 grows a Notion-style chart builder (US5, FR-018–029) | User: "spec it and start the build" after the walk-through |
| A chart in a document = the existing database block showing a chart view (`local.viewId`); settings stored on the view | One way to embed; agents use `embed_database view_id` |
| Chart settings offered in a document's database block too (exception to #22, charts only) | A chart from the `/` menu must be finished where it was inserted |
| Single-colour palettes: 3 shades per hue that pass 3:1 (Notion has 5) | FR-015 contrast rule |
| New primitive `ui/Popover` for the settings panel (part 3) | The layer had none |
| Number charts, horizontal bars: kinds of their own | Notion shows them so |
| "Each row" grouping (`groupBy "__row"`), up to 50 rows drawn, default sort value high → low; new default when nothing groups but a number exists (FR-030, FR-019) | User: "I want the charts to show the value of each row as a bar" |
| Settings always show "What to show"; a sentence when nothing groups (FR-031) | User's bug report |
| Part 3 work (and "Each row") in one PR, not a separate bug-fix PR | User: "or is this part of Part 3?" → agreed |
| Upgrade path = epic #263, next after charts, research first | User's request |
| Parallel work: max 2 streams on non-overlapping files (Claude's recommendation B; #263 research could run in a second session) | Recommended, user has not answered |

## 7. Changed / rejected
- Earlier chats: decisions page in workspace → `docs/decisions.md`; fixed surfaces list → registry; force-push rebase → merge `main`; hand-moved cards → derived Status; committed catalogue baselines → reference drawn per run; `Dialog` `open`/`onOpenChange` → `onClose`.
- Spec 004 "hand-drawn SVG, no runtime dependency" → Chart.js 4.5.1 (user's choice).
- Spec 004 three separate PRs → parts 1+2 merged together in PR #264 (the Stop hook forced part 2's push before #264 merged); part 3 its own PR.
- Chart settings in the database toolbar → a row above the chart (part 2) → `ui/Popover` panel (part 3).
- "Group by any property like Notion" (option B) → not now; "Each row" covers the user's case (R18).
- ❌ Spec 004 leaves out: a second grouping / stacked bars, reference lines, axis range, Download SVG, creating a database or CSV import from the picker, "Save for everyone"/"Reset", folding toolbar, Lock views, "Hide negative values", "Load limit", "Show data source title" (FR-017).
- ❌ Grouping by a number's distinct values (R18).
- ❌ DuckDB, Mantine as app component library, shadcn/ui, Storybook; uPlot, Recharts, ECharts; widening `ALLOWED_NON_TOOLS`; looser pixel tolerance; baselines committed by a CI bot; three or more parallel streams.

## 8. Data & facts (exact)

**Repo and tooling**
- Go 1.27.2 local, CI 1.27.3; Node 22. `modernc.org/sqlite` v1.60.1 (SQLite 3.53.4). `@base-ui/react` 1.9.0; Playwright 1.63.0; Chart.js 4.5.1 (MIT, dependency `@kurkle/color` 0.3.4).
- CI jobs: `Build and test` (required), `Component catalogue`, `Storage benchmarks`, `sync`, `cla` (skipped in fork).
- Parity manifest: `collections` capability now lists `POST /api/collections/{id}/aggregate`; 34 MCP tools; `gapBudget` 10. check-wiki: 40 pages, 34 tools, 146 routes.
- gofmt-exempt: `server/server.go`, `server/audit.go`, `server/desktop_auth.go`, `server/tunnel_update_test.go`.
- `npm run check` includes `check-chartlayout.mjs` (39 rules) and `check-chartdefaults.mjs` (11 rules). Browser tests include `chart-view.mjs`.
- Locales: 1155 entries each in de/es, 0 untranslated.
- Token space scale: `--space-50` 2px, `--space-150` 6px, `--space-300` 12px, `--space-600` 24px; the database toolbar's side padding is 48px (`calc(2 * var(--space-600))`), 14px on ≤768px.
- Container setup each new session: clone the working branch, `git fetch origin main:refs/remotes/origin/main`, deepen, `cd web && npm ci`, `cd web/tests && npm ci`; Playwright browsers at `/opt/pw-browsers`. For notices: `go mod download all` → `node scripts/licenses.mjs` → `git checkout -- go.sum`.
- Full gate ~10 min: `scripts/agent-gate.sh > log; echo exit $? >> log` in the background.

**Spec 004 (charts)**
- Issues: parent #20; T001–T048 = #215–#262; T049–T054 = #271–#276 (Each row, Phase 9). Bug/finding filed: #266 (chart cannot filter on rollup/formula/backrelation; priority 2).
- Merged in PR #264 (parts 1+2): T001–T030, T041–T044, T047 ticked; T046 done for `collection-chart` only.
- Open for part 3: T031–T040 (builder), T045, T046 (`chart-settings` shot), T048 (backlog issues), T049–T054.
- Bundle: main chunk 559,150 → 560,626 B (gzip -9, +1,476 B; plan budget +3 KB); `ChartView` lazy chunk 183.37 KB raw / 64.71 KB gzip; `budgets.json` `bundleGzip` 590,146.
- Budgets (CI run 40704990150, p95 × 1.5): sum per select 7 ms (1k) / 59 ms (10k); count per month 5 / 38 ms; rollup sum 139 / 1,445 ms. CI p95: 4.06, 38.8, 2.68, 25.2, 92.2, 963 ms. Grouped count unchanged (19.41 → 19.35 ms p95 at 10k).
- Chart.js sizes measured (bar+line+donut, gzip -9): uPlot 22,678 B; Chart.js 4.5.1 60,694 B; Recharts 112,446 B; ECharts 179,222 B.
- Caps: 12 groups drawn (fold into "Other", never "No value"); 400 date periods; Each row 50 (12 on a donut); drill-down list 200 rows.
- Tokens: `color.chart.1`–`.12` (colourful), `color.chart.<gray|blue|yellow|green|purple|teal|orange|pink|red>.1`–`.3`, `color.chart.background.1`–`.4`; `chart.height.small|medium|large|xlarge` = 200/320/440/600 px.
- Error codes: `invalid_chart`, `too_many_periods`, `query_timeout`.

**Safe upgrades (#263)**: today `openDB` runs `CREATE … IF NOT EXISTS` + ~40 `ensureColumn` on every start (additive only); search/file indexes versioned and rebuilt; `salt backup` / `salt restore` exist; no schema version, no pre-upgrade backup, no backwards guard, no upgrade test.

**Upstream (`saltmd/salt.md`)**: fork contains upstream main up to `2ee1efc` (+ `521a2fc`); remote `upstream` must be re-added in a new container. #84 done (spec 006), #85 not taken, #91 done (spec 005), #92 done (spec 007), #93 done differently (spec 001).

**Screenshots**: retake with `cd web && npx vite build`; `go build -o <scratch>/salt-shot .`; fresh data dirs; run on 127.0.0.1:8421 (seed with `SALT_SEED_URL=http://127.0.0.1:8421 node scripts/seed-wiki-instance.mjs`) and a fresh instance on 8422; `ln -sfn /opt/node22/lib/node_modules/playwright web/node_modules/playwright`; `SALT_SHOOT_URL=http://127.0.0.1:8421 SALT_SHOOT_FRESH_URL=http://127.0.0.1:8422 SALT_SHOOT_EMAIL=ada@example.com SALT_SHOOT_PASSWORD='WikiPruefung2026!' node scripts/shoot-wiki.mjs <ids>`; then remove the symlink, `git checkout -- .github/hero.png`, `pgrep -x salt-shot | xargs -r kill`. Test account is invented. The wiki seed's Tasks database now has a Chart view (donut, sum of effort per status). 59 shots × light/dark (`collection-chart` added). A `tokens.css` change makes ~29 shots stale.

## 9. People, terms & names
- **People:** the user (`neatlittlemacapps`, Frank De Graeve); upstream maintainer "Jeremia" (`jeremiaa`).
- **Terms:** surface = a registry row; gap = a person can, an agent can't; budget = a count that only goes down; gate = `scripts/agent-gate.sh`; registry = `.specify/memory/surfaces.md`; read pool = `s.rdb`; writer = `s.db`; peek = a row opened beside/over its view; "What to show" = a chart's grouping (what one bar is); "Value" = how tall a bar is; "Each row" = one bar per row.
- **Branches:** working branch `claude/happy-cori-rq1bym` (= main + the Each-row spec commit `bf80512` + this handoff); `claude/vigilant-babbage-bvoiel` and `claude/keen-hopper-9joiox` hold only old handoff files (user may delete).
- **Spec 004 code names:** server `server/aggregate.go` (`aggSpec`, `aggGroup`, `aggResult`, `aggregateRows`, `aggregateSQL`, `aggregateDerived`, `groupKeySQL`, `groupKeysGo`, `finishGroups`, `fillPeriods`, `checkAggSpec`, `checkChartView`, `checkChartStyle`, `chartSignature`, `aggRequest`, `resolveAggRequest`, `handleAggregate`, `errChart`, `errTooManyPeriods`, `listTypes`), `rowsWhere` in `collections.go`, `normalizeViews` in `viewopen.go`, `applyChartSpec` in `mcp_schema.go`, `mcpAggregate` in `mcp_db.go`, `mcpEmbedDatabase(u, page, db, viewID)`; tests `aggregate_test.go`, `mcp_chart_test.go`. Browser: `chartLayout.ts` (`layoutChart`, `NO_VALUE`, `OTHER`, `MAX_DRAWN`), `chartGroups.ts` (`groupFilter`, `periodRange`), `chartDefaults.ts` (`defaultChartView`, `chartSettingsFor`, `GROUPABLE_TYPES`, `NUMBER_TYPES`), `chartTheme.ts` (`groupColourTokens`, `readInk`, `onThemeChange`), `components/ChartView.tsx` (data), `components/ChartFigure.tsx` (drawing; used by the catalogue), `components/ChartSettings.tsx`; keyboard shortcut id `chart.groups` in `keys.ts`.
- **Planned part 3 names:** `ui/Popover`, `savePicture.ts`, `blocks.tsx` database block prop `chartKind`, five slash entries, `web/tests/chart-builder.mjs`.

## 10. Work state
| Item | Status | Location | Notes |
|---|---|---|---|
| Spec 004 parts 1+2 | merged | PR #264 | server, agents, chart view, wiki, budgets |
| Spec 004 part 3 (builder + Each row) | spec done, not started | `specs/004-chart-view/` Phase 7 + Phase 9 | T031–T040, T045, T046 (chart-settings), T048, T049–T054 |
| #266 chart filter on rollups | filed | issue | needs a decision (refuse vs apply in Go) |
| #263 safe upgrades epic | filed, priority 1 | issue | after charts; research first |
| #178 view changes not audited | issue | — | priority 2 |
| Working branch | main + `bf80512` + this file | `claude/happy-cori-rq1bym` | rides into part 3's PR |

**Backlog order** (priority 1): #20 charts (part 3) → #263 upgrades → #131 table text too small · #133 board drop marker · #132 drag columns · #18 Status property · #19 quick filters / board sub-groups · #26 agent edits live · #22 edit comments + reactions. Priority 2: #23, #24, #21, #15, #178, #14, #16, #266. Priority 3: #3–#9, #17, #25, decisions #10, #11, #12.

## 11. Next steps
1. **Next action:** start spec 004 part 3: label its open issues `in-progress` (T031–T040 = #245–#254, T045 = #259, T046 = #260, T048 = #262, T049–T054 = #271–#276), then build Phase 9 first (T049 Each row on the server, then T051/T052 so the user's number-only collection works), then the builder (T031 `ui/Popover` → T033 panel → T034–T038), tests, wiki, `chart-settings` screenshot; gate; ask before opening the PR.
2. Then epic #263: research (sources, options rejected) → `/speckit-specify`.
3. Then the priority-1 backlog from the top.

## 12. Open questions ⚠️
- Parallel work: run the #263 research in a second session while charts part 3 is built here (Claude's recommendation B), or keep one stream?
- Each row with many rows: the spec defaults to drawing up to 50 rows (largest first, rest into "Other"). The user was asked "11 largest + Other" vs "every row up to 50" and did not answer.
- Commit authorship: keep `neatlittlemacapps` as author (current) or switch to Claude as a Stop hook asks? (long open)
- Delete branches `claude/keen-hopper-9joiox` and `claude/vigilant-babbage-bvoiel` (old handoffs only)? Archive the earlier session "04 salt"?

## 13. Re-attach checklist
Nothing to attach. This file is `docs/handoffs/handoff-saltmd.md` on branch `claude/happy-cori-rq1bym` of `neatlittlemacapps/salt.md`. Start a Claude Code session on that repo and branch.

---
<sub>Audit: 13/13 sections · 12 rules · 44 corrections · 190 data points · secrets removed: none found (the test account is invented and documented) · generated by active-memory</sub>
