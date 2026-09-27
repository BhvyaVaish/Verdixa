/**
 * Schema migration script for Phase 5 tables.
 * Run this instead of `prisma db push` when TCP port 5432 is blocked.
 * Uses the pooler connection which the app already has working.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  console.log("[migration] Creating Phase 5 tables...");

  await db.$executeRawUnsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CommentStatus') THEN
        CREATE TYPE "CommentStatus" AS ENUM ('visible', 'hidden');
      END IF;
    END $$;
  `);

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "VotingWindow" (
      "id" TEXT NOT NULL,
      "eventId" TEXT NOT NULL,
      "opensAt" TIMESTAMP(3) NOT NULL,
      "closesAt" TIMESTAMP(3) NOT NULL,
      "resultsHidden" BOOLEAN NOT NULL DEFAULT true,
      "createdBy" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "VotingWindow_pkey" PRIMARY KEY ("id")
    );
  `);
  await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "VotingWindow_eventId_idx" ON "VotingWindow"("eventId");`);
  await db.$executeRawUnsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'VotingWindow_eventId_fkey'
      ) THEN
        ALTER TABLE "VotingWindow" ADD CONSTRAINT "VotingWindow_eventId_fkey"
          FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
        ALTER TABLE "VotingWindow" ADD CONSTRAINT "VotingWindow_createdBy_fkey"
          FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      END IF;
    END $$;
  `);

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Vote" (
      "id" TEXT NOT NULL,
      "votingWindowId" TEXT NOT NULL,
      "voterId" TEXT NOT NULL,
      "projectId" TEXT NOT NULL,
      "ipHash" TEXT NOT NULL,
      "ballotSeed" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "retractedAt" TIMESTAMP(3),
      CONSTRAINT "Vote_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "Vote_votingWindowId_voterId_projectId_key" UNIQUE ("votingWindowId", "voterId", "projectId")
    );
  `);
  await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Vote_votingWindowId_idx" ON "Vote"("votingWindowId");`);
  await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Vote_voterId_idx" ON "Vote"("voterId");`);
  await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Vote_projectId_idx" ON "Vote"("projectId");`);
  await db.$executeRawUnsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'Vote_votingWindowId_fkey'
      ) THEN
        ALTER TABLE "Vote" ADD CONSTRAINT "Vote_votingWindowId_fkey"
          FOREIGN KEY ("votingWindowId") REFERENCES "VotingWindow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
        ALTER TABLE "Vote" ADD CONSTRAINT "Vote_voterId_fkey"
          FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
        ALTER TABLE "Vote" ADD CONSTRAINT "Vote_projectId_fkey"
          FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      END IF;
    END $$;
  `);

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "VoteRateLimit" (
      "id" TEXT NOT NULL,
      "votingWindowId" TEXT NOT NULL,
      "ipHash" TEXT NOT NULL,
      "attempts" INTEGER NOT NULL DEFAULT 1,
      "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "lastAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "VoteRateLimit_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "VoteRateLimit_votingWindowId_ipHash_key" UNIQUE ("votingWindowId", "ipHash")
    );
  `);
  await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "VoteRateLimit_votingWindowId_idx" ON "VoteRateLimit"("votingWindowId");`);

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Comment" (
      "id" TEXT NOT NULL,
      "projectId" TEXT NOT NULL,
      "authorId" TEXT NOT NULL,
      "body" TEXT NOT NULL,
      "status" "CommentStatus" NOT NULL DEFAULT 'visible',
      "hideReason" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
    );
  `);
  await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Comment_projectId_idx" ON "Comment"("projectId");`);
  await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Comment_authorId_idx" ON "Comment"("authorId");`);
  await db.$executeRawUnsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'Comment_projectId_fkey'
      ) THEN
        ALTER TABLE "Comment" ADD CONSTRAINT "Comment_projectId_fkey"
          FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey"
          FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      END IF;
    END $$;
  `);

  console.log("[migration] Phase 5 tables created successfully.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
