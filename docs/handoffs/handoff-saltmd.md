# active-memory handoff: salt.md agentic setup and feature roadmap

**Handoff #10** · 2026-10-29 · Lineage:
- **#1 (2026-10-25):** agentic setup (rules, gate, Spec Kit, parity manifest); four feature branches merged; 25 issues; three specs.
- **#2 (2026-10-26):** find-and-replace edits (#13, PR #48); specs 001/002 planned; #47 fixed; surfaces registry, board sync, ruleset (PR #49).
- **#3 (2026-10-26):** board derives its columns (PR #74); spec 002 tasks (#50–#73); storage benchmarks; fixes #75, #76; Codespaces (PR #77).
- **#4 (2026-10-26/27):** spec 002 finished (PRs #80, #81, #83); read pool (#84); fast reads (#85); tag colours (#86).
- **#5 (2026-10-27):** spec 001 batch 1 (#87–#126, PRs #127/#128/#129); spec 004 written; local Mac test; #130 fix; feedback issues #131–#134; upstream plan agreed.
- **#6 (2026-10-27):** owner answered all open questions; PRs #135, #137, #138, #159 (spec 005), #176 (spec 006).
- **#7 (2026-10-27/28):** spec 007 shipped (PRs #212, #213); upstream #85 not taken; backlog prioritised; spec 004 planned with Chart.js (PR #214).
- **#8 (2026-10-28):** Notion chart walk-through → spec 004 builder (US5, FR-018–031); charts parts 1+2 merged (PR #264); safe-upgrades epic #263 filed.
- **#9 (2026-10-28/29):** charts finished (PR #283); agents author commits; Sonnet helpers rule; #263 → option C (goose) → spec 008 specified/planned, tasks #289–#314; #265 fork releases (spec 009, PR #288) → v1.6.9; image fix (PR #316) → v1.6.10.
- **#10 (2026-10-29):** spec 008 part 1 built (T001–T007, T009–T019) and merged (PR #321); notices list linked modules only; spec 010 (menu icons) and spec 011 (rename to **nigari**) specified + clarified; plan agreed: rename first, then 2 streams; code-review, ux-ui-audit and playwright plugins installed.

## 0. Instructions for Claude (read first)

You are continuing work from a previous chat. That chat is gone; this file is the complete context and the source of truth.

1. Read this whole file before replying.
2. Follow sections 3 (Style), 4 (Hard rules) and 5 (Corrections) in every reply, for the rest of this chat. They override your defaults.
3. Use the values in section 8 exactly. Never round, re-estimate, or "correct" them.
4. Do not suggest anything listed in section 7 (Changed / rejected) again unless the user brings it up.
5. Code word: Start every reply with exactly "Yes Boss!"
6. Your first reply: at most 5 lines covering the goal, the current state, and the next step (section 11). Mention any files from section 13 that were not attached. Ask the questions in section 12 if there are any. End with "Ready to continue with <next step>?" Then wait for the user's go.

## 1. Mission
- **Goal:** take the fork "to a higher level": many more features, built with an agentic setup that keeps the software's domains intact.
- **In the user's words:** "proper coding, holistic adjustments (think, when I add a feature, the system should also reason and tackle the fact that the mcp functionality might also need to follow), proper UI implementation, performance and testing".
- **Done looks like:** features flow spec → plan → tasks → board → implementation; each reaches every surface in the registry; gate and CI green; every merge to main becomes a release.
- **Standing way of working** (2026-10-26): "from here on out, you should indeed ensure you think about all aspects of the code in relation to my feature requests." / "When a feature request introduces some new concept (like but not excluding the design system) you should add it to the pool of things to think about when specking new features."
- **Also:** "I want you to be able to do as much as possible yourself"; "ensure you have good board and issue hygiene".
- **2026-10-29:** the fork is "an official forked version", renamed **nigari** ("we are too far gone from the original salt to ever contribute back").
- **Current order of work (2026-10-29, owner: "bump the rename to the top, then follow the proposed plan"; "after rename go 2 streams"):** (1) post-merge housekeeping + rule + steward skill; (2) spec 011 rename to nigari (alone, no parallel stream); (3) 2 streams: stream A = Claude (rest of spec 008 T020–T026, then spec 010 menu icons), stream B = a helper session (Epic A, database views); (4) later epics.

