#!/bin/sh
set -e
cd /repo/server
# Migrations are safe to repeat: the ones already applied are skipped.
bun src/infrastructure/database/migrate.ts
exec bun src/index.ts
