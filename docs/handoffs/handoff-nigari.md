# active-memory handoff: nigari (formerly salt.md fork): agentic setup and feature roadmap

**Handoff #12** · 2026-10-30 · Lineage:
- **#1 (2026-10-25):** agentic setup (rules, gate, Spec Kit, parity manifest); four feature branches merged; 25 issues; three specs.
- **#2 (2026-10-26):** find-and-replace edits (#13, PR #48); specs 001/002 planned; #47 fixed; surfaces registry, board sync, ruleset (PR #49).
- **#3 (2026-10-26):** board derives its columns (PR #74); spec 002 tasks (#50–#73); storage benchmarks; fixes #75, #76; Codespaces (PR #77).
- **#4 (2026-10-26/27):** spec 002 finished (PRs #80, #81, #83); read pool (#84); fast reads (#85); tag colours (#86).
- **#5 (2026-10-27):** spec 001 batch 1 (#87–#126, PRs #127/#128/#129); spec 004 written; local Mac test; #130 fix; feedback issues #131–#134; upstream plan agreed.
- **#6 (2026-10-27):** owner answered all open questions; PRs #135, #137, #138, #159 (spec 005), #176 (spec 006).
- **#7 (2026-10-27/28):** spec 007 shipped (PRs #212, #213); upstream #85 not taken; backlog prioritised; spec 004 planned with Chart.js (PR #214).
- **#8 (2026-10-28):** Notion chart walk-through → spec 004 builder (US5, FR-018–031); charts parts 1+2 merged (PR #264); safe-upgrades epic #263 filed.
- **#9 (2026-10-28/29):** charts finished (PR #283); agents author commits; Sonnet helpers rule; #263 → option C (goose) → spec 008 specified/planned, tasks #289–#314; #265 fork releases (spec 009, PR #288) → v1.6.9; image fix (PR #316) → v1.6.10.
- **#10 (2026-10-29):** spec 008 part 1 built and merged (PR #321); spec 010 (menu icons) and spec 011 (rename to **nigari**) specified + clarified; plugins installed.
- **#11 (2026-10-29/30):** review rule + steward skill (PR #325 → v1.6.12); spec 011 built and merged (PR #363 → **v2.0.0**); repo renamed to `neatlittlemacapps/nigari`; README "Built on salt.md" (PR #364 → v2.0.1); Dutch joins every translation step.
- **#12 (2026-10-30):** Dutch shipped and required (PR #366 → v2.0.3); spec 008 part 2 (T020–T026) shipped, spec 008 finished (PR #367 → v2.0.4); "bugs before features" rule (PR #369); bug #368 filed (chart replays its animation per row); session moved to `neatlittlemacapps/nigari`.

## 0. Instructions for Claude (read first)

You are continuing work from a previous chat. That chat is gone; this file is the complete context and the source of truth.

1. Read this whole file before replying.
2. Follow sections 3 (Style), 4 (Hard rules) and 5 (Corrections) in every reply, for the rest of this chat. They override your defaults.
3. Use the values in section 8 exactly. Never round, re-estimate, or "correct" them.
4. Do not suggest anything listed in section 7 (Changed / rejected) again unless the user brings it up.
5. Code word: Start every reply with exactly "Yes Boss!"
6. Your first reply: at most 5 lines covering the goal, the current state, and the next step (section 11). Mention any files from section 13 that were not attached. Ask the questions in section 12 if there are any. End with "Ready to continue with <next step>?" Then wait for the user's go.

## 1. Mission
- **Goal:** take the fork, now **nigari**, "to a higher level": many more features, built with an agentic setup that keeps the software's domains intact.
- **In the user's words:** "proper coding, holistic adjustments (think, when I add a feature, the system should also reason and tackle the fact that the mcp functionality might also need to follow), proper UI implementation, performance and testing".
- **Done looks like:** features flow spec → plan → tasks → board → implementation; each reaches every surface in the registry; gate and CI green; every merge to main becomes a release.
- **Standing way of working** (2026-10-26): "from here on out, you should indeed ensure you think about all aspects of the code in relation to my feature requests." / "When a feature request introduces some new concept (like but not excluding the design system) you should add it to the pool of things to think about when specking new features."
- **Also:** "I want you to be able to do as much as possible yourself"; "ensure you have good board and issue hygiene".
- **Why nigari exists (user, 2026-10-29/30):** "we are too far gone from the original salt to ever contribute back"; "mainly its me discovering how far I can get"; "I think the core is to pay extra attention to UX as well."
- **Order of work now** (bugs first, rule 19): (1) #368 + #319 (chart rebuilds instead of updating); (2) #317, #318, #320; (3) spec 010 menu icons; (4) 2 streams: helper session on Epic A (database views, spec 012); (5) backlog #322, #323, #326 and the README/Mac-app question (section 12).