## 2. About the user (as relevant to this work)
- GitHub `neatlittlemacapps` (id 60575307), display name "Frank De Graeve"; email neatlittlemacapps@gmail.com; owns `neatlittlemacapps/salt.md`, a public fork of `saltmd/salt.md` (AGPL-3.0); CLA signed upstream.
- Works mostly from a phone (Claude app, iPhone), also the Claude desktop app on a Mac. Designer/PM, not a developer. Timezone Europe/Brussels. Thinks in Notion terms.
- Answers each step with a terse "Ok"/"Yes"/a letter. Asks plain-language questions; catches process slips. Says when lost ("I am lost with what is done vs what is todo") → give a done/todo table.
- Local Mac test install: repo at `~/Documents/Salt/salt.md`; data `~/salt-demo`; run `cd ~/Documents/Salt/salt.md && SALT_DATA=~/salt-demo SALT_ADDR=:8420 ./salt`, open `http://localhost:8420`; stop with Ctrl+C. Install latest release: `curl -fsSL https://raw.githubusercontent.com/neatlittlemacapps/salt.md/main/install.sh | sh`.
- GitHub settings: Actions on; auto-merge enabled; `BOARD_TOKEN` secret, `BOARD_PROJECT`=5. The user taps merge on every PR.
- The user's desktop Claude once said "GitHub holds no built binary": binaries live under Releases, not in the code; the desktop app was never released by the fork.

## 3. Style & communication
- **Language:** English.
- **Tone:** direct, plain, no filler.
- **Reply length:** short (phone screen). Lead with the answer; detail only when asked.
- **Formatting:** short lists and small tables; numbered steps with exact tap/click paths for anything the user does by hand; shell commands in their own fenced `bash` blocks with full paths.
- **"Explain X" / options:** per option: gains, costs, effort; then one recommendation.
- **Working style:** each step ends with "Ready to continue with <next step>?" and waits for the user's go; a short status line when the user hasn't heard from Claude in a while during a long turn. When the user asks mid-turn questions, answer them in the same reply.
- **Explaining terms:** plain words for a non-developer; concrete examples.
- **Avoid:** recaps of steps; long explanations before the result.

## 4. Hard rules (word for word)
1. "Use spec-kit but indeed also a board to to track the work"
2. "Fold them into here so the functionality is in here too (those branches)"
3. Pushing: routine pushes to the working branch are fine; opening a PR is asked for ("Ready to continue with opening the PR?"), unless the user just asked for it. The user taps merge (Claude cannot enable auto-merge: classifier denial).
4. Repo rules in `AGENTS.md` and `.claude/rules/` apply. A Stop hook runs `scripts/agent-gate.sh` plus a git-check (uncommitted or unpushed work fails it). Stale wiki screenshots fail the gate: retake before stopping.
5. "ensure you think about all aspects of the code in relation to my feature requests". A new concept goes into `.specify/memory/surfaces.md`.
6. Never work around a classifier denial (CI bypass, self-modification, destructive git, enabling auto-merge, deleting scheduled tasks, copying protected `go.sum`). Tell the user and give them the manual step.
7. Commit authorship (owner, 2026-10-28: "Claude"): commits authored by the agent (`Claude <noreply@anthropic.com>`); trailers `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: …`.
8. "ensure you have good board and issue hygiene": label `in-progress` when starting (remove when merged); tick tasks in `tasks.md` in the PR that does them; `Closes #N` for every finished task issue; file an issue for every bug or finding; nobody moves cards.
9. After opening a PR: `subscribe_pr_activity`; a `send_later` check-in ~50 min later; on CI red fix and push; on merge remove `in-progress` and fast-forward the working branch (`git push origin origin/main:refs/heads/<branch>` when the branch is inside main).
10. "I want you to ignore the maintainers comments unless they really make sense for us as well. I basically want to implement the functionality on our end. I don't care about pushing it back to them"
11. Every number in a doc, comment or PR is measured in the session.
12. Sonnet helpers for mechanical tasks (translations, wiki text following a page, screenshot retakes, test runs, copy-a-pattern); judgement stays on Opus; review helper output. No Haiku. (`.claude/rules/claude-code.md`)
13. Anything spanning more than one surface starts with a spec/plan, even when filed as a plain issue.
14. Menu icons (owner, 2026-10-29): "menu-items should have an icon. Ensure that no 2 functions have the same icon" — same function keeps one icon in every menu; editor menus count; a function = the verb.
15. Parallel work: "after rename go 2 streams" (conductor = Claude; helper sessions on disjoint areas); never 3+.
16. After PR #321 merged: write the skill-use rule and the steward skill "right after PR #321 merges, on the fresh branch, so the open PR stays as it is".

