# active-memory handoff: salt.md agentic setup and feature roadmap

**Handoff #2** · 2026-10-26 · Lineage:
- #1 (2026-10-25): designed and built an agentic coding setup for the salt.md fork (rules, gate, Spec Kit, parity manifest), merged four feature branches, opened 25 issues, wrote three specs.
- #2 (2026-10-26):
  - built find-and-replace edits (#13, PR #48, merged);
  - wrote the plans for specs 001 and 002;
  - fixed #47;
  - added the surfaces registry, board sync, ruleset file, owner-authored commits and an upstream-only CLA (PR #49, open).

## 0. Instructions for Claude (read first)

You are continuing work from a previous chat. That chat is gone; this file is the complete context and the source of truth.

1. Read this whole file before replying.
2. Follow sections 3 (Style), 4 (Hard rules) and 5 (Corrections) in every reply, for the rest of this chat. They override your defaults.
3. Use the values in section 8 exactly. Never round, re-estimate, or "correct" them.
4. Do not suggest anything listed in section 7 (Changed / rejected) again unless the user brings it up.
5. Code word: None active. If the user types /amcodeword, start every reply with the phrase they choose (default "Yes Boss!").
6. Your first reply: at most 5 lines covering the goal, the current state, and the next step (section 11). Mention any files from section 13 that were not attached. Ask the questions in section 12 if there are any. End with "Ready to continue with <next step>?" Then wait for the user's go.

## 1. Mission
- **Goal:** take salt.md (the user's fork) "to a higher level": drastically increase features with an agentic coding setup that keeps the software's domains intact.
- **The user's own words:** "proper coding, holistic adjustments (think, when I add a feature, the system should also reason and tackle the fact that the mcp functionality might also need to follow), proper UI implementation, performance and testing".
- **Done looks like:** features flow spec → plan → tasks → board → implementation. Every feature reaches every surface in the registry, with the gate and CI green.
- **Clarified by the user on 2026-10-26:** the holistic idea is a standing way of working, not a one-off fix. "from here on out, you should indeed ensure you think about all aspects of the code in relation to my feature requests." "When a feature request introduces some new concept (like but not excluding the design system) you should add it to the pool of things to think about when specking new features."
- **Also from the user:** "I want you to be able to do as much as possible yourself".

## 2. About the user (as relevant to this work)
- GitHub account `neatlittlemacapps` (id 60575307). The display name on commits made in the web UI is "Frank De Graeve".
- Owns the fork `neatlittlemacapps/salt.md` (fork of `saltmd/salt.md`, AGPL-3.0). Signed the CLA in saltmd/salt.md#87.
- Works largely from a phone (Claude app). Sets GitHub settings by hand.
- Runs a local salt.md instance at http://localhost:8420, workspace **Workspace** (`f6526406952b1c9b154760df965df59a`). Cloud sessions cannot reach it.
- Designer/PM background. Has design-coach skills (Kernel components on Base UI, W3C/DTCG tokens) and a `saltmd` skill.
- Has turned on GitHub Actions for the fork and enabled auto-merge.

## 3. Style & communication
- **Language:** English.
- **Tone:** direct, plain, no filler.
- **Reply length:** short (phone screen). Lead with the answer; give detail only when asked.
- **Formatting:** short lists and small tables. Numbered steps for anything the user must do by hand, with exact tap paths.
- **Working style:**
  - Terse go-aheads ("Ok", "Start", "Yes", "done", "do 10").
  - "Keep going until I say stop or when you really really need an answer". Do clear work without asking; ask one short question only when the decision is genuinely theirs.
- **Avoid:** recaps of steps; long explanations before the result.

## 4. Hard rules (word for word)
1. "Use spec-kit but indeed also a board to to track the work"
2. "Fold them into here so the functionality is in here too (those branches)"
3. Pushing to GitHub needs the user's explicit OK. Their standing "Keep going until I say stop" covers routine pushes to the working branch. Opening a PR and merging are still asked for; the user merges.
4. Repo rules in `AGENTS.md` and `.claude/rules/` apply to all code work.
5. "ensure you think about all aspects of the code in relation to my feature requests". A new concept goes into `.specify/memory/surfaces.md`.
6. Never work around a classifier denial (CI bypass, self-modification, destructive git). Tell the user and give them the manual step.
7. Commits are authored as `neatlittlemacapps <60575307+neatlittlemacapps@users.noreply.github.com>`, with a `Co-Authored-By: Claude …` trailer. Run `git config` at session start; the rule is in `AGENTS.md`.

## 5. Corrections log
| # | Claude did | The user wanted |
|---|---|---|
| 1 | Told the user to run `/speckit-specify` in a separate session | "Can't you run all that from here?" Run Spec Kit steps directly |
| 2 | (self) Called the token-reachable membership routes a hidden security issue | A docs contradiction; decided #1 option B |
| 3 | (self) Planned `server/ops_*.go` | `server/ops.go` exists → `cap_*.go` |
| 4 | (self) Counted 36 MCP tools | 33 before the merges, 34 after |
| 5 | (self) Said de and es translations are both required | Only `de.json` is required; `es.json` is reported |
| 6 | Treated "MCP must follow new features" as something to fix | It was a guide for the way of working (see section 1). Apply it to every request and grow the registry |
| 7 | (self) Wrote a made-up benchstat pseudo-version | Verified the real one: `v0.0.0-20261009192801-be2c69fb417e` |
| 8 | Pushed commits after the user had merged #48, so they missed the merge | Watch the merge state; the leftovers became PR #49 |
| 9 | Ran a tool call that edited `AGENTS.md`; the user rejected it mid-run | Wait for the user. They later said to fix it, and it was kept and committed (`a0b3519`) |

## 6. Decisions
| Decision | Why |
|---|---|
| Spec Kit (pinned 1.2.3) + GitHub Projects board | user's call |
| `AGENTS.md` shared; `CLAUDE.md` gitignored | an earlier `CLAUDE.md` leaked deployment details |
| `capabilities.json` + `check-parity.mjs` + `parity_property_test.go`; `gapBudget` ratchet | agent parity |
| #1 membership: option B | user: "1 b" |
| Keep SQLite (spec 002) | DuckDB needs cgo, downloads extensions at runtime, has OCC conflicts |
| DTCG 2025.10 tokens + Base UI layer `web/src/ui/` (spec 001) | headless; the look stays salt.md's |
| Spec 003 FR-008: **C** (reload now; live delivery = #26) | user: "1 C" |
| Decisions live in the repo: `docs/decisions.md` | user: "2 repo" |
| Surfaces registry `.specify/memory/surfaces.md`, enforced by `check-surfaces.mjs`; constitution v1.1.0 | user's way-of-working instruction |
| Board sync: Surface field filled from `surface:*` labels (`board-sync.yml`) | user: "Yes I guess" |
| Commits authored as the owner | CLA bot cannot match the agent's address |
| CLA check runs only in `saltmd/salt.md` | user: "Yes" (option A) |
| Ruleset for `main`: PR required, `Build and test` required (app 15368), review threads resolved, 0 approvals, merge commits only, no force-push or deletion, admin bypass | user asked for the set; auto-merge is enabled |

## 7. Changed / rejected
- Decisions page in the salt.md workspace → `docs/decisions.md` (user chose repo)
- FR-003 Go token file (spec 001) → dropped: public pages link the app CSS (`publicCSSHref`)
- Spec 002 "SQLite 3.54.x" → driver v1.60.1 / SQLite 3.53.4. v1.61.0 is too new: release 2026-10-21, and the rule is to pin only releases at least two weeks old
- Fixed surfaces list in the plan template → the registry
- Force-push (rebase) of the branch → merging `main` into it (the classifier denied the force-push)
- Append snapshotting after the write: no change. Not a bug: the marker it records is the state before the next write
- ❌ DuckDB · ❌ Mantine as the app component library · ❌ shadcn/ui · ❌ generic code knowledge graph · ❌ agent teams for now · ❌ Storybook (catalogue is a dev-only Vite entry) · ❌ two DB connections up front (measure first)

## 8. Data & facts (exact)
**Repo**
- Go 1.27.2; `server/`; `modernc.org/sqlite` v1.34.5 (SQLite 3.46.0) today.
- Release targets with `CGO_ENABLED=0`: linux/amd64, linux/arm64, darwin/amd64, darwin/arm64, windows/amd64.
- Gate: `scripts/agent-gate.sh` (`--all`). Its web checks now also trigger on `^specs/` and `^\.specify/`.
- CI job name: `Build and test` (`ci.yml`). `cla` is upstream's check, not required.
- Parity manifest: 45 capabilities; 146 routes (145 + `POST /api/pages/{id}/edits`); 34 tools; `gapBudget: 11`.

**Find-and-replace (#13, merged)**
- `server/cap_edits.go` `editPageContent`; REST `POST /api/pages/{id}/edits`; MCP `write_content` mode `edit` (`edits`, `allow_removals`); max 100 edits per request.
- Error codes: `edit_no_match`, `edit_ambiguous`, `edit_removes_link`, `edit_unsupported_block`, `edit_stale`, `edit_empty`, `edit_empty_quote`, `edit_too_many`.
- Benchmark: 33 ms for one edit on a 5,000-block page.
- Parity run: 2,000 cases, REST and MCP agree on all of them.

**Spec 001 plan**
- Base UI `@base-ui/react` 1.9.0 (peer react ^17‖^18‖^19); `@axe-core/playwright` 4.14.0 (dev).
- Type scale: 11/12/13/14/16/20 px + display `clamp(28px, 4vw, 40px)`.
- Radius: 2/4/6/8/12/999 px. Layers: 10/50/200/300/400/900/1000/1200.
- Bundle baseline: 1,802,733 B raw / 790,888 B gzip; budget +60 KB gzip.

**Spec 002 plan**
- Driver v1.60.1 (SQLite 3.53.4). A scratch trial built all 5 targets and passed tests.
- benchstat `golang.org/x/perf/cmd/benchstat@v0.0.0-20261009192801-be2c69fb417e`; report at +15% p95, fail at +50%; `-count=6`.
- Read limit 5 s → `503 query_timeout`.
- `BENCH_SEED` 20261026; `BENCH_LARGE=1` turns on the 100k-row runs.

| p95 budget (provisional) | value |
|---|---|
| open page, 20k pages | 20 ms |
| query_rows, 10k / 100k rows | 50 / 300 ms |
| rollup, 10k | 100 ms |
| full-text search, 20k pages | 50 ms |
| grouped count, 100k | 250 ms |
| write during burst | 20 ms |

**Surfaces registry (14 entries)**
- Since 2026-10-25: Domain logic and gates, Schema and queries, REST routes, MCP tools, Closed-to-agents list, UI components, Translations, Server error codes, Wiki, Tests, Performance.
- Since 2026-10-26: Manifest, Design system, Storage budgets.

**Board sync**
- Secret `BOARD_TOKEN`: a classic token with the `repo` and `project` scopes.
- Variable `BOARD_PROJECT`: the board's number.
- Optional variable `BOARD_FIELD` (default `Surface`).

## 9. People, terms & names
- **People:** the user (`neatlittlemacapps`, "Frank De Graeve"); upstream maintainer "Jeremia" (`jeremiaa` in the CLA allowlist).
- **Terms:**
  - surface = a registry row a feature must answer for;
  - gap = a person can, an agent can't;
  - ratchet/budget = a count that may only go down;
  - gate = `scripts/agent-gate.sh`;
  - registry = `.specify/memory/surfaces.md`.
- **Names in use:** `capabilities.json`, `check-parity.mjs`, `check-surfaces.mjs`, `parity_property_test.go`, `cap_edits.go`, `board-sync.sh`, `board-sync.yml`, `.github/rulesets/main.json`, `docs/decisions.md`, `setup-board.sh`, branch `claude/saltmd-agentic-handoff-wv4ah6`.

## 10. Work state
| Item | Status | Location | Notes |
|---|---|---|---|
| PR #48 | merged 2026-10-26 at `9d7b2a8` | main `f26ae4a` | closed #13, #1 |
| PR #49 | open; head `a0b3519`; Build and test green, `cla` red (old Claude-authored commits) | branch above | #47 fix, registry, board sync, ruleset file, spec 002 plan, owner authorship, CLA scope, the user's settings commit `bf329d6`. Closes #47 |
| `AGENTS.md` decisions/cloud note | committed `a0b3519` | PR #49 | decisions go in `docs/decisions.md`; cloud sessions skip the workspace calls |
| Spec 001 | plan done | `specs/001-design-system/` | `/speckit-tasks` next |
| Spec 002 | plan done | `specs/002-storage-engine/` | `/speckit-tasks`, then the driver-bump PR |
| Spec 003 | implemented | merged | tasks #27–#46 done |
| #26 live edits | not specced | issue | needs the user's answers |
| Ruleset | file written | `.github/rulesets/main.json` | user to import (state not confirmed) |
| Board sync | built | PR #49 | user to set the secret and variable (not confirmed); then Claude runs it with `actions_run_trigger` |
| `.claude/settings.json` | user added allow rules (`bf329d6`) | branch | `Edit`/`Write(/.github/workflows/**)`, `Bash(git push --force-with-lease origin claude/*)` |
| Old branches | deleted by the user | — | only `main` and the working branch remain |
| PR #49 check-in | scheduled 11:22 UTC (trigger `trig_01DmwqFSCAQfnwMX54tK3rAs`) | — | cancel once #49 is merged |

## 11. Next steps
1. **Next action:** confirm with the user that the ruleset is imported, then they merge #49. After that, `cla` no longer runs in the fork.
2. Once `BOARD_TOKEN`/`BOARD_PROJECT` are set: start Board sync with `workflow_dispatch` and verify the result.
3. Build step 9: `/speckit-tasks` and issues for spec 002, then the driver-upgrade PR. Then spec 001 batch 1.
4. Later: spec #26 with the user's answers.

## 12. Open questions ⚠️
- Did the user import the ruleset and set `BOARD_TOKEN`/`BOARD_PROJECT`? "done" was not specific.
- Turn on auto-merge for every PR Claude opens (it merges when Build and test passes)? Asked, not answered.
- #26: server-side Yjs update or editor-applied? All outside writes or only edits? Keep today's path when no editor is open?

## 13. Re-attach checklist
Nothing to attach. Everything lives in `neatlittlemacapps/salt.md` (main + `claude/saltmd-agentic-handoff-wv4ah6`). Start a Claude Code session on that branch.

---
<sub>Audit: 13/13 sections · 7 rules · 9 corrections · 60 data points · secrets removed: none found · generated by active-memory</sub>
