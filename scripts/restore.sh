#!/usr/bin/env bash
# Loads a backup made by scripts/backup.sh. It REPLACES everything in the database.
#   scripts/restore.sh backups/easypos-20261014-210000.sql.gz [--yes]
set -euo pipefail
cd "$(dirname "$0")/.."

FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Usage: scripts/restore.sh <backup file> [--yes]" >&2
  exit 2
fi
gzip -t "$FILE" || { echo "$FILE is not a valid backup (the file is damaged)." >&2; exit 1; }

if [ "${2:-}" != "--yes" ]; then
  echo "This replaces ALL data in the shop's database with the contents of:"
  echo "  $FILE"
  read -r -p "Type YES to go on: " answer
  [ "$answer" = "YES" ] || { echo "Cancelled."; exit 1; }
fi

echo "Stopping the app..."
docker compose -f docker-compose.yml stop app
echo "Loading the backup..."
gunzip -c "$FILE" | docker compose -f docker-compose.yml exec -T db psql -U pos -d pos -v ON_ERROR_STOP=1 --quiet
echo "Starting the app (it brings the database up to date if the backup is from an older version)..."
docker compose -f docker-compose.yml start app
echo "Restored from $FILE"
