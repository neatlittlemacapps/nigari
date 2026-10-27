# active-memory handoff: salt.md agentic setup and feature roadmap

**Handoff #4** · 2026-10-27 · Lineage:
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
- **#4 (2026-10-26/27):**
  - finished spec 002: driver bump (PR #80), CI bench job + measured budgets (PR #81), 5 s read limit + grouped count (PR #83);
  - built a read-only connection pool (#82, PR #84);
  - sped up `query_rows` and search, moved search onto the pool (PR #85, open);
  - fixed tag colours for agents (#2, PR #86, open).

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
- **How they work:** mostly from a phone (Claude app, iPhone). Tests in GitHub Codespaces from the phone's browser. Sets GitHub settings by hand. Merges PRs themselves, often within minutes of "ready".
- **Local instance:** http://localhost:8420, workspace **Workspace** (`f6526406952b1c9b154760df965df59a`). Cloud sessions cannot reach it (AGENTS.md now says: skip `working_on`/`note` in cloud sessions and put that content in commits/PRs).
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
  - When asked to explain options (e.g. "Explain abc"): per option, what it gains, what it costs, effort; then one recommendation.
- **Working style:**
  - The user gives terse go-aheads ("ok", "go", "yes", "Build", "merged"). "Ik" was a typo for "Ok".
  - "Keep going until I say stop or when you really really need an answer". Do clear work without asking; ask one short question only when the decision is genuinely theirs.
  - Every reply that ends a step ends with "Ready to continue with <next step>?"
- **Avoid:** recaps of steps; long explanations before the result.

## 4. Hard rules (word for word)
1. "Use spec-kit but indeed also a board to to track the work"
2. "Fold them into here so the functionality is in here too (those branches)"
3. **Pushing:** pushing to GitHub needs the user's explicit OK. Their standing "Keep going until I say stop" covers routine pushes to working branches. Opening a PR is asked for ("Ready to continue with opening the PR?"). The user merges.
4. Repo rules in `AGENTS.md` and `.claude/rules/` apply to all code work. A Stop hook runs `scripts/agent-gate.sh` and the git-check (uncommitted or unpushed work fails it); both must pass.
5. "ensure you think about all aspects of the code in relation to my feature requests". A new concept goes into `.specify/memory/surfaces.md`.
6. Never work around a classifier denial (CI bypass, self-modification, destructive git). Tell the user and give them the manual step.
7. **Commit authorship:** commits are authored as `neatlittlemacapps <60575307+neatlittlemacapps@users.noreply.github.com>`, with a `Co-Authored-By: Claude …` trailer. Run `git config user.name neatlittlemacapps` and `git config user.email 60575307+neatlittlemacapps@users.noreply.github.com` before the first commit.
8. "ensure you have good board and issue hygiene":
   - Label an issue `in-progress` when starting it; remove the label when work on it stops without finishing.
   - Tick the task in `tasks.md` in the PR that does it.
   - List every task issue the PR finishes as `Closes #N`; closing a parent does not close its sub-issues.
   - File an issue for every bug or finding.
   - Nobody moves cards by hand.
9. **After opening a PR:** subscribe to its activity; arm one safety-net check-in (`send_later`, ~50 min); on CI red, fix and push; on a merge, restart the working branch from `main`.

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
| 13 | (self) Repeated #12 in chat #4 (`pkill -f "server.test.*ZZProbeSearch"`, exit 144) | Kill a Go test binary with `pgrep -x server.test \| xargs -r kill`; a long probe gets `timeout 300` and a per-query context deadline from the start |
| 14 | (self) Wrote an unmeasured figure ("about 1,200 hits") into a GitHub comment on #78 | Every number in a comment, PR or doc must come from a measurement in the session; fixed by editing the comment |
| 15 | (self) First read-pool test ("write finishes before the read") passed even with the reads back on the writer | Mutation-check every new test: break the code it guards and confirm the test fails; replaced it with a test that holds the writer in an open transaction |
| 16 | (self) Guessed the #83 CI regression came from per-statement context overhead and nearly built a fix on it | Measure the hypothesis first (it showed no difference); the batched-read fix was then validated by CI |
| 17 | (self) `gofmt -w server/*_test.go` reformatted `server/tunnel_update_test.go`, a file left unformatted on purpose | Run gofmt only on files you touched; check `git show HEAD:<file> \| gofmt -l` first for the four exempt files |
| 18 | (self) Wrote `` `query_timeout` `` in the wiki; `check-wiki.mjs` read it as a missing tool | Write error codes as `` `"code": "query_timeout"` ``; never widen `ALLOWED_NON_TOOLS` to pass |
| 19 | (self) Fed benchstat raw `go test` output; `go: downloading` lines made it print two tables with no comparison | Keep only `^(goos\|goarch\|pkg\|cpu\|Benchmark)` lines (now built into `scripts/bench-compare.sh`) |

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
| **Board derives Status** (`board-sync.yml`, `scripts/board-sync.sh`) | Hygiene; cloud agents can't reach the board |
| **Ticked task closes its issue** (`scripts/tasks-sync.sh`, on push to `main`) | #13's children stayed open |
| **`check-tasks.mjs`**: every `tasks.md` has `**Issues**: parent #N` and one surface tag per task | Derive, don't remember |
| Spec issues = sub-issues of a feature issue, titled `T001: …`, labelled `surface:*` | The mapping `tasks-sync.sh` reads |
| Search entries deleted by recorded rowid (`ftsVersion` 4) | #75 |
| Toolbar menus portaled (`web/src/anchoredMenu.ts`) | #76 |
| Remote testing via GitHub Codespaces (`.devcontainer/`) | User: "do the remote solution" |
| **Storage budgets record today's speed; targets stay with issues** (budget = CI p95 × 1.5, lowered in the PR that fixes it) | `docs/decisions.md` 2026-10-26 |
| **5 s read limit** on rows, rollups, backrelations, grouped counts: REST `503 query_timeout`, MCP tool error, same sentence | Spec 002 contract; PR #83 |
| **Read-only pool `s.rdb`** (4 × `mode=ro`) beside the one writer `s.db` | Measured 2.7 s write waits; user: "Build"; `docs/decisions.md` 2026-10-26; PR #84 |
| **#78 option c**: search runs on the read pool | User: "c in the #79 PR" |
| **Tag colours**: one function `setTagColor`; agents use `workspace` with `workspace_id`+`tag`+`color` | Parity rule "both doors call one function"; PR #86 |
| Order after #85/#86: #2 → spec 001 → #20 | Claude recommended; user said "Yes" to #2 |

## 7. Changed / rejected
- Decisions page in the salt.md workspace → `docs/decisions.md` (user chose the repo).
- FR-003 Go token file (spec 001) → dropped: public pages link the app CSS (`publicCSSHref`).
- Spec 002 "SQLite 3.54.x" → driver v1.60.1 / SQLite 3.53.4. v1.61.0 too new (rule: releases at least two weeks old).
- Fixed surfaces list in the plan template → the registry.
- Force-push (rebase) of the branch → merging `main` into it.
- Moving cards by hand → derived Status.
- One shared SQLite connection → one writer + read-only pool (#84).
- Provisional budgets (guesses) → CI-measured budgets (#81), lowered again in #85.
- Research P5 "a second connection measured, not built" → built (#82).
- Per-target rollup reads (one query per related row) → one batched `IN (…)` query (#83 fix).
- `query_rows` count as a separate `COUNT(*)` → `COUNT(*) OVER ()` on the page query.
- Search join by `chunk_id` → join by `page_chunks.fts_rowid` with `CROSS JOIN`.
- Rejected:
  - ❌ DuckDB
  - ❌ Mantine as the app component library
  - ❌ shadcn/ui
  - ❌ generic code knowledge graph
  - ❌ agent teams for now
  - ❌ Storybook (the catalogue is a dev-only Vite entry)
  - ❌ permanent hosted demo
  - ❌ GitHub's built-in project workflows alone
  - ❌ #78 option a (rank only the first ~2,000 hits) and option b (`workspace_id` in `chunks_fts`, `ftsVersion` 5): not chosen; may come back if search at 20k still feels slow
  - ❌ widening `ALLOWED_NON_TOOLS` in `check-wiki.mjs` to pass a check
- Not built yet, possible later: an `:edge` Docker image for local runs.

## 8. Data & facts (exact)

**Repo**
- **Toolchain:** Go 1.27.2 (CI: 1.27.3); Node 22; `modernc.org/sqlite` **v1.60.1** (SQLite 3.53.4); `go.mod` `go 1.26.0`; app version 1.6.8.
- **Release targets** (`CGO_ENABLED=0`): linux/amd64, linux/arm64, darwin/amd64, darwin/arm64, windows/amd64. All five build on v1.60.1.
- **CI:** `Build and test` (required); `Storage benchmarks` (`bench` job, not required; PRs touching `server/`, `go.mod`/`go.sum`, `scripts/bench-compare.sh`; warn +15% p95, fail +50%); `cla` skipped in the fork; `sync` = Board sync.
- **Parity manifest:** 45 capabilities, 146 routes, 34 tools; `gapBudget` **11 on `main`, 10 after #86**.
- **Unformatted on purpose** (no gofmt in feature changes): `server/server.go`, `server/audit.go`, `server/desktop_auth.go`, `server/tunnel_update_test.go`.
- **`go test ./...`** fails at the root package without a built frontend (`web/dist`); build it with `cd web && npx vite build` first. The gate needs it too.
- **Board:** project 5. Status: Backlog, Spec, Ready, In progress, In review, Done. Surface: backend, mcp, ui, i18n, wiki, test, perf. Labels: `in-progress`, `spec`, `surface:*`.

**Read limit and pool**
- `readLimit = 5 * time.Second` (`server/cap_limits.go`); `readPoolSize = 4` (`server/db.go`, `openReadDB`, DSN `mode=ro&_pragma=busy_timeout(5000)&_pragma=query_only(1)`).
- Error sentence (REST and MCP): "The query took longer than 5 seconds and was stopped. Narrow the filter or ask for fewer rows."
- German (`de.json`): "Die Abfrage hat länger als 5 Sekunden gedauert und wurde abgebrochen. Grenze den Filter ein oder frage weniger Zeilen ab."
- On `s.rdb`: `collectionRowsQuery`, `relatedRows` (batched, 500 per query), `backrelationIDs`, `groupCounts`, and (#85) `searchChunks` and `searchPagesFallback`. Permission lookups stay on `s.db`.
- Writes during back-to-back 100k reads (dev, p95): writer path 2.6–3.0 s; read pool 4.6–5.9 ms; no read 3.4–4.6 ms. Write budget 8 ms.

**Budgets (research P3, CI p95 × 1.5)**
| Operation | Size | CI p95 | Budget |
|---|---|---|---|
| Open a page | 1k / 20k pages | 0.42 / 0.44 ms | 1 / 1 ms |
| `query_rows` | 1k rows | 11.7 ms (#85) | 18 ms |
| `query_rows` | 10k rows | 33.1 ms (#85) | 50 ms |
| `query_rows` | 100k rows | not in CI | 300 ms, provisional |
| Rollup | 10k rows | 23.8 ms | 36 ms |
| Search | 1k pages | 10.6 ms (#85) | 16 ms |
| Search | 20k pages | 122.8 ms (#85) | 185 ms (#78) |
| Grouped count | 1k / 10k rows | 2.1 / 19.5 ms (#85) | 4 / 30 ms |
| Grouped count | 100k rows | 139 ms dev, not in CI | 250 ms, provisional |
| Write in a 5-agent burst | 10k rows | 5.3 ms | 8 ms |
- The #85 rows and budgets are on branch `claude/fast-reads` (PR #85) until it merges; `main` still has 26 / 113 / 21 / 301 ms for those rows.
- Baseline runs: PR #81 run 40365065291 (driver v1.34.5); PR #85 run 40452540193.

**#78 measurement (dev, 20k pages, word `vertrag`, 24,160 passages)**
- `MATCH` only 9 ms; + `bm25` order, no joins 30 ms; joins by `chunk_id` 118 ms; full old query 141 ms; `snippet()` ~5 ms; new full query 85 ms. Benchmark p95 129.5 → 103.8 ms (dev); CI 173.8 → 122.8 ms.

**Benchmarks**
- Run: `go test ./server -run '^$' -bench Storage -count=6`; add `BENCH_LARGE=1` for 100k and `BenchmarkStorageWriteDuringLongRead`.
- Compare: `scripts/bench-compare.sh old.txt new.txt`.
- benchstat `golang.org/x/perf/cmd/benchstat@v0.0.0-20261009192801-be2c69fb417e`; `BENCH_SEED` 20261026.

**Codespaces**
- Open: repo → **Code** → **Codespaces** → **Create codespace on <branch>**. Port 8420, private address.
- Test account (invented): `ada@example.com` / `WikiPruefung2026!`.
- Update: `git pull && .devcontainer/start.sh`. Data `~/salt-demo`, log `~/salt-demo.log`. 2 cores; stops after 30 idle minutes.

**Spec 001 plan:** `@base-ui/react` 1.9.0; `@axe-core/playwright` 4.14.0 (dev); type scale 11/12/13/14/16/20 px + display `clamp(28px, 4vw, 40px)`; radius 2/4/6/8/12/999 px; layers 10/50/200/300/400/900/1000/1200; bundle baseline 1,802,733 B raw / 790,888 B gzip; budget +60 KB gzip.

**Surfaces registry (14):** Domain logic and gates, Schema and queries (now says: long reads on `s.rdb` under `withReadLimit`, writes and must-see-the-write reads on `s.db`), REST routes, MCP tools, Closed-to-agents list, UI components, Translations, Server error codes, Wiki, Tests, Performance, Manifest, Design system, Storage budgets.

## 9. People, terms & names
- **People:** the user (`neatlittlemacapps`, "Frank De Graeve"); upstream maintainer "Jeremia" (`jeremiaa`).
- **Terms:** surface = a registry row a feature must answer for; gap = a person can, an agent can't; budget/ratchet = a count that may only go down; gate = `scripts/agent-gate.sh`; registry = `.specify/memory/surfaces.md`; read pool = `s.rdb`; writer = `s.db`.
- **Names in use:**
  - **Board and tasks:** `board-sync.sh`, `tasks-sync.sh`, `board-sync.yml`, `check-tasks.mjs`, `setup-board.sh`.
  - **Parity:** `capabilities.json`, `check-parity.mjs`, `check-surfaces.mjs`, `parity_property_test.go` (`parityActs`, `parityWorkspaceActs`, `fill`), `credential_audit_test.go` (`outsiders`).
  - **Storage:** `bench_world_test.go`, `storage_bench_test.go` (`writeBurst`, `BenchmarkStorageGroupedCount`, `BenchmarkStorageWriteDuringLongRead`), `scripts/bench-compare.sh`, `cap_limits.go` (`withReadLimit`, `readErr`, `errQueryTimeout`), `collections_group.go` (`groupCounts`), `rowScope`, `openReadDB`, `idx_chunk_fts_rowid`, `backup_test.go`.
  - **Tags:** `setTagColor`, `errTagWorkspaceNotFound`, `errTagWorkspaceReadOnly`, `errTagRequired`, `errTagColorUnknown` (`server/tags.go`).
  - **Docs:** `docs/decisions.md`, `docs/handoffs/handoff-saltmd.md`.
  - **Branches:** `claude/keen-hopper-9joiox` (working branch, = `main` + this handoff), `claude/fast-reads` (#85), `claude/tag-colors` (#86).
- **Screenshot retake** (cloud session; needed whenever `server/mcp.go` changes, shot `agents-connect`):
  1. `cd web && npx vite build`, then `go build -o <scratch>/salt-shot .`.
  2. Run it with `SALT_DATA=<scratch>/salt-shots SALT_ADDR=127.0.0.1:8421`; seed with `node scripts/seed-wiki-instance.mjs`.
  3. `ln -sfn /opt/node22/lib/node_modules/playwright web/node_modules/playwright`.
  4. `SALT_SHOOT_URL=http://127.0.0.1:8421 SALT_SHOOT_EMAIL=ada@example.com SALT_SHOOT_PASSWORD='WikiPruefung2026!' node scripts/shoot-wiki.mjs agents-connect`.
  5. Kill the instance by PID, remove the symlink and scratch data; check `.github/hero.png` is untouched.

## 10. Work state
| Item | Status | Location | Notes |
|---|---|---|---|
| PR #80 driver bump | merged | `main` | Closed #55–#59 |
| PR #81 CI bench job + budgets | merged | `main` | Closed #60–#62 |
| PR #83 5 s read limit, grouped count, T013–T023 | merged | `main` | Closed #63–#73; spec 002 tasks all ticked |
| PR #84 read-only pool | merged | `main` `346f858` | Closed #82 |
| PR #85 fast reads + search on pool + lowered budgets | open, green before the last push | `claude/fast-reads` | Closes #79; improves #78. Last push `ce18e06` (budgets) needs CI; then the user merges |
| PR #86 tag colours | open | `claude/tag-colors` | Closes #2; CI was starting |
| #78 search at 20k pages | open, not in progress | issue | Findings comment posted; options a/b open |
| #50 spec 002 parent | open | issue | Close when #85 merges (all tasks done) |
| Spec 001 | plan done | `specs/001-design-system/` | `/speckit-tasks` not run yet |
| #20 charts | not specced | issue | Builds on `groupCounts`, the read limit and the pool |
| #26 live edits | not specced | issue | Needs the user's answers |
| PR subscriptions / check-ins | none in the new session | — | Re-subscribe to #85 and #86 in the new chat |

## 11. Next steps
1. **Next action:** subscribe to PR #85 and PR #86; check CI on their heads (`ce18e06` for #85); fix anything red; tell the user both are ready to merge.
2. When #85 merges: close #50 (spec 002 done); reset `claude/keen-hopper-9joiox` to `main`.
3. Spec 001: run `/speckit-tasks` on `specs/001-design-system/`, then `/speckit-github-taskstoissues`, then build batch 1.
4. Then #20 (charts): `/speckit-specify`, building on `groupCounts`.
5. Later: #78 (a or b, if the user wants it), #3–#9 parity gaps, #10–#12 decisions, #26.

## 12. Open questions ⚠️
- Turn on auto-merge for every PR Claude opens (it merges once `Build and test` passes)? Asked several times, never answered.
- #78: take option a (rank only the first ~2,000 hits for very common words) or b (`workspace_id` in `chunks_fts`, full reindex), or leave it at today's 122.8 ms CI p95?
- #26: server-side Yjs update or editor-applied? All outside writes or only edits? Keep today's path when no editor is open?

## 13. Re-attach checklist
Nothing to attach. This file is `docs/handoffs/handoff-saltmd.md` on branch `claude/keen-hopper-9joiox` of `neatlittlemacapps/salt.md` (it reaches `main` with the next PR from that branch). Start a Claude Code session on that repo and branch.

---
<sub>Audit: 13/13 sections · 9 rules · 19 corrections · 120 data points · secrets removed: none found (the Codespaces password is an invented, documented test account) · generated by active-memory</sub>
