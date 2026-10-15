#!/usr/bin/env bash
# Saves the whole database to backups/easypos-<date>-<time>.sql.gz. Safe to run while the shop is open.
#   scripts/backup.sh [folder]
set -euo pipefail
cd "$(dirname "$0")/.."

DIR="${1:-backups}"
mkdir -p "$DIR"
FILE="$DIR/easypos-$(date +%Y%m%d-%H%M%S).sql.gz"

# --clean --if-exists: the file can be loaded over a database that already has the tables.
docker compose -f docker-compose.yml exec -T db pg_dump -U pos -d pos --clean --if-exists --no-owner \
  | gzip > "$FILE"

# A dump that is only the gzip header means pg_dump failed.
if [ "$(wc -c < "$FILE")" -lt 200 ]; then
  rm -f "$FILE"
  echo "The backup failed: is the database running? (docker compose ps)" >&2
  exit 1
fi
echo "Backup saved: $FILE ($(du -h "$FILE" | cut -f1))"

# Product images kept on this machine live in the app's volume; they go in a second file with the same name.
MEDIA_FILE="${FILE%.sql.gz}.media.tar.gz"
if docker compose -f docker-compose.yml exec -T app sh -c 'find /data/media -type f 2>/dev/null | head -n 1 | grep -q .'; then
  # Inside sh -c, so a shell that rewrites paths on its way to the command (Git Bash on Windows) leaves /data/media alone.
  docker compose -f docker-compose.yml exec -T app sh -c 'tar -czf - -C /data/media .' > "$MEDIA_FILE"     || { rm -f "$MEDIA_FILE"; echo "The images could not be saved." >&2; exit 1; }
  gzip -t "$MEDIA_FILE" || { rm -f "$MEDIA_FILE"; echo "The images could not be saved." >&2; exit 1; }
  echo "Images saved: $MEDIA_FILE ($(du -h "$MEDIA_FILE" | cut -f1))"
fi
echo "Keep a copy somewhere else too (another disk, or a cloud drive)."
