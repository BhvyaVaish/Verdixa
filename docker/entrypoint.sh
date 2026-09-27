#!/bin/sh
# VERDIXA container entrypoint
# Runs: migrate deploy → idempotent seed → start app
# This script is safe to re-run on container restart.

set -e

echo "[entrypoint] Running database migrations..."
if [ -f "./prisma/migrations/migration_lock.toml" ]; then
  npx prisma migrate deploy --schema=./prisma/schema.prisma
else
  echo "[entrypoint] No formal migrations found, syncing schema with db push..."
  npx prisma db push --schema=./prisma/schema.prisma --accept-data-loss
fi

echo "[entrypoint] Running idempotent seed..."
npx tsx ./prisma/seed.ts

echo "[entrypoint] Starting application..."
exec "$@"
