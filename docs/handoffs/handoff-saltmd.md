# active-memory handoff: nigari (formerly salt.md fork): agentic setup and feature roadmap

**Handoff #11** · 2026-10-30 · Lineage:
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
- **#11 (2026-10-29/30):** housekeeping + review rule + steward skill (PR #325 → v1.6.12); spec 011 planned, tasked (#327–#362), built and merged (PR #363 → **v2.0.0**); repo renamed to `neatlittlemacapps/nigari`; image republished as `ghcr.io/neatlittlemacapps/nigari`; README "Built on salt.md" (PR #364 → v2.0.1); backlog issues #322, #323, #324, #326; Dutch joins every translation step.

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
- **Order of work now:** (1) Dutch, #324; (2) then 2 streams: stream A = Claude (spec 008 part 2, T020–T026 = #308–#314, then spec 010 menu icons); stream B = a helper session (Epic A, database views; spec 012); (3) later epics and backlog (#322 icon, #323 desktop release, #326 docs site).

## 2. About the user (as relevant to this work)
- GitHub `neatlittlemacapps` (id 60575307), display name "Frank De Graeve"; email neatlittlemacapps@gmail.com; owns `neatlittlemacapps/nigari` (renamed from `neatlittlemacapps/salt.md` on 2026-10-30), still a GitHub fork of `saltmd/salt.md` (AGPL-3.0); CLA signed upstream.
- Works mostly from a phone (Claude app, iPhone), also the Claude desktop app on a Mac. Designer/PM, not a developer. Timezone Europe/Brussels; works in Belgium (hence Dutch). Thinks in Notion terms.
- Answers each step with a terse "Ok"/"Yes"/a letter/"go"/"done". Asks plain-language questions; catches process slips. Says when lost → give a done/todo table.
- Local Mac test install: repo at `~/Documents/Salt/salt.md`; data `~/salt-demo`. Since v2.0.0 the binary is `nigari` and variables are `NIGARI_*`: `cd ~/Documents/Salt/salt.md && NIGARI_DATA=~/salt-demo NIGARI_ADDR=:8420 ./nigari`, open `http://localhost:8420`; Ctrl+C stops. (A leftover `SALT_*` variable makes nigari refuse to start.) Install latest: `curl -fsSL https://raw.githubusercontent.com/neatlittlemacapps/nigari/main/install.sh | sh`.
- GitHub settings: Actions on; auto-merge enabled; `BOARD_TOKEN` secret, `BOARD_PROJECT`=5. The user taps merge on every PR.

## 3. Style & communication
- **Language:** English replies. Translations: German, Spanish, and Dutch from now on.
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
4. Repo rules in `AGENTS.md` and `.claude/rules/` apply. A Stop hook runs `scripts/agent-gate.sh` plus a git-check (uncommitted or unpushed work fails it). Stale wiki screenshots fail the gate: retake before stopping.
5. "ensure you think about all aspects of the code in relation to my feature requests". A new concept goes into `.specify/memory/surfaces.md`.
6. Never work around a classifier denial (CI bypass, self-modification, destructive git, enabling auto-merge, deleting scheduled tasks, copying protected `go.sum`, chroot into an image). Tell the user and give them the manual step.
7. Commit authorship (owner, 2026-10-28: "Claude"): commits authored by `Claude <noreply@anthropic.com>`; trailers `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: <session url>`. No model identifiers in PR titles/bodies.
8. "ensure you have good board and issue hygiene": label `in-progress` when starting (remove when merged); tick tasks in `tasks.md` in the PR that does them; `Closes #N` for every finished task issue; file an issue for every bug or finding; nobody moves cards.
9. After opening a PR: `subscribe_pr_activity`; a `send_later` check-in ~50 min later; on CI red fix and push; on merge remove `in-progress`, cancel the check-in, fast-forward the working branch (`git push origin origin/main:refs/heads/<branch>`).
10. "I want you to ignore the maintainers comments unless they really make sense for us as well. I basically want to implement the functionality on our end. I don't care about pushing it back to them"
11. Every number in a doc, comment or PR is measured in the session.
12. Sonnet helpers for mechanical tasks (translations, wiki text following a page, screenshot retakes, test runs, copy-a-pattern); judgement stays on Opus; review helper output. No Haiku.
13. Anything spanning more than one surface starts with a spec/plan, even when filed as a plain issue.
14. Menu icons (owner, 2026-10-29): "menu-items should have an icon. Ensure that no 2 functions have the same icon".
15. Parallel work: "after rename go 2 streams" (conductor = Claude; helper on disjoint areas; `.claude/skills/steward/SKILL.md`); never 3+.
16. Reviews before a PR is offered (`.claude/rules/claude-code.md`): `/code-review` on every branch diff; `ux-ui-audit` after visible changes (light/dark, desktop/phone); `/security-review` for sign-in, sessions, permissions, tokens or gates. The PR names which ran and what each found.
17. Dutch (owner, 2026-10-29: "You should also include Dutch in your translation related actions from now on, not?"): every new string gets de, es and nl (`.claude/rules/i18n.md`); Dutch is reported until complete, then required.
18. Protected files (deny rules): `LICENSE`, `CLA.md`, `THIRD-PARTY-NOTICES.md`, lockfiles (only via `npm install`), `go.sum`, `wiki/img/` (only via `web/scripts/shoot-wiki.mjs`), `.github/cla-signatures.json`, `.gitignore`. Never edit or work around them; ask the user.

