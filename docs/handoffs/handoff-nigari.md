# active-memory handoff: nigari (formerly salt.md fork): agentic setup and feature roadmap

**Handoff #19** · 2026-11-12 · Lineage:
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
- **#15 (2026-11-02):** board Priority mirrored onto `priority:N` labels by the board-sync Action (PR #423 → v2.1.1); #269 empty values fixed (PR #424 → v2.1.2); #278 chart colours fixed (PR #425 → v2.1.3); epic #426 "database views" filed with 10 sub-issues; spec 012 spec + plan written; German-comment bug #427 found and fixed (PR #428, with spec 012 docs; release expected v2.1.4, not checked).
- **#16 (2026-11-03):** spec 012 finished: PR 1 (#528 → v2.1.8) and PR 2 (#533 → v2.1.9), built by the helper stream, reviewed and audited by Claude; spec 013 docs merged (#523 → v2.1.10, after Claude resolved its `docs/decisions.md` conflict); owner's embed model (an embed owns its views) → **spec 014** written and clarified (`specs/014-embed-own-views/`, #371 under #426); bugs #524–#527, #532 filed (helper filed #529–#531).
- **#17 (2026-11-04/05):** spec 014 planned + 36 tasks (#534–#569 under #371; docs PR #570 → v2.1.11); #524 delete-property confirmation (PR #573 → v2.1.12); #571 workspace empty state (PR #575 → v2.1.13); spec 013 PR 1 views lock + activity log, built by helper stream B, reviewed/audited by Claude (PR #576 → v2.1.14 expected); bugs #571, #572, #574 filed; owner's next task: **Umbrel packaging** (section 11).
- **#18 (2026-11-05/06):** Umbrel packaging done: audit; cross-origin hole fixed (another app's page could write and read the live socket) + `NIGARI_TRUST_PROXY` (PR #579 → v2.1.15, issue #578); store `yokogaki` published at `neatlittlemacapps/yokogaki-umbrel`, pinned to 2.1.15 (PR #580); owner's icon in the store (PR #581); owner added the store on their Umbrel.
- **#19 (2026-11-06 → 11-12):** #322 logo (#583 → v2.1.18); spec 013 PR 2 personal filter/sort (#584 → v2.1.19); spec 013 PR 3 quick filters + lanes (#587 → v2.1.21), conflict with #586 (BoardView refactor from Claude's suggested task) resolved; spec 013 finished (#477 closed).

> **Read first (2026-11-12):** nothing is in progress. No open PRs, no
> running helper, no scheduled check-ins. Still check `list_sessions`,
> `git ls-remote --heads origin` and open PRs first (correction 107), and
> fetch `origin/claude/handoff-14` and `origin/main` before reading this file
> from a local checkout (correction 117). Spec 013 is finished. The next job
> is spec 014 PR 2, on a **new branch** `claude/spec-014-pr2` from `main`
> (one branch per pull request, owner 2026-11-12; steward skill).

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
- **Order of work now** (2026-11-06): Umbrel is done. (0) **#322 nigari's own logo everywhere** (the owner supplied the artwork; short plan first, section 11). Then the board, as before (2026-11-03, after #523): work goes by the board's Priority (rule 24); only a `bug` + `breaking` issue jumps to P1 (rule 19). (1) **Spec 014 plan** (`/speckit-plan`, then tasks and taskstoissues under #426); (2) **spec 013 build** (45 tasks #478–#522, parent #477) by a helper stream (stream B) per the steward skill, Claude reviews and audits; (3) open bugs by priority: #476, #524, #525, #526, #527, #529, #530, #531, #532; (4) backlog #370, #322, #323, #326, #379.

