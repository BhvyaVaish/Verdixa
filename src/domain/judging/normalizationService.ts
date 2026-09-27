/**
 * Normalization Service (Phase 4)
 *
 * Wires the pure normalizeEvent() domain function to real ScoreCard data.
 * Results are persisted to NormalizationRun for audit, never recomputed silently.
 */

import { db } from "@/lib/db";
import { normalizeEvent, SHRINKAGE_K } from "@/domain/judging/normalization/normalize";
import type { NormalizationResult } from "@/domain/judging/normalization/types";

export interface NormalizationRunResult {
  runId: string;
  result: NormalizationResult;
  rankings: ProjectRanking[];
  judgeProgress: JudgeProgressSummary[];
}

export interface ProjectRanking {
  projectId: string;
  projectTitle: string;
  teamId: string;
  rawScore: number;
  normalizedScore: number;
  rankRaw: number;
  rankNormalized: number;
  rankMovement: number; // positive = moved up, negative = moved down
  judgeCount: number;
}

export interface JudgeProgressSummary {
  judgeId: string;
  judgeEmail: string;
  totalAssigned: number;
  totalCompleted: number;
  totalOutstanding: number;
  completionPct: number;
  anomalyFlags: string[];
  averageScore: number | null;
}

/**
 * Loads all submitted scorecards for an event, builds the input map,
 * runs normalizeEvent(), and persists the result to NormalizationRun.
 */