## 5. Corrections log
| # | Claude did | The user wanted |
|---|---|---|
| 1 | Told the user to run `/speckit-specify` in a separate session | Run Spec Kit steps directly (follow their SKILL.md by hand) |
| 2 | (self) Called token-reachable membership routes a hidden security issue | A docs contradiction; #1 option B |
| 3 | (self) Planned `server/ops_*.go` | `server/ops.go` exists → `cap_*.go` |
| 4 | (self) Counted 36 MCP tools | 34 |
| 5 | (self) Said de and es both required | Only `de.json` required; `es.json` (and now `nl.json`) reported |
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
| 52 | Wrote the name "salty.md" into spec 011 before the user checked it ("stop, lemme doublecheck the name") | Names are confirmed by the user before they go into docs |
| 53–56 | (self) Upgrade test/SQLite/audit/shadowing slips | see #10 history |
| 57 | (self) Rule-based rename sed went too far (`salt.db` in the `rename_conflict` text; "nigari.db becomes nigari.db"; "install upstream with NIGARI_REPO") | Review every mechanical replace by hand |
| 58 | (self) `check-wiki` read `"name": "nigari"` as a tool | `const mcpServerName = "nigari"` |
| 59 | (self) WAL mutation test passed with checkpoint removed | Mutation "no open at all"; then `PRAGMA journal_mode=DELETE` as the open-elsewhere check |
| 60 | (self) Release assets and `dialog-escape` still used old names | Grep outputs and events after a rename |
| 61 | (self) Merged v2.0.0 before repo rename → image went to `ghcr.io/neatlittlemacapps/salt.md` | With user's yes, ran `docker.yml` by hand (run 41021371749) |
| 62 | (self) `git remote set-url origin …/nigari` → fetch 403 | Keep remote `https://github.com/neatlittlemacapps/salt.md` (session scope; GitHub redirects) |
| 63 | README draft listed specifics | "I want the copy to read more on what differs intent wise, not the specifics" |
| 64 | README draft | "too harsh towards salt. I'm thinking in lines of where we go beyond the salt concept, like the design system and the database mechanic" |
| 65 | README draft missed the core | "I think the core is to pay extra attention to UX as well." / "but mainly its me discovering how far I can get." |
| 66 | README bullets | "ditch Every feature, everywhere…"; "ditch A deliberate way of building…"; design-system bullet reworded to the user's text |
| 67 | (self) Planned an image uid via chroot (denied) | Don't work around; reason: same adduser on same base = same uid |
| 68 | (self) `/security-review` failed on `origin/HEAD` | `git remote set-head origin main` |
| 69 | (self) Benchstat compared nothing across the module rename | Read base and head tables by hand |

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
| Every push to main = a release; a version line with no tag releases the base as is (v2.0.0), otherwise last + 1 | #265; spec 011 R11 amendment in `docs/decisions.md` |
| Notices list modules the 5 release binaries link | User: "B" |
| Spec 010: every menu item has an icon; one function = one icon app-wide; editor menus count; function = the verb | User |
| Rename option C (everything incl. internals) to **nigari**, v2.0.0, no transition; `SALT_*` without `NIGARI_*` refuses the start | User: "C", "go with \"nigari\"", "Q1 immediately", "Q2 B" |
| Database move `salt.db` → `nigari.db`: no copy before | User: "No copy" (FR-004 updated) |
| Links to `https://salt.md` → the repo's own wiki now; docs site later (#326) | User: "A now" |
| Kept as data: old `salt_` API tokens stay valid; OAuth client ids; calendar UIDs `@salt.md`; volume `salt-data` | Research R8/R14; identity/data, not names |
| Desktop app id `io.github.neatlittlemacapps.nigari`, scheme `nigari://` | User confirmed |
| Dutch: separate PR after the rename (#324) | User: "A" |
| CLA / `pull_request_target` GitHub notice: do nothing | User: "A" |
| README "Built on salt.md" section (intent, warm, UX, personal exploration) | User edits; PR #364 merged |
| Icon: backlog, the user provides artwork later (#322) | User: "put it to the backlog. I`ll provide something later" |
| Desktop release: backlog (#323) | User: "yes" |
| Review rule + steward skill | User: "Ok" (PR #325) |
| 2 streams after the rename and Dutch | User: "after rename go 2 streams" |

## 7. Changed / rejected
- Earlier chats: decisions page in workspace → `docs/decisions.md`; fixed surfaces list → registry; force-push rebase → merge `main`; hand-moved cards → derived Status; committed catalogue baselines → reference per run; hand-drawn SVG charts → Chart.js; owner as commit author → Claude.
- #263 research B → C (goose); notices from `go list -m all` → linked modules only.
- Name "salty.md" → "nigari". Rename option B → C. Transition period → none.
- Spec 008 one PR → two parts; rename right after part 1.
- R8 first version (rename calendar UIDs) → UIDs keep `@salt.md`.
- Pinning the image uid → no pinned uid (reason in a `Dockerfile` comment).
- Copy before the DB move → no copy ("No copy").
- README: feature list / harsh tone → intent-based, warm section; bullets "Every feature, everywhere…" and "A deliberate way of building…" ❌ ditched.
- Git remote `…/nigari` → back to `…/salt.md` (session scope).
- ❌ 3+ parallel streams; streams during the rename.
- ❌ Community Go/security/Flutter/mobile/AWS plugins.
- ❌ GitHub Pages docs site now (later as #326); own domain.
- ❌ Spec 004 leftovers (backlog #279–#282); DuckDB, Mantine as app library, shadcn/ui, Storybook, uPlot, Recharts, ECharts; widening `ALLOWED_NON_TOOLS`; looser pixel tolerance; baselines by a CI bot; down migrations, Litestream, upgrade-on-read.

## 8. Data & facts (exact)

**Repo and tooling**
- Go 1.27.2 local, CI 1.27.3; Node 22. `modernc.org/sqlite` v1.60.1; Playwright 1.63.0; Chart.js 4.5.1; goose v3.29.0.
- Go module `nigari`; `server.Version = "2.0.0"`; DB `nigari.db`.
- Locales: de 1217, es 1217 entries; no `nl.json` yet. German uses "du".
- 34 MCP tools; `gapBudget` 10. gofmt-exempt: `server/server.go`, `server/audit.go`, `server/desktop_auth.go`, `server/tunnel_update_test.go`.
- `check-names.mjs` ENFORCE true; `web/scripts/names-allowlist.json`: 48 files, 379 names (README 14). `check-storagemove.mjs` 14 cases. `scripts/test-install-move.sh` 4 cases (CI step "Installer move" + gate).
- Container setup per session: clone working branch, `git fetch origin main`, deepen, `git remote set-head origin main`, `cd web && npm ci && npx vite build`, `cd web/tests && npm ci`; Playwright at `/opt/pw-browsers`.
- Full gate ~10 min: `timeout 900 scripts/agent-gate.sh > log 2>&1`.
- Screenshot recipe: as before but with `NIGARI_*` variables (`NIGARI_SEED_URL`, `NIGARI_SHOOT_URL`, `NIGARI_SHOOT_FRESH_URL`, `NIGARI_SHOOT_EMAIL=ada@example.com`, `NIGARI_SHOOT_PASSWORD='WikiPruefung2026!'`; invented account), binary built to scratch, ports 8421 (seeded) and 8422 (fresh), `node scripts/shoot-wiki.mjs <ids>`.

**Releases**
| Version | PR | Published (UTC) |
|---|---|---|
| v1.6.11 | #321 (spec 008 part 1) | 2026-10-29 20:10 |
| v1.6.12 | #325 (budget, review rule, steward, 011 plan) | 2026-10-29 21:16 |
| v2.0.0 | #363 (rename to nigari) | 2026-10-30 07:27 |
| v2.0.1 | #364 (README) | 2026-10-30 07:46 |
- Image `ghcr.io/neatlittlemacapps/nigari:2.0.0` and `:latest` pushed by run 41021371749 (job 123949229536), verified in the log. Package still private until the user changes it. v2.0.1's image not checked.
- Assets `nigari-<os>-<arch>` (darwin arm64/amd64, linux amd64/arm64, windows amd64 .exe) + `SHA256SUMS.txt`.

**Spec 011 (done)**: tasks T001–T035 = #328–#362, parent #327, all ticked. Docs in `specs/011-rename-nigari/` (spec, plan, research R1–R16, data-model, contracts/refusal.md, contracts/release-notes.md, quickstart, tasks).
**Spec 008**: part 1 done; T008 (#296) recorded in PR #325 (budget 2 ms); open T020–T026 = #308–#314.

**Backlog / open issues**
| # | Title |
|---|---|
| 317 | Enter in a column block adds the new block in the next column |
| 318 | Colorful setting has no effect on bar charts that show table rows |
| 319 | Chart redraw (twice) |
| 320 | Wiki screenshots show the data directory |
| 322 | nigari needs its own icon (user supplies artwork) |
| 323 | The fork releases its desktop app (unsigned first) |
| 324 | The interface speaks Dutch (`nl.json`) |
| 326 | nigari has a docs site built from the wiki (GitHub Pages) |
- Epic A (stream B): #131, #132, #133, #18, #19, #270, #269, #279, #281, #280, #178. Epic B charts: #319, #318, #278, #277, #282, #266. Epic C: #22, #26, #24, #23. Epic D editor: #317, #267, #268. Epic E agent parity: #3–#12, #14, #16, #17.

## 9. People, terms & names
- **People:** the user (`neatlittlemacapps`, Frank De Graeve); upstream maintainer "Jeremia" (`jeremiaa`).
- **Terms:** surface = registry row; gap = person can, agent can't; budget = count that only goes down; gate = `scripts/agent-gate.sh`; stream = a parallel work line; conductor = Claude; steward skill = `.claude/skills/steward/SKILL.md`; outside names = registry row (old names something outside may still use); treatments moved / refused / gone / kept.
- **Repo:** `neatlittlemacapps/nigari` (old URL `neatlittlemacapps/salt.md` redirects; this session's GitHub tools are scoped to the old name).
- **Branches:** working branch `claude/pensive-turing-plu40r` (main `1f885c9` + this handoff); remote also has `claude/handoff-continuation-4byisr`, `claude/happy-cori-rq1bym`, `claude/keen-hopper-9joiox`, `claude/serene-planck-ie0e6w`, `claude/upgrades-research`.
- **Key files:** `server/oldnames.go` (`CheckOldEnv`, `moveOldDatabase`, `expireOldCookies`, `readManifest`), `web/src/storageMove.ts`, `web/scripts/check-names.mjs`, `install.sh` (`move_old_service`), `deploy/install.sh`, `.claude/rules/i18n.md`, `.claude/rules/claude-code.md`, `docs/decisions.md`.

## 10. Work state
| Item | Status | Location | Notes |
|---|---|---|---|
| Spec 011 rename | merged, v2.0.0 | PR #363 | done |
| README "Built on salt.md" | merged, v2.0.1 | PR #364 | done |
| nigari image | pushed, private | GHCR | user makes it public |
| Fork banner ("219 commits ahead… 28 behind saltmd/salt.md") | user asked how to remove | GitHub | user detaches fork (Settings → Danger Zone → Leave fork network, else support.github.com "detach fork") |
| AGENTS.md upstream-PR paragraph + decision entry | proposed, not started | `AGENTS.md` § Commits, `docs/decisions.md` | after the detach |
| Dutch | not started | #324 | `nl.json`, Sonnet helper, review |
| Spec 008 part 2 | not started | #308–#314 | stream A |
| Spec 010 menu icons | spec + clarify done | `specs/010-menu-icons/` | stream A after 008 |
| Epic A | proposed | section 8 | stream B (helper), spec 012 |

## 11. Next steps
1. **Next action:** ask whether the user detached the fork; if yes, a small PR removing the upstream-PR/re-commit paragraph from `AGENTS.md` § Commits and adding a newest-first entry in `docs/decisions.md` (with `/code-review`), PR asked first.
2. Dutch PR (#324): `web/src/locales/nl.json` for all 1217 strings via a Sonnet helper, reviewed; `check-i18n` reports Dutch; label `in-progress`; PR asked first.
3. Then 2 streams per the steward skill: A = spec 008 part 2 (T020–T026), then spec 010; B = Epic A helper session.

## 12. Open questions ⚠️
- Has the user detached the fork from `saltmd/salt.md` (removes the ahead/behind banner)?
- Has the user made the `nigari` GHCR package public (Profile → Packages → nigari → Package settings → Change visibility → Public)?
- Has the user pasted the v2.0.0 release notes (from PR #363's description / `specs/011-rename-nigari/contracts/release-notes.md`) into the release?
- Has the user changed `/salt` to `/nigari` in `.gitignore` (protected; Claude cannot)?
- Does the Claude GitHub App cover `nigari` so new sessions can start on `neatlittlemacapps/nigari`?
- Delete stale branches (`claude/keen-hopper-9joiox`, `claude/happy-cori-rq1bym`, `claude/upgrades-research`)? Only on the user's word.

## 13. Re-attach checklist
Nothing to attach. This file is `docs/handoffs/handoff-saltmd.md` on branch `claude/pensive-turing-plu40r` of `neatlittlemacapps/nigari` (old URL `neatlittlemacapps/salt.md`). Start a Claude Code session on that repo and branch.

---
<sub>Audit: 13/13 sections · 18 rules · 69 corrections · ~230 data points · secrets removed: none found (test accounts invented and documented) · generated by active-memory</sub>
