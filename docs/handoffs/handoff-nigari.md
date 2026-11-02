# active-memory handoff: nigari (formerly salt.md fork): agentic setup and feature roadmap

**Handoff #14** · 2026-11-02 · Lineage:
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
- **#13 (2026-10-30 → 11-02):** every open bug fixed: #368+#319 chart builds once (PR #372 → v2.0.8); #317 Enter stays in its column + **CodeGraph** set up for cloud sessions (PR #373 → v2.0.9); #318 Colourful on Each row + #320 neutral wiki shots + CodeGraph prompt hook off (PR #374 → v2.0.10); #375 flaky catalogue test (PR #376); backlog features #370, #371 filed.
- **#14 (2026-11-02):** README Download line (PR #377 → v2.0.12); CodeGraph during specifying, planning and tasks (PR #378 → v2.0.13); spec 010 planned + tasks + issues #380–#419 (PR #420 → v2.0.14); spec 010 built on Base UI menus (option B) in two PRs (#421 → v2.0.15, #422 → **v2.1.0**); board cleaned; #379 (fewer hand-built buttons) filed; #278 labelled `bug`.

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
- **CodeGraph (user, 2026-11-01):** "My goal is that Claude can use a continuously up-to-date code graph to understand the architecture, dependencies, function calls and relationships across the entire codebase before making coding changes." / "CodeGraph should be an active coding tool, not merely an installed MCP server."
- **Order of work now** (2026-11-02, after v2.1.0): (1) open bugs: #269 (an empty date looks filled in), then #278 (chart colour clash); (2) 2 streams: helper session on Epic A (database views, spec 012) per the steward skill; (3) backlog #370, #371 (spec first, each multi-surface), #322, #323, #326, #379. A new `bug` issue always jumps the queue (rule 19).

