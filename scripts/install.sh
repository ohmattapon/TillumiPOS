#!/usr/bin/env bash
# Not supported yet: Linux has not been tested (Windows is the supported platform, see docs/install.md).
# Installs TillumiPOS with Podman Compose: writes .env with fresh secrets, starts it, and prints the setup code.
#
#   scripts/install.sh                      http://localhost:3000
#   scripts/install.sh --domain pos.my.shop  HTTPS on that domain (ports 80 and 443 must be free and reach this machine)
set -euo pipefail
cd "$(dirname "$0")/.."

DOMAIN=""
while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

# Podman runs rootful here (ports 80 and 443 need it), so every call uses sudo unless the script already runs as root.
compose() {
  if [ "$(id -u)" -eq 0 ]; then podman compose "$@"; else sudo podman compose "$@"; fi
}

command -v podman >/dev/null 2>&1 || { echo "Podman is not installed. Install it first: https://podman.io/getting-started/installation" >&2; exit 1; }
compose version >/dev/null 2>&1 || { echo "Podman Compose is not available: check with: sudo podman compose version" >&2; exit 1; }

secret() { head -c 256 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c "$1"; }

if [ -f .env ]; then
  echo ".env already exists: keeping it. Delete it first to make a fresh one."
else
  {
    echo "# Written by scripts/install.sh. Keep this file private: it holds the secrets of this shop."
    echo "POSTGRES_PASSWORD=$(secret 32)"
    echo "JWT_SECRET=$(secret 64)"
    echo "CHECKOUT_MODE=shifts"
    echo "PORT=3000"
    if [ -n "$DOMAIN" ]; then
      echo "DOMAIN=$DOMAIN"
      echo "COOKIE_SECURE=true"
    else
      echo "COOKIE_SECURE=false"
    fi
  } > .env
  chmod 600 .env 2>/dev/null || true
  echo "Wrote .env"
fi

PORT="$(grep -E '^PORT=' .env | tail -1 | cut -d= -f2 | tr -d '\r')"
PORT="${PORT:-3000}"
PROFILE=()
if grep -qE '^DOMAIN=.+' .env; then
  PROFILE=(--profile https)
  DOMAIN="$(grep -E '^DOMAIN=' .env | tail -1 | cut -d= -f2 | tr -d '\r')"
fi

compose -f docker-compose.yml "${PROFILE[@]}" up -d --build

echo "Waiting for the system to start..."
for _ in $(seq 1 90); do
  if curl -fsS "http://localhost:${PORT}/api/v1/health" >/dev/null 2>&1; then break; fi
  sleep 2
done
curl -fsS "http://localhost:${PORT}/api/v1/health" >/dev/null 2>&1 || {
  echo "The system did not start. See: sudo podman compose logs app" >&2
  exit 1
}

URL="http://localhost:${PORT}"
[ -n "$DOMAIN" ] && URL="https://${DOMAIN}"
echo
echo "TillumiPOS is running: ${URL}"
CODE="$(compose -f docker-compose.yml logs app 2>/dev/null | grep -o 'SETUP CODE[^:]*:  *[A-Z0-9]*' | tail -1 | grep -o '[A-Z0-9]*$' || true)"
if [ -n "$CODE" ]; then
  echo "First-time setup code: ${CODE}"
  echo "Open the address above and enter this code to create the owner account."
else
  echo "This shop is already set up: sign in at the address above."
fi
