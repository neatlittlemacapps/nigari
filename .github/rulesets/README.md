# Rulesets

`main.json` is the ruleset for the default branch. GitHub does not read this
folder; it is kept here so the rules are reviewed like code and can be
re-imported (Settings → Rules → Rulesets → New ruleset → Import a ruleset).

What it enforces, and why:

| Rule | Why |
| --- | --- |
| Changes reach `main` through a pull request | Every change gets CI and a reviewable diff, including an agent's. |
| `Build and test` must pass (from GitHub Actions, app id 15368) | It is `ci.yml`: the check scripts, the Vite build and the Go tests. Auto-merge waits for it. Pinning the app means no other app can post a green check under the same name. |
| Review threads must be resolved | A question left open on a PR blocks the merge instead of being forgotten. |
| 0 approvals required | The repository has one person, and GitHub does not let an author approve their own PR, so a required approval would make every PR unmergeable. Raise it when there is a second reviewer. |
| Merge commits only | Each commit's message carries its reasoning; a squash would flatten it. |
| No force-push, no deletion of `main` | History on `main` is the record. |
| Admins may bypass | For an emergency fix. It shows in the audit log when used. |

Not required: `cla`. It is upstream's check. It asks for signatures that a fork
cannot collect from an agent's commits, and since commits are authored by the
owner (AGENTS.md → Commits), it passes on its own for new work.
