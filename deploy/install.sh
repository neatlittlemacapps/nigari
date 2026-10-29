#!/bin/sh
# Installs nigari as a systemd service. Run as root on the target machine:
#   ./deploy/install.sh ./nigari
set -e

BIN="${1:-./nigari}"
[ -f "$BIN" ] || { echo "usage: $0 <path-to-nigari-binary>"; exit 1; }

# nigari was salt.md until v2.0.0 (spec 011). This script used to install into
# /opt/salt; installing next to it would start on an empty /opt/nigari/data
# while the workspace sits in /opt/salt/data. Stop instead and say what to do.
if [ -d /opt/salt/data ] && [ ! -e /opt/nigari ]; then
  echo "Found salt.md in /opt/salt. Move it first, then run this again:"
  echo "  systemctl disable --now salt && mv /opt/salt /opt/nigari && rm /opt/nigari/salt /etc/systemd/system/salt.service"
  exit 1
fi

id nigari >/dev/null 2>&1 || useradd -r -s /usr/sbin/nologin nigari
install -d /opt/nigari
install -m 755 "$BIN" /opt/nigari/nigari
install -d -o nigari -g nigari /opt/nigari/data
chown -R nigari:nigari /opt/nigari/data
install -m 644 "$(dirname "$0")/nigari.service" /etc/systemd/system/nigari.service
systemctl daemon-reload
systemctl enable --now nigari

echo "nigari is running on port 80."