## 5. Corrections log
| # | Claude did | The user wanted |
|---|---|---|
| 1 | Told the user to run `/speckit-specify` in a separate session | Run Spec Kit steps directly (the speckit skills are `disable-model-invocation`: follow their SKILL.md by hand) |
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
| 12–13 | (self) `pkill -f <pattern>` killed its own shell (twice) | `pgrep -x <name> \| xargs -r kill`; `timeout` on long probes |
| 14 | (self) Unmeasured figure in a GitHub comment | Every number measured in the session |
| 15 | (self) A test that passed with the bug present | Mutation-check every new test |
| 16 | (self) Guessed a CI regression cause | Measure the hypothesis first |
| 17 | (self) `gofmt -w` on an exempt file | gofmt only touched files; four exempt files |
| 18 | (self) `` `query_timeout` `` in the wiki | `` `"code": "query_timeout"` ``; never widen `ALLOWED_NON_TOOLS` |
| 19 | (self) Raw `go test` output to benchstat | `scripts/bench-compare.sh` |
| 20 | (self) `git checkout -- file` undid own edits | Back up a file before a test edit (to the scratchpad) |
| 21–22 | (self) Unmeasured counts/baselines | Measure |
| 23 | (self) Committed catalogue baselines from the container | Reference drawn on the CI runner |
| 24 | (self) `\s*` before a lookahead in `check-tokens.mjs` | Each lookahead carries its own `\s*` |
| 25 | (self) `git reset --hard` + force-push (blocked) | Fast-forward: `git push origin origin/main:refs/heads/<branch>` |
| 26 | (self) `setsid` in `.devcontainer/start.sh` failed on a Mac | `nohup` fallback |
| 27 | (self) `localhost:8420` without http | `http://localhost:8420` |
| 28 | (self) Mutation `sed` hit 5 files, backup covered 2 | Back up every file a mutation touches |
| 29 | (self) `check-tokens` counted a dialog selector | `[aria-modal="true"]`; never `token-ok` to dodge a counter |
| 30 | (self) A Playwright block that could never run | Delete vacuous test code |
| 31–32 | (self) Unmeasured chart sizes; Claude's default labelled as user's | Measure; label Claude's defaults as defaults |
| 33 | (self) Gate said "nothing changed" in a shallow clone | Fetch `origin/main` and deepen before the gate |
| 34–37 | (self) catalogue/CI/Escape/tooltip slips | see spec 001/004 history |
| 38–39 | (self) Plan claims about reader menus; unasked "Now" items | Check the code; leave out what was not asked |
| 40 | (self) `go mod download all` changed protected `go.sum` | Revert with `git checkout -- go.sum` (commit first so git is the backup) |
| 41 | (self) `scripts/licenses.mjs` without modules downloaded dropped notices | `go mod download all` first, then regenerate, then revert `go.sum` |
| 42 | (self) Toolbar stretched by chart settings | Look at every screenshot before committing |
| 43–44 | (self) Chart grouping slips | FR-031; "Each row" |
| 45 | Built #265 without spec/plan; user: "Did you spec this first?" | Spec + plan first for multi-surface work |
| 46 | (self) `npx prettier --write` reformatted whole files | Never run prettier |
| 47 | (self) Check regex matched words in a comment | Anchor checks to the code line |
| 48 | (self) Sonnet gave "Caption" the labels' German word | Review helper output |
| 49 | (self) taskstoissues dedup by task ID repo-wide | Dedupe per parent issue's sub-issues |
| 50 | (self) Container image copied a few dirs only | `COPY . /src` + `.dockerignore`; `check-release.mjs` |
| 51 | (self) `cp go.sum <scratch>` was denied (twice) | Commit `go.mod`/`go.sum` first; git is the backup; never copy protected files |
| 52 | Wrote spec 011 with the name "salty.md" before the user had checked it; user: "stop, lemme doublecheck the name" | Brand/name choices are confirmed (availability checked by the user) before they go into docs |
| 53 | (self) Test expected copy `.before-step-2`; one start takes one copy, before its first pending step | Correct expectation: the newest copy the release can open |
| 54 | (self) Read-only SQLite check created `-wal`/`-shm` | Open `immutable=1` when no `-wal` exists |
| 55 | (self) New "upgrade" audit entry on a fresh DB broke retention tests | A new, empty file is created, not upgraded: no entry (fix code, not test) |
| 56 | (self) Parameter named `sql` shadowed the package; `fmt` added to exempt `server.go` | Rename params; put helpers (e.g. `stepsDetail`) in the new file |