## 2. About the user (as relevant to this work)
- GitHub `neatlittlemacapps` (id 60575307), display name "Frank De Graeve"; email neatlittlemacapps@gmail.com; owns `neatlittlemacapps/nigari` (renamed from `neatlittlemacapps/salt.md` on 2026-10-30), still a GitHub fork of `saltmd/salt.md` (AGPL-3.0); CLA signed upstream. Fork stays attached for now ("I'll leave it for now").
- Works mostly from a phone (Claude app, iPhone), also the Claude desktop app on a Mac. Designer/PM, not a developer. Timezone Europe/Brussels; works in Belgium (hence Dutch, which they read natively). Thinks in Notion terms; sends Notion screenshots as references for features.
- Answers each step with a terse "Ok"/"Yes"/"yes"/a letter/"go"/"done". Asks plain-language questions ("I don't know where to find the release", "Shoul I start new session for you to have access to graph?", "enlighten me if and how the graph knowledge has helped you"). Wants honest answers about whether tools actually help. Types fast with typos. Says when lost → give a done/todo table.
- Often taps merge within minutes of a PR opening, before CI finishes, or enables auto-merge (PR #374). Check `main`'s CI and release afterwards.
- Local Mac test install: repo at `~/Documents/Salt/salt.md`; data `~/salt-demo`. Run: `cd ~/Documents/Salt/salt.md && NIGARI_DATA=~/salt-demo NIGARI_ADDR=:8420 ./nigari`, open `http://localhost:8420`; Ctrl+C stops. A leftover `SALT_*` variable makes nigari refuse to start. Install latest: `curl -fsSL https://raw.githubusercontent.com/neatlittlemacapps/nigari/main/install.sh | sh`.
- Uses other agents too: pointed one at the GitHub link and it cloned the repo instead of offering the binary/Mac app (the README "Download" line answers this).
- GitHub settings: Actions on; auto-merge enabled; `BOARD_TOKEN` secret, `BOARD_PROJECT`=5.

## 3. Style & communication
- **Language:** English replies. Translations: German, Spanish and Dutch (all three, every string).
- **Tone:** direct, plain, no filler; honest about limits ("hardly at all so far" was the right answer about CodeGraph's help).
- **Reply length:** short (phone screen). Lead with the answer; detail only when asked.
- **Formatting:** short lists and small tables; numbered steps with exact tap/click paths for anything the user does by hand; shell commands in their own fenced `bash` blocks with full paths; issues and PRs as full markdown links `[neatlittlemacapps/nigari#N](https://github.com/neatlittlemacapps/nigari/pull/N)`.
- **"Explain X" / options:** per option: gains, costs, effort; then one recommendation.
- **Working style:** each step ends with "Ready to continue with <next step>?" and waits for the user's go; a short status line during a long turn ("Status: …"). Mid-turn messages from the user are answered in the same turn (e.g. two backlog features filed while a fix was running).
- **Explaining terms:** plain words for a non-developer; concrete examples.
- **Prose about nigari vs salt.md (README):** intent, not specifics; warm to salt.md, never harsh; nigari goes *beyond* salt's concept (design system, database mechanic); UX is the compass; a personal exploration.
- **Avoid:** recaps of steps; long explanations before the result; claiming a tool helped when it did not.

## 4. Hard rules (word for word)
1. "Use spec-kit but indeed also a board to to track the work"
2. "Fold them into here so the functionality is in here too (those branches)"
3. Pushing: routine pushes to the working branch are fine; opening a PR is asked for ("Ready to continue with opening the PR?"), unless the user just asked for it. The user taps merge (Claude cannot enable auto-merge: classifier denial).
4. Repo rules in `AGENTS.md` and `.claude/rules/` apply (now including `.claude/rules/codegraph.md`). A Stop hook runs `scripts/agent-gate.sh` plus a git-check (uncommitted or unpushed work fails it; the branch must track its remote). Stale wiki screenshots fail the gate: retake before stopping.
5. "ensure you think about all aspects of the code in relation to my feature requests". A new concept goes into `.specify/memory/surfaces.md`.
6. Never work around a classifier denial (CI bypass, self-modification, destructive git incl. deleting remote branches, enabling auto-merge, deleting scheduled tasks, copying protected `go.sum`, chroot into an image, a combined background-server + `pgrep | xargs kill` command). Tell the user and give them the manual step. Run test servers as separate `run_in_background` tasks and stop them with TaskStop.
7. Commit authorship (owner, 2026-10-28: "Claude"): commits authored by `Claude <noreply@anthropic.com>`; trailers `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: <session url>`. No model identifiers in PR titles/bodies.
8. "ensure you have good board and issue hygiene": label `in-progress` when starting (remove when merged); tick tasks in `tasks.md` in the PR that does them; `Closes #N` for every finished task issue; file an issue for every bug or finding; nobody moves cards. Setting labels replaces all labels: read the issue's labels first and keep its `surface:*` label.
9. After opening a PR: `subscribe_pr_activity` (on `neatlittlemacapps/nigari`); a `send_later` check-in ~50 min later; on CI red find the cause (never "flake"), fix or show it is not the PR's, comment once; on merge remove `in-progress`, cancel the check-in, fast-forward the working branch (`git push origin origin/main:refs/heads/<branch>`; GitHub deletes the branch on merge, so this recreates it).
10. "I want you to ignore the maintainers comments unless they really make sense for us as well. I basically want to implement the functionality on our end. I don't care about pushing it back to them"
11. Every number in a doc, comment or PR is measured in the session.
12. Sonnet helpers for mechanical tasks (translations, wiki text following a page, screenshot retakes, test runs, copy-a-pattern); judgement stays on Opus; review helper output. No Haiku.
13. Anything spanning more than one surface starts with a spec/plan, even when filed as a plain issue.
14. Menu icons (owner, 2026-10-29): "menu-items should have an icon. Ensure that no 2 functions have the same icon".
15. Parallel work: "after rename go 2 streams" (conductor = Claude; helper on disjoint areas; `.claude/skills/steward/SKILL.md`); never 3+.
16. Reviews before a PR is offered (`.claude/rules/claude-code.md`): `/code-review` on every branch diff; `ux-ui-audit` after visible changes (light/dark, desktop/phone); `/security-review` for sign-in, sessions, permissions, tokens or gates. The PR names which ran and what each found. When the review helper is unavailable (usage limit), review by hand and say so in the PR.
17. Dutch (owner, 2026-10-29: "You should also include Dutch in your translation related actions from now on, not?"): every new string gets de, es and nl. `de.json` and `nl.json` are **required** by `check-i18n.mjs`; `es.json` reported.
18. Protected files (deny rules): `LICENSE`, `CLA.md`, `THIRD-PARTY-NOTICES.md`, lockfiles (only via `npm install`), `go.sum`, `wiki/img/` (only via `web/scripts/shoot-wiki.mjs`), `.github/cla-signatures.json`, `.gitignore`. Never edit or work around them; ask the user.
19. Bugs before features (owner chose option A, 2026-10-30; `AGENTS.md`): "An open `bug` issue goes before starting the next feature or spec. A bug found while working gets an issue at once and is fixed in its own small pull request, not saved up."
20. Code word: every reply starts with "Yes Boss!" (never drop it).
21. CodeGraph is a working tool (owner, 2026-11-01): before a change that reaches past one function, query the graph (`codegraph_explore` MCP tool or `codegraph explore "<…>"`); callers/impact over text search; then read the source; check `codegraph status` before trusting it. Rules in `.claude/rules/codegraph.md`.
22. CodeGraph at every step (owner, 2026-11-02): "You should use codegraph also whilst speccing." / "Ensure any new session always uses codegraph" / "Are you using codegraph during task execution as well? If it makes sense ensure you do so moving forward". Plans have a **CodeGraph** section (`check-surfaces.mjs` enforces it, `CODEGRAPH_SINCE = '2026-11-03'`); before a PR: `codegraph sync`, then `codegraph callers` on every exported symbol added/moved/dropped.
23. Keep asking before each step (owner, 2026-11-02, asked "Why do I need to approve these steps?", then answered "No, continue" to the offer to stop asking): every step still ends with "Ready to continue with <next step>?".

## 5. Corrections log
| # | Claude did | The user wanted |
|---|---|---|
| 1 | Told the user to run `/speckit-specify` in a separate session | Run Spec Kit steps directly (follow their SKILL.md by hand) |
| 2 | (self) Called token-reachable membership routes a hidden security issue | A docs contradiction; #1 option B |
| 3 | (self) Planned `server/ops_*.go` | `server/ops.go` exists → `cap_*.go` |
| 4 | (self) Counted 36 MCP tools | 34 |
| 5 | (self) Said de and es both required | Now de + nl required, es reported |
| 6 | Treated "MCP must follow new features" as a fix | A way of working; grow the registry |
| 7 | (self) Invented a benchstat pseudo-version | Verified `v0.0.0-20261009192801-be2c69fb417e` |
| 8 | Pushed after the user merged #48 | Watch merge state; restart branch after a merge |
| 9 | Edited `AGENTS.md` during a rejected tool call | Wait for the user |
| 10 | Spec 003 merged with 20 task issues open | Issue and board hygiene (rule 8) |
| 11 | (self) Appended decisions at the bottom | `docs/decisions.md` is newest first |
| 12–13 | (self) `pkill -f <pattern>` killed its own shell | Stop own background tasks with TaskStop; `timeout` on long probes |
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
| 62 | (self) `git remote set-url origin …/nigari` in an old-name session | Work in a session on `neatlittlemacapps/nigari` |
| 63–66 | README drafts | Intent, warm, UX core, personal exploration; ditched two bullets |
| 67 | (self) Planned an image uid via chroot (denied) | Don't work around |
| 68 | (self) `/security-review` failed on `origin/HEAD` | `git remote set-head origin main` |
| 69 | (self) Benchstat compared nothing across the module rename | Read base and head tables by hand |
| 70 | (self) Tried `git push --delete` on stale branches (classifier: destructive) | User deletes branches by hand (Branches page → 🗑) |
| 71 | (self) Session ran under the old repo name; merge of #366 never reached Claude; user: "I merged. normally you see this" | Work on `neatlittlemacapps/nigari`; subscribe under that name |
| 72 | (self) Took a `subscription.created` event as proof GitHub events arrive | It comes from Claude's side; only real PR events prove it |
| 73 | (self) Dropped the "Yes Boss!" code word after the first reply | Every reply starts with it |
| 74 | (self) Helpers made `{one, other}` objects for keys read by `t()` (shows English) | `check-i18n.mjs` fails on that shape; plural objects only for `plural()` keys |
| 75 | (self) Wrote a wrong reason for not keeping `nl.machine.json` | Check claims about other files before writing them |
| 76 | (self) Changed `nigari version` output; root-package test broke (found by review) | Grep every reader of a changed output (incl. `install.sh`, tests in `.`) |
| 77 | (self) Label "Last upgrade" showed install time on a fresh instance | Label the data for what it is ("Step applied") |
| 78 | (self) Moved comment added an old name; `check-names` failed | Reword to the old count; do not raise the allowlist |
| 79 | (self) Comment-only edit in `server/backup.go` made `admin-maintenance` stale | After touching any file a shot lists, retake that shot before stopping |
| 80 | (self) Ran `scripts/test-install-move.sh` with `sh` (exit 2) | It is bash: `bash scripts/test-install-move.sh` |
| 81 | (self) Wrote "v2.0.2 and earlier" for pre-step backups | Steps first shipped in v1.6.11: "v1.6.10 and earlier" |
| 82 | (self) Told the user the CodeGraph installer kept "the harness's existing hooks" in `~/.claude/settings.json` | The file did not exist before; the installer itself added `codegraph prompt-hook`. Diff config files before describing what a tool changed |
| 83 | (self) Used `crypto.randomUUID` in `columnEnter.ts` | It throws outside a secure context (nigari over plain http on a LAN): `crypto.getRandomValues`; tests simulate it by deleting `Crypto.prototype.randomUUID` |
| 84 | (self) Playwright `End` key did not move the editor cursor | Click at the inline content's right edge |
| 85 | (self) A `keys.ts` handler read a stale ProseMirror selection after arrow keys | Call `editor.prosemirrorView.domObserver.flush()` before reading the selection in a capture-phase handler |
| 86 | (self) Hook test showed "already current" after an edit | A leftover `codegraph serve` daemon (started by probes) had synced it; `.codegraph/daemon.pid` is JSON; stop that process before testing the sync path |
| 87 | (self) A retaken screenshot showed "nigari v2.0.7 is out" | `shoot-wiki.mjs` now hides `.update-banner`; any build works |
| 88 | (self) `eventually(() => locator.textContent())` waited 30 s inside each try | `locator('[…]', { hasText }).waitFor()` |
| 89 | (self) Reported 382 vs 381 files inconsistently | Quote `codegraph status`, the figure that is current |
| 90 | Wrote spec 010's first plan without CodeGraph; user: "You should use codegraph also whilst speccing." / "How sure are you that you used codegraph to inform you in the plans" | Graph first in specify/plan/tasks; plan records what it found (rule 22) |
| 91 | (self) Put a made-up commit hash "c6f2a1e" in PR #422's body | Real hashes 54383dd / 73ddf44; copy hashes from `git log`, never from memory |
| 92 | (self) Offered to edit the v2.1.0 release notes | No tool edits releases: give the user the text to paste |
| 93 | (self) `check-surfaces` regex missed a section at end of file (found by review) | Lookahead also matches end of file |
| 94 | (self) Proposed to stop asking before each step | User: "No, continue" — keep asking (rule 23) |
| 95 | (self) Hand-built menu triggered app shortcuts / stole ↓ / lost focus (found by tests) | `menuOwnsKey`, `data-nav-skip`, focus return in `DialogHost` + `AfterClose` |
| 96 | (self) Main chunk 1.4 KB over the bundle cap | Lazy-load dialogs; never raise the cap to pass |

## 6. Decisions
| Decision | Why |
|---|---|
| Spec Kit 1.2.3 + GitHub Projects board (project 5) | User's call |
| `AGENTS.md` shared; `CLAUDE.md` gitignored | An earlier `CLAUDE.md` leaked deployment details |
| Parity manifest + `check-parity.mjs`; `gapBudget` ratchet | Agent parity |
| SQLite; read pool `s.rdb` beside writer `s.db` | Spec 002 |
| Charts on Chart.js 4.5.1 | User: "I choose chartjs" |
| A chart is built once per kind/theme/value-label setting and updated in place (`chart.update()`); identical answers change nothing | #368/#319; PR #372 |
| Agents author their commits | User: "Claude" |
| Safe upgrades on goose v3.29.0 (option C) | User: "No, go with c" |
| Every push to main = a release (last + 1) | #265; spec 011 R11 amendment |
| Notices list modules the 5 release binaries link | User: "B" |
| Spec 010: every menu item has an icon; one function = one icon app-wide; editor menus count; function = the verb | User |
| Rename option C to **nigari**, v2.0.0, no transition | User |
| Database move `salt.db` → `nigari.db`: no copy before | User: "No copy" |
| Kept as data: old `salt_` API tokens; OAuth client ids; calendar UIDs `@salt.md`; volume `salt-data` | Identity/data, not names |
| Desktop app id `io.github.neatlittlemacapps.nigari`, scheme `nigari://` | User confirmed |
| Dutch shipped complete and **required** like German (constitution 1.2.0) | PR #366 |
| Dutch style: informal *je/jij*, infinitive buttons, neutral NL/BE Dutch; glossary in `docs/decisions.md` | Claude's default, merged by the user |
| CLA / `pull_request_target` notice: do nothing | User: "A" |
| README "Built on salt.md" section | User edits; PR #364 |
| README "Download" line (option A: binaries on Releases; desktop app not yet, #323) | User: "1. yes" (2026-10-30); not done yet |
| v2.0.0 release page keeps GitHub's generated notes; the notes file stays in `specs/011-rename-nigari/contracts/release-notes.md` | User: "leave it" |
| Icon: backlog (#322), user provides artwork | User |
| Desktop release: backlog (#323) | User: "yes" |
| Review rule + steward skill | User: "Ok" (PR #325) |
| 2 streams after the rename and Dutch | User: "after rename go 2 streams" |
| Fork stays attached to `saltmd/salt.md` for now | User |
| Work from a session on `neatlittlemacapps/nigari` | Events under the old name do not arrive |
| Restore refuses a newer archive before replacing anything | Spec 008 FR-009 |
| Bugs before features (option A) | User: "yes" to A; PR #369 |
| A column = its first block + that block's children; Enter in a column stays in it (`columnEnter.ts`); a column's lines drawn flush | #317; matches server export/import; PR #373 |
| CodeGraph 1.6.2 (npm) in cloud sessions: SessionStart hook `.claude/hooks/codegraph.sh` installs/wires/indexes/syncs; telemetry off; index in `.codegraph/` via `.git/info/exclude`; rules in `.claude/rules/codegraph.md` | User's CodeGraph request; PR #373; `docs/decisions.md` 2026-11-01 |
| CodeGraph's per-message `codegraph prompt-hook` removed every session start | User: "yes" (noise: "graph" pulled in `GraphView`); PR #374 |
| #317 and CodeGraph in one PR | User: "one PR for both" |
| Each row: one colour by default and for single-colour palettes; **Colourful** gives each bar its own | #318; spec 004 R18 amended; PR #374 |
| Wiki shots: `text` step puts `/data` in the data-directory cell; `.update-banner` hidden in every shot | #320; PR #374 |
| Spec 010 option **B**: every menu rebuilt on `ui/Menu` (Base UI `@base-ui/react/menu` 1.9.0), not only icons | User: "B" |
| Icons by function in `web/src/menuIcons.ts` (`MENU_ICONS`, 86 functions); `check-menu-icons.mjs` fails a hand-built menu, a shared icon, a raw button inside a Menu | Spec 010; rule 14 |
| Right-click opens the same `Menu` at the pointer; a modal menu swallows the first outside click | Spec 010 research |
| `anchoredMenu.ts` stays (`anchoredMenuStyle`, `SHEET_MAX_WIDTH`); `AnchoredMenu.tsx` deleted | Still used by non-menu popovers |
| Bundle: lazy dialogs (AdminSettings, LanguageTime, 2FA, calendar) instead of raising the cap | Cap stays 590,146 B |
| Spec 010 release = **v2.1.0** (minor bump) | User: "1. Yes" |
| v2.1.0 release notes written by Claude, pasted by the user | User: "2. Yes" |
| #278 is a bug | User: "3. Yes" |
| README Download line done (option A) | PR #377 |
| #379: shared button components to bring hand-built buttons down, look kept | User: "Ok"; backlog |

## 7. Changed / rejected
- Earlier chats: decisions page in workspace → `docs/decisions.md`; fixed surfaces list → registry; force-push rebase → merge `main`; hand-moved cards → derived Status; committed catalogue baselines → reference per run; hand-drawn SVG charts → Chart.js; owner as commit author → Claude.
- #263 research B → C (goose); notices from `go list -m all` → linked modules only.
- Name "salty.md" → "nigari". Rename option B → C. Transition period → none.
- Spec 008 one PR → two parts (both merged).
- R8 first version (rename calendar UIDs) → UIDs keep `@salt.md`.
- Pinning the image uid → no pinned uid. Copy before the DB move → no copy.
- README: feature list / harsh tone → intent-based, warm section.
- Dutch "reported like Spanish" → required like German. Constitution 1.1.1 → 1.2.0.
- UI label "Last upgrade" → "Step applied". `word-break: break-all` → `overflow-wrap: anywhere`.
- Each row "always one colour" → one colour unless Colourful (#318).
- CodeGraph instructions in `CLAUDE.md` → `.claude/rules/codegraph.md` (`CLAUDE.md` is gitignored here).
- CodeGraph install via `raw.githubusercontent.com` → npm `@colbymchenry/codegraph@1.6.2` (GitHub blocked by the session proxy).
- CodeGraph prompt hook on → off.
- `crypto.randomUUID` → `crypto.getRandomValues` (insecure contexts).
- README "Download" line: agreed → done (PR #377).
- Spec 010 option A (icons only) → option B (menus rebuilt).
- Stop asking before each step → keep asking (user: "No, continue").
- Raise the bundle cap → lazy dialogs.
- ❌ Bugs-first option B. ❌ `nl.machine.json`. ❌ 3+ parallel streams.
- ❌ Committing the CodeGraph index (25 MB, machine-specific). ❌ A repository `.mcp.json` for CodeGraph. ❌ An external database/R2/salt.md integration/custom graph engine (user's constraint).
- ❌ Community Go/security/Flutter/mobile/AWS plugins. ❌ GitHub Pages docs site now (later as #326); own domain.
- ❌ Spec 004 leftovers (backlog #279–#282); DuckDB, Mantine as app library, shadcn/ui, Storybook, uPlot, Recharts, ECharts; widening `ALLOWED_NON_TOOLS`; looser pixel tolerance; baselines by a CI bot; down migrations, Litestream, upgrade-on-read.

## 8. Data & facts (exact)

**Repo and tooling**
- Go 1.27.2 local, CI 1.27.3; Node 22.22.0. `modernc.org/sqlite` v1.60.1; Playwright 1.63.0; Chart.js 4.5.1; goose v3.29.0; BlockNote 0.51.4 (`@blocknote/core`, `/react`, `/mantine`); Base UI Select (`@base-ui/react/select`).
- Go module `nigari`; `server.Version = "2.1.0"` in `server/backup.go` (the version line; patch = last + 1) (releases stamp the tag); DB `nigari.db`; newest upgrade step 1.
- `nigari version` prints `<release> (upgrade step N)`; a `-ldflags "-X nigari/server.Version=dev"` build prints `dev (upgrade step 1)` and has no update check.
- Locales: de 1225, es 1225, nl 1225 entries (measured 2026-10-30; no strings added since). German and Dutch use informal address.
- Constitution 1.2.0. 34 MCP tools; `gapBudget` 10; 19 registry rows (new: "Menu icons", since 2026-11-03).
- Budgets (`web/tokens/budgets.json`, after v2.1.0): rawButtons 271, zIndex 40, radius 252, fontSize 374. Component token `menu.icon-size` 16px. Bundle cap `check-bundle.mjs` 590,146 B gzip; main chunk ~17.2 KB under it.
- Spec 010 tests: `web/tests/menu-icons.mjs`, `web/tests/menu-keyboard.mjs` (new); updated menus-and-arrows, dialog-escape, design-system-dialog, side-peek, trash-navigation, database-toolbar-menus, tabs, chart-*.mjs, catalog.mjs. gofmt-exempt: `server/server.go`, `server/audit.go`, `server/desktop_auth.go`, `server/tunnel_update_test.go`.
- `check-names.mjs`: 382 old names in 49 allowlisted files. `check-upgrades.mjs` 7 cases. `check-storagemove.mjs` 14 cases. `check-columnenter.mjs` 17 cases (new). `scripts/test-install-move.sh` (bash) 4 cases.
- New browser tests: `web/tests/chart-redraw.mjs` (#368/#319: 1 build for a new chart view on 20 rows; old code built 3), `web/tests/column-enter.mjs` (#317). `chart-each-row.mjs` checks swatches (#318). `catalog.mjs` waits for "Banana" highlighted (#375).
- Full gate ~10 min: `timeout 900 scripts/agent-gate.sh > <scratchpad>/gate.log 2>&1`.
- Container setup per session (repo at `/home/user/nigari`): `git fetch origin main --depth=300`; `git remote set-head origin main`; branch tracks its remote; `cd web && npm ci && npx vite build`; `cd web/tests && npm ci`; Playwright browsers at `/opt/pw-browsers`.
- Screenshot recipe: `CGO_ENABLED=0 go build -o <scratch>/nigari .`; start two instances as **separate background tasks** (`NIGARI_DATA=<scratch>/d1 NIGARI_ADDR=127.0.0.1:8421 exec <scratch>/nigari`, same with d2/8422), stop them with TaskStop; in `web/`: `npm i --no-save playwright@1.63.0` once; seed: `NIGARI_SEED_URL=http://127.0.0.1:8421 NIGARI_SEED_EMAIL=ada@example.com NIGARI_SEED_PASSWORD='WikiPruefung2026!' node scripts/seed-wiki-instance.mjs`; shoot: `NIGARI_SHOOT_URL=http://127.0.0.1:8421 NIGARI_SHOOT_FRESH_URL=http://127.0.0.1:8422 NIGARI_SHOOT_EMAIL=ada@example.com NIGARI_SHOOT_PASSWORD='WikiPruefung2026!' node scripts/shoot-wiki.mjs <ids>` (invented account). A new seed changes the share-dialog link id; that diff is expected.
- Test account in Go tests: `signedIn` uses password `passwort12345` (invented); fixture account `fixture@example.test`.

**CodeGraph (cloud sessions)**
- Package `@colbymchenry/codegraph` **1.6.2** (npm, published 2026-10-03), CLI at `/opt/node22/bin/codegraph`. Telemetry off (saved choice + `CODEGRAPH_TELEMETRY=0` in the hook).
- Global wiring (home dir, recreated each session): `~/.claude.json` `mcpServers.codegraph = {"type":"stdio","command":"codegraph","args":["serve","--mcp"],"alwaysLoad":true}`; `~/.claude/settings.json` `permissions.allow: ["mcp__codegraph__*"]`; `~/.claude/CLAUDE.md` CodeGraph section (marker-fenced).
- MCP exposes one tool: `codegraph_explore` (available as `mcp__codegraph__codegraph_explore` after a restart; confirmed 2026-11-02).
- Index: `.codegraph/codegraph.db` (~25 MB); 382 files, 6,964 nodes, 22,574 edges (2026-11-01); a later rebuild reported 6,965 nodes, 22,582 edges. Built in 10.2 s on a fresh machine; 1.0 s when current.
- Hook outcomes: "built" / "already current" / "synced with the checkout" / "rebuilt"; does nothing when `CLAUDE_CODE_REMOTE` is not `true`.
- Optional environment setup script (owner pastes in the environment settings → Setup script): `npm install -g @colbymchenry/codegraph@1.6.2 && codegraph telemetry off && codegraph install --target=claude --location=global --yes`

**Releases**
| Version | PR | Published (UTC) |
|---|---|---|
| v2.0.0 | #363 (rename to nigari) | 2026-10-30 07:27 |
| v2.0.1 | #364 (README) | 2026-10-30 07:46 |
| v2.0.2 | #365 (`.gitignore`, by the user) | 2026-10-30 12:16 |
| v2.0.3 | #366 (Dutch) | 2026-10-30 13:38 |
| v2.0.4 | #367 (spec 008 part 2) | 2026-10-30 15:49 |
| v2.0.8 | #372 (chart builds once) | 2026-10-30 19:26 |
| v2.0.9 | #373 (columns + CodeGraph) | 2026-11-01 23:19 |
| v2.0.10 | #374 (Colourful, wiki shots, prompt hook off) | 2026-11-01 23:33 |
| v2.0.12 | #377 (README Download) | 2026-11-02 |
| v2.0.13 | #378 (CodeGraph everywhere) | 2026-11-02 |
| v2.0.14 | #420 (spec 010 plan/tasks) | 2026-11-02 |
| v2.0.15 | #421 (spec 010 part 1) | 2026-11-02 |
| v2.1.0 | #422 (spec 010 part 2) | 2026-11-02 12:16:44 |
- v2.0.5–v2.0.7 (#369 and the user's two release-notes edits) not checked individually. #376's release (expected v2.0.11) not checked.
- Releases page: https://github.com/neatlittlemacapps/nigari/releases. Assets `nigari-<os>-<arch>` + `SHA256SUMS.txt`. Image `ghcr.io/neatlittlemacapps/nigari`. No desktop app published (#323).

**Specs**: 008, 010 (menu icons, 39 tasks, parent #380, tasks #381–#419 all closed), 011 done.

**Open issues**
| # | Title |
|---|---|
| 370 | Every row of a table view has a drag handle and a row menu (dragging removes the sort) — owner: important |
| 371 | A nested (linked) database has its own views, separate from the original's |
| 322 | nigari needs its own icon (user supplies artwork) |
| 323 | The fork releases its desktop app (unsigned first) |
| 326 | nigari has a docs site built from the wiki (GitHub Pages) |
| 379 | Fewer hand-built buttons: shared button components, same look |
| 269 | `bug`: an empty date looks filled in |
| 278 | `bug`: chart colour clash |
- Open bugs: #269, #278 (2026-11-02). #263 closed in the board cleanup.
- Epic A (stream B): #131, #132, #133, #18, #19, #270, #269, #279, #281, #280, #178. Epic B charts: #278, #277, #282, #266. Epic C: #22, #26, #24, #23. Epic D editor: #267, #268. Epic E agent parity: #3–#12, #14, #16, #17.
- #370/#371 Notion reference screenshots were described in words; the owner attaches the images by hand (no API).

## 9. People, terms & names
- **People:** the user (`neatlittlemacapps`, Frank De Graeve); upstream maintainer "Jeremia" (`jeremiaa`).
- **Terms:** surface = registry row; gap = person can, agent can't; budget = count that only goes down; gate = `scripts/agent-gate.sh`; stream = a parallel work line; conductor = Claude; steward skill = `.claude/skills/steward/SKILL.md`; upgrade step = a numbered goose step; column head = a column's first block; Each row = chart grouping `__row`; code graph = CodeGraph index.
- **Repo:** `neatlittlemacapps/nigari`.
- **Branches:** this handoff on `claude/handoff-14` (from main `69647dc`, merge of #422). Old working branch `claude/wizardly-johnson-y7nazn`. GitHub deletes it on every merge; fast-forward recreates it.
- **Key files:** `web/src/components/ChartFigure.tsx`, `ChartView.tsx`, `web/src/chartTheme.ts` (`groupColourTokens(drawn, palette, groupProp, series)`), `web/src/columnEnter.ts` (`columnEnterAction`, `columnEnter`), `web/src/blocks.tsx` (`columnsSpec`), `web/src/keys.ts`, `web/src/components/Editor.tsx` (`column.enter` shortcut), `web/scripts/shoot-wiki.mjs` (`text` step), `.claude/hooks/codegraph.sh`, `.claude/rules/codegraph.md`, `server/upgrade.go`, `server/backup.go`, `docs/decisions.md`, `web/src/menuIcons.ts`, `web/src/ui/Menu.tsx` (+ `Menu.css`), `web/scripts/check-menu-icons.mjs`, `web/src/components/SidebarMenus.tsx`, `CollectionMenus.tsx`, `UserMenu.tsx`, `web/src/keys.ts` (`menuOwnsKey`), `web/src/dialog.tsx`.
- **Terms (new):** option B = menus rebuilt on Base UI; menu function = the verb an item does (one icon each); hand-built button = a raw `<button>` counted by the rawButtons budget.

## 10. Work state
| Item | Status | Location | Notes |
|---|---|---|---|
| #368 + #319 chart | merged, v2.0.8 | PR #372 | |
| #317 column Enter | merged, v2.0.9 | PR #373 | |
| CodeGraph setup | merged, v2.0.9; prompt hook off in v2.0.10 | PR #373, #374 | MCP tool confirmed live after a restart |
| #318 Colourful, #320 wiki shots | merged, v2.0.10 | PR #374 | |
| #375 flaky catalogue Select test | merged | PR #376 | not reproduced on demand; fix rests on Base UI's late first highlight |
| README "Download" line | merged, v2.0.12 | PR #377 | |
| CodeGraph in spec/plan/tasks | merged, v2.0.13 | PR #378 | |
| Spec 010 menu icons | merged, **v2.1.0** | PRs #420, #421, #422 | SC-004 by-hand check by owner open |
| Bugs #269, #278 | open | issues | next |
| #379 buttons | filed | issue | backlog |
| Epic A | proposed | section 8 | helper stream, spec 012 |
| #370, #371 | filed | issues | spec first |

## 11. Next steps
1. **Next action:** fix bug #269 (an empty date looks filled in): label `in-progress`, `codegraph explore` the date cell, small PR.
2. Fix bug #278 (chart colour clash), own small PR.
3. Start stream B (Epic A, spec 012) per the steward skill.
4. Then #370 and #371 (spec first), #322, #323, #326, #379.

## 12. Open questions ⚠️
- Has the owner added the CodeGraph setup-script line to the environment settings? (Without it, the MCP tool may arrive only from a machine's second start.)
- Has the owner attached the Notion screenshots to #370 and #371?
- Did the owner paste the v2.1.0 release notes (Claude gave the text; no tool edits releases)?
- Spec 010 SC-004 (by-hand keyboard check): done by the owner?
- Delete the stray label `surface:performance`? (yes / leave)

## 13. Re-attach checklist
Nothing to attach. This file is `docs/handoffs/handoff-nigari.md` on branch `claude/handoff-14` of `neatlittlemacapps/nigari`. Start the new Claude Code session on **`neatlittlemacapps/nigari`**, branch `claude/handoff-14`.

---
<sub>Audit: 13/13 sections · 23 rules · 96 corrections · ~330 data points · secrets removed: none found (test accounts invented and documented) · generated by active-memory</sub>
