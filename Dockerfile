# ─── Stage 1: Install dependencies ───────────────────────────────────────────
FROM node:20-alpine AS deps

RUN apk add --no-cache libc6-compat python3 make g++

WORKDIR /app

COPY package.json package-lock.json* ./
# Install all deps (including devDeps needed for build)
RUN npm ci

# ─── Stage 2: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client + vendor query engine binaries into the image.
# This is the only point in the lifecycle that is allowed network access for
# binary resolution. The running container must never need a network call.
# See blueprint §16.
RUN npx prisma generate

# Build Next.js in standalone mode (src/app is auto-detected by Next.js)
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# DATABASE_URL must be provided at build time for prisma to be happy,
# but the actual value is injected at runtime via docker-compose.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"

RUN npm run build

# ─── Stage 3: Production runner ───────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache openssl

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone Next.js server
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Prisma schema + migration files + seed (needed for migrate deploy + seed at startup)
COPY --from=builder /app/prisma ./prisma

# Copy vendored Prisma query engine binaries
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy node_modules needed at runtime (prisma CLI for migrate deploy, argon2, tsx for seed)
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/argon2 ./node_modules/argon2
COPY --from=builder /app/node_modules/tsx ./node_modules/tsx
COPY --from=builder /app/node_modules/typescript ./node_modules/typescript

# Copy src/ for the seed script to access domain types if needed
COPY --from=builder /app/src ./src

# Copy tools/acceptance fixtures for the seed to load
COPY --from=builder /app/tools ./tools

# Copy startup script
COPY --from=builder /app/docker/entrypoint.sh ./docker/entrypoint.sh
RUN chmod +x ./docker/entrypoint.sh

# Uploads volume mount point
RUN mkdir -p /app/uploads && chown nextjs:nodejs /app/uploads

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./docker/entrypoint.sh"]
CMD ["node", "server.js"]