## 6. Decisions
| Decision | Why |
|---|---|
| Spec Kit 1.2.3 + GitHub Projects board (project 5) | User's call |
| `AGENTS.md` shared; `CLAUDE.md` gitignored | An earlier `CLAUDE.md` leaked deployment details |
| Parity manifest + `check-parity.mjs`; `gapBudget` ratchet | Agent parity |
| SQLite; read pool `s.rdb` beside writer `s.db` | Spec 002 |
| Charts on Chart.js 4.5.1 | User: "I choose chartjs" |
| Agents author their commits | User: "Claude" |
| Safe upgrades on goose v3.29.0 (option C) | User: "No, go with c" |
| Every push to main = a release, next patch on `server.Version`'s major.minor | #265, `docs/decisions.md` |
| Third-party notices list modules the 5 release binaries link (`go list -deps` per target in `release.yml`), not `go list -m all` | User: "B" (in `docs/decisions.md`) |
| Spec 010: every menu item has an icon; one function = one icon app-wide; editor's `/` and block menus count; function = the verb ("Move to trash" ≠ "Delete") | User: "1. yes", "2. count too", "A" |
| Spec 010 timing: spec now, build after 008 | User: "3. spec now, build after 008" |
| Rename the fork, option C: everything incl. internals | User: "C. Rename everything, internals too" |
| New name **nigari** | User: "go with \"nigari\"" (after checking "salty.md") |
| No transition for old names: they stop with the first nigari release; data still moves once; a `SALT_*` variable without its `NIGARI_*` name refuses the start | User: "Q1 immediately" (refusal = Claude's safety design inside that choice) |
| First nigari release = **v2.0.0** | User: "Q2 B" |
| Rename the GitHub repo too, at the moment the spec 011 PR merges | Claude's recommendation; user asked, did not object |
| Spec 008 split: part 1 (T001–T019) merged as PR #321; part 2 (T020–T026) later | Needed for the rename (owner: "bump the rename to the top") |
| After the rename: 2 streams (conductor + 1 helper) | User: "after rename go 2 streams" |
| Skill use enforced by (1) a rule in `.claude/rules/claude-code.md` + (2) a repo steward skill; GitHub auto-review (3) later if needed | User: "yes" |
| Plugins installed: code-review (Anthropic), ux-ui-audit (community), playwright (Microsoft) | User installed from Claude's card |

## 7. Changed / rejected
- Earlier chats: decisions page in workspace → `docs/decisions.md`; fixed surfaces list → registry; force-push rebase → merge `main`; hand-moved cards → derived Status; committed catalogue baselines → reference per run; `Dialog` `open`/`onOpenChange` → `onClose`; hand-drawn SVG charts → Chart.js; owner as commit author → Claude.
- #263 research B (hand-written runner) → C (goose); spec 008 fixture per release → per step; #265 `1.6.8+42` versions rejected.
- Notices from `go list -m all` → linked modules only (A rejected: 10× longer notices for code that does not ship).
- Plan 008 P2 "goose's own missing-migrations error would also catch a newer DB" → false; plain-SQL refusal. P3 `HasPending` → plain-SQL "pending" (HasPending writes).
- Upgrades on the single writer connection → own pool of 2 (RunDB deadlock).
- Name "salty.md" → "nigari".
- Rename option B (product only) → C (everything). Transition period for old names → none.
- Spec 008 as one PR → two parts. Rename after all of 008 → rename right after part 1.
- ❌ 3+ parallel streams; parallel streams during the rename.
- ❌ Community Go/security/Flutter/mobile/AWS plugins (repo rules and `/security-review` cover it).
- ❌ Spec 004 leftovers (backlog #279–#282); DuckDB, Mantine as app library, shadcn/ui, Storybook, uPlot, Recharts, ECharts; widening `ALLOWED_NON_TOOLS`; looser pixel tolerance; baselines committed by a CI bot; down migrations, Litestream, upgrade-on-read.

## 8. Data & facts (exact)

**Repo and tooling**
- Go 1.27.2 local, CI 1.27.3; Node 22 (v22.22.0, has `node:sqlite`). `modernc.org/sqlite` v1.60.1; `modernc.org/libc` now v1.78.0 (was v1.77.1; raised by goose with x/crypto v0.58.0, x/net v0.61.0, x/sys v0.49.0, x/text v0.43.0, go-humanize v1.1.0, go-strftime v1.1.0). Playwright 1.63.0; Chart.js 4.5.1.
- CI jobs: `Build and test` (required), `Component catalogue`, `Storage benchmarks`, `sync`, `cla` (skipped). Release workflow on push to main: `build`, `image / image`.
- 34 MCP tools; `gapBudget` 10; check-wiki: 40 pages, 146 routes; registry 17 surfaces.
- Locales: de/es 1212 entries each, 0 untranslated. Languages: en, de, es (no Dutch). i18n: `t('English')` keys, `web/src/locales/*.json` auto-picked, `web/scripts/translate.mjs` (model `SALT_TRANSLATE_MODEL`), `check-i18n.mjs`. German uses "du".
- gofmt-exempt: `server/server.go`, `server/audit.go`, `server/desktop_auth.go`, `server/tunnel_update_test.go`.
- Container setup each new session: clone the working branch, `git fetch origin main`, deepen, `cd web && npm ci && npx vite build`, `cd web/tests && npm ci`; Playwright at `/opt/pw-browsers`.
- Full gate ~10 min: `timeout 900 scripts/agent-gate.sh > log 2>&1` (prints only "gate: green" when green).
- Screenshot recipe: `cd web && npx vite build`; `go build -o <scratch>/salt-shot .`; fresh data dirs; instances on 127.0.0.1:8421 (seed: `SALT_SEED_URL=http://127.0.0.1:8421 node scripts/seed-wiki-instance.mjs`) and fresh on 8422; `ln -sfn /opt/node22/lib/node_modules/playwright web/node_modules/playwright`; `SALT_SHOOT_URL=http://127.0.0.1:8421 SALT_SHOOT_FRESH_URL=http://127.0.0.1:8422 SALT_SHOOT_EMAIL=ada@example.com SALT_SHOOT_PASSWORD='WikiPruefung2026!' node scripts/shoot-wiki.mjs <ids>`; remove the symlink; `git checkout -- .github/hero.png`; `pgrep -x salt-shot | xargs -r kill`. Test account invented.

**Releases**
- v1.6.9, v1.6.10 (08:22 UTC 2026-10-29; assets `salt-darwin-arm64` 25,759,266 B, `salt-darwin-amd64`, `salt-linux-amd64`, `salt-linux-arm64`, `salt-windows-amd64.exe`, `SHA256SUMS.txt`; image `ghcr.io/neatlittlemacapps/salt.md`).
- PR #321 merged → main `aa5d13b`; release run **40946182773** was in progress at handoff time (expected v1.6.11 — verify, do not assume).
- No `desktop-v*` tags: the fork never released the desktop app (`desktop/`, Electron, `appId` `md.salt.desktop`, unsigned without Apple secrets).

**Spec 008 safe upgrades (part 1 merged)**
- Done T001–T007, T009–T019 = #289–#295, #297–#307 (closed by PR #321 on merge). Open: T008 #296 (budget to record), T020–T026 = #308–#314.
- Binary 33,914,395 B → 34,268,625 B with goose imported (+354,230 B). Modules in graph 33 → 112; linked +5 (goose, mfridman/interpolate, sethvargo/go-retry, go.uber.org/multierr, golang.org/x/sync). Notices now 16 Go modules (was 33 listed).
- `BenchmarkStorageStart` on CI (run 40944485890, AMD EPYC 9V74, 6 runs): `upgrade-nothing-pending` p95 **1.275 ms** (benchstat), `before-spec-008` p95 **1.666 ms** → budget **2 ms** (p95 × 1.5, rounded up). Container: 0.82–0.95 ms vs 1.84–2.23 ms.
- Fixture `server/testdata/upgrade/step-0.db` 421,888 B, written by main `f9e35b9` (v1.6.10); generator `TestWriteUpgradeFixture` (`SALT_WRITE_UPGRADE_FIXTURE=<path>`), content in `upgradeFixture` (page "Upgrade fixture", search word "quokka", child "Child page", database "Hours", rows Design/Build/Test, chart view "Hours by stage", comment "Written before the upgrade", file `notes.txt`, account `fixture@example.test`).
- Step 1 fingerprint `stepOneShape` = `25b99a931b53844377f1d7738661854fe9e6ab9a3cd97e80c3c30e9b194f133f`.
- Codes: `upgrade_refused`, `upgrade_failed`, `upgrade_copy_failed`, `upgrade_busy`. Copies `salt.db.before-step-<n>`, keep 3; restore line `cp <copy> salt.db && rm -f salt.db-wal salt.db-shm`. Lock `upgrade.lock` (PID + time), only when pending, stale after 15 min.
- goose findings (tests in `server/upgrade_goose_test.go`): newer DB → no pending, no error; `GetDBVersion` and `HasPending` create `goose_db_version`; `NewProvider` writes nothing; `RunDB` on 1 connection deadlocks.

**Spec 011 rename (specified, clarified, not planned)**
- 256 tracked files mention "salt"; 33 `SALT_*` env vars; cookies `salt_session`, `salt_oauth`, `salt_mail_oauth`; 18 browser-storage keys (`salt-theme`, `salt-tabs`, …); header `X-Salt-Signature`; export `salt-workspace.json`; `salt.db`; binary `salt`; Go module `salt`; desktop `md.salt.desktop`; image `ghcr.io/neatlittlemacapps/salt.md`; repo `neatlittlemacapps/salt.md`; 11 UI strings; 36 wiki pages.
- New names: `nigari` binary/image, `NIGARI_*`, `nigari.db`, repo `neatlittlemacapps/nigari`, v2.0.0.

**Backlog epics (proposed by Claude, Epic A chosen for stream B)**
| Epic | Issues |
|---|---|
| A. Databases & views | #131, #132, #133, #18, #19, #270, #269, #279, #281, #280, #178 |
| B. Charts follow-ups | #319, #318, #278, #277, #282, #266 |
| C. Collaboration | #22, #26, #24, #23 |
| D. Editor | #317, #267, #268 |
| E. Agent parity | #3–#12, #14, #16, #17 |
- New issues this chat: #317, #318, #319 (filed by the user), #320 (wiki screenshots show the scratch data directory).

## 9. People, terms & names
- **People:** the user (`neatlittlemacapps`, Frank De Graeve); upstream maintainer "Jeremia" (`jeremiaa`).
- **Terms:** surface = registry row; gap = person can, agent can't; budget = count that only goes down; gate = `scripts/agent-gate.sh`; step = numbered upgrade step; fixture = DB written before a step; stream = a parallel work line; conductor = Claude steering helper sessions; steward skill = repo skill with the conductor rules.
- **Branches:** working branch `claude/serene-planck-ie0e6w` (fast-forwarded to main `aa5d13b` after the merge; holds this handoff once committed); `claude/handoff-continuation-4byisr` (old handoff branch, merged).
- **Files:** `server/upgrade.go` (`upgradeDB`, `upgradeWith`, `inspectDB`, `storedStep`, `refuseNewer`, `copyBeforeUpgrade`, `pruneCopies`, `takeUpgradeLock`, `UpgradeRefusal`, `stepsDetail`), `server/upgrade_steps.go` (`upgradeSteps`, `baseSchema`, `rebuildTable`), `server/refusal.go` (`RefusalHandler`), `main.go` (`serveRefusal`), tests `server/upgrade_test.go`, `upgrade_goose_test.go`, `upgrade_fixture_test.go`, `web/tests/upgrade-refusal.mjs`; specs `specs/008-safe-upgrades/`, `specs/010-menu-icons/`, `specs/011-rename-nigari/`.
- **Plugins/skills available:** `code-review:code-review`, `ux-ui-audit:ux-ui-audit`, playwright MCP (`mcp__plugin_playwright_playwright__*`), built-in `/code-review`, `/security-review`.

## 10. Work state
| Item | Status | Location | Notes |
|---|---|---|---|
| Spec 008 part 1 | merged | PR #321 | release run 40946182773 |
| T008 budget | measured, not recorded | #296 | write 2 ms into `specs/002-storage-engine/research.md` P3; tick T008 |
| `in-progress` labels | to remove | #289–#307 | rule 8 (closed issues keep no in-progress) |
| Skill-use rule + steward skill | agreed, not written | `.claude/rules/claude-code.md`, `.claude/skills/steward/SKILL.md` | rule 16 |
| Spec 011 rename | spec + clarify done | `specs/011-rename-nigari/` | plan next (incl. repo-rename steps) |
| Spec 008 part 2 | not started | T020–T026, #308–#314 | stream A after rename |
| Spec 010 menu icons | spec + clarify done | `specs/010-menu-icons/` | stream A after 008 |
| Epic A | proposed | issues in section 8 | stream B (helper) after rename; spec 012 |
| #320 | filed | issue | wiki screenshot data dir |

## 11. Next steps
1. **Next action:** check the release of run 40946182773 (version, assets, image), then remove `in-progress` from #289–#307 and write T008's 2 ms budget into `specs/002-storage-engine/research.md` P3 with run 40944485890, tick T008 (#296).
2. Write the skill-use rule into `.claude/rules/claude-code.md` (`/code-review` before offering any PR; `ux-ui-audit` after visible UI changes, light and dark; `/security-review` when sign-in, permissions or tokens change) and `.claude/skills/steward/SKILL.md` (conductor rules: allowed files per stream, branch names, labels, tick tasks, `Closes #N`, merge `main` after each merge, review before offering, never touch the other stream's area).
3. Spec 011: `/speckit-plan` (by hand), then tasks, then issues via `speckit-github-taskstoissues` (dedupe per parent), then build; PR asked first; repo rename by the owner at merge time.
4. Then 2 streams (rule 15).

## 12. Open questions ⚠️
- nigari icon: A custom SVG mark (recommended) / B Lucide icon / C Tabler or Phosphor.
- Add a fork desktop release (unsigned at first) to the backlog?
- Add Dutch (`nl.json`, ~1,212 strings via a Sonnet helper)?
- Has the user made the container image public (Profile → Packages → salt.md → Package settings → Change visibility → Public)?
- Has the user deleted branches `claude/keen-hopper-9joiox` and `claude/vigilant-babbage-bvoiel`?

## 13. Re-attach checklist
Nothing to attach. This file is `docs/handoffs/handoff-saltmd.md` on branch `claude/serene-planck-ie0e6w` of `neatlittlemacapps/salt.md`. Start a Claude Code session on that repo and branch.

---
<sub>Audit: 13/13 sections · 16 rules · 56 corrections · 260 data points · secrets removed: none found (the test accounts are invented and documented) · generated by active-memory</sub>
