#!/usr/bin/env bash
# Not supported yet: Linux has not been tested (Windows is the supported platform, see docs/install.md).
# Loads a backup made by scripts/backup.sh. It REPLACES everything in the database.
#   scripts/restore.sh backups/easypos-20261014-210000.sql.gz [--yes]
set -euo pipefail
cd "$(dirname "$0")/.."

# Podman runs rootful (see install.sh): sudo unless already root.
# POS_COMPOSE replaces the command altogether; the tests use it to stand in for Podman.
compose() {
  if [ -n "${POS_COMPOSE:-}" ]; then "$POS_COMPOSE" "$@"
  elif [ "$(id -u)" -eq 0 ]; then podman compose "$@"
  else sudo podman compose "$@"; fi
}

FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Usage: scripts/restore.sh <backup file> [--yes]" >&2
  exit 2
fi
gzip -t "$FILE" || { echo "$FILE is not a valid backup (the file is damaged)." >&2; exit 1; }
# Checked before anything is touched: a dump that was cut off would leave the database half empty.
gunzip -c "$FILE" | tail -n 20 | grep -q 'PostgreSQL database dump complete' \
  || { echo "$FILE is not a complete backup (it was cut off). Nothing was changed." >&2; exit 1; }

if [ "${2:-}" != "--yes" ]; then
  echo "This replaces ALL data in the shop's database with the contents of:"
  echo "  $FILE"
  [ -f "${FILE%.sql.gz}.media.tar.gz" ] && echo "  and the product images in ${FILE%.sql.gz}.media.tar.gz"
  read -r -p "Type YES to go on: " answer
  [ "$answer" = "YES" ] || { echo "Cancelled."; exit 1; }
fi

echo "Stopping the app..."
compose -f docker-compose.yml stop app
echo "Loading the backup..."
# One transaction: if anything in the file fails, the database is left exactly as it was.
if ! gunzip -c "$FILE" | compose -f docker-compose.yml exec -T db psql -U pos -d pos -v ON_ERROR_STOP=1 --single-transaction --quiet; then
  echo "The restore failed, and the database was left as it was. Starting the app again..." >&2
  compose -f docker-compose.yml start app
  exit 1
fi
echo "Starting the app (it brings the database up to date if the backup is from an older version)..."
compose -f docker-compose.yml start app

# The images saved with it, if any. A dump without them leaves the images that are there alone.
MEDIA_FILE="${FILE%.sql.gz}.media.tar.gz"
if [ -f "$MEDIA_FILE" ]; then
  gzip -t "$MEDIA_FILE" || { echo "$MEDIA_FILE is damaged; the database is restored but the images are not." >&2; exit 1; }
  echo "Restoring the images..."
  compose -f docker-compose.yml exec -T app sh -c 'rm -rf /data/media/* && tar -xzf - -C /data/media' < "$MEDIA_FILE"
fi
echo "Restored from $FILE"
