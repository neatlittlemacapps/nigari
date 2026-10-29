# Contract: refusals at start-up

## Old environment variables (FR-006)

**When**: any `SALT_<X>` is set and `NIGARI_<X>` is not. Checked first in `main`,
before any variable is read and before any file is opened.

**Effect**: one log line, exit status **2**, nothing written anywhere, no listener.

**Sentence** (one line; pairs in the order of the environment, joined by `, `):

```text
nigari did not start: these variables still have their salt.md names: SALT_DATA → NIGARI_DATA, SALT_ADDR → NIGARI_ADDR. Rename them where they are set (service file, compose file, shell) and start again. Nothing was changed.
```

**Beside its new name** (both set): start-up continues, using `NIGARI_<X>`, with one line per old variable:

```text
SALT_DATA is ignored: NIGARI_DATA is set. Remove SALT_DATA where it is set.
```

`install.sh` applies the same rule to its own variables (`SALT_VERSION`,
`SALT_REPO`, `SALT_NO_START`, `SALT_NO_SERVICE`), with the same wording, before it
downloads anything.

## Both database files present: `rename_conflict`

**When**: the data directory holds both `salt.db` and `nigari.db` (a v2 started
on an empty directory once, then an old `salt.db` was copied in).

**Effect**: spec 008's refusal path. Log line, refusal page on the usual address,
`/api/…` and `/mcp` answer **503** with JSON:

```json
{ "error": "<sentence>", "code": "rename_conflict" }
```

**Sentence**:

```text
nigari did not start: this data directory holds both salt.db and nigari.db, and it will not choose between them. Keep the one with your data, move the other out of the directory, and start again. Nothing was changed.
```

`web/src/serverErrors.ts` gains `rename_conflict` with a translated sentence
(German required, Spanish reported).

## The move itself (not a refusal)

One log line when it ran:

```text
rename: salt.db is now nigari.db (and 2 copies from earlier upgrades). Nothing inside it changed.
```

Plus one `audit("system", "rename", …)` entry.
