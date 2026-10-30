#!/bin/sh
# nigari installer: downloads the right prebuilt binary, installs it, and
# starts it. Set NIGARI_NO_START=1 to install without starting.
#
#   curl -fsSL https://raw.githubusercontent.com/neatlittlemacapps/nigari/main/install.sh | sh
#
# The binary is fully self-contained (frontend embedded, no CGO, no runtime
# deps). Override the target dir with BIN_DIR=/path, pin a version with
# NIGARI_VERSION=v2.0.0, or install from another repository with
# NIGARI_REPO=owner/name.
#
# nigari was salt.md until v2.0.0 (spec 011). Run on a server that has the
# salt.md service, this moves it: the service, its data directory and the old
# binary (move_old_service below).
set -eu

REPO="${NIGARI_REPO:-neatlittlemacapps/nigari}"

say()  { printf '\033[1;32m»\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

# --- old variable names -------------------------------------------------------
# The same rule as the server's (server/oldnames.go): a SALT_X without its
# NIGARI_X stops here with a sentence rather than being ignored. Ignored,
# SALT_VERSION would install a different release than the one asked for.
old_alone=''
for name in $(env | sed -n 's/^\(SALT_[A-Za-z0-9_]*\)=.*/\1/p'); do
  new="NIGARI_${name#SALT_}"
  if env | grep -q "^$new="; then
    say "$name is ignored: $new is set. Remove $name where it is set."
  else
    old_alone="$old_alone${old_alone:+, }$name → $new"
  fi
done
[ -z "$old_alone" ] || err "nigari was not installed: these variables still have their salt.md names: $old_alone. Rename them and run this again. Nothing was changed."

# --- an existing salt.md service ----------------------------------------------
# A server set up by salt.md's installer has /etc/systemd/system/salt.service,
# its data in /var/lib/salt (or wherever its SALT_DATA points) and the binary
# /usr/local/bin/salt. Installing nigari next to it would write nigari.service
# over an empty /var/lib/nigari while the data sits in /var/lib/salt: the
# workspace would look lost. So the old service is moved instead: stopped,
# its data directory moved (when it is the default one), its unit and binary
# removed. The salt user is left in place; removing a system account is not an
# installer's call. NIGARI_INSTALL_ROOT prefixes every path, for
# scripts/test-install-move.sh only.
root="${NIGARI_INSTALL_ROOT:-}"
old_unit="$root/etc/systemd/system/salt.service"
old_data=''
old_port=''
if [ -f "$old_unit" ]; then
  old_data=$(sed -n 's/^Environment=SALT_DATA=//p' "$old_unit" | tail -n1)
  old_port=$(sed -n 's/^Environment=SALT_ADDR=.*:\([0-9][0-9]*\)$/\1/p' "$old_unit" | tail -n1)
fi

# Prints each step; sets svcdata to the directory the new service will use.
move_old_service() {
  [ -f "$old_unit" ] || return 0
  say "Found the salt.md service. Moving it to nigari."
  systemctl stop salt 2>/dev/null || true
  systemctl disable salt >/dev/null 2>&1 || true
  case "${old_data:-/var/lib/salt}" in
    /var/lib/salt)
      if [ -d "$root/var/lib/salt" ]; then
        [ ! -e "$root/var/lib/nigari" ] || err "Both /var/lib/salt and /var/lib/nigari exist, and the installer will not choose between them. Keep the one with your data, move the other away, and run this again. The salt.md service is stopped; nothing else was changed."
        mv "$root/var/lib/salt" "$root/var/lib/nigari"
        say "Moved /var/lib/salt to /var/lib/nigari."
      fi
      svcdata=/var/lib/nigari
      ;;
    *)
      # A data directory somebody chose stays where they chose it.
      svcdata=$old_data
      say "Keeping the data directory $svcdata."
      ;;
  esac
  moved_data=yes
  rm -f "$old_unit"
  say "Removed salt.service."
  if [ -f "$root$bindir/salt" ]; then
    rm -f "$root$bindir/salt"
    say "Removed $bindir/salt; the command is nigari now."
  fi
  systemctl daemon-reload 2>/dev/null || true
}

