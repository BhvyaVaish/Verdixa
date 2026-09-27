/**
 * Voting Service (ADR-004 / Phase 5)
 *
 * Authenticated voting: one vote per user per project per VotingWindow.
 * Results hidden to non-organizers while window is open.
 * Randomised ballot ordering per voter (seeded by userId+windowId, deterministic).
 * Rate limiting: DB-backed VoteRateLimit (falls back gracefully when no Redis).
 *
 * VOTING MECHANISM DECISION: authenticated (session-cookie) voting.
 * Rationale: all participants are already registered accounts — reusing the
 * existing session avoids a second email-verification flow and its deliverability
 * risk, while providing a hard account-level deduplication anchor. IP hashing
 * supplements account deduplication for additional abuse resistance.
 * Link-based and email-gated were rejected: link-based has no deduplication
 * anchor without JS fingerprinting; email-gated adds SMTP dependency and
 * delivery latency that increases friction for legitimate voters.
 */

import { createHash } from "crypto";
import { db } from "@/lib/db";

// Rate-limit: max votes per IP per window within the rate window period.
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// In-process fallback rate limiter (used when DB is unavailable for rate-limit table).
const inProcessRateMap = new Map<string, { count: number; windowStart: number }>();

function hashIp(ip: string): string {
  return createHash("sha256").update(ip + "verdixa-salt-v1").digest("hex");
}

/** Seeded shuffle — same userId+windowId always produces the same project order. */
function seededShuffle<T>(arr: T[], seed: string): T[] {
  const copy = [...arr];
  // Simple seeded LCG
  let s = [...seed].reduce((acc, c) => acc * 31 + c.charCodeAt(0), 0) >>> 0;
  const next = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/** Check + increment rate limit for an IP within a voting window. Returns true if allowed. */
async function checkRateLimit(votingWindowId: string, ipHash: string): Promise<boolean> {
  try {
    const now = new Date();
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
    const row = await db.voteRateLimit.findUnique({
      where: { votingWindowId_ipHash: { votingWindowId, ipHash } },
    });
    if (!row || row.windowStart < windowStart) {
      await db.voteRateLimit.upsert({
        where: { votingWindowId_ipHash: { votingWindowId, ipHash } },
        create: { votingWindowId, ipHash, attempts: 1, windowStart: now, lastAttemptAt: now },
        update: { attempts: 1, windowStart: now, lastAttemptAt: now },
      });
      return true;
    }
    if (row.attempts >= RATE_LIMIT_MAX) return false;
    await db.voteRateLimit.update({
      where: { votingWindowId_ipHash: { votingWindowId, ipHash } },
      data: { attempts: { increment: 1 }, lastAttemptAt: now },
    });
    return true;
  } catch {
    // DB unavailable: fall back to in-process map
    const key = `${votingWindowId}:${ipHash}`;
    const now = Date.now();
    const entry = inProcessRateMap.get(key);
    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
      inProcessRateMap.set(key, { count: 1, windowStart: now });
      return true;
    }
    if (entry.count >= RATE_LIMIT_MAX) return false;
    entry.count++;
    return true;
  }
}

/** Get the active voting window for an event (null if none or closed). */
export async function getActiveWindow(eventId: string) {
  const now = new Date();
  return db.votingWindow.findFirst({
    where: { eventId, opensAt: { lte: now }, closesAt: { gte: now } },
    orderBy: { opensAt: "desc" },
  });
}

/** Returns projects in randomised order for this voter. Results count hidden if window active+resultsHidden. */
export async function getBallot(eventId: string, voterId: string | null) {
  const window = await getActiveWindow(eventId);
  const hideResults = window?.resultsHidden && window !== null;

  const projects = await db.project.findMany({
    where: { eventId, status: "submitted" },
    select: {
      id: true,
      title: true,
      description: true,
      teamId: true,
      trackId: true,
      demoUrl: true,
      repoUrl: true,
      _count: { select: { votes: { where: { retractedAt: null } } } },
    },
  });

  // Randomise order per voter
  const seed = voterId ? `${voterId}:${window?.id ?? "nowindow"}` : "anonymous";
  const shuffled = seededShuffle(projects, seed);

  // Get voter's existing votes
  const voterVotes = voterId && window
    ? await db.vote.findMany({
        where: { voterId, votingWindowId: window.id, retractedAt: null },
        select: { projectId: true },
      })
    : [];
  const votedProjectIds = new Set(voterVotes.map((v) => v.projectId));

  return {
    windowId: window?.id ?? null,
    windowOpen: !!window,
    closesAt: window?.closesAt ?? null,
    projects: shuffled.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      teamId: p.teamId,
      trackId: p.trackId,
      demoUrl: p.demoUrl,
      repoUrl: p.repoUrl,
      // Hide vote counts from non-organizers during open window
      voteCount: hideResults ? null : p._count.votes,
      hasVoted: votedProjectIds.has(p.id),
    })),
  };
}

