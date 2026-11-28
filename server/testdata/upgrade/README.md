# Upgrade fixtures

Databases written by an older release, kept so every later release proves it
can still open them (spec 008, FR-012). The fixture test copies each one to a
temporary directory, starts the server on it, and checks that the pages, rows,
views, comment, file and search in `upgradeFixture`
(`server/upgrade_fixture_test.go`) are all still there, and that the step number
is the newest one.

| File | Written by | Before |
| --- | --- | --- |
| `step-0.db` | `main` at `f9e35b9` (v1.6.10; the server code was unchanged since), before any step existed | step 1 |
| `step-1.db` | `main` at `f3fbaba`, the last commit with step 1 as the newest step | step 2 |
| `step-2.db` | `main` at `d106b79`, the last commit with step 2 as the newest step | step 3 |
| `step-3.db` | `main` at `0977418`, the last commit with step 3 as the newest step | step 4 |
| `step-4.db` | `main` at `f1918a8`, the last commit with step 4 as the newest step | step 5 |
| `step-5.db` | `main` at `fe6d0f6`, the last commit with step 5 as the newest step | step 6 |

## Adding one

Each new step N ships with `step-<N-1>.db`, written by the code **just before**
step N goes in (the commit that adds step N-1, or `main` before it):

```sh
NIGARI_WRITE_UPGRADE_FIXTURE=$PWD/server/testdata/upgrade/step-<N-1>.db \
  go test ./server -run TestWriteUpgradeFixture -count=1
```

Then add the file to the table above, saying which commit wrote it.

A fixture is never rewritten. Rewriting it with newer code would produce a
database that has already been upgraded, and the test would prove nothing; the
generator refuses an existing file for that reason. The content is a throwaway
instance: the account `fixture@example.test` and its password are invented.
