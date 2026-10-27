# active-memory handoff: salt.md agentic setup and feature roadmap

**Handoff #6** · 2026-10-27 · Lineage:
- **#1 (2026-10-25):** agentic setup (rules, gate, Spec Kit, parity manifest); four feature branches merged; 25 issues; three specs.
- **#2 (2026-10-26):** find-and-replace edits (#13, PR #48); specs 001/002 planned; #47 fixed; surfaces registry, board sync, ruleset (PR #49).
- **#3 (2026-10-26):** board derives its columns (PR #74); spec 002 tasks (#50–#73); storage benchmarks; fixes #75, #76; Codespaces (PR #77).
- **#4 (2026-10-26/27):** spec 002 finished (PRs #80, #81, #83); read pool (#84); fast reads (#85); tag colours (#86).
- **#5 (2026-10-27):** spec 001 batch 1 (tasks #87–#126, PRs #127/#128/#129); spec 004 (charts) written; local Mac test; #130 fix; feedback issues #131–#134; upstream plan agreed.
- **#6 (2026-10-27):** owner answered all open questions; plan steps 1–4 shipped: PR #135 (#130), #137 (upstream sync, #136), #138 (#134 Escape), #159 (spec 005, #139–#158), #176 (spec 006, #160–#175).

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
- **Standing way of working** (user, 2026-10-26): "from here on out, you should indeed ensure you think about all aspects of the code in relation to my feature requests." / "When a feature request introduces some new concept (like but not excluding the design system) you should add it to the pool of things to think about when specking new features."
- **Also:** "I want you to be able to do as much as possible yourself"; "ensure you have good board and issue hygiene".
- **2026-10-27:** "I want you to ignore the maintainers comments unless they really make sense for us as well. I basically want to implement the functionality on our end. I don't care about pushing it back to them".

## 2. About the user (as relevant to this work)
- GitHub `neatlittlemacapps` (id 60575307), display name "Frank De Graeve"; owns `neatlittlemacapps/salt.md`, a public fork of `saltmd/salt.md` (AGPL-3.0); CLA signed upstream.
- Works mostly from a phone (Claude app, iPhone), also the Claude desktop app on a Mac. Designer/PM, not a developer.
- Answers each step with a terse "Ok". Auto-merge now merges PRs within minutes of green.
- Local Mac test install: repo at `~/Documents/Salt/salt.md`; data `~/salt-demo`; run `SALT_DATA=~/salt-demo SALT_ADDR=:8420 ./salt`, open `http://localhost:8420` (http, not https); seed with `SALT_SEED_URL=http://127.0.0.1:8420 node web/scripts/seed-wiki-instance.mjs`.
- GitHub settings: Actions on; auto-merge enabled; `BOARD_TOKEN` secret, `BOARD_PROJECT`=5.

## 3. Style & communication
- **Language:** English.
- **Tone:** direct, plain, no filler.
- **Reply length:** short (phone screen). Lead with the answer; detail only when asked.
- **Formatting:** short lists and small tables; numbered steps with exact tap/click paths for anything the user does by hand; shell commands in code blocks with full paths.
- **"Explain X":** per option: gains, costs, effort; then one recommendation.
- **Working style:** each step ends with "Ready to continue with <next step>?" and waits for the user's go; a short status line when the user hasn't heard from Claude in a while during a long turn.
- **Avoid:** recaps of steps; long explanations before the result.

