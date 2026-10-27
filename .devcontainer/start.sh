#!/usr/bin/env bash
# Builds the checked-out commit and runs it on :8420 with invented content.
#
#   .devcontainer/start.sh        # run by the codespace on every start;
#                                 # run it again after `git pull` to update
#
# The data folder lives outside the repository and holds only what
# web/scripts/seed-wiki-instance.mjs writes: Ada Lovelace, Northwind, Acme.
# Never copy a real salt.db into a codespace: it runs on GitHub's machines.
set -euo pipefail
cd "$(dirname "$0")/.."

data="$HOME/salt-demo"
pidfile="$HOME/salt-demo.pid"
log="$HOME/salt-demo.log"

if [[ -f "$pidfile" ]] && kill "$(cat "$pidfile")" 2>/dev/null; then
  echo "start: stopped the previous instance"
fi

# The release build (npm run build runs the check gate first), minus
# `make backend`'s `go mod tidy`: that rewrites go.mod in the codespace, and a
# changed file there makes the next `git pull` refuse.
make frontend
CGO_ENABLED=0 go build -trimpath -o salt .

# setsid + nohup: the codespace runs this as a lifecycle command and would
# otherwise take the server down with it when the command returns. macOS has
# no setsid, and there the script runs from a terminal that stays open, so
# nohup alone is enough (it failed with "setsid: command not found").
detach=(nohup)
command -v setsid >/dev/null && detach=(setsid nohup)
SALT_DATA="$data" SALT_ADDR=:8420 "${detach[@]}" ./salt >"$log" 2>&1 < /dev/null &
echo $! >"$pidfile"

for _ in $(seq 1 60); do
  curl -fs -o /dev/null http://127.0.0.1:8420/ && break
  sleep 1
done
curl -fs -o /dev/null http://127.0.0.1:8420/ || { echo "start: the server did not come up; see $log" >&2; exit 1; }

# The seeder refuses an instance that already has an account, so this only
# fills a fresh data folder.
SALT_SEED_URL=http://127.0.0.1:8420 node web/scripts/seed-wiki-instance.mjs || true

cat <<MSG

  salt.md is running on port 8420 ($(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD)).
  Open it from the Ports tab, or the URL the codespace shows.
  Sign in: ada@example.com / WikiPruefung2026!   (invented test account)
  Log: $log
MSG