svcdata=/var/lib/nigari
moved_data=no

# --- detect platform --------------------------------------------------------
os=$(uname -s | tr '[:upper:]' '[:lower:]')
arch=$(uname -m)
case "$os" in
  linux|darwin) ;;
  *) err "Unsupported OS: $os (nigari ships prebuilt binaries for linux and macOS; build from source for others)";;
esac
case "$arch" in
  x86_64|amd64) arch=amd64 ;;
  aarch64|arm64) arch=arm64 ;;
  *) err "Unsupported architecture: $arch" ;;
esac
asset="nigari-${os}-${arch}"

# --- resolve download URL ---------------------------------------------------
ver="${NIGARI_VERSION:-latest}"
if [ "$ver" = "latest" ]; then
  url="https://github.com/$REPO/releases/latest/download/$asset"
else
  url="https://github.com/$REPO/releases/download/$ver/$asset"
fi

# --- pick a fetcher ---------------------------------------------------------
if command -v curl >/dev/null 2>&1; then
  fetch() { curl -fsSL "$1" -o "$2"; }
elif command -v wget >/dev/null 2>&1; then
  fetch() { wget -qO "$2" "$1"; }
else
  err "Neither curl nor wget is available."
fi

# --- pick an install dir ----------------------------------------------------
use_sudo=
if [ -n "${BIN_DIR:-}" ]; then
  bindir="$BIN_DIR"
elif [ -w /usr/local/bin ]; then
  bindir=/usr/local/bin
elif command -v sudo >/dev/null 2>&1; then
  bindir=/usr/local/bin
  use_sudo=1
else
  bindir="$HOME/.local/bin"
fi

# scripts/test-install-move.sh: the move alone, against a scratch root, with
# nothing downloaded.
if [ -n "$root" ]; then
  bindir=/usr/local/bin
  move_old_service
  printf '%s\n' "$svcdata" > "$root/.svcdata"
  exit 0
fi

say "Downloading nigari ($asset, $ver)…"
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
fetch "$url" "$tmp" || err "Download failed. Is there a release yet? $url"
# A GitHub 404 page is HTML, not an ELF/Mach-O binary — catch that early.
if head -c 4 "$tmp" | grep -q '<!DO\|<htm\|<HTM' 2>/dev/null || [ ! -s "$tmp" ]; then
  err "Downloaded file is not a binary — the release asset '$asset' may not exist yet."
fi
chmod +x "$tmp"

say "Installing to $bindir/nigari"
if [ -n "$use_sudo" ]; then
  sudo mkdir -p "$bindir" && sudo mv "$tmp" "$bindir/nigari"
else
  mkdir -p "$bindir" && mv "$tmp" "$bindir/nigari"
fi
trap - EXIT

# `nigari version` already prints a leading v, and $ver is "latest" when nobody
# pinned one — so normalise instead of gluing a v in front of whatever comes
# back, which produced "vv1.0.0" and could have produced "vlatest".
installed=$("$bindir/nigari" version 2>/dev/null || echo "$ver")
installed=${installed#v}
case "$installed" in latest|'') installed='' ;; *) installed="v$installed   " ;; esac

# --- the address somebody can actually open ---------------------------------
# Almost nobody installs this on the machine they are sitting at. Printing
# "localhost" to a person three hops into an SSH session sends them to their
# own laptop, and that is the most common way a fresh install goes nowhere.
#
# Every probe ends in `|| true`: `set -e` is on, and a machine without
# `hostname -I` must not lose the whole summary over it. Linux first, because
# that is where this mostly runs.
lan=$(hostname -I 2>/dev/null | awk '{ print $1 }' || true)
[ -n "$lan" ] || lan=$(ip route get 1.1.1.1 2>/dev/null | awk '{ for (i = 1; i < NF; i++) if ($i == "src") { print $(i + 1); exit } }' || true)
[ -n "$lan" ] || lan=$(ipconfig getifaddr en0 2>/dev/null || true)

