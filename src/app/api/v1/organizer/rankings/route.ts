import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, extractSessionCookie } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/organizer/rankings?eventId=xxx
 * Returns raw vs normalized rankings for an event, from the most recent NormalizationRun.
 * If no run exists, returns raw scores only.
 */
export async function GET(request: NextRequest) {
  const session = await getSession(extractSessionCookie(request.headers.get("cookie")));
  if (!session || (session.role !== "organizer" && session.role !== "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const eventId = request.nextUrl.searchParams.get("eventId");
  if (!eventId) return NextResponse.json({ error: "eventId required" }, { status: 400 });

  // Try to get the latest normalization run
  const latestRun = await db.normalizationRun.findFirst({
    where: { eventId },
    orderBy: { createdAt: "desc" },
  });

  // Load raw scores from scorecards
  const scorecards = await db.scoreCard.findMany({
    where: {
      project: { eventId },
      submittedAt: { not: null },
    },
    include: {
      scores: { include: { criterion: true } },
      project: { select: { id: true, title: true, teamId: true } },
    },
  });

  // Compute raw project averages
  const rawByProject = new Map<string, { title: string; teamId: string; scores: number[] }>();
  for (const sc of scorecards) {
    if (!rawByProject.has(sc.projectId)) {
      rawByProject.set(sc.projectId, { title: sc.project.title, teamId: sc.project.teamId, scores: [] });
    }
    let weightedSum = 0, totalWeight = 0;
    for (const cs of sc.scores) {
      weightedSum += cs.score * cs.criterion.weight;
      totalWeight += cs.criterion.weight;
    }
    if (totalWeight > 0) rawByProject.get(sc.projectId)!.scores.push(weightedSum / totalWeight);
  }

  const avg = (arr: number[]) => arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;

  const projectIds = [...rawByProject.keys()];
  const rawStats = projectIds.map((pid) => ({
    projectId: pid,
    title: rawByProject.get(pid)!.title,
    teamId: rawByProject.get(pid)!.teamId,
    rawScore: Math.round(avg(rawByProject.get(pid)!.scores) * 100) / 100,
    judgeCount: rawByProject.get(pid)!.scores.length,
  }));

  const sortedByRaw = [...rawStats].sort((a, b) => b.rawScore - a.rawScore);
  const rawRankMap = new Map<string, number>();
  sortedByRaw.forEach((p, i) => rawRankMap.set(p.projectId, i + 1));

  // Overlay normalized scores from the last run if available
  let normalizedScoreMap = new Map<string, number>();
  let flags: unknown[] = [];
  let runId: string | null = null;

  if (latestRun) {
    runId = latestRun.id;
    const output = latestRun.outputJson as {
      normalizedScores: { submissionId: string; normalizedValue: number }[];
      flags: unknown[];
    };

    // Average normalized scores per project
    const normByProject = new Map<string, number[]>();
    for (const ns of output.normalizedScores) {
      if (!normByProject.has(ns.submissionId)) normByProject.set(ns.submissionId, []);
      normByProject.get(ns.submissionId)!.push(ns.normalizedValue);
    }
    for (const [pid, scores] of normByProject) {
      normalizedScoreMap.set(pid, Math.round(avg(scores) * 100) / 100);
    }
    flags = output.flags;
  }

  const rankings = rawStats.map((p) => {
    const normScore = normalizedScoreMap.get(p.projectId) ?? p.rawScore;
    return {
      ...p,
      rankRaw: rawRankMap.get(p.projectId) ?? 0,
      normalizedScore: normScore,
    };
  });

  const sortedByNorm = [...rankings].sort((a, b) => b.normalizedScore - a.normalizedScore);
  const normRankMap = new Map<string, number>();
  sortedByNorm.forEach((p, i) => normRankMap.set(p.projectId, i + 1));

  const rankingsWithMovement = rankings.map((p) => ({
    ...p,
    rankNormalized: normRankMap.get(p.projectId) ?? p.rankRaw,
    rankMovement: (rawRankMap.get(p.projectId) ?? 0) - (normRankMap.get(p.projectId) ?? 0),
  }));
  rankingsWithMovement.sort((a, b) => a.rankNormalized - b.rankNormalized);

  return NextResponse.json({
    eventId,
    runId,
    hasNormalization: !!latestRun,
    flags,
    rankings: rankingsWithMovement,
  });
}
