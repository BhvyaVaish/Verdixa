#!/bin/sh
# VERDIXA container entrypoint
# Runs: migrate deploy → idempotent seed → start app
# This script is safe to re-run on container restart.

set -e

echo "[entrypoint] Running database migrations..."
npx prisma migrate deploy --schema=./prisma/schema.prisma

echo "[entrypoint] Running idempotent seed..."
node --import tsx/esm ./prisma/seed.ts || npx tsx ./prisma/seed.ts

echo "[entrypoint] Starting application..."
exec "$@"