# The port is not always 8420: NIGARI_ADDR moves it, and printing the default
# regardless sends people to a port nothing is listening on. Take whatever
# follows the last colon, fall back to the default when NIGARI_ADDR is unset or
# is a bare address.
# `set -u` is on, so NIGARI_ADDR has to be defaulted before it is expanded —
# ${NIGARI_ADDR##*:} on its own aborts the whole install when nobody set it,
# which is every ordinary run.
addr=${NIGARI_ADDR:-}
port=${addr##*:}
# A moved salt.md service keeps its port.
case "$port" in ''|*[!0-9]*) port=${old_port:-8420} ;; esac

case "$lan" in
  ''|127.*) url="http://localhost:$port"; also='' ;;
  *)        url="http://$lan:$port";      also="http://localhost:$port" ;;
esac

# --- run it ------------------------------------------------------------------
# One command should end with a running instance, not with homework.
#
# On a Linux server that means a service, not a foreground process. A process
# holds the terminal, dies with the SSH session, and is gone after a reboot;
# nobody ships software that way. So when this is root on a machine running
# systemd, it installs a unit and starts it: the terminal comes back, a crash
# restarts it, and a reboot brings it up again.
#
# Everywhere else it runs here in the foreground, which is the right thing on a
# laptop somebody is trying it out on.
service_possible() {
  [ "$os" = linux ] || return 1
  [ "$(id -u)" = 0 ] || return 1
  command -v systemctl >/dev/null 2>&1 || return 1
  # systemctl can be installed in a container where systemd runs nothing. This
  # directory is what tells a real init apart from a leftover binary.
  [ -d /run/systemd/system ] || return 1
}

install_service() {
  id nigari >/dev/null 2>&1 || useradd --system --home-dir "$svcdata" --shell /usr/sbin/nologin nigari 2>/dev/null || true
  install -d -o nigari -g nigari "$svcdata"
  # A moved data directory was salt's: its files too, not only the directory.
  [ "$moved_data" = no ] || chown -R nigari:nigari "$svcdata"

  cat > /etc/systemd/system/nigari.service <<UNIT
[Unit]
Description=nigari
Documentation=https://github.com/neatlittlemacapps/nigari/tree/main/wiki
After=network-online.target
Wants=network-online.target

[Service]
User=nigari
Group=nigari
ExecStart=$bindir/nigari
Environment=NIGARI_ADDR=:$port
Environment=NIGARI_DATA=$svcdata
WorkingDirectory=$svcdata
Restart=on-failure
RestartSec=2
KillSignal=SIGTERM
TimeoutStopSec=20
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
UNIT

  systemctl daemon-reload
  systemctl enable nigari >/dev/null 2>&1 || true
  systemctl restart nigari
}

# Decide BEFORE anything is printed, so the summary can name the directory that
# will actually be used. Printing $PWD/data and then installing a service that
# reads /var/lib/nigari is how somebody goes looking for a database that was
# never there.
if [ -z "${NIGARI_NO_SERVICE:-}" ] && service_possible; then
  as_service=yes
  had_unit=no
  [ -f /etc/systemd/system/nigari.service ] && had_unit=yes
  # Before the summary, so it names the directory the moved service uses.
  [ "$had_unit" = yes ] || [ ! -f "$old_unit" ] || { had_unit=moved; move_old_service; }
  datadir=$svcdata
else
  as_service=no
  datadir=$PWD/data
fi

