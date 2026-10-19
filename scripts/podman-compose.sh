#!/usr/bin/env bash
# Shared by install.sh, backup.sh and restore.sh. Source it from the repo root, then call compose:
#   . scripts/podman-compose.sh
#   prepare_podman
#   compose -f docker-compose.yml up -d
# On Linux, Podman runs rootful here (ports 80 and 443 need it), so every call uses sudo unless the script already
# runs as root, which lets a root crontab work unchanged. On a Mac, Podman runs inside a virtual machine that belongs
# to the user and is itself rootful, so there is no sudo.
# POS_COMPOSE replaces the command altogether; the tests use it to stand in for Podman.

is_mac() { [ "$(uname -s)" = Darwin ]; }

compose() {
  if [ -n "${POS_COMPOSE:-}" ]; then "$POS_COMPOSE" "$@"
  elif is_mac || [ "$(id -u)" -eq 0 ]; then podman compose "$@"
  else sudo podman compose "$@"; fi
}

# What to type to run a compose command by hand, for the messages.
compose_hint() {
  if is_mac || [ "$(id -u)" -eq 0 ]; then echo "podman compose"; else echo "sudo podman compose"; fi
}

# Homebrew is how Podman reaches a Mac: podman is the engine and docker-compose is the provider `podman compose` calls.
install_podman_mac() {
  is_mac || return 0
  if command -v podman >/dev/null 2>&1 && command -v docker-compose >/dev/null 2>&1; then return 0; fi
  if ! command -v brew >/dev/null 2>&1; then
    echo "Podman and Docker Compose are needed. Install Homebrew first (https://brew.sh), then run this script again." >&2
    return 1
  fi
  echo "Installing Podman and Docker Compose with Homebrew..."
  brew install podman docker-compose
}

# Makes sure the pieces a Mac needs are ready: a rootful, running Podman machine, no compose notices on stderr, and
# anonymous registry pulls (a Docker Desktop credential helper in ~/.docker would break the build). Nothing outside
# this process changes. Linux needs none of this.
prepare_podman() {
  [ -n "${POS_COMPOSE:-}" ] && return 0
  is_mac || return 0

  export PODMAN_COMPOSE_WARNING_LOGS=false
  DOCKER_CONFIG="$(mktemp -d)"
  echo '{}' > "$DOCKER_CONFIG/config.json"
  export DOCKER_CONFIG

  if [ -z "$(podman machine list --format '{{.Name}}' 2>/dev/null)" ]; then
    echo "Creating the Podman machine (first time only: downloads about 1 GB)..."
    podman machine init --rootful >/dev/null || { echo "The Podman machine could not be created." >&2; return 1; }
  fi

  if [ "$(podman machine inspect --format '{{.Rootful}}' 2>/dev/null | head -1)" != true ]; then
    # `machine set --rootful` only works on a stopped machine.
    if [ "$(podman machine inspect --format '{{.State}}' 2>/dev/null | head -1)" = running ]; then podman machine stop >/dev/null; fi
    podman machine set --rootful >/dev/null || { echo "The Podman machine could not be made rootful." >&2; return 1; }
  fi

  if [ "$(podman machine inspect --format '{{.State}}' 2>/dev/null | head -1)" != running ]; then
    echo "Starting the Podman machine..."
    podman machine start >/dev/null || { echo "The Podman machine could not be started. Try: podman machine start" >&2; return 1; }
  fi
}
