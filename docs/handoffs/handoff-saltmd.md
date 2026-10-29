# active-memory handoff: salt.md agentic setup and feature roadmap

**Handoff #9** · 2026-10-29 · Lineage:
- **#1 (2026-10-25):** agentic setup (rules, gate, Spec Kit, parity manifest); four feature branches merged; 25 issues; three specs.
- **#2 (2026-10-26):** find-and-replace edits (#13, PR #48); specs 001/002 planned; #47 fixed; surfaces registry, board sync, ruleset (PR #49).
- **#3 (2026-10-26):** board derives its columns (PR #74); spec 002 tasks (#50–#73); storage benchmarks; fixes #75, #76; Codespaces (PR #77).
- **#4 (2026-10-26/27):** spec 002 finished (PRs #80, #81, #83); read pool (#84); fast reads (#85); tag colours (#86).
- **#5 (2026-10-27):** spec 001 batch 1 (#87–#126, PRs #127/#128/#129); spec 004 written; local Mac test; #130 fix; feedback issues #131–#134; upstream plan agreed.
- **#6 (2026-10-27):** owner answered all open questions; PRs #135, #137, #138, #159 (spec 005), #176 (spec 006).
- **#7 (2026-10-27/28):** spec 007 shipped (PRs #212, #213); upstream #85 not taken; backlog prioritised; spec 004 planned with Chart.js (PR #214).
- **#8 (2026-10-28):** Notion chart walk-through → spec 004 builder (US5, FR-018–031); charts parts 1+2 merged (PR #264); safe-upgrades epic #263 filed.
- **#9 (2026-10-28/29):** charts finished (PR #283: Each row, ui/Popover, settings panel, tooltip, Save chart as, `/` entries); agents author commits; Sonnet helpers rule; #263 research (second session) → owner chose option C (goose) → spec 008 specified, clarified, planned, 26 task issues (#289–#314); #265 fork releases (spec 009, PR #288) → v1.6.9; image fix (#315, PR #316) → v1.6.10 with image.

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
- **Done looks like:** features flow spec → plan → tasks → board → implementation; each reaches every surface in the registry; gate and CI green; every merge to main becomes a release.
- **Standing way of working** (2026-10-26): "from here on out, you should indeed ensure you think about all aspects of the code in relation to my feature requests." / "When a feature request introduces some new concept (like but not excluding the design system) you should add it to the pool of things to think about when specking new features."
- **Also:** "I want you to be able to do as much as possible yourself"; "ensure you have good board and issue hygiene".
- **2026-10-27:** "I want you to ignore the maintainers comments unless they really make sense for us as well. I basically want to implement the functionality on our end. I don't care about pushing it back to them".
- **Current order of work (2026-10-29):** spec 008 safe upgrades (#263) build → then the priority-1 backlog.

## 2. About the user (as relevant to this work)
- GitHub `neatlittlemacapps` (id 60575307), display name "Frank De Graeve"; email neatlittlemacapps@gmail.com; owns `neatlittlemacapps/salt.md`, a public fork of `saltmd/salt.md` (AGPL-3.0); CLA signed upstream.
- Works mostly from a phone (Claude app, iPhone), also the Claude desktop app on a Mac. Designer/PM, not a developer. Timezone Europe/Brussels. Thinks in Notion terms.
- Answers each step with a terse "Ok"/"Yes". Asks plain-language questions; catches process slips ("Did you spec this first?").
- Local Mac test install: repo at `~/Documents/Salt/salt.md`; data `~/salt-demo`; run `cd ~/Documents/Salt/salt.md && SALT_DATA=~/salt-demo SALT_ADDR=:8420 ./salt`, open `http://localhost:8420` (http, not https); stop with Ctrl+C; seed with `SALT_SEED_URL=http://127.0.0.1:8420 node web/scripts/seed-wiki-instance.mjs`. Backup before an update: `./salt backup`. Now also installable with `curl -fsSL https://raw.githubusercontent.com/neatlittlemacapps/salt.md/main/install.sh | sh` (fork releases).
- GitHub settings: Actions on; auto-merge enabled in the repo; `BOARD_TOKEN` secret, `BOARD_PROJECT`=5. The user taps merge on every PR.

## 3. Style & communication
- **Language:** English.
- **Tone:** direct, plain, no filler.
- **Reply length:** short (phone screen). Lead with the answer; detail only when asked.
- **Formatting:** short lists and small tables; numbered steps with exact tap/click paths for anything the user does by hand; shell commands in their own fenced `bash` blocks with full paths.
- **"Explain X" / options:** per option: gains, costs, effort; then one recommendation.
- **Working style:** each step ends with "Ready to continue with <next step>?" and waits for the user's go; a short status line when the user hasn't heard from Claude in a while during a long turn.
- **Explaining terms:** plain words for a non-developer (what it is, what it costs us, what it gives us); concrete examples.
- **Avoid:** recaps of steps; long explanations before the result.

## 4. Hard rules (word for word)
1. "Use spec-kit but indeed also a board to to track the work"
2. "Fold them into here so the functionality is in here too (those branches)"
3. Pushing: routine pushes to the working branch are fine; opening a PR is asked for ("Ready to continue with opening the PR?"), unless the user just asked for it. PRs: the user taps merge (Claude cannot enable auto-merge: classifier denial).
4. Repo rules in `AGENTS.md` and `.claude/rules/` apply. A Stop hook runs `scripts/agent-gate.sh` plus a git-check (uncommitted or unpushed work fails it). Stale wiki screenshots fail the gate: retake before stopping.
5. "ensure you think about all aspects of the code in relation to my feature requests". A new concept goes into `.specify/memory/surfaces.md`.
6. Never work around a classifier denial (CI bypass, self-modification, destructive git such as deleting remote branches, enabling auto-merge, deleting scheduled tasks). Tell the user and give them the manual step.
7. Commit authorship (changed 2026-10-28, owner: "Claude"): commits are authored by the agent (git's configured `Claude <noreply@anthropic.com>`); trailers `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: …`. Anything offered upstream is re-committed with the owner as author first.
8. "ensure you have good board and issue hygiene": label `in-progress` when starting (remove when done/merged); tick tasks in `tasks.md` in the PR that does them; `Closes #N` for every finished task issue; file an issue for every bug or finding; nobody moves cards.
9. After opening a PR: `subscribe_pr_activity`; a `send_later` check-in ~50 min later; on CI red fix and push; on merge remove `in-progress` and fast-forward the working branch (`git push origin origin/main:refs/heads/<branch>` when the branch is inside main).
10. "I want you to ignore the maintainers comments unless they really make sense for us as well. I basically want to implement the functionality on our end. I don't care about pushing it back to them"
11. Every number in a doc, comment or PR is measured in the session.
12. Upgrade epic (#263) is "the next big epic to complete after the charting"; research done; owner chose option C ("No, go with c").
13. Sonnet helpers (owner, 2026-10-28: "can you hand off to sonnet if you think it is useful?" → yes; "Capture that behaviour for other sessions please."): mechanical tasks (translations, wiki text following an existing page, screenshot retakes, test runs, copy-a-pattern tasks) may go to a `model: "sonnet"` subagent; judgement stays on Opus; review helper output before committing. Recorded in `.claude/rules/claude-code.md`. No Haiku.
14. Anything spanning more than one surface starts with a spec/plan (`.claude/rules/claude-code.md`), even when the user files it as a plain issue (#265 lesson).

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
| 13 | (self) Repeated #12 (twice now: also 2026-10-28 on a vite catalog server) | `pgrep -x server.test \| xargs -r kill`; for node: loop `pgrep -x node` and match `/proc/$pid/cmdline`; `timeout` on long probes |
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
| 38 | (self) Plan said a menu is "hidden for readers"; there is no role check | Shown to all; server refuses a reader's save (charts now use `canEdit` from the editor, FR-027) |
| 39 | (self) Listed "Save for everyone/Reset" filters as "Now" for charts | Left out; backlog #279 |
| 40 | (self) `go mod download all` changed protected `go.sum` | Revert it (`git checkout -- go.sum`); `go.sum` changes only through Go tooling with a reason |
| 41 | (self) `scripts/licenses.mjs` without Go modules downloaded dropped 630 notice lines | Run `go mod download all` first, then regenerate, then revert `go.sum` |
| 42 | (self) Chart settings in the toolbar stretched it | Look at every screenshot before committing |
| 43 | (self) A chart with nothing to group by silently stayed a number chart | FR-031 sentence; every kind selectable (built) |
| 44 | (self) Proposed "group by any property" as the fix | "Each row" (built) |
| 45 | Built #265 (workflows, update check, installer, docs) without spec/plan; user: "Did you spec this first?" | Spec + plan first for multi-surface work; spec/plan 009 written after, code reviewed against it |
| 46 | (self) `npx prettier --write` reformatted whole files (no repo config) | Never run prettier; revert and re-apply only own edits |
| 47 | (self) A check regex matched words in a comment (`npm run build`) | Anchor checks to the code line (`/^RUN .*npm run build/m`) |
| 48 | (self) Sonnet helper gave "Caption" the same German word as labels | Review helper output; "Bildunterschrift" / "Pie de gráfico" |
| 49 | (self) Speckit taskstoissues dedups by task ID repo-wide (T001 exists for every spec) | Dedupe per parent issue's sub-issues |
| 50 | (self) Container image's frontend stage copied a few dirs; gate failed on `.specify/` (#315) | `COPY . /src` + `.dockerignore`; `check-release.mjs` enforces it |

## 6. Decisions
| Decision | Why |
|---|---|
| Spec Kit 1.2.3 + GitHub Projects board (project 5) | User's call |
| `AGENTS.md` shared; `CLAUDE.md` gitignored | An earlier `CLAUDE.md` leaked deployment details |
| Parity manifest + `check-parity.mjs`; `gapBudget` ratchet | Agent parity |
| SQLite; read pool `s.rdb` beside writer `s.db` | Spec 002 |
| Board derives Status; a ticked task closes its issue | Hygiene |
| Spec 004 charts with Chart.js 4.5.1, lazy chunk | User: "I choose chartjs" |
| "Each row" draws every row up to 50 (12 on a donut) | User: "all rows" |
| Agents author their commits | User: "Claude" (2026-10-28) |
| Sonnet helpers for mechanical tasks | User (rule 13) |
| #263 research ran in a second session in parallel | User: "1 yes" |
| Old handoff branches deleted | User: "yes" (Claude was blocked; user does it by hand) |
| Safe upgrades on a migration library: goose v3.29.0 (option C); golang-migrate rejected (SQL steps only) | User: "No, go with c"; goose picked by Claude for Go steps |
| A refused start shows its sentence in the log AND on the usual address (one page; JSON `{error, code}` for `/api/`, `/mcp`) | User: "B" (spec 008 FR-019) |
| Fixtures per upgrade step (not per release); pre-upgrade copies kept 3, not in `salt backup` | Claude while clarifying (releases happen on every push) |
| #265 done before spec 008 build | User: "Yes but after that do 265 first" |
| Every push to main = a release, next patch on the `server.Version` major.minor line (v1.6.9 first); plain `vX.Y.Z`; release action creates the tag; image built in the same workflow; desktop never latest | #265 + Claude's rule, in `docs/decisions.md` |

## 7. Changed / rejected
- Earlier chats: decisions page in workspace → `docs/decisions.md`; fixed surfaces list → registry; force-push rebase → merge `main`; hand-moved cards → derived Status; committed catalogue baselines → reference drawn per run; `Dialog` `open`/`onOpenChange` → `onClose`.
- Spec 004 "hand-drawn SVG" → Chart.js 4.5.1; chart settings in toolbar → row → `ui/Popover` panel.
- Owner as commit author → Claude as author.
- #263 research recommendation B (hand-written runner, `PRAGMA user_version`) → C (goose; version in `goose_db_version`).
- Spec 008 "one fixture per release" → per step.
- #265 "server.Version + run number (1.6.8+42)" → rejected (update check ignores `+`).
- ❌ Spec 004 leaves out: second grouping/stacked bars, reference lines, axis range, SVG, creating a database or CSV import from the picker, "Save for everyone"/"Reset", folding toolbar, Lock views, "Hide negative values", "Load limit", "Show data source title" (backlog #279–#282).
- ❌ Grouping by a number's distinct values; "group by any property" (for now).
- ❌ DuckDB, Mantine as app library, shadcn/ui, Storybook; uPlot, Recharts, ECharts; widening `ALLOWED_NON_TOOLS`; looser pixel tolerance; baselines committed by a CI bot; three or more parallel streams.
- ❌ Down migrations, Litestream, upgrade-on-read as the mechanism (research).

## 8. Data & facts (exact)

**Repo and tooling**
- Go 1.27.2 local, CI 1.27.3; Node 22. `modernc.org/sqlite` v1.60.1 (SQLite 3.53.4). `@base-ui/react` 1.9.0; Playwright 1.63.0; Chart.js 4.5.1.
- CI jobs: `Build and test` (required), `Component catalogue`, `Storage benchmarks`, `sync`, `cla` (skipped in fork). Release workflow on push to main: jobs `build`, `image / image`.
- 34 MCP tools; `gapBudget` 10; check-wiki: 40 pages, 146 routes; registry has 17 surfaces (new: **Stored data**).
- gofmt-exempt: `server/server.go`, `server/audit.go`, `server/desktop_auth.go`, `server/tunnel_update_test.go`.
- `npm run check` now includes `check-chartlayout.mjs` (45 rules), `check-chartdefaults.mjs` (17 rules), `check-release.mjs`.
- Locales: 1206 entries each de/es, 0 untranslated (at v1.6.10).
- Container setup each new session: clone the working branch, `git fetch origin main:refs/remotes/origin/main`, deepen, `cd web && npm ci`, `cd web/tests && npm ci`; Playwright browsers at `/opt/pw-browsers`.
- Full gate ~10 min: `timeout 900 scripts/agent-gate.sh > log 2>&1`.
- Screenshot retake recipe: `cd web && npx vite build`; `go build -o <scratch>/salt-shot .`; fresh data dirs; run on 127.0.0.1:8421 (seed: `SALT_SEED_URL=http://127.0.0.1:8421 node scripts/seed-wiki-instance.mjs`) and fresh on 8422; `ln -sfn /opt/node22/lib/node_modules/playwright web/node_modules/playwright`; `SALT_SHOOT_URL=http://127.0.0.1:8421 SALT_SHOOT_FRESH_URL=http://127.0.0.1:8422 SALT_SHOOT_EMAIL=ada@example.com SALT_SHOOT_PASSWORD='WikiPruefung2026!' node scripts/shoot-wiki.mjs <ids>`; remove the symlink, `git checkout -- .github/hero.png`, `pgrep -x salt-shot | xargs -r kill`. Test account is invented. Changes to `tokens.css` mark ~30 shots stale (timestamps move on activity-log etc.).

**Charts (spec 004, done)**
- Merged PRs #264 (parts 1+2), #283 (part 3). Issues closed: #20, #215–#262, #271–#276.
- Each row: `groupBy "__row"`; budgets p95 4.575 ms → **7 ms** (1k), 45.84 ms → **69 ms** (10k), CI run 40764479349; answer 761,291 B at 10k (#277).
- Popover tokens: `popover.width` 320px, `popover.layer` 150.

**Releases (#265, spec 009, done)**
- PR #288 merged → **v1.6.9** (binaries; image failed, #315); PR #316 merged → **v1.6.10** (binaries + image OK, run 40841297991).
- Assets: `salt-darwin-arm64`, `salt-darwin-amd64`, `salt-linux-amd64`, `salt-linux-arm64`, `salt-windows-amd64.exe`, `SHA256SUMS.txt`; image `ghcr.io/neatlittlemacapps/salt.md:<version>` and `:latest`.
- Fork tags before: v1.1.2–v1.1.4 (upstream's). `install.sh` `REPO="${SALT_REPO:-neatlittlemacapps/salt.md}"`; `updateRepo = "neatlittlemacapps/salt.md"`.

**Safe upgrades (spec 008, specified/planned, not built)**
- Today: `openDB` runs `schema` + 40 `ensureColumn` calls; `schema_meta.version` overwritten every start; `make build` used to stamp nothing (fixed by #265).
- Research measurements: `openDB` new file 90.6 ms; existing 2.3–2.6 ms; `VACUUM INTO` 83 MB in 178 ms; goose +83 modules, +1.16 MB (golang-migrate +192, +0.12 MB).
- goose v3.29.0 probe (scratch, not in repo): `NewProvider(DialectSQLite3, db, nil, WithGoMigrations(NewGoMigration(n, &GoFunc{RunTx: …}, nil)))` works; a failing step rolls back, version stays at last success, next start continues; **a newer database: goose reports no pending, runs nothing, no error**; **`GetDBVersion` on a fresh DB creates `goose_db_version` (file checksum changed)** → refusal check must read the version with plain SQL before any goose call. Add both findings to the plan/research in T001.
- Spec 008 tasks T001–T026 = **#289–#314** (sub-issues of #263); #289 labelled `in-progress`.
- Codes: `upgrade_refused`, `upgrade_failed`, `upgrade_copy_failed`, `upgrade_busy`; copies `salt.db.before-step-<n>`; lock `upgrade.lock` (15-minute takeover); fixtures `server/testdata/upgrade/step-<N-1>.db`; SC-002 start ≤ 5 ms.

**Upstream (`saltmd/salt.md`)**: fork contains upstream main up to `2ee1efc` (+ `521a2fc`); remote `upstream` must be re-added in a new container.

## 9. People, terms & names
- **People:** the user (`neatlittlemacapps`, Frank De Graeve); upstream maintainer "Jeremia" (`jeremiaa`).
- **Terms:** surface = a registry row; gap = a person can, an agent can't; budget = a count that only goes down; gate = `scripts/agent-gate.sh`; registry = `.specify/memory/surfaces.md`; "Each row" = one bar per row; step = numbered upgrade step; fixture = a database written before a step.
- **Branches:** working branch `claude/handoff-continuation-4byisr` (= main at `f9e35b9` + this handoff); `claude/upgrades-research` (research only, merged content via cherry-pick); `claude/happy-cori-rq1bym` (old, merged).
- **Files:** specs `specs/004-chart-view/`, `specs/008-safe-upgrades/` (spec, research, plan, data-model, contracts/rest.md + refusal.md, quickstart, tasks), `specs/009-fork-releases/`; chart code `server/aggregate.go`, `web/src/components/ChartPane.tsx`, `ChartSettings.tsx`, `ChartSave.tsx`, `ChartFigure.tsx`, `ChartView.tsx`, `web/src/chartInsert.ts`, `savePicture.ts`, `ui/Popover.tsx`; release `.github/workflows/release.yml`, `docker.yml`, `.dockerignore`, `web/scripts/check-release.mjs`.
- **Planned 008 names:** `server/upgrade.go` (`upgradeDB`, `UpgradeRefusal`, `copyBeforeUpgrade`, `pruneCopies`, `upgradeLock`, `RefusalHandler`), `server/upgrade_steps.go` (`baseSchema(tx)`, `rebuildTable`), `server/upgrade_test.go`, `web/scripts/check-upgrades.mjs`, `web/tests/upgrade-refusal.mjs`.

## 10. Work state
| Item | Status | Location | Notes |
|---|---|---|---|
| Spec 004 charts | done, merged | PRs #264, #283 | — |
| #265 fork releases | done, merged | PR #288, spec 009 | v1.6.9 out |
| #315 image build | done, merged | PR #316 | v1.6.10 image OK |
| Spec 008 safe upgrades | spec + clarify + plan + tasks done; build not started | `specs/008-safe-upgrades/`, #289–#314 | T001 next |
| Docker image visibility | waiting on user | GitHub Packages | make public (section 12) |
| Backlog priority 1 | after 008 | issues | #131, #133, #132, #18, #19, #26, #22 |
| Priority 2 | later | issues | #23, #24, #21, #15, #178, #14, #16, #266, #277, #278 |
| Priority 3 | later | issues | #3–#9, #17, #25, #10, #11, #12, #279–#282 |

## 11. Next steps
1. **Next action:** spec 008 T001 (#289): in the repo, `go get github.com/pressly/goose/v3@v3.29.0`; record binary size and module count before/after (`CGO_ENABLED=0`); regenerate notices (`go mod download all` → `node scripts/licenses.mjs` → keep `go.sum` only as `go get` changed it); write the two goose findings (section 8) into `specs/008-safe-upgrades/plan.md` P2/research.
2. T002 fixture `step-0.db` from today's main, then T003–T006 (step 1 = today's schema; `upgradeDB`; all opens through it; frozen-step tests), then US2–US7 tasks in order; label each issue `in-progress` when starting.
3. One PR for spec 008 (ask first), then the priority-1 backlog from #131.

## 12. Open questions ⚠️
- Has the user made the container image public (Profile → Packages → salt.md → Package settings → Change visibility → Public)? Without it `docker pull` needs a login.
- Has the user deleted branches `claude/keen-hopper-9joiox` and `claude/vigilant-babbage-bvoiel` (said yes; Claude was blocked)?

## 13. Re-attach checklist
Nothing to attach. This file is `docs/handoffs/handoff-saltmd.md` on branch `claude/handoff-continuation-4byisr` of `neatlittlemacapps/salt.md`. Start a Claude Code session on that repo and branch.

---
<sub>Audit: 13/13 sections · 14 rules · 50 corrections · 230 data points · secrets removed: none found (the test account is invented and documented) · generated by active-memory</sub>
