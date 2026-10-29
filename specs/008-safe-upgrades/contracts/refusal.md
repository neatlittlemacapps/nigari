# The refused start (FR-019)

When start-up is refused, `salt` logs the sentence and serves on its usual address:

| Request | Answer |
| --- | --- |
| `/api/…`, `/mcp` | `503`, `{"error": "<sentence>", "code": "<code>"}` |
| anything else | `503`, an HTML page: the sentence, the way out, the code |

Codes and their sentences (numbers and paths filled in):

| Code | When | Sentence |
| --- | --- | --- |
| `upgrade_refused` | database step > newest step | "This database is at upgrade step N, but this salt.md (R) only knows steps up to M. It has not been changed. Run the salt.md release that upgraded it, or put back the copy taken before that upgrade: <command>." |
| `upgrade_failed` | a step returned an error | "Upgrade step N failed: <reason>. The database is as it was before that step (at step N-1). A copy from before the upgrade is at <path>. Fix the cause and start salt.md again." |
| `upgrade_copy_failed` | the copy could not be written | "No upgrade step ran: the copy of the database (S MB) could not be written to <dir>: <reason>. Free space there and start salt.md again." |
| `upgrade_busy` | another process holds the lock | "Another salt.md is upgrading this data directory (process P, since T). Wait for it to finish, or stop it." |

Nothing in the data directory is written while refused. The page has no scripts and no
links into the app.