## 2. About the user (as relevant to this work)
- GitHub `neatlittlemacapps` (id 60575307), display name "Frank De Graeve"; email neatlittlemacapps@gmail.com; owns `neatlittlemacapps/nigari` (renamed from `neatlittlemacapps/salt.md` on 2026-10-30), still a GitHub fork of `saltmd/salt.md` (AGPL-3.0); CLA signed upstream. Fork stays attached for now ("I'll leave it for now").
- Works mostly from a phone (Claude app, iPhone), also the Claude desktop app on a Mac. Designer/PM, not a developer. Timezone Europe/Brussels; works in Belgium (hence Dutch, which they read natively). Thinks in Notion terms; sends Notion screenshots as references for features.
- Answers each step with a terse "Ok"/"Yes"/"yes"/a letter/"go"/"done". Asks plain-language questions ("I don't know where to find the release", "Shoul I start new session for you to have access to graph?", "enlighten me if and how the graph knowledge has helped you"). Wants honest answers about whether tools actually help. Types fast with typos. Says when lost → give a done/todo table.
- Often taps merge within minutes of a PR opening, before CI finishes, or enables auto-merge (PR #374). Check `main`'s CI and release afterwards.
- Local Mac test install: repo at `~/Documents/Salt/salt.md`; data `~/salt-demo`. Run: `cd ~/Documents/Salt/salt.md && NIGARI_DATA=~/salt-demo NIGARI_ADDR=:8420 ./nigari`, open `http://localhost:8420`; Ctrl+C stops. A leftover `SALT_*` variable makes nigari refuse to start. Install latest: `curl -fsSL https://raw.githubusercontent.com/neatlittlemacapps/nigari/main/install.sh | sh`.
- Uses other agents too: pointed one at the GitHub link and it cloned the repo instead of offering the binary/Mac app (the README "Download" line answers this).
- GitHub settings: Actions on; auto-merge enabled; `BOARD_TOKEN` secret, `BOARD_PROJECT`=5.
- Runs an Umbrel at home ("umbrelOS for Docker v2.0.1", per its log, 2026-11-05) and added the yokogaki store there; sends Umbrel logs and screenshots when something fails.

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
19. **Replaced 2026-11-03** (owner: work goes by Priority; only a `bug` + `breaking` issue is raised to P1; `AGENTS.md`). Was: Bugs before features (owner chose option A, 2026-10-30; `AGENTS.md`): "An open `bug` issue goes before starting the next feature or spec. A bug found while working gets an issue at once and is fixed in its own small pull request, not saved up."
20. Code word: every reply starts with "Yes Boss!" (never drop it).
21. CodeGraph is a working tool (owner, 2026-11-01): before a change that reaches past one function, query the graph (`codegraph_explore` MCP tool or `codegraph explore "<…>"`); callers/impact over text search; then read the source; check `codegraph status` before trusting it. Rules in `.claude/rules/codegraph.md`.
22. CodeGraph at every step (owner, 2026-11-02): "You should use codegraph also whilst speccing." / "Ensure any new session always uses codegraph" / "Are you using codegraph during task execution as well? If it makes sense ensure you do so moving forward". Plans have a **CodeGraph** section (`check-surfaces.mjs` enforces it, `CODEGRAPH_SINCE = '2026-11-03'`); before a PR: `codegraph sync`, then `codegraph callers` on every exported symbol added/moved/dropped.
23. Keep asking before each step (owner, 2026-11-02, asked "Why do I need to approve these steps?", then answered "No, continue" to the offer to stop asking): every step still ends with "Ready to continue with <next step>?".
24. Priority (owner, 2026-11-02): "use the "Priority" field to assess priority" — the board's Priority field (options `P1 - High`, `P2 - Medium`, `P3 - Low`), mirrored onto `priority:1`/`2`/`3` labels; read priority from those labels, never set one by hand (`AGENTS.md`).
25. Board sync (owner, 2026-11-02): "The GitHub action should tackle this, not you" — Claude does not run the board-sync workflow itself (no `workflow_dispatch` by Claude); the Action runs nightly 03:17 UTC, on issue events, or when the owner taps Actions → Board sync → Run workflow.
26. Embeds (owner, 2026-11-03, with Notion screenshots): "You basically recreate a view from the originating database, but in itself it is a separate view hat only exists in combo with the embed block on this page. So if you want to add the other views you can but you'd need to add or recreate these." / "it is still possible to edit properties of the dbase and thus change the source base as well. Doing these type of actions (resulting in an alteration of the true source d-base or different views elsewhere) can happen but through a confirmation." / "So think really well on how this pans out".
27. Conductor/helper (steward skill, applied 2026-11-03): the helper builds on its own branch (`claude/spec-012-views` for spec 012) and never opens PRs; the conductor merges its head into `claude/handoff-14`, reviews the diff, runs `ux-ui-audit`, and offers the PR from `claude/handoff-14`. Helper messages arrive via `send_message`, often late.
28. **Done 2026-11-05** (the owner later approved the local branch, option B, then each push with "Ok"). Umbrel task constraints (owner, 2026-11-05, word for word): "Do not publish, push, tag or open pull requests. Leave all changes uncommitted for me to review." / "Do not weaken auth, TLS or security checks to make it work. If a security trade-off is needed, stop and explain it." / "Keep the license (AGPL-3.0) and notices intact." (These override rule 3 and the git-check for that task only; see section 12.)
29. Finishing (owner, 2026-11-05; done for Umbrel, still the way to end a stream): "I want a clean stop and build/release so I can pick up fresh later" / "ensure a full build and no open stuff is left. After this a new handoff can prepare for regular ongoing development of the rest on the board once I give a go".
30. Execution (owner, 2026-11-05, word for word): "Plan with opus execute with sonnet". Claude plans and reviews; mechanical execution steps go to a Sonnet helper (`Agent` with `model: "sonnet"`), whose diff Claude reviews before it is committed or pushed.
31. Branches (owner, 2026-11-12, "ok" to Claude's proposal): one branch per pull request, named after the work, from the newest `main`, even when the session is handed a fixed branch; the handoff file goes to `main`. A suggested task touching an open PR's files says "Start after PR #N merges."; before offering a PR, check `list_sessions` and open PRs for the same files. In `.claude/skills/steward/SKILL.md` and `docs/decisions.md`.
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
| 97 | (self) Said npm was blocked by the environment's network policy | Environment is "full access" (user); `NO_PROXY`/`npm_config_noproxy` list `registry.npmjs.org` and `proxy.golang.org` for direct access, which has no DNS here. Override: `export NO_PROXY=localhost,127.0.0.1 no_proxy=localhost,127.0.0.1 npm_config_noproxy=localhost,127.0.0.1` |
| 98 | (self) Ran `board-sync.yml` by `workflow_dispatch` on the branch to read priorities | User: "The GitHub action should tackle this, not you" (rule 25) |
| 99 | (self) Proposed reading priorities from the board-sync run log (option A) | User: "can't you find a job or something that mirrors project priority to a field tag?" → the Action mirrors them onto `priority:N` labels |
| 100 | (self) First chart-colour fix compared tokens by `getComputedStyle` at render time (found by review) | One name per colour: options use the colourful palette's numbered tokens; compare names; `check-chartcolours.mjs` guards it |
| 101 | (self) Empty date/number input swapped for the Empty button while editing a filled value (found by review) | Focus counts as editing; test reloads so the field starts filled (mutation-checked) |
| 102 | (self) Started #278 without the `in-progress` label | Label when starting (rule 8) |
| 103 | (self) Issue #427 said check-i18n does not read comments | It does; it needed 2 listed words. Check claims against the code before writing an issue |
| 104 | (self) Took "Done" (setup script fixed) as the wording choice for #269 | Label own defaults as defaults and say so (did) |
| 105 | Offered "no Settings in embeds" (R10) as option A with a wrong reason ("#22", an upstream issue number from a pre-fork code comment) | User: "Did I ask to not have settings in embedded version? What was the ask here?" — read the owner's own issue (#270 asked for view settings in embeds) before offering options; never cite an issue number without opening it |
| 106 | Asked the owner to choose 14px or 15px table text | User: "I'm confused why I need to make this choice. are you using a design token… go with 14 if you need one. What is the catalogue?" — when a token decides, use it; explain terms (catalogue = `web/catalog/`) |
| 107 | (self) Started from handoff #15 without checking other sessions; a previous conductor had already built spec 012 PR 1 and written spec 013 | Check `list_sessions`, remote branches and open PRs first |
| 108 | (self) Wrote a scratch audit script into `web/tests/` (the git-check would fail) | Scratch files only in the scratchpad |
| 109 | (self) Playwright fixture build failed ("pattern all:web/dist: no matching files") after the gate | The gate deletes `web/dist`: `cd web && npx vite build` before any fixture run |
| 110 | (self) Assumed GitHub closed every `Closes #N`; #131–#133 stayed open after #528 | After a merge, check every listed issue; close the rest by hand with a comment |
| 111 | (self) Wrote the same three doc edits the helper had been asked for (its message arrived 50 min late); merge conflict | After asking the helper for an edit, wait for its report; do not do it too |
| 113 | (self) Opened PR #573 without asking first (rule 3) | Ask before opening a PR unless the owner just asked; owner later said "finish off what is still open", which covered #575/#576 |
| 114 | (self) Planned spec 014 issues "straight under #426" as the owner chose, then found tasks-sync matches task IDs per parent (spec 012's ticked T001–T040 there) and reads only 100 sub-issues | Check scripts/tasks-sync.sh before choosing a parent; owner: "whatever makes it easiest for you" → under #371 |
| 115 | (self) Wrote spec 014's "the other database's column goes too" (Notion's model) | nigari computes back-relations from links (derived.go): the confirmation says the links go; docs corrected |
| 116 | (self) A cross-session answer to the helper did not arrive as a turn (it read it only later); helper also hit its usage limit mid-task | After sending a helper a decision, check its reply quotes it; resend after a usage-limit stop (check get_session status) |
| 112 | (self) Told the owner #371 would go into spec 013 | Spec 013 was already planned (45 tasks) by the other session: #371 became spec 014; say when an earlier plan no longer fits |
| 117 | (self) Opened handoff #15 from a stale local checkout of `claude/handoff-14`; main and the branch held handoffs #16 and #17 | `git fetch origin main claude/handoff-14` and read the newest handoff before anything else |
| 118 | (self) First origin check trusted `Sec-Fetch-Site`, which browsers send only over HTTPS and to localhost (found by `/code-review`) | On plain HTTP compare `Origin` with `Host`, then `X-Forwarded-Host` or `public_base_url`; Sec-Fetch-Site still decides when sent |
| 119 | (self) The settings dialog wrote `trust_proxy` on every save, freezing `NIGARI_TRUST_PROXY` (found by `/code-review`) | Write the setting only when the checkbox changes; the tunnel sets it only when unset |
| 120 | (self) `umbrel/.../data/.gitkeep` never committed: `.gitignore` has `data/` (found by `/code-review`) | `git add -f` that one file; never edit `.gitignore` |
| 121 | (self) Mutation checks looked uncaught because the `-run` filter missed the new test's name | Run mutations against the test by its own name |
| 122 | (self) Browser attack test used a cross-site `PUT`, which `no-cors` cannot send | Attack with `POST` (`/api/pages`, `text/plain`) |
| 123 | (self) Validation script checked the setup text without waiting, so one run reported a false FAIL | `waitFor` the exact text ("Create the first (admin) account for this workspace."), screenshot it |
| 124 | (self) Linked umbrel.com and `http://umbrel.local` in the wiki; `check-wiki` flags foreign hosts | Reword (no link, `umbrel.local:8420` without scheme); never widen `ALLOWED_HOSTS` |
| 125 | (self) `/security-review` failed on `origin/HEAD` again (same as 68) | `git remote set-head origin main` at session start |
| 126 | (self) Read a stale local handoff again at the start of #19 (same as 117) | `git fetch origin main claude/handoff-14` first, then read the newest |
| 127 | (self) The owner's mark used blend modes; the front shape turned black on dark backgrounds | Flatten into 3 plain shapes, the overlap clipped (`brand/mark.svg`) |
| 128 | (self) First `check-brand.mjs` scanned only `web/` and missed the desktop and server copies of the mark (found by `/code-review`); also a comment false positive and a self-test that tested nothing | Scan the whole tree (server, web/src, web/public, web/index.html, desktop/src); strip comments before matching; self-tests that fail on the old mark |
| 129 | (self) `check-names` flagged "salt.md" in a new comment | Reword the comment; never widen the allowlist for it |
| 130 | (self) Tried to amend a pushed commit; denied | Add a new commit instead |
| 131 | (self) Personal view: the last edit was lost on reload (debounce never fired) | Flush with `keepalive` on `pagehide` |
| 132 | (self) A quick-filter pick made in a tab then hidden was lost | Also flush on `visibilitychange` (hidden) |
| 133 | (self) Lane drag placeholder pushed lanes under the pointer | A thin line marker when lanes are on |
| 134 | (self) Fold test raced a reload | The test waits for the PUT before reloading |
| 135 | (self) Code review on PR 3: stale settings blocked every views save; group picker clashed with sub-group; default groupBy offered as lanes; stale picks still filtered; multi-value lane drop lost values; per-cell recomputation; duplicated code | All fixed in `ecfa8e1`; large-file finding became #586 |
| 136 | (self) Suggested a BoardView refactor task (#586) without saying "start after #587 merges"; it touched the same file and #587 conflicted (owner: "How did this happen? How to avoid?") | A suggested task that touches an open PR's files says "start after PR #N merges"; check sessions and open PRs before offering a PR (accepted 2026-11-12: rule 31) |

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
| Board Priority → `priority:N` labels in `scripts/board-sync.sh` (option C); retries on GitHub 5xx only | User: "can't you find a job…"; PR #423 |
| #269: row page empty fields read muted "Empty"; list fields "Add person" / "Add link" / "Add sub-task"; table/board cells stay blank; empty date is a button until clicked; clearing stores null | User: "Can't we say "Add Person" etc"; Claude's default "Empty" for the rest; PR #424 |
| #278: options map to the colourful palette's numbered tokens (blue→chart-1, orange→2, green→3, purple→4, pink→6, yellow→7, red→8, brown→11, gray→gray-3); a place-coloured group skips colours already shown | PR #425 |
| Epic #426 database views = two specs: 012 (look/handle: #131, #132, #133, #270, #280), 013 (stored: #18, #19, #279, #281, #178) | User: "1 A" |
| Column drag changes order in that view only (`colOrder` on the view) | User: "2 A" |
| Anyone who can edit a database may lock its views (#281, spec 013) | User: "3 A" |
| Spec 012 plan amendments: no Settings button in embeds (#22); no Layout item | Claude's plan (R9, R10); owner not asked separately — PR #428 merged by owner |
| #427: one German word with no English homograph marks a line German; self-test cases in check-i18n | PR #428 |
| Table cells 14px (`--font-size-md`); headers 12px uppercase (`--font-size-xs`); catalogue shows 14px only | Owner: "go with 14"; header chosen by owner in the earlier conductor session |
| Spec 012 R10: no Settings in embeds in spec 012; reason = embeds will own their views (spec 014), not "#22" | Owner's embed model (rule 26) |
| An embedded database owns its views: starts with one table; **New view** lists types + "Views on <db>" to copy; changes never touch the database's views; Settings in embeds acts on embed views without asking | Owner (rule 26); `docs/decisions.md` 2026-11-03 |
| #371 → **spec 014** (`specs/014-embed-own-views/`), under epic #426; not in 012 (doubles it) nor 013 (planned) | Owner "ok" |
| Spec 014 Q1 **A**: every property change saved from a document asks first, naming the database | Owner "Ok" to recommendation |
| Spec 014 Q2 **B**: an embed written before spec 014 gets a copy of every database view it could switch to (nothing visibly changes) | Owner "Ok" to recommendation |
| Embeds lose the timeline Start/End pickers and the sub-items picker until spec 014 (option a) | Conductor's call, named in PR #533; owner merged |
| Deleting a property asks for confirmation (#524) on every surface | Owner's Notion screenshots; filed as bug |
| `docs/decisions.md` conflict on #523: keep both entries, newest first | Merge commit 03104d0 |
| Spec 014 storage: embed views in the block's `local` prop (`{v:2, viewId, views:[…]}`); old embeds read in both shapes, converted on first change; **no upgrade step** (server cannot rewrite Yjs) | research R1–R2; docs/decisions.md 2026-11-03 |
| Spec 014 agents: no new tools; `get_collection`/`set_view`/`delete_view` take `embed_id`; `get_page` lists embeds; `create_page`/`create_rows` take `embed` | research R7 |
| Spec 014 task issues under #371 (not straight under #426) | Owner "whatever makes it easiest for you"; docs/decisions.md 2026-11-04 |
| Delete-property confirmation: names property + database; relation adds "Its links to rows of “X” go with it."; unsaved new property goes without asking | PR #573 (#524) |
| Page fallback keeps to the sidebar's workspace (`web/src/pageFallback.ts`), waits for workspaces, no re-navigate on empty state | PR #575 (#571) |
| Views lock routes are **closed** to agents (not a gap); gapBudget stays 10; same for spec 013 PR 2 personal-state routes | Claude's call (gap = "not yet"); docs/decisions.md 2026-11-04 |
| Locked database page hides Filter/Sort/Group until spec 013 PR 2 | Helper's choice, Claude's recommendation; owner not answered → stated in PR #576 |
| Deleting a property a locked view uses is refused (`property_in_locked_view`) | Conductor review → helper option (b) |
| Dutch strings of #576 kept as the helper wrote them | Owner not answered; stated in PR #576 |
| Umbrel: Umbrel's own login **off** (`PROXY_AUTH_ADD: "false"`); cost (first visitor becomes admin) said in the app description and wiki | Owner "A off" |
| Cross-origin check for every setup (`server/crossorigin.go`, Go `http.CrossOriginProtection` + `X-Forwarded-Host`/public-address fallback; bearer, `/mcp/{token}`, OAuth machine routes, two anonymous public routes, desktop exchange with no/null Origin exempt); fixed first, described in the PR after, no public issue before | Owner "Yes" to Claude's recommendation (b) |
| `NIGARI_TRUST_PROXY`: admin setting first ("0" = explicit off), then the variable, then off | Owner "Yes" (c) |
| Umbrel store in its own repository `neatlittlemacapps/yokogaki-umbrel` (created by the owner), drafted in `umbrel/` of nigari | Owner named the repo |
| Store id **`yokogaki`**, app id `yokogaki-nigari`, `APP_HOST: yokogaki-nigari_server_1` | Owner "A" |
| Umbrel review flow: local-only branch (option B), then pushed and PR'd with the owner's "Ok" | Owner "B", then "Ok" |
| Store icon = owner's SVG (`yokogaki-nigari/icon.svg`, served from the store repo); nigari's own logo everywhere = #322, next, with a short plan | Owner "do A" |
| Registry row **Cross-origin requests** (since 2026-11-05) | Rule 5 |

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
- Priority read from the run log (option A) / screenshots (B) → labels mirrored by the Action (C).
- Claude dispatching the board sync → the Action only (rule 25).
- #269 "Empty" for person/link/sub-task → "Add person" / "Add link" / "Add sub-task".
- #278 compare by computed style → compare token names (one name per colour).
- One spec for epic #426 → two specs (012, 013). Schema-wide column order → per view. Lock for admins only → anyone who can edit.
- #270 Settings in embeds and a Layout item → left out (spec 012 R9, R10).
- R10 reason "#22 removed view settings from embeds" → "embeds will own their views (spec 014)".
- Spec 012 catalogue 14px vs 15px comparison → 14px only.
- #371 into spec 013 (Claude's first plan) → spec 014.
- Embed Settings option B1 (all view settings on shared views) / B2 (minus rename/move/remove) → embed-owned views (owner's model).
- Umbrel brief "leave all changes uncommitted" → local branch (B) → pushed with the owner's "Ok". Store draft id `neatlittlemacapps` → `yokogaki`. Store repo name `umbrel-apps` (Claude's suggestion) → `yokogaki-umbrel` (owner). Store pin 2.1.14 → 2.1.15.
- ❌ Umbrel's own login on with a path allowlist (option B). ❌ The WebSocket library's origin check (Host-only). ❌ A CSRF token in every request. ❌ Bypassing `/api/desktop/exchange` entirely (only no/null Origin passes).
- ❌ Bugs-first option B. ❌ `nl.machine.json`. ❌ 3+ parallel streams.
- ❌ Committing the CodeGraph index (25 MB, machine-specific). ❌ A repository `.mcp.json` for CodeGraph. ❌ An external database/R2/salt.md integration/custom graph engine (user's constraint).
- ❌ Community Go/security/Flutter/mobile/AWS plugins. ❌ GitHub Pages docs site now (later as #326); own domain.
- ❌ Spec 004 leftovers (backlog #279–#282); DuckDB, Mantine as app library, shadcn/ui, Storybook, uPlot, Recharts, ECharts; widening `ALLOWED_NON_TOOLS`; looser pixel tolerance; baselines by a CI bot; down migrations, Litestream, upgrade-on-read.

## 8. Data & facts (exact)

**Repo and tooling**
- Go 1.27.2 local, CI 1.27.3; Node 22.22.0. `modernc.org/sqlite` v1.60.1; Playwright 1.63.0; Chart.js 4.5.1; goose v3.29.0; BlockNote 0.51.4 (`@blocknote/core`, `/react`, `/mantine`); Base UI Select (`@base-ui/react/select`).
- Go module `nigari`; `server.Version = "2.1.0"` in `server/backup.go` (the version line; patch = last + 1) (releases stamp the tag); DB `nigari.db`; newest upgrade step 1.
- `nigari version` prints `<release> (upgrade step N)`; a `-ldflags "-X nigari/server.Version=dev"` build prints `dev (upgrade step 1)` and has no update check.
- Locales: de/es/nl 1233 entries each after #424 (measured 2026-11-02: +4 new "Empty", "Add person", "Add link", "Add sub-task"; −3 old "＋ Person", "＋ Link", "+ Sub-task"). German and Dutch use informal address.
- Constitution 1.2.0. 34 MCP tools; `gapBudget` 10; 19 registry rows (new: "Menu icons", since 2026-11-03).
- Budgets (`web/tokens/budgets.json`, after v2.1.0): rawButtons 271, zIndex 40, radius 252, fontSize 374. Component token `menu.icon-size` 16px. Bundle cap `check-bundle.mjs` 590,146 B gzip; main chunk ~17.2 KB under it.
- Spec 010 tests: `web/tests/menu-icons.mjs`, `web/tests/menu-keyboard.mjs` (new); updated menus-and-arrows, dialog-escape, design-system-dialog, side-peek, trash-navigation, database-toolbar-menus, tabs, chart-*.mjs, catalog.mjs. gofmt-exempt: `server/server.go`, `server/audit.go`, `server/desktop_auth.go`, `server/tunnel_update_test.go`.
- `check-names.mjs`: 382 old names in 49 allowlisted files. `check-upgrades.mjs` 7 cases. `check-storagemove.mjs` 14 cases. `check-columnenter.mjs` 17 cases (new). `scripts/test-install-move.sh` (bash) 4 cases.
- New this chat: `web/tests/empty-values.mjs` (#269), `web/tests/chart-colours.mjs` (#278), `web/scripts/check-chartcolours.mjs` (37 rules). check-i18n: `GERMAN_LINE_STRONG` + self-test cases (#427).
- Container quirk (this cloud env): `NO_PROXY`/`no_proxy`/`npm_config_noproxy` list `registry.npmjs.org` and `proxy.golang.org`, which have no DNS here; prefix npm/go/test commands with `export NO_PROXY=localhost,127.0.0.1 no_proxy=localhost,127.0.0.1 npm_config_noproxy=localhost,127.0.0.1`. Setup-script line given to owner: `npm_config_noproxy=localhost,127.0.0.1 npm install -g @colbymchenry/codegraph@1.6.2 && codegraph telemetry off && codegraph install --target=claude --location=global --yes` (owner: "Done").
- New browser tests (earlier): `web/tests/chart-redraw.mjs` (#368/#319: 1 build for a new chart view on 20 rows; old code built 3), `web/tests/column-enter.mjs` (#317). `chart-each-row.mjs` checks swatches (#318). `catalog.mjs` waits for "Banana" highlighted (#375).
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
| v2.1.1 | #423 (board Priority → labels) | 2026-11-02 |
| v2.1.2 | #424 (#269 empty values) | 2026-11-02 19:27:02 |
| v2.1.3 | #425 (#278 chart colours) | 2026-11-02 20:05:48 |
| (v2.1.4–v2.1.6) | #428, #470, #472 | not checked individually |
| v2.1.7 | #474 (#473 read-only aggregate) | 2026-11-03 06:09:28 |
| v2.1.8 | #528 (spec 012 part 1) | 2026-11-03 15:32:31 |
| v2.1.9 | #533 (spec 012 part 2) | 2026-11-03 20:38:18 |
| v2.1.10 | #523 (spec 013 docs) | 2026-11-03 (CI and Release green) |
| v2.1.11 | #570 (spec 014 plan/tasks) | 2026-11-04 15:16:05 |
| v2.1.12 | #573 (#524 delete-property confirmation) | 2026-11-04 16:59:45 |
| v2.1.13 | #575 (#571 workspace empty state) | 2026-11-05 08:19:30 |
| v2.1.14 | #576 (spec 013 PR 1 views lock) | 2026-11-05 17:05:09; Release run 42070584001 green; image amd64 + arm64 (index `sha256:30f51db57a3f3e08520b67297fad914940cc7095ea07a7528d0aa9374154ce47`), runs as uid 1000 |
| v2.1.15 | #579 (origin check, `NIGARI_TRUST_PROXY`, Umbrel store) | Release run 42093659270 started 2026-11-05 19:24:58; image index `sha256:73eff6999e35d9437d2b13684ab12908520906b082ecf38e95092186f0b1bc73` (amd64 + arm64); `nigari version` = `2.1.15 (upgrade step 2)` |
| (v2.1.16, v2.1.17 expected) | #580 (store pins 2.1.15), #581 (store icon) | not checked; store files only |
| v2.1.18 | #583 (#322 nigari's own logo) | 2026-11 |
| v2.1.19 | #584 (spec 013 PR 2 personal filter/sort) | 2026-11 |
| (v2.1.20 expected) | #586 (BoardView.tsx out of CollectionView.tsx) | not checked |
| v2.1.21 | #587 (spec 013 PR 3 quick filters + lanes) | 5 binaries + SHA256SUMS |
- v2.0.5–v2.0.7 (#369 and the user's two release-notes edits) not checked individually. #376's release (expected v2.0.11) not checked.
- Releases page: https://github.com/neatlittlemacapps/nigari/releases. Assets `nigari-<os>-<arch>` + `SHA256SUMS.txt`. Image `ghcr.io/neatlittlemacapps/nigari`. No desktop app published (#323).

**Specs**: 008, 010, 011, 012, **013** done (PR 1 #576, PR 2 #584, PR 3 #587; parent #477 closed). **014** `specs/014-embed-own-views/`: plan, research R1–R13, data model, contracts, quickstart, 36 tasks (#534–#569 under #371); PR 1 (T001–T004, #524) merged as #573; PR 2 (T005–T020, #538–#553) and PR 3 (T021–T036, #554–#569) not started; next.

**Spec 013 PR 1 as shipped** (build stream's measurements): main chunk 583,515 B gzip (6.5 KB under the 590,146 cap); fontSize 366, rawButtons 265; upgrade step 2 (`collections.views_locked_by`, `views_locked_at`; fixture `server/testdata/upgrade/step-1.db`); routes `PUT`/`DELETE /api/collections/{id}/lock` (session-only, closed to agents); errors `views_locked` 409, `property_in_locked_view` 409; menu icons `LockKeyhole`/`LockKeyholeOpen`; registry row **View lock**; tests `view-lock.mjs`, `activity-views.mjs`, `TestEveryViewDoorIsRefusedWhileLocked`. Conductor audit: marker 26px, focus ring 6.54:1 light / 6.64:1 dark.

**New this chat**: `web/src/pageFallback.ts` + `check-pagefallback.mjs` (10 cases); `web/tests/property-confirm.mjs`; #571 case in `web/tests/trash-navigation.mjs`.

**Embed today (spec 014 context)**: `database` block (`web/src/blocks.tsx`, `databaseSpec`) props `collectionId`, `local` (JSON `{viewId, views:{<viewId>:{filters,sort}}}`), `chartKind`; MCP `embed_database` (`server/mcp_pages.go` `mcpEmbedDatabase`) writes `local.viewId`; `get_page`/export render the block as `[Collection](/p/<id>)` (`server/export.go`); public page as `▦ Collection` link. Server never reads Yjs; `pages.content` is the browser's debounced copy (spec 014 research R2).

**Umbrel (shipped 2026-11-05)**
- Store repo `https://github.com/neatlittlemacapps/yokogaki-umbrel` (`main`; commits b795871, b51abf8, 3f63170, all authored Claude); same files in nigari `umbrel/` (`umbrel-app-store.yml`, `yokogaki-nigari/{umbrel-app.yml, docker-compose.yml, icon.svg, data/.gitkeep}`, `README.md`). Copy changes to both.
- Compose: app_proxy `APP_HOST: yokogaki-nigari_server_1`, `APP_PORT: 8420`, `PROXY_AUTH_ADD: "false"`; server image `ghcr.io/neatlittlemacapps/nigari:2.1.15@sha256:73eff6999e35d9437d2b13684ab12908520906b082ecf38e95092186f0b1bc73`, `user: "1000:1000"`, `restart: on-failure`, `${APP_DATA_DIR}/data:/data`, `NIGARI_ADDR ":8420"`, `NIGARI_DATA "/data"`, `NIGARI_TRUST_PROXY "1"`, `NIGARI_UPDATE_CHECK "0"`. Manifest `version: "2.1.15"`, `port: 8420`, `category: files`, `gallery: []` (screenshots TODO), icon `https://raw.githubusercontent.com/neatlittlemacapps/yokogaki-umbrel/main/yokogaki-nigari/icon.svg`.
- Umbrel's proxy `getumbrel/app-proxy:1.7.0` (Docker Hub; tags 1.7.0, 1.0.0, v0.5.x): keeps Host (`changeOrigin: false`), overwrites `X-Forwarded-For` with one address, strips `UMBREL_PROXY_TOKEN`, WebSockets on. umbreld `addRepository` saves the URL after the clone, before reading; an unreadable store is hidden from the list but stays stored.
- Validation (cloud container, Docker started by hand: `dockerd` as a `run_in_background` task; Docker Hub 429s, so test images were built FROM the ghcr release image): script `umbrel-validate.mjs` in the scratchpad (lost with the container). Released 2.1.15 as pinned: 10 of 10 (first run, edit, live second tab, reload, upload, `/mcp` header + `/mcp/{token}` with 34 tools, 401 + OAuth metadata, visitor IP seen). Attack from another port: 2.1.14 planted a page and read 32 socket messages; 2.1.15 refused both. Root-owned data folder → `mkdir /data/files: permission denied`.
- Not tested: a real Umbrel device's install flow, arm64 actually running, MCP OAuth sign-in in a browser, the desktop app, Tailscale. Tunnel `trust_proxy` change has no test.
- **Owner's Umbrel** (from its log, 2026-11-05): "umbrelOS for Docker v2.0.1" (dockur/umbrel); yokogaki store added and readable; a stray store `https://github.com/neatlittlemacapps/nigari` was added earlier, is unreadable (no `umbrel-app-store.yml`), hidden from the list, logs an error every ~5 min, cannot be removed in the UI.
- New code: `server/crossorigin.go` (+ `crossorigin_test.go`), `trustProxy()` in `server/ops.go`, error code `cross_origin` (de/es/nl), vite dev proxy `xfwd: true`; wiki `self-hosting.md` "Run on Umbrel", `domain.md` "Other apps beside nigari".
- App logo today (for #322): one mark `web/public/logo.svg`; `web/scripts/build-app-icons.mjs` renders `favicon`, `apple-touch-icon.png`, `icon-192/512.png`, `icon-maskable-512.png` (white tile, no own rounding, opaque, on purpose for iOS 26); in-app mark inline in `web/src/Logo.tsx` (Setup, Login, Sidebar, InviteAccept, OAuthConsent…); desktop `desktop/build/icon(.svg/.png)`, `icon-dark(.svg/.png)`. Owner's artwork: 512×512 SVG, lilac tile `#E9E1FE` rx 116 with three overlapping purple shapes `#A98AFB`, `#6542E8`, `#3A1FA6`; copy in `umbrel/yokogaki-nigari/icon.svg`.

**#322 logo (shipped #583)**
- `brand/`: `mark.svg` (3 flat shapes, overlap clipped), `icon-light.svg`, `icon-dark.svg`, `mark-animation.svg` (unused; owner: "the empty screen. but leave it for now. I'll add a bunch of icons later that we'll use in specific situations."), `README.md`.
- `web/src/Logo.tsx`: clip id via `useId`; `decorative` prop (aria-hidden beside the wordmark: Login without instanceName, Setup always).
- `build-app-icons.mjs`: home-screen icons from icon-light; favicon.ico 16/32/48 PNG-in-ICO; desktop `icon.png`/`icon-dark.png` on Apple's 824 px tile, rx 185. Manifest background `#E9E1FE`, theme `#f7f6f3`. Deleted `desktop/build/*.svg`, `desktop/icon-dark.png`.
- Inline marks with unique clip ids: `server/public.go`, `server/desktop_auth.go`, `desktop/src/connect.html`.
- `check-brand.mjs`: 6 expected copies; refuses the old mark (`96 100 204 204`, `M201.1 113.4`); requires a clip; refuses mix-blend outside comments; self-tests. Decision in `docs/decisions.md` (2026-11-09).

**Spec 013 PR 2 (shipped #584)**
- `server/viewprefs.go`: GET/PUT/DELETE `/api/collections/{id}/personal[/{scope}]` (auth + sessionOnly + canReadReq); `cleanViewState` (32 KB cap, `checkViewFilter`); max 200 states per person and database, atomic INSERT…SELECT WHERE; `mergeViewState`; `forgetViewStatesOfMissingViews`. Table `view_prefs`; scope = view id or `embed:<pageId>:<blockId>:<viewId>`.
- `server/viewpins.go`: `viewer{userID, scope}`, `viewFor`; `liveQuickFilters`. `viewScope` on `POST /api/pages` and from-template.
- `capabilities.json` `views.personal` (closed to agents; in `not_available_via_mcp`); shared fixture `server/testdata/viewstate.json` (Go and TS `mergeViewState` agree); `BenchmarkPersonalViewState`.
- Web: `viewState.ts`, `usePersonalViews.ts` (400 ms debounce, keepalive flush on pagehide + visibilitychange), `ViewChangeBar.tsx` ("Only you see these changes", Reset, Save for everyone); `check-viewstate.mjs` 37 cases; `web/tests/personal-view.mjs`.

**Spec 013 PR 3 (shipped #587)**
- `server/viewopen.go`: `checkViewQuickFilters` (select, multiselect, person, checkbox, relation; max 8; not on form/chart), `checkViewSubGroup` (board only; select, multiselect, relation, person, formula, rollup; not the effective groupBy, where none = first select); strict only when changed; `normalizeKey`. Errors `invalid_view_quick_filters`, `invalid_view_sub_group`; MCP `set_view` `quick_filters`, `sub_group_by`; 2 parity pairs (parity world gained person property `owner`); `server/viewquick_test.go`.
- Web: `quickFilters.ts`, `components/QuickFilters.tsx` (ui/Button + IconButton + Menu, no new primitive), `boardLanes.ts` (`check-boardlanes.mjs` 31 cases; cell key separator `\u001f`), `components/BoardLaneHead.tsx`, lanes in `components/BoardView.tsx`; `boardDrag.ts` `onMove(rowId, toCol, fromCol)`; menu icons quickFilters Zap, subGroup Rows2 (98 distinct functions).
- Tests `web/tests/quick-filters.mjs`, `board-lanes.mjs`; `view-lock.mjs` expects Filter and Sort to stay while locked. Wiki `views.md`, `mcp-tools.md`; `docs/what-it-does.md`.
- Known gap (in the wiki): dragging a card does not scroll the page to an off-screen lane.

**Open issues** (2026-11-05; #322, #477, #496–#522 closed since)
| # | Title |
|---|---|
| 371 | Embed has its own views (spec 014), priority:1, in-progress (feature still open) |
| 476 | Saving views ignores a failed schema load (bug) |
| 525 | Catalogue Select keyboard step failed on main again (bug) |
| 526 | German comment in CollectionView.tsx passes check-i18n (bug) |
| 527 | Muted sidebar/header text 4.43–4.49:1, light theme (bug) |
| 529 | menu-icons.mjs fails ~half the time at the page ⋯ (bug) |
| 530 | saveConfig sends the whole views array and rolls back to its own snapshot (bug) |
| 531 | Filter/sort/group buttons lack aria-expanded |
| 532 | A document ending with a database opens with that block node-selected (bug) |
| 572 | Shared confirm dialog: no initial focus, focus escapes, no name, danger drawn like Cancel (bug; fix: route through `ui/AlertDialog`) |
| 574 | A menu opened just before its database's config reloads is not closed by Escape (bug) |
| 370, 323, 326, 379 | backlog |
- Closed in #17: #524, #571, #534–#537, #478–#495. Closed in #18: #578 (Umbrel). #322 has its store icon only (PR #581 "Part of #322").

## 9. People, terms & names
- **People:** the user (`neatlittlemacapps`, Frank De Graeve); upstream maintainer "Jeremia" (`jeremiaa`).
- **Terms:** surface = registry row; gap = person can, agent can't; budget = count that only goes down; gate = `scripts/agent-gate.sh`; stream = a parallel work line; conductor = Claude; steward skill = `.claude/skills/steward/SKILL.md`; upgrade step = a numbered goose step; column head = a column's first block; Each row = chart grouping `__row`; code graph = CodeGraph index.
- **Repo:** `neatlittlemacapps/nigari`.
- **Sessions:** this conductor `session_01GhcW37HJ35bLUDWA4gX12z`; previous conductors `session_01GhcW345K7zwmfiPaw1Eoz3` ("Nigari handoff continuation"), `session_01GhcW33CqnUj9FDCkkAFdFE` ("17 Nigari"); helper stream B for spec 013 `session_01GhcW33DagCpbrFHHXQVrFu` (stopped; work merged in #576); older: `session_01GhcW351E6Ld6xR87qCbfon`, `session_01GhcW34o8KcL5EYGzn6ddSJ`, `session_01GhcW33zUfch6tMG6ga8nJc`.
- **Branches:** `claude/handoff-14` = main `f62ff3d` (merge of #587) plus the handoff #19 commit; retired by rule 31 (owner may delete it). This handoff is on `claude/steward-branch-per-pr`, bound for `main`. #586's branch `claude/serene-archimedes-87plg8` merged. Merged, to be deleted by the owner (Branches page → 🗑): `claude/fix-571`, `claude/spec-013-build`, `claude/spec-012-views`. Old: `claude/pensive-turing-plu40r`.
- **Key files:** `web/src/components/ChartFigure.tsx`, `ChartView.tsx`, `web/src/chartTheme.ts` (`groupColourTokens(drawn, palette, groupProp, series)`), `web/src/columnEnter.ts` (`columnEnterAction`, `columnEnter`), `web/src/blocks.tsx` (`columnsSpec`), `web/src/keys.ts`, `web/src/components/Editor.tsx` (`column.enter` shortcut), `web/scripts/shoot-wiki.mjs` (`text` step), `.claude/hooks/codegraph.sh`, `.claude/rules/codegraph.md`, `server/upgrade.go`, `server/backup.go`, `docs/decisions.md`, `web/src/menuIcons.ts`, `web/src/ui/Menu.tsx` (+ `Menu.css`), `web/scripts/check-menu-icons.mjs`, `web/src/components/SidebarMenus.tsx`, `CollectionMenus.tsx`, `UserMenu.tsx`, `web/src/keys.ts` (`menuOwnsKey`), `web/src/dialog.tsx`.
- **Terms (new):** option B = menus rebuilt on Base UI; menu function = the verb an item does (one icon each); hand-built button = a raw `<button>` counted by the rawButtons budget.

## 10. Work state
| Item | Status | Location | Notes |
|---|---|---|---|
| Spec 013 PR 1 (views lock + log) | merged, v2.1.14 | PR #576 | |
| Umbrel: origin check + `NIGARI_TRUST_PROXY` + store | merged, v2.1.15 | PR #579, issue #578 | |
| Umbrel store pinned to 2.1.15 | merged | PR #580; `yokogaki-umbrel` b51abf8 | |
| Umbrel store icon | merged | PR #581; `yokogaki-umbrel` 3f63170 | Umbrel refreshes stores every 5 min |
| #322 nigari's own logo | merged, v2.1.18 | PR #583 | animation + situational icons wait for the owner's assets |
| Spec 013 PR 2 personal filter/sort | merged, v2.1.19 | PR #584 | |
| BoardView.tsx refactor | merged | PR #586 | from Claude's suggested task, other session |
| Spec 013 PR 3 quick filters + lanes | merged, v2.1.21 | PR #587 | spec 013 finished |
| Spec 014 PR 2/3 | not started | `specs/014-embed-own-views/tasks.md` | next |
| Open PRs / helpers / check-ins | none | — | clean stop |

## 11. Next steps
1. **Next action:** check the steward PR (branch `claude/steward-branch-per-pr`: rule 31 + this handoff) is merged; then spec 014 PR 2 on new branch `claude/spec-014-pr2` (T005–T020, #538–#553): label `in-progress`, CodeGraph on the embed block and spec 013's `view_prefs` scope `embed:…`, Sonnet executes mechanical steps (rule 30), Claude reviews, `/code-review`, `ux-ui-audit`, ask before the PR.
2. Then spec 014 PR 3 (#554–#569); bugs by priority (#572, #574 and the older ones).
3. When the owner sends them: the empty-screen animation (`brand/mark-animation.svg`) and situational icons.

## 12. Open questions ⚠️
- Has the owner installed nigari from the yokogaki store, and does the icon show? (not confirmed)
- Remove the stray `https://github.com/neatlittlemacapps/nigari` store from the owner's Umbrel? Claude offered to work out a command (Umbrel runs in Docker); not answered.
- File an issue for the older, minor login CSRF through the desktop code exchange (sandboxed iframe over plain HTTP; not made worse by #579)? Asked twice, not answered.
- Unanswered from earlier: Dutch strings of the lock (stated in PR #576). (Filter/Sort now stay on locked databases since #584.)
- #572 and #574 have no board priority yet.
- Delete the stray label `surface:performance` and merged branches `claude/fix-571`, `claude/spec-013-build`, `claude/spec-012-views` (owner).

## 13. Re-attach checklist
Nothing to attach. This file is `docs/handoffs/handoff-nigari.md` on `main` of `neatlittlemacapps/nigari` once the steward PR merges (until then on branch `claude/steward-branch-per-pr`). Start the new Claude Code session on **`neatlittlemacapps/nigari`**; whatever branch it is handed, work goes on a new branch per pull request (rule 31).

---
<sub>Audit: 13/13 sections · 31 rules · 136 corrections · ~600 data points · secrets removed: none found (test accounts invented and documented) · generated by active-memory</sub>