# Colour only for a terminal. Piped into a file or a log, the escapes would be
# the only thing anybody sees.
if [ -t 1 ]; then
  b=$(printf '\033[1m'); d=$(printf '\033[2m'); r=$(printf '\033[0m')
  g1=$(printf '\033[38;5;211m'); g3=$(printf '\033[38;5;177m'); g5=$(printf '\033[38;5;110m')
else
  b=''; d=''; r=''; g1=''; g3=''; g5=''
fi

printf '\n'
printf '  %s█▄ █ █ █▀▀▀ █▀▀█ █▀▀▄ █%s\n' "$g1" "$r"
printf '  %s█ ▀█ █ █ ▀█ █▄▄█ █▄▄▀ █%s\n' "$g3" "$r"
printf '  %s▀  ▀ ▀ ▀▀▀▀ ▀  ▀ ▀  ▀ ▀%s\n' "$g5" "$r"
printf '\n  %s%sthe workspace people and agents share%s\n\n' "$d" "$installed" "$r"

printf '  Open in browser   %s%s%s\n' "$b" "$url" "$r"
[ -n "$also" ] && printf '                    %s%s on the machine itself%s\n' "$d" "$also" "$r"
printf '  Star it           %shttps://github.com/%s%s\n' "$d" "$REPO" "$r"
printf '  Data              %s%s%s\n' "$d" "$datadir" "$r"
printf '\n'


if [ "$as_service" = yes ]; then
  install_service

  # Report it running because it IS, not because systemctl exited 0.
  i=0
  while [ "$i" -lt 30 ] && ! systemctl is-active --quiet nigari; do
    i=$((i + 1))
    sleep 1
  done

  if systemctl is-active --quiet nigari; then
    if [ "$had_unit" = yes ]; then
      printf '  %sUpdated. It was already running as a service, and was restarted.%s\n' "$d" "$r"
    elif [ "$had_unit" = moved ]; then
      printf '  %sMoved from salt.md and running as the nigari service, on the same data.%s\n' "$d" "$r"
    else
      printf '  %sInstalled as a service: it starts on boot and restarts after a crash.%s\n' "$d" "$r"
    fi
    printf '  %ssystemctl status nigari   ·   journalctl -u nigari -f%s\n' "$d" "$r"
    # A foreground run earlier wrote its database into whatever directory it was
    # started from. The service reads a different one, so an empty workspace here
    # is a file in the other place and not a lost one.
    # salt.md's foreground runs wrote ./data/salt.db; nigari's write nigari.db.
    fg=''
    for f in nigari.db salt.db; do [ -f "./data/$f" ] && fg=$f && break; done
    if [ -n "$fg" ] && [ ! -f "$svcdata/nigari.db" ] && [ ! -f "$svcdata/salt.db" ]; then
      printf '\n  %sNote: ./data/%s is from an earlier foreground run. The service uses%s\n' "$d" "$fg" "$r"
      printf '  %s%s, so it starts empty. Nothing was deleted.%s\n' "$d" "$svcdata" "$r"
    fi
    printf '\n'
  else
    printf '  %sThe service did not come up. journalctl -u nigari says why.%s\n\n' "$d" "$r"
  fi
  exit 0
fi

# Not a systemd server. Piped into a Dockerfile or a provisioning script a
# foreground process would block forever, so a non-tty install prints the
# command and gets out of the way.
if [ -n "${NIGARI_NO_START:-}" ] || [ ! -t 1 ]; then
  case ":$PATH:" in
    *":$bindir:"*) printf '  Run it:   nigari\n' ;;
    *)             printf '  %s is not on your PATH. Run it with:\n            %s/nigari\n' "$bindir" "$bindir" ;;
  esac
  exit 0
fi

# No "starting it now" line: the server's own "listening on" line arrives a
# breath later and says it better. What a person needs here is the way back out.
printf '  %sCtrl-C stops it. Run%s nigari %sto start it again.%s\n\n' "$d" "$r" "$d" "$r"
exec "$bindir/nigari"
