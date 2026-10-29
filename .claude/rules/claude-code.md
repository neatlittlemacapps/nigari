# Claude Code in this repository

`AGENTS.md` holds the project instructions for every agent. Claude Code reads it
when there is no `CLAUDE.md`. `CLAUDE.md` is gitignored on purpose — a local one
once carried deployment details into the public repository — so if you keep a
local `CLAUDE.md`, make its first line `@AGENTS.md`, or Claude stops reading the
shared instructions.

- **Rules per domain** load on their own from `.claude/rules/` when you touch
  matching files: Go server, MCP, frontend, translations, wiki, tests.
- **The gate runs when you stop.** A `Stop` hook runs `scripts/agent-gate.sh`.
  If it fails, its output comes back to you: fix the cause, do not weaken the
  check. If a check is genuinely wrong, say so and stop; changing a check is a
  decision for a person.
- **Protected files.** Deny rules in `.claude/settings.json` refuse edits to
  `LICENSE`, `CLA.md`, `THIRD-PARTY-NOTICES.md`, lockfiles and `go.sum`,
  `wiki/img/`, `.github/cla-signatures.json` and `.gitignore`. Do not work
  around them with shell commands; ask the person. Lockfiles change through `npm install`; screenshots through
  `web/scripts/shoot-wiki.mjs`; notices through `scripts/licenses.mjs`.
- **Formatting.** Go files are run through `gofmt` after each edit, unless the
  file is already unformatted in the last commit (`server/server.go`,
  `server/audit.go`, `server/desktop_auth.go`, `server/tunnel_update_test.go`
  today). Those are left alone so a small change does not carry an unrelated
  reformat; format them in a commit of their own.
- **Plan before large changes.** Anything spanning more than one surface starts
  in plan mode or with `/speckit-plan`, not with edits.
- **Hand mechanical work to Sonnet.** The owner allows (2026-10-28) handing a
  task to a subagent on Sonnet (`model: "sonnet"`) wherever that saves time or
  cost without risking quality: translations into `de.json`/`es.json`, wiki text
  that follows an existing page, screenshot retakes, running browser tests,
  tasks that copy an existing pattern. Keep on the session's own model (Opus)
  what needs judgement: specs and plans, the surfaces a feature touches, new
  server logic, new `ui/` primitives, security and permission gates, bug fixes.
  Review a helper's work before it is committed; the gate checks it like any
  other. Haiku is not used here.
- **Review skills before a pull request is offered.** The owner merges every
  pull request and does not read Go, so these reviews stand in for a
  developer's second look; a finding they make goes into the pull request or
  gets an issue, never dropped (2026-10-29):
  - `/code-review` on the branch's diff, before any pull request is offered.
  - `ux-ui-audit` after a change anyone can see in the interface, in light
    and dark, at desktop and phone width.
  - `/security-review` when sign-in, sessions, permissions, tokens or a
    `canRead`/`canWrite`/`credentialMayEnter` gate change.
  The pull request names which ran and what each found.
- **Parallel work follows `.claude/skills/steward/SKILL.md`**: at most two
  streams, Claude steering, each in its own files.