## 4. Hard rules (word for word)
1. "Use spec-kit but indeed also a board to to track the work"
2. "Fold them into here so the functionality is in here too (those branches)"
3. Pushing: routine pushes to the working branch are fine; opening a PR is asked for ("Ready to continue with opening the PR?"). PRs get auto-merge (user, 2026-10-27: "yes").
4. Repo rules in `AGENTS.md` and `.claude/rules/` apply. A Stop hook runs `scripts/agent-gate.sh` plus a git-check (uncommitted or unpushed work fails it).
5. "ensure you think about all aspects of the code in relation to my feature requests". A new concept goes into `.specify/memory/surfaces.md`.
6. Never work around a classifier denial (CI bypass, self-modification, destructive git). Tell the user and give them the manual step.
7. Commit authorship: before the first commit `git config user.name neatlittlemacapps` and `git config user.email 60575307+neatlittlemacapps@users.noreply.github.com`; trailers `Co-Authored-By: Claude …` and `Claude-Session: …`. A Stop hook keeps asking to re-author as Claude; Claude declined (AGENTS.md, CLA) and left it as the user's call.
8. "ensure you have good board and issue hygiene": label `in-progress` when starting (remove it when done or stopped); tick tasks in `tasks.md` in the PR that does them; `Closes #N` for every finished task issue; file an issue for every bug or finding; nobody moves cards.
9. After opening a PR: enable auto-merge; `subscribe_pr_activity`; one `send_later` check-in ~50 min later; on CI red fix and push; on merge cancel the check-in, remove `in-progress` from the feature issue, and fast-forward the working branch (`git push origin origin/main:refs/heads/<branch>` when the branch is inside main).
10. "I want you to ignore the maintainers comments unless they really make sense for us as well. I basically want to implement the functionality on our end. I don't care about pushing it back to them"

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
| 10 | Spec 003 merged with 20 task issues open | Issue and board hygiene (rule 8), automated |
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
| 22 | (self) Unmeasured bundle baseline 790,888 B | `main` measured 528,706 B gzip; cap 590,146 B |
| 23 | (self) Committed catalogue baselines from the container | Reference shots drawn on the same CI runner; a difference is a warning |
| 24 | (self) `\s*` before a lookahead in `check-tokens.mjs` | Each lookahead carries its own `\s*`; shadow budget 94 → 59 |
| 25 | (self) `git reset --hard` + force-push (blocked) | Fast-forward: `git push origin origin/main:refs/heads/<branch>` |
| 26 | (self) `setsid` in `.devcontainer/start.sh` failed on a Mac | `nohup` fallback (#130, PR #135) |
| 27 | (self) Told the user `localhost:8420` without http | Say `http://localhost:8420` |
| 28 | (self) A mutation `sed` removed the opt-outs from 5 files; backup covered 2 | Back up every file a mutation touches; restore all of them |
| 29 | (self) `check-tokens` counted a `[role="dialog"]` selector as a hand dialog | Find the panel by `[aria-modal="true"]`; never `token-ok` to dodge a counter |
| 30 | (self) A Playwright block that could never run (native selects) | Delete vacuous test code; a test must be able to fail |

## 6. Decisions
| Decision | Why |
|---|---|
| Spec Kit 1.2.3 + GitHub Projects board (project 5) | User's call |
| `AGENTS.md` shared; `CLAUDE.md` gitignored | An earlier `CLAUDE.md` leaked deployment details |
| Parity manifest + `check-parity.mjs`; `gapBudget` ratchet | Agent parity |
| SQLite; read pool `s.rdb` beside writer `s.db` | Spec 002 |
| Board derives Status; a ticked task closes its issue | Hygiene |
| Auto-merge on for Claude's PRs | User 2026-10-27 |
| #78: leave search as is (CI p95 122.8 ms); revisit with option b | User 2026-10-27 |
| #26: the open editor applies outside writes; all outside writes; today's path with no editor | User 2026-10-27 |
| #132: column order per view, like widths | User 2026-10-27 |
| #133: no manual order in a board column; sort decides | User 2026-10-27 |
| Peek: side peek first, centre peek in a follow-up PR | User 2026-10-27 |
| Upstream sync: fork's `database_templates` is the third action-decided tool in the read-only gate | Upstream switched to a reading-tools allowlist |
| #134: Escape/Tab trap/focus return in `useExclusiveModal`; topmost only; menus and `DialogHost` `preventDefault` | Option A of the issue |
| Spec 005: armed "is" with one value pins, in stored form; template → view → explicit; match by the rows query's SQL; toast with Open; AND list only; agent answer names view by id | Claude's defaults, stated, not objected |
| Spec 006: GitHub alerts, `<details>`, `---/***/___`, `[[toc]]`, `[[subpages]]`, `<url>`, pandoc `:::` columns; bare URL stays a link; old `> 💡` read as callout; toggle headings and embedded collection out of scope | Claude's defaults, stated, not objected |
| Spec numbering: 005, 006 on main (004 charts lives on `claude/keen-hopper-9joiox`) | Avoid a clash |

## 7. Changed / rejected
- Earlier chats: decisions page in workspace → `docs/decisions.md`; Go token file dropped; SQLite 3.54.x → driver v1.60.1; fixed surfaces list → registry; force-push rebase → merge `main`; hand-moved cards → derived Status; one shared connection → writer + read pool; per-target rollup reads → batched `IN`; separate COUNT → `COUNT(*) OVER ()`; search join by `chunk_id` → `fts_rowid`; bundle baseline 790,888 B → 528,706 B; committed catalogue baselines → reference drawn per run; 2% pixel tolerance → anti-aliasing allowance + 25-pixel limit; `web/src/catalog/` → `web/catalog/`; `Dialog` `open`/`onOpenChange` → `onClose`.
- No auto-merge → auto-merge on (user answered).
- Pushing features upstream → not wanted (rule 10).
- Fork's `web/tests/toolbar-menus.mjs` → `database-toolbar-menus.mjs` (upstream kept the name).
- Spec 005 notice as a dialog → toast; view name in agent answers → view id.
- ❌ DuckDB, Mantine as app component library, shadcn/ui, Storybook; generic code knowledge graph, agent teams for now, permanent hosted demo; GitHub's built-in project workflows alone; widening `ALLOWED_NON_TOOLS`; #78 options a/b (for now); declaring muted text "large/UI" to pass contrast; a visually hidden close button; a looser pixel tolerance; baselines committed by a CI bot; the maintainer's account-level-only side panel for #92.
- ❌ Spec 005: picking a value from a range or set; pins computed in the browser.
- ❌ Spec 006: a Markdown library (goldmark); a bare URL as a bookmark.

## 8. Data & facts (exact)

**Repo and tooling**
- Go 1.27.2 local, CI 1.27.3; Node 22. `modernc.org/sqlite` v1.60.1 (SQLite 3.53.4). `@base-ui/react` 1.9.0; Playwright 1.63.0 in web/tests.
- CI jobs: `Build and test` (required), `Component catalogue`, `Storage benchmarks`, `sync`, `cla` (skipped in fork).
- Parity manifest: 45 capabilities, 146 routes, 34 tools, `gapBudget` 10. check-wiki: 40 pages, 34 tools, 145 routes.
- gofmt-exempt: `server/server.go`, `server/audit.go`, `server/desktop_auth.go`, `server/tunnel_update_test.go`.
- Browser tests in `web/tests/package.json`: 24. Check scripts in `npm run check`: 16 (`check-modal.mjs` added).
- Locales: `de.json` / `es.json` 1098 entries each, 0 untranslated.
- `web/tokens/budgets.json` (spec 001): color 399, fontSize 377, radius 256, shadow 59, zIndex 45; rawButtons 332; handDialogs 23; bundleGzip 590,146.
- The full gate takes ~10 min: run it in the background (`scripts/agent-gate.sh > log; echo exit $? >> log`).

**Upstream (`saltmd/salt.md`)**: fork contains upstream main up to `2ee1efc` (+ `521a2fc` CLA commit). Remote `upstream` must be re-added in a new container: `git remote add upstream https://github.com/saltmd/salt.md && git fetch upstream main`.

| Upstream # | Topic | Fork status |
|---|---|---|
| 84 | Markdown for slash blocks | done (spec 006, PR #176) |
| 85 | Full width as own column | not started (plan step 6) |
| 86, 89, 90 | collection picker, columns, database templates | in fork earlier |
| 91 | New row takes view filter values | done (spec 005, PR #159) |
| 92 | Open pages in side/center peek, per view | next (plan step 5) |
| 93 | Component layer | done differently (spec 001) |
| PR 100 | Embedded database round trip | not taken; out of scope of spec 006 |

**Measured this chat**
- `BenchmarkCreateRowWithView` (1k-row seeded db, 300 iterations): plain mean 1.50 ms / p95 1.89 ms; with view 1.95 / 2.69 ms.
- `BenchmarkMarkdownLargePage` (5,000 blocks, medians of 6): read 39.6 → 39.1 ms; write 21.1 → 20.2 ms.
- Match-check plans: `SEARCH pages USING INDEX sqlite_autoindex_pages_1 (id=?)`; `SEARCH collections USING INDEX sqlite_autoindex_collections_1 (page_id=?)`.

**Codespaces / screenshots**
- Test account (invented): `ada@example.com` / `WikiPruefung2026!`.
- Retake: `cd web && npx vite build`; `go build -o <scratch>/salt-shot .`; run on 127.0.0.1:8421 (data dir seeded once with `SALT_SEED_URL=http://127.0.0.1:8421 node scripts/seed-wiki-instance.mjs`), fresh instance on 8422 only for `setup-welcome`; `ln -sfn /opt/node22/lib/node_modules/playwright web/node_modules/playwright`; `SALT_SHOOT_URL=… SALT_SHOOT_FRESH_URL=http://127.0.0.1:8422 SALT_SHOOT_EMAIL=… SALT_SHOOT_PASSWORD=… node scripts/shoot-wiki.mjs <ids>`; afterwards remove the symlink, `git checkout -- .github/hero.png`, `pgrep -x salt-shot | xargs -r kill`.
- 58 wiki screenshots (29 × light/dark). Any change to a file in a shot's `shows` list (e.g. `server/mcp.go` → `agents-connect`) makes it stale.

## 9. People, terms & names
- **People:** the user (`neatlittlemacapps`, Frank De Graeve); upstream maintainer "Jeremia" (`jeremiaa`).
- **Terms:** surface = a registry row; gap = a person can, an agent can't; budget/ratchet = a count that only goes down; gate = `scripts/agent-gate.sh`; registry = `.specify/memory/surfaces.md` (14 entries); read pool = `s.rdb`; writer = `s.db`; pins = values a view's filters pin down (spec 005); spellings = Markdown forms of blocks (spec 006).
- **Branches:** `claude/vigilant-babbage-bvoiel` = working branch, equal to `main` at `4f27f1f` plus this handoff; `claude/keen-hopper-9joiox` holds spec 004 (`specs/004-chart-view/`) and handoff #5; `claude/start-macos` merged.
- **New code names:** `server/viewpins.go` (`pinsFromFilters`, `rowPinsForView`, `rowMatchesView`, `rowMatchesFilters`, `viewFiltersNow`, `viewMatchNote`, `propsInView`, `mergePins`); error code `view_not_in_database`; `server/md_spellings.go` (`alertEmoji`, `emojiAlert`, `containerEnd`, `columnSections`, `columnsWidthsProp`, `leadingCalloutEmoji`); `mdLinesToBlocks`, `columnsFromSections`, `renderColumnsMarkdown`, `blockSpellingHint`; `web/src/modalKeys.ts` (`trapStep`, `escapeTarget`, `FOCUSABLE`); `useExclusiveModal(onClose, { escape?, focus? })`; `toast(message, action?)`.

## 10. Work state
| Item | Status | Location | Notes |
|---|---|---|---|
| Upstream sync (#136) | merged | PR #137 | read-only gate + `typeFilters` guard fixed in the merge |
| #130 start.sh on Mac | merged | PR #135 | |
| #134 Escape in dialogs | merged | PR #138 | test: `web/tests/dialog-escape.mjs` (user-menu dialogs only) |
| Spec 005 new row filter values | merged | PR #159, `specs/005-new-row-filter-values/` | #139–#158 closed |
| Spec 006 Markdown spellings | merged | PR #176, `specs/006-markdown-block-spellings/` | #160–#175 closed |
| Spec 004 charts | spec written | branch `claude/keen-hopper-9joiox` | `/speckit-plan` not run |
| Spec 001 batch 2 | not specced | — | menus, remaining dialogs, toasts into `web/src/ui/` |
| #131 table text too small | issue | — | type scale 14px+ |
| #132 column order per view | issue, answered | — | per view |
| #133 board drop affordance | issue, answered | — | no manual order |
| #26 outside writes into an open editor | issue, answered | — | editor applies; all writes |
| #78 | closed not planned | — | |
| Upstream #92 peek | not started | — | plan step 5 |
| Upstream #85 full width column | not started | — | plan step 6 |

## 11. Next steps
1. **Next action:** spec 007 for upstream #92: per-view "Open pages in" (Side peek / Center peek / Full page; default Full page), readable and writable via `set_view`. Side peek in this feature; centre peek in a follow-up PR. File the feature issue (label `spec`, `in-progress`), write `specs/007-…/spec.md` + checklist, then plan, tasks, issues, implement, PR.
2. Plan step 6: upstream #85, full width from prop `_fullWidth` to its own column (`ensureColumn`), migrating existing values.
3. Spec 004 charts: `/speckit-plan` (spec on `claude/keen-hopper-9joiox`; bring it to main first).
4. Then the answered issues: #132, #133, #26, #131.

## 12. Open questions ⚠️
- Commit authorship: keep commits authored by `neatlittlemacapps` (AGENTS.md, CLA; GitHub shows them "Unverified"), or switch to Claude as the hook asks? Claude has kept the owner as author.
- Archive the previous session "04 salt"? (offered; no answer)

## 13. Re-attach checklist
Nothing to attach. This file is `docs/handoffs/handoff-saltmd.md` on branch `claude/vigilant-babbage-bvoiel` of `neatlittlemacapps/salt.md`. Start a Claude Code session on that repo and branch.

---
<sub>Audit: 13/13 sections · 10 rules · 30 corrections · 150 data points · secrets removed: none found (the test account is invented and documented) · generated by active-memory</sub>
