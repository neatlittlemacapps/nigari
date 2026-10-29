# Quickstart: check the rename end to end

Run from the repository root on the feature branch. Ports and paths are examples.

## 1. The build check

```bash
cd web && npm run check
```

Expected: `names: 0 old names outside the allowlist`. Add `salt.md` to any
`web/src` string and run again: the check fails naming the file and line.

## 2. An old install moves (SC-001, SC-003)

```bash
mkdir -p /tmp/q011/data && cp server/testdata/upgrade/step-0.db /tmp/q011/data/salt.db
go build -o /tmp/q011/nigari .
NIGARI_DATA=/tmp/q011/data NIGARI_ADDR=127.0.0.1:8431 /tmp/q011/nigari
```

Expected:
- the log has the `rename:` line from [contracts/refusal.md](contracts/refusal.md);
- `/tmp/q011/data` holds `nigari.db` and no `salt.db`;
- signing in as `fixture@example.test` shows the page "Upgrade fixture", search finds "quokka", and the database "Hours" has its three rows and the chart view.

## 3. An old variable refuses (SC-005)

```bash
SALT_DATA=/tmp/q011/data /tmp/q011/nigari; echo "exit $?"
```

Expected: the refusal sentence naming `SALT_DATA → NIGARI_DATA`, `exit 2`, and no
file in `./data`.

```bash
SALT_DATA=/x NIGARI_DATA=/tmp/q011/data NIGARI_ADDR=127.0.0.1:8431 /tmp/q011/nigari
```

Expected: one "SALT_DATA is ignored" line, then a normal start on `/tmp/q011/data`.

## 4. Both files refuse

```bash
cp server/testdata/upgrade/step-0.db /tmp/q011/data/salt.db
NIGARI_DATA=/tmp/q011/data NIGARI_ADDR=127.0.0.1:8431 /tmp/q011/nigari
curl -s http://127.0.0.1:8431/api/me
```

Expected: `{"error":"…","code":"rename_conflict"}` with 503; both files unchanged.

## 5. The browser moves its preferences (FR-007)

```bash
npm test --prefix web/tests -- storage-move.mjs
```

Expected: a browser with `salt-theme=dark`, `salt-tabs`, `salt-recents` and
`salt-prefs` loads the app dark, with its tabs and recents. The `nigari-*` keys
are set and no `salt-*` key is left.

## 6. Nothing visible says salt.md (SC-002)

Open every screen in English, German and Spanish (the wiki screenshot run does
this: `node scripts/shoot-wiki.mjs`). Look at the retaken screenshots: only the
About screen's origin notice says salt.md.

## 7. After the merge

Check the release run: tag **v2.0.0**, assets `nigari-darwin-arm64`,
`nigari-darwin-amd64`, `nigari-linux-amd64`, `nigari-linux-arm64`,
`nigari-windows-amd64.exe`, `SHA256SUMS.txt`, and the image
`ghcr.io/neatlittlemacapps/nigari:2.0.0`.
