#!/usr/bin/env bash
# Shared by install.sh, backup.sh and restore.sh. Source it from the repo root, then call compose:
#   . scripts/podman-compose.sh
#   compose -f docker-compose.yml up -d
# Podman runs rootful here (ports 80 and 443 need it), so every call uses sudo unless the script already runs as root,
# which lets a root crontab work unchanged.
# POS_COMPOSE replaces the command altogether; the tests use it to stand in for Podman.
compose() {
  if [ -n "${POS_COMPOSE:-}" ]; then "$POS_COMPOSE" "$@"
  elif [ "$(id -u)" -eq 0 ]; then podman compose "$@"
  else sudo podman compose "$@"; fi
}
