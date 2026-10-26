# active-memory handoff: salt.md agentic setup and feature roadmap

**Handoff #3** · 2026-10-26 · Lineage:
- **#1 (2026-10-25):** designed and built the agentic setup for the salt.md fork (rules, gate, Spec Kit, parity manifest); merged four feature branches; opened 25 issues; wrote three specs.
- **#2 (2026-10-26):**
  - built find-and-replace edits (#13, PR #48);
  - planned specs 001 and 002;
  - fixed #47;
  - added the surfaces registry, board sync and ruleset file (PR #49).
- **#3 (2026-10-26):**
  - merged #49;
  - closed #13's 20 open sub-issues;
  - made the board derive its own columns (PR #74);
  - wrote spec 002's tasks and issues (#50–#73);
  - built the storage benchmarks;
  - fixed a save that scanned the whole search index (#75) and clipped mobile menus (#76);
  - added Codespaces testing (PR #77).

## 0. Instructions for Claude (read first)

You are continuing work from a previous chat. That chat is gone; this file is the complete context and the source of truth.

1. Read this whole file before replying.
2. Follow sections 3 (Style), 4 (Hard rules) and 5 (Corrections) in every reply, for the rest of this chat. They override your defaults.
3. Use the values in section 8 exactly. Never round, re-estimate, or "correct" them.
4. Do not suggest anything listed in section 7 (Changed / rejected) again unless the user brings it up.
5. Code word: Start every reply with exactly "Yes Boss!"
6. Your first reply: at most 5 lines covering the goal, the current state, and the next step (section 11). Mention any files from section 13 that were not attached. Ask the questions in section 12 if there are any. End with "Ready to continue with <next step>?" Then wait for the user's go.

## 1. Mission
- **Goal:** take salt.md (the user's fork) "to a higher level". Drastically increase its features with an agentic coding setup that keeps the software's domains intact.
- **In the user's words:** "proper coding, holistic adjustments (think, when I add a feature, the system should also reason and tackle the fact that the mcp functionality might also need to follow), proper UI implementation, performance and testing".
- **Done looks like:** features flow spec → plan → tasks → board → implementation. Every feature reaches every surface in the registry, with the gate and CI green.
- **Standing way of working** (user, 2026-10-26):
  - "from here on out, you should indeed ensure you think about all aspects of the code in relation to my feature requests."
  - "When a feature request introduces some new concept (like but not excluding the design system) you should add it to the pool of things to think about when specking new features."
- **Also from the user:**
  - "I want you to be able to do as much as possible yourself".
  - "ensure you have good board and issue hygiene".

## 2. About the user (as relevant to this work)
- **GitHub:** account `neatlittlemacapps` (id 60575307). Display name on web-UI commits: "Frank De Graeve".
- **The fork:** owns `neatlittlemacapps/salt.md`, a fork of `saltmd/salt.md` (AGPL-3.0). The repo is public because GitHub doesn't let a fork of a public repo be private. Signed the CLA in saltmd/salt.md#87.
- **How they work:** mostly from a phone (Claude app, iPhone). Tests in GitHub Codespaces from the phone's browser. Sets GitHub settings by hand.
- **Local instance:** http://localhost:8420, workspace **Workspace** (`f6526406952b1c9b154760df965df59a`). Cloud sessions cannot reach it.
- **Background:** designer/PM. Has design-coach skills (Kernel components on Base UI, W3C/DTCG tokens) and a `saltmd` skill.
- **GitHub settings in place:**
  - GitHub Actions on; auto-merge enabled in the repo.
  - `BOARD_TOKEN` secret and `BOARD_PROJECT` variable set (= 5).
  - The board's Status options are spelled correctly.
  - Surface options include `i18n`.

## 3. Style & communication
- **Language:** English.
- **Tone:** direct, plain, no filler.
- **Reply length:** short (phone screen). Lead with the answer; detail only when asked.
- **Formatting:**
  - Short lists and small tables.
  - Numbered steps with exact tap paths for anything the user must do by hand, plus direct links when a file must be downloaded.
- **Working style:**
  - The user gives terse go-aheads ("ok", "go", "yes", "merged").
  - "Keep going until I say stop or when you really really need an answer". Do clear work without asking; ask one short question only when the decision is genuinely theirs.
- **Avoid:** recaps of steps; long explanations before the result.

## 4. Hard rules (word for word)
1. "Use spec-kit but indeed also a board to to track the work"
2. "Fold them into here so the functionality is in here too (those branches)"
3. **Pushing:** pushing to GitHub needs the user's explicit OK. Their standing "Keep going until I say stop" covers routine pushes to the working branch. Opening a PR is asked for ("Ready to continue with opening the PR?"). The user merges.
4. Repo rules in `AGENTS.md` and `.claude/rules/` apply to all code work. A Stop hook runs `scripts/agent-gate.sh` and the git-check; both must pass.
5. "ensure you think about all aspects of the code in relation to my feature requests". A new concept goes into `.specify/memory/surfaces.md`.
6. Never work around a classifier denial (CI bypass, self-modification, destructive git). Tell the user and give them the manual step.
7. **Commit authorship:** commits are authored as `neatlittlemacapps <60575307+neatlittlemacapps@users.noreply.github.com>`, with a `Co-Authored-By: Claude …` trailer. Run `git config user.name neatlittlemacapps` and `git config user.email 60575307+neatlittlemacapps@users.noreply.github.com` before the first commit.
8. "ensure you have good board and issue hygiene":
   - Label an issue `in-progress` when starting it.
   - Tick the task in `tasks.md` in the PR that does it.
   - List every task issue the PR finishes as `Closes #N`; closing a parent does not close its sub-issues.
   - File an issue for every bug or finding.
   - Nobody moves cards by hand.

## 5. Corrections log
| # | Claude did | The user wanted |
|---|---|---|
| 1 | Told the user to run `/speckit-specify` in a separate session | "Can't you run all that from here?" Run Spec Kit steps directly |
| 2 | (self) Called the token-reachable membership routes a hidden security issue | It was a docs contradiction; decided #1 option B |
| 3 | (self) Planned `server/ops_*.go` | `server/ops.go` exists → `cap_*.go` |
| 4 | (self) Counted 36 MCP tools | 33 before the merges, 34 after |
| 5 | (self) Said de and es translations are both required | Only `de.json` is required; `es.json` is reported |
| 6 | Treated "MCP must follow new features" as something to fix | It is a way of working: apply it to every request and grow the registry |
| 7 | (self) Wrote a made-up benchstat pseudo-version | Verified the real one: `v0.0.0-20261009192801-be2c69fb417e` |
| 8 | Pushed commits after the user merged #48, so they missed the merge | Watch the merge state; after a merge, restart the branch from `main` |
| 9 | Ran a tool call that edited `AGENTS.md`; the user rejected it mid-run | Wait for the user |
| 10 | Spec 003 merged with its 20 task issues (#27–#46) still open and in Backlog | "I also found certain features containing many issues are not tackled properly" / "I also don't see those items moved to spec or in progress" → issue and board hygiene (rule 8), automated |
| 11 | (self) Appended `docs/decisions.md` entries at the bottom | The log is newest first: put new entries at the top |
| 12 | (self) `pkill -f <pattern>` killed its own shell (exit 144) | Kill by `pgrep -f "name$"` or by PID file, never a pattern that matches the command itself |

## 6. Decisions
| Decision | Why |
|---|---|
| Spec Kit (pinned 1.2.3) + GitHub Projects board | User's call |
| `AGENTS.md` shared; `CLAUDE.md` gitignored | An earlier `CLAUDE.md` leaked deployment details |
| `capabilities.json` + `check-parity.mjs` + `parity_property_test.go`; `gapBudget` ratchet | Agent parity |
| #1 membership: option B | User: "1 b" |
| Keep SQLite (spec 002) | DuckDB needs cgo, downloads extensions at runtime, and has optimistic-concurrency conflicts |
| DTCG 2025.10 tokens + Base UI layer `web/src/ui/` (spec 001) | Headless; the look stays salt.md's |
| Spec 003 FR-008: **C** (reload now; live delivery = #26) | User: "1 C" |
| Decisions live in `docs/decisions.md`, newest first | User: "2 repo" |
| Surfaces registry `.specify/memory/surfaces.md` (`check-surfaces.mjs`); constitution v1.1.0 | User's way-of-working instruction |
| Ruleset for `main` (`.github/rulesets/main.json`) | User asked; imported |
| CLA check only in `saltmd/salt.md` | User: option A |
| **Board derives Status** (`board-sync.yml`, `scripts/board-sync.sh`): closed → Done, open closing PR → In review, label `in-progress` → In progress, parent with a task started → In progress, parent → Ready, label `spec` → Spec, sub-issue → Ready, else Backlog | Hygiene; cloud agents can't reach the board |
| **Ticked task closes its issue** (`scripts/tasks-sync.sh`, on push to `main`) | #13's children stayed open |
| **`check-tasks.mjs`**: every `tasks.md` has `**Issues**: parent #N` and one surface tag per task | Derive, don't remember |
| Spec issues = sub-issues of a feature issue, titled `T001: …`, labelled `surface:*` | The mapping `tasks-sync.sh` reads |
| Search entries deleted by recorded rowid (`pages.fts_rowid`, `page_chunks.fts_rowid`, `ftsVersion` 4) | #75 |
| Toolbar menus portaled and placed by `web/src/anchoredMenu.ts` (sheet ≤640px, dropdown otherwise) | #76 |
| **Remote testing via GitHub Codespaces** (`.devcontainer/`) | User: "do the remote solution" |

## 7. Changed / rejected
- Decisions page in the salt.md workspace → `docs/decisions.md` (user chose the repo).
- FR-003 Go token file (spec 001) → dropped: public pages link the app CSS (`publicCSSHref`).
- Spec 002 "SQLite 3.54.x" → driver v1.60.1 / SQLite 3.53.4. v1.61.0 (released 2026-10-21) is too new: the rule is to pin only releases at least two weeks old.
- Fixed surfaces list in the plan template → the registry.
- Force-push (rebase) of the branch → merging `main` into it.
- Append snapshotting after the write → no change; not a bug.
- Moving cards by hand, or by the agent → derived Status.
- Board sync filling Surface only → Surface + Status + parent re-sync.
- Spec 003 `tasks.md` "Issues" line → `parent #13; T001–T020 are #27–#46`.
- Menus inline in `.collection-toolbar` → portaled.
- Rejected:
  - ❌ DuckDB
  - ❌ Mantine as the app component library
  - ❌ shadcn/ui
  - ❌ generic code knowledge graph
  - ❌ agent teams for now
  - ❌ Storybook (the catalogue is a dev-only Vite entry)
  - ❌ two DB connections up front (measure first)
  - ❌ permanent hosted demo (cost, a public unreleased build)
  - ❌ GitHub's built-in project workflows alone
- Not built yet, possible later: an `:edge` Docker image for local runs.

## 8. Data & facts (exact)

**Repo**
- **Toolchain:** Go 1.27.2; Node 22; `modernc.org/sqlite` v1.34.5 (SQLite 3.46.0) today; app version 1.6.8.
- **Release targets** (`CGO_ENABLED=0`): linux/amd64, linux/arm64, darwin/amd64, darwin/arm64, windows/amd64.
- **CI:** job `Build and test` (`ci.yml`, required). `cla` is skipped in the fork. `sync` is Board sync.
- **Parity manifest:** 45 capabilities, 146 routes, 34 tools, `gapBudget: 11`.
- **Not tidy:** `go.mod` on `main` (`go mod tidy` moves `golang.org/x/net v0.56.0` to direct); `.devcontainer/start.sh` avoids tidy for that reason.
- **Board:** project number 5. Fields: Status (Backlog, Spec, Ready, In progress, In review, Done) and Surface (backend, mcp, ui, i18n, wiki, test, perf). Labels: `in-progress`, `spec`, `surface:*`. Board sync runs nightly at 03:17 UTC; a full run takes about 2.5 min.

**Issues**
| # | What | State |
|---|---|---|
| 13 / 27–46 | Spec 003 find-replace and its tasks | closed |
| 50 | Spec 002 feature (parent) | open |
| 51–54 | Spec 002 T001–T004 | closed by PR #77 |
| 55–73 | Spec 002 T005–T023 | open, Ready |
| 75 | Save scanned the whole search index | closed by #77 |
| 76 | Mobile toolbar menus clipped | closed by #77 |
| 78 | Search at 20k pages: 423 ms p95 vs 50 ms budget | open |
| 79 | `query_rows` at 10k rows: 141 ms p95 vs 50 ms budget | open |
| 26 | Live edits in open editors | not specced |

**Spec 002 tasks:** T005 baseline on `main`; T006 `go get modernc.org/sqlite@v1.60.1`; T007 Backup test; T008 five cross-builds + full tests; T009 benchstat ≤ +15% p95 (own PR, FR-002); T010–T012 CI bench job and budgets; T013–T021 5 s read limit (`query_timeout`, 503), grouped count, read-only connection measurement; T022–T023 polish.

**Benchmarks** (4 cores, 200 iterations, first run)
| Operation | p50 | p95 | Budget (provisional) |
|---|---|---|---|
| Open page, 1k / 20k pages | 0.42 / 0.54 ms | 0.75 / 1.25 ms | 20 ms |
| `query_rows`, 1k / 10k rows | 21.7 / 89.2 ms | 37.4 / 141.5 ms | 50 ms (10k), 300 ms (100k) |
| Rollup, 10k (100 rows) | 27.6 ms | 41.8 ms | 100 ms |
| Search, 1k / 20k pages | 17.9 / 331.9 ms | 26.3 / 422.8 ms | 50 ms |
| Write during 5-agent burst, 10k | 6.7 ms | 12.0 ms | 20 ms |
| Grouped count, 100k | — | — | 250 ms |

- **Run:** `go test ./server -run '^$' -bench Storage -benchtime 200x` (add `BENCH_LARGE=1` for 100k). The suite takes about 155 s; the 20k-page world builds in 47 s, about 2 ms a page.
- **Before #75:** 1k pages built in 3.5 s and 5k pages in 63 s (about 25 ms a save by 5k).
- **Settings:** `BENCH_SEED` 20261026; benchstat `golang.org/x/perf/cmd/benchstat@v0.0.0-20261009192801-be2c69fb417e`; report at +15% p95, fail at +50%, `-count=6`; read limit 5 s → `503 query_timeout`.

**Codespaces**
- **Open:** repo → **Code** → **Codespaces** → **Create codespace on <branch>**. It serves port 8420 at a private address.
- **Test account (invented):** `ada@example.com` / `WikiPruefung2026!`.
- **Update:** `git pull && .devcontainer/start.sh`. Data lives in `~/salt-demo`, the log in `~/salt-demo.log`.
- **Limits:** 2 cores; stops after 30 idle minutes.

**Find-and-replace (#13, merged):** `server/cap_edits.go`; `POST /api/pages/{id}/edits`; MCP `write_content` mode `edit`; max 100 edits.

**Spec 001 plan:**
- `@base-ui/react` 1.9.0; `@axe-core/playwright` 4.14.0 (dev).
- Type scale 11/12/13/14/16/20 px + display `clamp(28px, 4vw, 40px)`.
- Radius 2/4/6/8/12/999 px; layers 10/50/200/300/400/900/1000/1200.
- Bundle baseline 1,802,733 B raw / 790,888 B gzip; budget +60 KB gzip.

**Surfaces registry (14):** Domain logic and gates, Schema and queries, REST routes, MCP tools, Closed-to-agents list, UI components, Translations, Server error codes, Wiki, Tests, Performance, Manifest, Design system, Storage budgets.

## 9. People, terms & names
- **People:** the user (`neatlittlemacapps`, "Frank De Graeve"); upstream maintainer "Jeremia" (`jeremiaa`).
- **Terms:**
  - surface = a registry row a feature must answer for;
  - gap = a person can, an agent can't;
  - budget/ratchet = a count that may only go down;
  - gate = `scripts/agent-gate.sh`;
  - registry = `.specify/memory/surfaces.md`.
- **Names in use:**
  - **Board and tasks:** `board-sync.sh`, `tasks-sync.sh`, `board-sync.yml`, `check-tasks.mjs`, `setup-board.sh`.
  - **Parity and surfaces:** `capabilities.json`, `check-parity.mjs`, `check-surfaces.mjs`.
  - **Benchmarks and search fix:** `bench_world_test.go`, `storage_bench_test.go`, `searchindex_rowid_test.go`.
  - **Menu fix:** `anchoredMenu.ts`, `check-anchoredmenu.mjs`, `web/tests/toolbar-menus.mjs`.
  - **Codespaces and screenshots:** `.devcontainer/start.sh`, `web/scripts/seed-wiki-instance.mjs`, `web/scripts/shoot-wiki.mjs`.
  - **Docs:** `docs/decisions.md`, `docs/handoffs/handoff-saltmd.md`.
  - **Working branch:** `claude/keen-hopper-9joiox`.
- **Screenshot retake** (in a cloud session):
  1. Build the frontend with `npx vite build`.
  2. Run a throwaway instance on :8421 and seed it with `seed-wiki-instance.mjs`.
  3. Symlink `/opt/node22/lib/node_modules/playwright` into `web/node_modules/`.
  4. Run `SALT_SHOOT_URL=… SALT_SHOOT_EMAIL=… SALT_SHOOT_PASSWORD=… node scripts/shoot-wiki.mjs <id>`.
  5. Afterwards, revert `.github/hero.png` (the script touches it) and remove the symlinks.

## 10. Work state
| Item | Status | Location | Notes |
|---|---|---|---|
| PR #74 (board derives Status, spec 002 tasks) | merged | `main` `21ba0f0` | |
| PR #77 (search fix, benchmarks, Codespaces, mobile menus) | merged | `main` `9f17e02` | Closed #75, #76, #51–#54 |
| Spec 001 | plan done | `specs/001-design-system/` | `/speckit-tasks` not run yet |
| Spec 002 | T001–T004 done | `specs/002-storage-engine/` | T005–T009 next (driver bump, own PR) |
| Spec 003 | done | merged | |
| #78, #79 | open | issues | Measure with the benchmarks, fix in SQL |
| #26 live edits | not specced | issue | Needs the user's answers |
| Working branch | reset to `main` | `claude/keen-hopper-9joiox` | After a merge, always `git checkout -B <branch> origin/main` |
| Check-ins | none pending | — | |

## 11. Next steps
1. **Next action:** spec 002 T005–T009 on a fresh branch from `main`:
   1. Label #55–#59 `in-progress`.
   2. Run the benchmarks on `main` (`-count=6`) and save `old.txt` in the scratchpad.
   3. `go get modernc.org/sqlite@v1.60.1 && go mod tidy`.
   4. Add the Backup test (T007).
   5. Run the five cross-builds and `go test ./...`.
   6. Benchmark again, run `benchstat`, and put the table in the PR body.
   7. Tick T005–T009 and open its own PR with `Closes #55` … `Closes #59`.
2. Then T010–T012 (CI bench job) and T013–T021 (5 s read limit), or #78/#79 first if the user prefers.
3. Spec 001: `/speckit-tasks` → issues → batch 1.
4. Later: spec #26 with the user's answers.

## 12. Open questions ⚠️
- Turn on auto-merge for every PR Claude opens (it merges once `Build and test` passes)? Asked three times, not answered.
- #78/#79 before or after the driver bump? Not asked yet; the default is after.
- #26: server-side Yjs update or editor-applied? All outside writes or only edits? Keep today's path when no editor is open?

## 13. Re-attach checklist
Nothing to attach. This file is `docs/handoffs/handoff-saltmd.md` on `main` of `neatlittlemacapps/salt.md`. Start a Claude Code session on that repo.

---
<sub>Audit: 13/13 sections · 8 rules · 12 corrections · 95 data points · secrets removed: none found (the Codespaces password is an invented, documented test account) · generated by active-memory</sub>