export async function runNormalization(
  eventId: string,
  actorId: string
): Promise<NormalizationRunResult> {
  // 1. Load event + active rubric
  const event = await db.event.findUnique({
    where: { id: eventId },
    include: {
      rubrics: { where: { isActive: true }, take: 1 },
    },
  });
  if (!event) throw new Error("Event not found");
  const rubric = event.rubrics[0];
  if (!rubric) throw new Error("No active rubric found for event");

  // 2. Load all submitted scorecards with criterion scores
  const scorecards = await db.scoreCard.findMany({
    where: {
      project: { eventId },
      submittedAt: { not: null },
    },
    include: {
      scores: {
        include: { criterion: true },
      },
      project: { select: { id: true, title: true, teamId: true } },
    },
  });

  // 3. Build judgeScoreMap: Map<judgeId, Map<projectId, weightedAvgScore>>
  const judgeScoreMap = new Map<string, Map<string, number>>();

  for (const sc of scorecards) {
    if (!judgeScoreMap.has(sc.judgeId)) {
      judgeScoreMap.set(sc.judgeId, new Map());
    }
    const judgeMap = judgeScoreMap.get(sc.judgeId)!;

    // Compute weighted average score across all criteria
    let weightedSum = 0;
    let totalWeight = 0;
    for (const cs of sc.scores) {
      weightedSum += cs.score * cs.criterion.weight;
      totalWeight += cs.criterion.weight;
    }
    const compositeScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
    judgeMap.set(sc.projectId, compositeScore);
  }

  // 4. Run normalization
  const normResult: NormalizationResult = normalizeEvent(judgeScoreMap);

  // 5. Persist the run
  const run = await db.normalizationRun.create({
    data: {
      eventId,
      rubricId: rubric.id,
      inputsJson: Object.fromEntries(
        [...judgeScoreMap.entries()].map(([judgeId, scores]) => [
          judgeId,
          Object.fromEntries(scores),
        ])
      ),
      outputJson: normResult as any,
      shrinkageK: SHRINKAGE_K,
      createdBy: actorId,
    },
  });

  // 6. Compute per-project rankings
  const projectMap = new Map<string, { title: string; teamId: string }>();
  for (const sc of scorecards) {
    projectMap.set(sc.projectId, {
      title: sc.project.title,
      teamId: sc.project.teamId,
    });
  }

  const rawByProject = new Map<string, number[]>();
  const normalizedByProject = new Map<string, number[]>();

  for (const [judgeId, scores] of judgeScoreMap) {
    for (const [projectId, rawScore] of scores) {
      if (!rawByProject.has(projectId)) rawByProject.set(projectId, []);
      rawByProject.get(projectId)!.push(rawScore);
    }
  }
  for (const ns of normResult.normalizedScores) {
    if (!normalizedByProject.has(ns.submissionId))
      normalizedByProject.set(ns.submissionId, []);
    normalizedByProject.get(ns.submissionId)!.push(ns.normalizedValue);
  }

  const avg = (arr: number[]) =>
    arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;

  const projectIds = [...rawByProject.keys()];
  const projectStats = projectIds.map((pid) => ({
    projectId: pid,
    rawScore: avg(rawByProject.get(pid) ?? []),
    normalizedScore: avg(normalizedByProject.get(pid) ?? []),
    judgeCount: (rawByProject.get(pid) ?? []).length,
  }));

  const sortedByRaw = [...projectStats].sort((a, b) => b.rawScore - a.rawScore);
  const sortedByNorm = [...projectStats].sort(
    (a, b) => b.normalizedScore - a.normalizedScore
  );

  const rawRankMap = new Map<string, number>();
  sortedByRaw.forEach((p, i) => rawRankMap.set(p.projectId, i + 1));
  const normRankMap = new Map<string, number>();
  sortedByNorm.forEach((p, i) => normRankMap.set(p.projectId, i + 1));

  const rankings: ProjectRanking[] = projectStats.map((p) => {
    const rawRank = rawRankMap.get(p.projectId) ?? 0;
    const normRank = normRankMap.get(p.projectId) ?? 0;
    const info = projectMap.get(p.projectId) ?? { title: "Unknown", teamId: "" };
    return {
      projectId: p.projectId,
      projectTitle: info.title,
      teamId: info.teamId,
      rawScore: Math.round(p.rawScore * 100) / 100,
      normalizedScore: Math.round(p.normalizedScore * 100) / 100,
      rankRaw: rawRank,
      rankNormalized: normRank,
      rankMovement: rawRank - normRank, // positive = improved rank after normalization
      judgeCount: p.judgeCount,
    };
  });
  rankings.sort((a, b) => a.rankNormalized - b.rankNormalized);

  // 7. Compute judge progress
  const allAssignments = await db.judgeAssignment.findMany({
    where: { eventId },
    include: {
      judge: { select: { id: true, email: true } },
      scorecard: { select: { submittedAt: true } },
    },
  });

  const judgeProgMap = new Map<
    string,
    {
      email: string;
      total: number;
      completed: number;
      scores: number[];
    }
  >();

  for (const a of allAssignments) {
    if (!judgeProgMap.has(a.judgeId)) {
      judgeProgMap.set(a.judgeId, {
        email: a.judge.email,
        total: 0,
        completed: 0,
        scores: [],
      });
    }
    const entry = judgeProgMap.get(a.judgeId)!;
    entry.total++;
    if (a.scorecard?.submittedAt) {
      entry.completed++;
      const judgeScores = judgeScoreMap.get(a.judgeId);
      const projectScore = judgeScores?.get(a.projectId);
      if (projectScore !== undefined) entry.scores.push(projectScore);
    }
  }

  // Get anomaly flags per judge
  const flagsByJudge = new Map<string, string[]>();
  for (const flag of normResult.flags) {
    if (flag.judgeId) {
      if (!flagsByJudge.has(flag.judgeId)) flagsByJudge.set(flag.judgeId, []);
      flagsByJudge.get(flag.judgeId)!.push(flag.code);
    }
  }

  const judgeProgress: JudgeProgressSummary[] = [...judgeProgMap.entries()].map(
    ([judgeId, d]) => ({
      judgeId,
      judgeEmail: d.email,
      totalAssigned: d.total,
      totalCompleted: d.completed,
      totalOutstanding: d.total - d.completed,
      completionPct:
        d.total > 0 ? Math.round((d.completed / d.total) * 100) : 0,
      anomalyFlags: flagsByJudge.get(judgeId) ?? [],
      averageScore: d.scores.length > 0 ? avg(d.scores) : null,
    })
  );
  judgeProgress.sort((a, b) => b.completionPct - a.completionPct);

  return { runId: run.id, result: normResult, rankings, judgeProgress };
}

/**
 * Load the most recent NormalizationRun for an event (or null if none exists).
 */
export async function getLatestNormalizationRun(eventId: string) {
  return db.normalizationRun.findFirst({
    where: { eventId },
    orderBy: { createdAt: "desc" },
  });
}