/** Cast a vote. Returns error string or null on success. */
export async function castVote(
  votingWindowId: string,
  voterId: string,
  projectId: string,
  ipAddress: string
): Promise<{ ok: boolean; error?: string }> {
  const ipHash = hashIp(ipAddress);

  // Rate limit check
  const allowed = await checkRateLimit(votingWindowId, ipHash);
  if (!allowed) return { ok: false, error: "rate_limit_exceeded" };

  // Verify window is still open
  const window = await db.votingWindow.findUnique({ where: { id: votingWindowId } });
  if (!window) return { ok: false, error: "window_not_found" };
  const now = new Date();
  if (now < window.opensAt || now > window.closesAt) {
    return { ok: false, error: "voting_window_closed" };
  }

  // Duplicate check (also enforced by DB unique constraint as safety net)
  const existing = await db.vote.findUnique({
    where: { votingWindowId_voterId_projectId: { votingWindowId, voterId, projectId } },
  });
  if (existing && !existing.retractedAt) return { ok: false, error: "already_voted" };

  const ballotSeed = `${voterId}:${votingWindowId}`;

  try {
    if (existing && existing.retractedAt) {
      // Re-vote after retraction: create a new record
      await db.vote.create({
        data: { votingWindowId, voterId, projectId, ipHash, ballotSeed },
      });
    } else {
      await db.vote.create({
        data: { votingWindowId, voterId, projectId, ipHash, ballotSeed },
      });
    }
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === "P2002") return { ok: false, error: "already_voted" };
    throw e;
  }

  await db.auditLog.create({
    data: {
      actorId: voterId,
      action: "VOTE_CAST",
      entityType: "Vote",
      entityId: `${votingWindowId}:${projectId}`,
      payload: { votingWindowId, projectId, ipHash: ipHash.slice(0, 8) + "..." },
    },
  });

  return { ok: true };
}

/** Retract a vote within the open window. */
export async function retractVote(
  votingWindowId: string,
  voterId: string,
  projectId: string
): Promise<{ ok: boolean; error?: string }> {
  const window = await db.votingWindow.findUnique({ where: { id: votingWindowId } });
  if (!window) return { ok: false, error: "window_not_found" };
  const now = new Date();
  if (now > window.closesAt) return { ok: false, error: "voting_window_closed" };

  const vote = await db.vote.findUnique({
    where: { votingWindowId_voterId_projectId: { votingWindowId, voterId, projectId } },
  });
  if (!vote || vote.retractedAt) return { ok: false, error: "no_active_vote" };

  await db.vote.update({
    where: { id: vote.id },
    data: { retractedAt: now },
  });

  await db.auditLog.create({
    data: {
      actorId: voterId,
      action: "VOTE_RETRACTED",
      entityType: "Vote",
      entityId: `${votingWindowId}:${projectId}`,
      payload: { votingWindowId, projectId },
    },
  });

  return { ok: true };
}

/** Get vote tallies for an event (organizer only during active window). */
export async function getVoteTallies(eventId: string) {
  const results = await db.vote.groupBy({
    by: ["projectId"],
    where: {
      project: { eventId },
      retractedAt: null,
    },
    _count: { projectId: true },
    orderBy: { _count: { projectId: "desc" } },
  });

  const projectIds = results.map((r) => r.projectId);
  const projects = await db.project.findMany({
    where: { id: { in: projectIds } },
    select: { id: true, title: true, teamId: true },
  });
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  return results.map((r) => ({
    projectId: r.projectId,
    title: projectMap.get(r.projectId)?.title ?? "Unknown",
    teamId: projectMap.get(r.projectId)?.teamId ?? "",
    voteCount: r._count.projectId,
  }));
}