## 2. About the user (as relevant to this work)
- GitHub `neatlittlemacapps` (id 60575307), display name "Frank De Graeve"; email neatlittlemacapps@gmail.com; owns `neatlittlemacapps/nigari` (renamed from `neatlittlemacapps/salt.md` on 2026-10-30), still a GitHub fork of `saltmd/salt.md` (AGPL-3.0); CLA signed upstream. Fork stays attached for now ("I'll leave it for now").
- Works mostly from a phone (Claude app, iPhone), also the Claude desktop app on a Mac. Designer/PM, not a developer. Timezone Europe/Brussels; works in Belgium (hence Dutch, which they read natively). Thinks in Notion terms.
- Answers each step with a terse "Ok"/"Yes"/"yes"/a letter/"go"/"done". Asks plain-language questions ("what is the repository picker?", "where are the releases?"); catches process slips ("I merged. normally you see this"). Types fast with typos ("no what" = "now what"). Says when lost → give a done/todo table.
- Local Mac test install: repo at `~/Documents/Salt/salt.md`; data `~/salt-demo`. Run: `cd ~/Documents/Salt/salt.md && NIGARI_DATA=~/salt-demo NIGARI_ADDR=:8420 ./nigari`, open `http://localhost:8420`; Ctrl+C stops. A leftover `SALT_*` variable makes nigari refuse to start. Install latest: `curl -fsSL https://raw.githubusercontent.com/neatlittlemacapps/nigari/main/install.sh | sh`.
- Uses other agents too: pointed one at the GitHub link and it cloned the repo instead of offering the binary/Mac app (see section 12).
- GitHub settings: Actions on; auto-merge enabled; `BOARD_TOKEN` secret, `BOARD_PROJECT`=5. The user taps merge on every PR, sometimes before CI finishes (PR #366 merged 2 min after opening; CI on main was green afterwards).

## 3. Style & communication
- **Language:** English replies. Translations: German, Spanish and Dutch (all three, every string).
- **Tone:** direct, plain, no filler.
- **Reply length:** short (phone screen). Lead with the answer; detail only when asked.
- **Formatting:** short lists and small tables; numbered steps with exact tap/click paths for anything the user does by hand; shell commands in their own fenced `bash` blocks with full paths.
- **"Explain X" / options:** per option: gains, costs, effort; then one recommendation.
- **Working style:** each step ends with "Ready to continue with <next step>?" and waits for the user's go; a short status line during a long turn. Mid-turn questions are answered in the same reply.
- **Explaining terms:** plain words for a non-developer; concrete examples.
- **Prose about nigari vs salt.md (README):** intent, not specifics; warm to salt.md, never harsh; nigari goes *beyond* salt's concept (design system, database mechanic); UX is the compass; a personal exploration.
- **Avoid:** recaps of steps; long explanations before the result.

## 4. Hard rules (word for word)
1. "Use spec-kit but indeed also a board to to track the work"
2. "Fold them into here so the functionality is in here too (those branches)"
3. Pushing: routine pushes to the working branch are fine; opening a PR is asked for ("Ready to continue with opening the PR?"), unless the user just asked for it. The user taps merge (Claude cannot enable auto-merge: classifier denial).
4. Repo rules in `AGENTS.md` and `.claude/rules/` apply. A Stop hook runs `scripts/agent-gate.sh` plus a git-check (uncommitted or unpushed work fails it; the branch must track its remote). Stale wiki screenshots fail the gate: retake before stopping.
5. "ensure you think about all aspects of the code in relation to my feature requests". A new concept goes into `.specify/memory/surfaces.md`.
6. Never work around a classifier denial (CI bypass, self-modification, destructive git incl. deleting remote branches, enabling auto-merge, deleting scheduled tasks, copying protected `go.sum`, chroot into an image). Tell the user and give them the manual step.
7. Commit authorship (owner, 2026-10-28: "Claude"): commits authored by `Claude <noreply@anthropic.com>`; trailers `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: <session url>`. No model identifiers in PR titles/bodies.
8. "ensure you have good board and issue hygiene": label `in-progress` when starting (remove when merged); tick tasks in `tasks.md` in the PR that does them; `Closes #N` for every finished task issue; file an issue for every bug or finding; nobody moves cards. Setting labels replaces all labels: read the issue's labels first and keep its `surface:*` label.
9. After opening a PR: `subscribe_pr_activity` (on `neatlittlemacapps/nigari`, not the old name); a `send_later` check-in ~50 min later; on CI red fix and push; on merge remove `in-progress`, cancel the check-in, fast-forward the working branch (`git push origin origin/main:refs/heads/<branch>`).
10. "I want you to ignore the maintainers comments unless they really make sense for us as well. I basically want to implement the functionality on our end. I don't care about pushing it back to them"
11. Every number in a doc, comment or PR is measured in the session.
12. Sonnet helpers for mechanical tasks (translations, wiki text following a page, screenshot retakes, test runs, copy-a-pattern); judgement stays on Opus; review helper output. No Haiku.
13. Anything spanning more than one surface starts with a spec/plan, even when filed as a plain issue.
14. Menu icons (owner, 2026-10-29): "menu-items should have an icon. Ensure that no 2 functions have the same icon".
15. Parallel work: "after rename go 2 streams" (conductor = Claude; helper on disjoint areas; `.claude/skills/steward/SKILL.md`); never 3+.
16. Reviews before a PR is offered (`.claude/rules/claude-code.md`): `/code-review` on every branch diff; `ux-ui-audit` after visible changes (light/dark, desktop/phone); `/security-review` for sign-in, sessions, permissions, tokens or gates. The PR names which ran and what each found (so far a targeted Playwright pass has stood in for the full `ux-ui-audit`, and the PRs said so).
17. Dutch (owner, 2026-10-29: "You should also include Dutch in your translation related actions from now on, not?"): every new string gets de, es and nl. `de.json` and `nl.json` are **required** by `check-i18n.mjs`; `es.json` reported.
18. Protected files (deny rules): `LICENSE`, `CLA.md`, `THIRD-PARTY-NOTICES.md`, lockfiles (only via `npm install`), `go.sum`, `wiki/img/` (only via `web/scripts/shoot-wiki.mjs`), `.github/cla-signatures.json`, `.gitignore`. Never edit or work around them; ask the user.
19. Bugs before features (owner chose option A, 2026-10-30; `AGENTS.md`): "An open `bug` issue goes before starting the next feature or spec. A bug found while working gets an issue at once and is fixed in its own small pull request, not saved up."
20. Code word: every reply starts with "Yes Boss!" (it was dropped for most of chat #12; never drop it).

## 5. Corrections log
| # | Claude did | The user wanted |
|---|---|---|
| 1 | Told the user to run `/speckit-specify` in a separate session | Run Spec Kit steps directly (follow their SKILL.md by hand) |
| 2 | (self) Called token-reachable membership routes a hidden security issue | A docs contradiction; #1 option B |
| 3 | (self) Planned `server/ops_*.go` | `server/ops.go` exists → `cap_*.go` |
| 4 | (self) Counted 36 MCP tools | 34 |
| 5 | (self) Said de and es both required | Only de was required then; now de + nl required, es reported |
| 6 | Treated "MCP must follow new features" as a fix | A way of working; grow the registry |
| 7 | (self) Invented a benchstat pseudo-version | Verified `v0.0.0-20261009192801-be2c69fb417e` |
| 8 | Pushed after the user merged #48 | Watch merge state; restart branch after a merge |
| 9 | Edited `AGENTS.md` during a rejected tool call | Wait for the user |
| 10 | Spec 003 merged with 20 task issues open | Issue and board hygiene (rule 8) |
| 11 | (self) Appended decisions at the bottom | `docs/decisions.md` is newest first |
| 12–13 | (self) `pkill -f <pattern>` killed its own shell | `pgrep -x <name> \| xargs -r kill`; `timeout` on long probes |
| 14 | (self) Unmeasured figure in a GitHub comment | Every number measured in the session |
| 15 | (self) A test that passed with the bug present | Mutation-check every new test |
| 16 | (self) Guessed a CI regression cause | Measure the hypothesis first |
| 17 | (self) `gofmt -w` on an exempt file | gofmt only touched files; four exempt files |
| 18 | (self) `` `query_timeout` `` in the wiki | `` `"code": "query_timeout"` ``; never widen `ALLOWED_NON_TOOLS` |
| 19 | (self) Raw `go test` output to benchstat | `scripts/bench-compare.sh` |
| 20 | (self) `git checkout -- file` undid own edits | Back up a file before a test edit (scratchpad) |
| 21–23 | (self) Unmeasured counts; container baselines committed | Measure; reference drawn on the CI runner |
| 24 | (self) `\s*` before a lookahead in `check-tokens.mjs` | Each lookahead carries its own `\s*` |
| 25 | (self) `git reset --hard` + force-push (blocked) | Fast-forward: `git push origin origin/main:refs/heads/<branch>` |
| 26 | (self) `setsid` in `.devcontainer/start.sh` failed on a Mac | `nohup` fallback |
| 27 | (self) `localhost:8420` without http | `http://localhost:8420` |
| 28 | (self) Mutation `sed` hit 5 files, backup covered 2 | Back up every file a mutation touches |
| 29 | (self) `check-tokens` counted a dialog selector | `[aria-modal="true"]`; never `token-ok` to dodge a counter |
| 30 | (self) A Playwright block that could never run | Delete vacuous test code |
| 31–32 | (self) Unmeasured chart sizes; Claude's default labelled as user's | Measure; label Claude's defaults as defaults |
| 33 | (self) Gate said "nothing changed" in a shallow clone | Fetch `origin/main` and deepen before the gate |
| 34–39 | (self) catalogue/CI/Escape/tooltip slips; unchecked plan claims; unasked items | Check the code; leave out what was not asked |
| 40–41 | (self) `go mod download all` changed `go.sum`; licenses run without modules | Commit first; download, regenerate, revert `go.sum` |
| 42 | (self) Toolbar stretched by chart settings | Look at every screenshot before committing |
| 43–44 | (self) Chart grouping slips | FR-031; "Each row" |
| 45 | Built #265 without spec/plan; user: "Did you spec this first?" | Spec + plan first for multi-surface work |
| 46 | (self) `npx prettier --write` reformatted whole files | Never run prettier |
| 47 | (self) Check regex matched words in a comment | Anchor checks to the code line |
| 48 | (self) Sonnet gave "Caption" the labels' German word | Review helper output |
| 49 | (self) taskstoissues dedup by task ID repo-wide | Dedupe per parent issue's sub-issues |
| 50 | (self) Container image copied a few dirs only | `COPY . /src` + `.dockerignore`; `check-release.mjs` |
| 51 | (self) `cp go.sum <scratch>` was denied | Commit first; git is the backup |
| 52 | Wrote the name "salty.md" into spec 011 before the user checked it | Names are confirmed by the user before they go into docs |
| 53–56 | (self) Upgrade test/SQLite/audit/shadowing slips | see #10 history |
| 57 | (self) Rule-based rename sed went too far | Review every mechanical replace by hand |
| 58 | (self) `check-wiki` read `"name": "nigari"` as a tool | `const mcpServerName = "nigari"` |
| 59 | (self) WAL mutation test passed with checkpoint removed | Mutation "no open at all"; then `PRAGMA journal_mode=DELETE` |
| 60 | (self) Release assets and `dialog-escape` still used old names | Grep outputs and events after a rename |
| 61 | (self) Merged v2.0.0 before repo rename → image went to `ghcr.io/neatlittlemacapps/salt.md` | With user's yes, ran `docker.yml` by hand (run 41021371749) |
| 62 | (self) `git remote set-url origin …/nigari` → fetch 403 in an old-name session | Superseded: attach the repo with `add_repo` (access push) and clone to `/home/user/nigari` |
| 63–66 | README drafts | Intent, warm, UX core, personal exploration; ditched two bullets |
| 67 | (self) Planned an image uid via chroot (denied) | Don't work around |
| 68 | (self) `/security-review` failed on `origin/HEAD` | `git remote set-head origin main` |
| 69 | (self) Benchstat compared nothing across the module rename | Read base and head tables by hand |
| 70 | (self) Tried `git push --delete` on stale branches (classifier: destructive) | User deletes branches by hand (Branches page → 🗑) |
| 71 | (self) Session ran under the old repo name; merge of #366 never reached Claude; user: "I merged. normally you see this" | Work on `neatlittlemacapps/nigari`; subscribe under that name (events then arrived for #367/#369) |
| 72 | (self) Took a `subscription.created` event as proof GitHub events arrive | It comes from Claude's side; only real PR events prove it |
| 73 | (self) Dropped the "Yes Boss!" code word after the first reply | Every reply starts with it |
| 74 | (self) Helpers made `{one, other}` objects for keys read by `t()` (shows English) | `check-i18n.mjs` now fails on that shape; plural objects only for `plural()` keys |
| 75 | (self) Wrote a wrong reason for not keeping `nl.machine.json` | Check claims about other files before writing them |
| 76 | (self) Changed `nigari version` output; root-package test `TestVersionCommandStillWorks` broke (found by review) | Grep every reader of a changed output (incl. `install.sh`, tests in `.`) |
| 77 | (self) Label "Last upgrade" showed install time on a fresh instance | Label the data for what it is ("Step applied") |
| 78 | (self) Moved comment added an old name; `check-names` failed | Reword to the old count; do not raise the allowlist |
| 79 | (self) Comment-only edit in `server/backup.go` made `admin-maintenance` stale (file is in its `shows` list) | After touching any file a shot lists, retake that shot before stopping |
| 80 | (self) Ran `scripts/test-install-move.sh` with `sh` (exit 2) | It is bash: `bash scripts/test-install-move.sh` |
| 81 | (self) Wrote "v2.0.2 and earlier" for pre-step backups | Steps first shipped in v1.6.11: "v1.6.10 and earlier" |

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
| Every push to main = a release (last + 1) | #265; spec 011 R11 amendment |
| Notices list modules the 5 release binaries link | User: "B" |
| Spec 010: every menu item has an icon; one function = one icon app-wide; editor menus count; function = the verb | User |
| Rename option C to **nigari**, v2.0.0, no transition | User: "C", "go with \"nigari\"", "Q1 immediately", "Q2 B" |
| Database move `salt.db` → `nigari.db`: no copy before | User: "No copy" |
| Kept as data: old `salt_` API tokens; OAuth client ids; calendar UIDs `@salt.md`; volume `salt-data` | Identity/data, not names |
| Desktop app id `io.github.neatlittlemacapps.nigari`, scheme `nigari://` | User confirmed |
| Dutch: separate PR after the rename; shipped complete and **required** like German (constitution 1.2.0) | User: "A"; rule said "required once complete"; PR #366 |
| Dutch style: informal *je/jij*, infinitive buttons, neutral NL/BE Dutch; glossary in `docs/decisions.md` | Claude's default, merged by the user in PR #366 |
| CLA / `pull_request_target` notice: do nothing | User: "A" |
| README "Built on salt.md" section | User edits; PR #364 |
| Icon: backlog (#322), user provides artwork | User |
| Desktop release: backlog (#323) | User: "yes" |
| Review rule + steward skill | User: "Ok" (PR #325) |
| 2 streams after the rename and Dutch | User: "after rename go 2 streams" |
| Fork stays attached to `saltmd/salt.md` for now | User: "I'll leave it for now" |
| Stale branches `keen-hopper`, `happy-cori`, `upgrades-research` go | User: "yes" (Claude blocked; user deletes) |
| Work from a session/clone on `neatlittlemacapps/nigari` | Events under the old name do not arrive (#71) |
| Restore reads the archive's step first, refuses a newer archive before replacing anything; forced restore removes the replaced DB's copies | Spec 008 FR-009; code review |
| Maintenance shows "Database upgrades" (step, step applied, copies) | Spec 008 FR-014 |
| Bugs before features (option A) | User: "yes" to A; PR #369 |

## 7. Changed / rejected
- Earlier chats: decisions page in workspace → `docs/decisions.md`; fixed surfaces list → registry; force-push rebase → merge `main`; hand-moved cards → derived Status; committed catalogue baselines → reference per run; hand-drawn SVG charts → Chart.js; owner as commit author → Claude.
- #263 research B → C (goose); notices from `go list -m all` → linked modules only.
- Name "salty.md" → "nigari". Rename option B → C. Transition period → none.
- Spec 008 one PR → two parts (both now merged).
- R8 first version (rename calendar UIDs) → UIDs keep `@salt.md`.
- Pinning the image uid → no pinned uid.
- Copy before the DB move → no copy.
- README: feature list / harsh tone → intent-based, warm section.
- Git remote `…/nigari` in the old-name session → separate clone `/home/user/nigari` attached via `add_repo` (push).
- AGENTS.md upstream-PR cleanup PR → skipped while the fork stays attached.
- Dutch "reported like Spanish" → required like German (it arrived complete).
- Constitution 1.1.1 (PATCH) → 1.2.0 (MINOR; a newly enforced rule).
- UI label "Last upgrade" → "Step applied".
- `.info-grid strong { word-break: break-all }` → `overflow-wrap: anywhere` (split "releas e" on phones).
- ❌ Bugs-first option B (only bugs visible in daily use).
- ❌ `nl.machine.json` (every line would be on it; would print a "behind" note on every run).
- ❌ 3+ parallel streams; streams during the rename.
- ❌ Community Go/security/Flutter/mobile/AWS plugins.
- ❌ GitHub Pages docs site now (later as #326); own domain.
- ❌ Spec 004 leftovers (backlog #279–#282); DuckDB, Mantine as app library, shadcn/ui, Storybook, uPlot, Recharts, ECharts; widening `ALLOWED_NON_TOOLS`; looser pixel tolerance; baselines by a CI bot; down migrations, Litestream, upgrade-on-read.

## 8. Data & facts (exact)

**Repo and tooling**
- Go 1.27.2 local, CI 1.27.3; Node 22.22.0. `modernc.org/sqlite` v1.60.1; Playwright 1.63.0; Chart.js 4.5.1; goose v3.29.0.
- Go module `nigari`; `server.Version = "2.0.0"` in source (releases stamp the tag); DB `nigari.db`; newest upgrade step 1; fixture `server/testdata/upgrade/step-0.db`.
- `nigari version` prints `<release> (upgrade step N)`, e.g. `2.0.0 (upgrade step 1)`; `install.sh` takes the first word.
- Locales: de 1225, es 1225, nl 1225 entries (measured 2026-10-30). German and Dutch use informal address.
- Constitution 1.2.0 (2026-10-30). 34 MCP tools; `gapBudget` 10; 18 registry rows. gofmt-exempt: `server/server.go`, `server/audit.go`, `server/desktop_auth.go`, `server/tunnel_update_test.go`.
- `check-names.mjs`: 382 old names in 49 allowlisted files. `check-upgrades.mjs` (new, in `npm run check`): 7 self-test cases. `check-storagemove.mjs` 14 cases. `scripts/test-install-move.sh` (bash) 4 cases.
- Full gate ~10 min: `timeout 900 scripts/agent-gate.sh > <scratchpad>/gate.log 2>&1` (run in background).
- Container setup per session (repo at `/home/user/nigari`): `git fetch origin main --depth=300`; branch `claude/<name>` from `origin/main`; `git remote set-head origin main`; make the branch track its remote (`git config --add remote.origin.fetch '+refs/heads/<branch>:refs/remotes/origin/<branch>'`, `git fetch origin`, `git branch -u origin/<branch>`), else the stop hook reports "unpushed"; `cd web && npm ci && npx vite build`; `cd web/tests && npm ci`; Playwright browsers at `/opt/pw-browsers`.
- Screenshot recipe: binary to scratchpad (`CGO_ENABLED=0 go build -o <scratch>/nigari .`), instances on :8421 (seeded) and :8422 (fresh) with empty `NIGARI_DATA` dirs; in `web/`: `npm i --no-save playwright@1.63.0` once; seed: `NIGARI_SEED_URL=http://127.0.0.1:8421 NIGARI_SEED_EMAIL=ada@example.com NIGARI_SEED_PASSWORD='WikiPruefung2026!' node scripts/seed-wiki-instance.mjs`; shoot: `NIGARI_SHOOT_URL=http://127.0.0.1:8421 NIGARI_SHOOT_FRESH_URL=http://127.0.0.1:8422 NIGARI_SHOOT_EMAIL=ada@example.com NIGARI_SHOOT_PASSWORD='WikiPruefung2026!' node scripts/shoot-wiki.mjs <ids>` (invented account); stop with `pgrep -x nigari | xargs -r kill`.
- Test account in Go tests: `signedIn` uses password `passwort12345` (invented); fixture account `fixture@example.test`.

**Releases**
| Version | PR | Published (UTC) |
|---|---|---|
| v2.0.0 | #363 (rename to nigari) | 2026-10-30 07:27 |
| v2.0.1 | #364 (README) | 2026-10-30 07:46 |
| v2.0.2 | #365 (`.gitignore` `/salt` → `/nigari`, by the user) | 2026-10-30 12:16 |
| v2.0.3 | #366 (Dutch) | 2026-10-30 13:38 |
| v2.0.4 | #367 (spec 008 part 2) | 2026-10-30 15:49 |
- #369 (bugs first) merged 2026-10-30 15:58; its release (expected v2.0.5) was not checked.
- Releases page: https://github.com/neatlittlemacapps/nigari/releases. Assets `nigari-<os>-<arch>` (darwin arm64/amd64, linux amd64/arm64, windows amd64 .exe) + `SHA256SUMS.txt`. Image `ghcr.io/neatlittlemacapps/nigari` (public, user confirmed). No desktop app is published (#323).

**Specs**: 008 done (T001–T026, #289–#314, all closed). 011 done. 010 menu icons: spec + clarify done (`specs/010-menu-icons/`), not planned yet.

**Open issues**
| # | Title |
|---|---|
| 368 | A new chart view replays its animation once per row instead of drawing once (bug) |
| 319 | Chart redraw (changing a chart property redraws twice) (bug) |
| 317 | Enter in a column block adds the new block in the next column |
| 318 | Colorful setting has no effect on bar charts that show table rows |
| 320 | Wiki screenshots show the data directory |
| 322 | nigari needs its own icon (user supplies artwork) |
| 323 | The fork releases its desktop app (unsigned first) |
| 326 | nigari has a docs site built from the wiki (GitHub Pages) |
- Epic A (stream B): #131, #132, #133, #18, #19, #270, #269, #279, #281, #280, #178. Epic B charts: #319, #318, #278, #277, #282, #266. Epic C: #22, #26, #24, #23. Epic D editor: #317, #267, #268. Epic E agent parity: #3–#12, #14, #16, #17.

**#368 analysis (from code, not reproduced):** `ChartFigure.tsx` builds the chart in a `useLayoutEffect` with deps `[kind, layout, tokens, themeTick, style.labels]`; every run destroys the Chart.js chart and builds a new one (200 ms animation). `layout` is a `useMemo` over `result`; `ChartView.tsx` refetches `result` whenever `reloadKey` moves; `reloadKey` = `chartEpoch` in `CollectionView.tsx`, incremented by every `loadRows`. Fix direction: build once per kind, update data in place (`chart.data = …; chart.update()`), skip identical results, coalesce the reload burst. Done when a Playwright spec counts one chart construction for a new chart view on 20 rows, and a setting change does not redraw twice (closes #319).

## 9. People, terms & names
- **People:** the user (`neatlittlemacapps`, Frank De Graeve); upstream maintainer "Jeremia" (`jeremiaa`).
- **Terms:** surface = registry row; gap = person can, agent can't; budget = count that only goes down; gate = `scripts/agent-gate.sh`; stream = a parallel work line; conductor = Claude; steward skill = `.claude/skills/steward/SKILL.md`; upgrade step = a numbered goose step in `server/upgrade_steps.go`; copy = `nigari.db.before-step-<n>` (3 kept); refusal codes `upgrade_refused`, `upgrade_failed`, `upgrade_copy_failed`, `upgrade_busy`.
- **Repo:** `neatlittlemacapps/nigari` (old URL `neatlittlemacapps/salt.md` redirects for git, but not for event routing).
- **Branches:** working branch `claude/wizardly-johnson-y7nazn` (= main `03384ab` + this handoff). Old: `claude/pensive-turing-plu40r` (handoff #11), `claude/handoff-continuation-4byisr`, `claude/serene-planck-ie0e6w`; the user deletes `claude/keen-hopper-9joiox`, `claude/happy-cori-rq1bym`, `claude/upgrades-research` (nothing unmerged: their work is on main as `specs/004-chart-view`, `specs/008-safe-upgrades/research.md`).
- **Key files:** `server/upgrade.go` (`upgradeWith`, `listCopies`, `pruneCopies`, `upgradeState`, `NewestStep`, `refuseNewer`, `takeUpgradeLock`), `server/backup.go` (`Restore`/`restoreWith`, `extractDB`, `extractFiles`, `restoreReport`), `server/instance.go` (`admin/info`), `web/src/components/DatabaseUpgrades.tsx`, `web/scripts/check-upgrades.mjs`, `web/scripts/check-i18n.mjs` (`REQUIRED = de.json, nl.json`; plural-shape check), `web/src/components/ChartFigure.tsx`, `ChartView.tsx`, `server/oldnames.go`, `install.sh`, `.claude/rules/i18n.md`, `.claude/rules/claude-code.md`, `docs/decisions.md`.

## 10. Work state
| Item | Status | Location | Notes |
|---|---|---|---|
| Dutch | merged, v2.0.3 | PR #366 | user is the first native reader; corrections go into `nl.json` |
| Spec 008 part 2 | merged, v2.0.4 | PR #367 | spec 008 complete |
| Bugs-before-features rule | merged | PR #369 | `AGENTS.md` § How work flows |
| #368 + #319 chart rebuild | not started | issue #368 | next |
| README download line / Mac app | asked, no answer | section 12 | |
| Spec 010 menu icons | spec + clarify done | `specs/010-menu-icons/` | after the bugs |
| Epic A | proposed | section 8 | helper stream, spec 012 |

## 11. Next steps
1. **Next action:** bug #368 (with #319): label both `in-progress`; reproduce with a Playwright spec in `web/tests/` that counts Chart.js constructions when a chart view is created on a 20-row database; then fix in `ChartFigure.tsx` (update in place) and find what fires the reload burst; `/code-review`; ask before the PR.
2. Then the other bugs: #317, #318, #320 (each its own small PR).
3. Then spec 010 (plan → tasks → issues), and start stream B (Epic A) per the steward skill.

## 12. Open questions ⚠️
- README and Mac app (asked 2026-10-30, no answer yet): A) add a "Download" line to the README (binaries on Releases; desktop app not published yet, #323), about 15 min; B) do #323 (publish the Mac app with every release, unsigned first; spec + plan first). Claude recommended A now, B after spec 008.
- Did the user paste the v2.0.0 release notes into the release (`specs/011-rename-nigari/contracts/release-notes.md`)? They answered "no?" and got the steps.
- Did the user delete `claude/keen-hopper-9joiox`, `claude/happy-cori-rq1bym`, `claude/upgrades-research`?

## 13. Re-attach checklist
Nothing to attach. This file is `docs/handoffs/handoff-nigari.md` on branch `claude/wizardly-johnson-y7nazn` of `neatlittlemacapps/nigari`. Start the new Claude Code session on **`neatlittlemacapps/nigari`** (pick it in the repository picker, not `salt.md`), branch `claude/wizardly-johnson-y7nazn`.

---
<sub>Audit: 13/13 sections · 20 rules · 81 corrections · ~260 data points · secrets removed: none found (test accounts invented and documented) · generated by active-memory</sub>
