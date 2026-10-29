#!/usr/bin/env bash
# Tests install.sh's move of a salt.md service to nigari (spec 011, T017).
#
#   scripts/test-install-move.sh
#
# The move is the one part of the installer that can lose a workspace: done
# wrong, nigari.service starts on an empty /var/lib/nigari while the data sits
# in /var/lib/salt. It cannot run for real here (root, systemd), so install.sh
# runs against a scratch root (NIGARI_INSTALL_ROOT), with systemctl stubbed on
# PATH, and this checks what it left behind.
set -euo pipefail

here="$(cd "$(dirname "$0")/.." && pwd)"
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
fails=0
fail() { echo "  FAIL  $1" >&2; fails=$((fails + 1)); }

# systemctl and chown do nothing here; the calls are logged.
mkdir -p "$scratch/bin"
for cmd in systemctl; do
  printf '#!/bin/sh\necho "%s $*" >> "%s/calls"\n' "$cmd" "$scratch" > "$scratch/bin/$cmd"
  chmod +x "$scratch/bin/$cmd"
done

# A server as salt.md's installer left it.
setup() {
  local root="$1" data="$2"
  rm -rf "$root"
  mkdir -p "$root/etc/systemd/system" "$root/usr/local/bin" "$root$data"
  printf '[Service]\nUser=salt\nExecStart=/usr/local/bin/salt\nEnvironment=SALT_ADDR=:8421\nEnvironment=SALT_DATA=%s\n' "$data" \
    > "$root/etc/systemd/system/salt.service"
  echo "binary" > "$root/usr/local/bin/salt"
  echo "the workspace" > "$root$data/salt.db"
}

run() {
  env -i PATH="$scratch/bin:/usr/bin:/bin" HOME="$scratch" NIGARI_INSTALL_ROOT="$1" sh "$here/install.sh" >"$scratch/out" 2>&1
}

# 1. The default data directory moves with its database.
r="$scratch/root1"
setup "$r" /var/lib/salt
if ! run "$r"; then fail "the move failed: $(cat "$scratch/out")"; fi
[[ "$(cat "$r/var/lib/nigari/salt.db" 2>/dev/null)" == "the workspace" ]] || fail "the database is not in /var/lib/nigari"
[[ ! -e "$r/var/lib/salt" ]] || fail "/var/lib/salt is still there"
[[ ! -e "$r/etc/systemd/system/salt.service" ]] || fail "salt.service was not removed"
[[ ! -e "$r/usr/local/bin/salt" ]] || fail "the salt binary was not removed"
[[ "$(cat "$r/.svcdata")" == /var/lib/nigari ]] || fail "the new service would use $(cat "$r/.svcdata"), not /var/lib/nigari"
grep -q "systemctl stop salt" "$scratch/calls" || fail "the old service was not stopped"

# 2. A data directory somebody chose stays where it is.
r="$scratch/root2"
setup "$r" /srv/salt
if ! run "$r"; then fail "the move with /srv/salt failed: $(cat "$scratch/out")"; fi
[[ "$(cat "$r/.svcdata")" == /srv/salt ]] || fail "a chosen data directory was not kept: $(cat "$r/.svcdata")"
[[ -f "$r/srv/salt/salt.db" ]] || fail "the database in /srv/salt moved"

# 3. Both directories present: refused, nothing moved.
r="$scratch/root3"
setup "$r" /var/lib/salt
mkdir -p "$r/var/lib/nigari"
if run "$r"; then fail "both /var/lib/salt and /var/lib/nigari: the installer did not refuse"; fi
grep -q "will not choose" "$scratch/out" || fail "the refusal does not say why: $(cat "$scratch/out")"
[[ -f "$r/var/lib/salt/salt.db" && -f "$r/etc/systemd/system/salt.service" ]] || fail "the refused move changed files"

# 4. An old variable alone refuses before anything.
r="$scratch/root4"
setup "$r" /var/lib/salt
if env -i PATH="$scratch/bin:/usr/bin:/bin" HOME="$scratch" NIGARI_INSTALL_ROOT="$r" SALT_VERSION=v1.6.11 sh "$here/install.sh" >"$scratch/out" 2>&1; then
  fail "SALT_VERSION alone: the installer did not refuse"
fi
grep -q "SALT_VERSION → NIGARI_VERSION" "$scratch/out" || fail "the refusal does not name the rename: $(cat "$scratch/out")"
[[ -d "$r/var/lib/salt" ]] || fail "the refused install moved data"

if [[ $fails -ne 0 ]]; then
  echo "install move: $fails failure(s)" >&2
  exit 1
fi
echo "  install move: 4 cases passed"
