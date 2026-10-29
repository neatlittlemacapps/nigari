# Data model: Safe upgrades

## Upgrade step (code, not stored)

| Field | What it is |
| --- | --- |
| number | 1, 2, 3 …: its position, never reused or renumbered |
| run | a Go function on a transaction (`RunTx`), or for a table rebuild on the database with its own transaction (`RunDB`, P5) |
| fixture | `server/testdata/upgrade/step-<number-1>.db`, written by the code just before this step (required from step 2 on, P7) |

Step 1 is today's schema work (`schema` constant, the `ensureColumn` list, `webhooks`), frozen.

## Step number (stored)

goose's table, created by goose in `salt.db`:

| Column | Meaning |
| --- | --- |
| `version_id` | a step number that ran (0 is goose's own first row) |
| `is_applied` | true |
| `tstamp` | when it ran (the "last upgrade" time in maintenance) |

The database's step = `MAX(version_id)`. No table = no step yet (before step 1): every
database written before this feature.

## Last written by (stored, existing)

`schema_meta` row `version` = the release that last opened the database, written only after
the refusal check passed (FR-008). For people and logs; nothing decides on it.

## Pre-upgrade copy (file)

`<data>/salt.db.before-step-<n>`: a `VACUUM INTO` copy taken before step `n` ran, the
newest 3 kept (by step number), left out of `salt backup`. Restoring one: stop salt.md,
then `cp salt.db.before-step-<n> salt.db` (the log prints the exact line with paths).

## Upgrade lock (file)

`<data>/upgrade.lock`: PID and start time, present only while steps run; taken over when
older than 15 minutes (P4).

## Upgrade refusal (in memory)

| Field | Values |
| --- | --- |
| code | `upgrade_refused` (database newer than binary), `upgrade_failed` (a step failed), `upgrade_busy` (another process holds the lock), `upgrade_copy_failed` (the copy could not be written) |
| sentence | the one sentence for the log, the page and the JSON `error` |
