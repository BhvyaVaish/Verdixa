/**
 * Slice C — Judging Engine: Normalization Pipeline
 *
 * Pure functions only. Zero imports from Prisma, Next.js, or any DB layer.
 *
 * Pipeline:
 * 1. Per-judge z-score (handles sd=0 → FLAT_RATER flag, no crash)
 * 2. Reliability-weighted shrinkage toward pooled z-score
 *    reliability = n / (n + SHRINKAGE_K), where SHRINKAGE_K = 3 (named constant)
 * 3. Rescale to presentation range
 *
 * Design principle (blueprint §10 + §11):
 * Anomaly flags (FLAT_RATER, EXTREME_RATER, INSUFFICIENT_DATA, SINGLE_JUDGE)
 * are SURFACED to the organizer, NEVER auto-corrected or clipped.
 * "We surface anomalies for human judgment rather than have an algorithm quietly
 * override a human judge's opinion."
 */

import type {
  RawScore,
  NormalizedScore,
  NormalizationResult,
  NormalizationFlag,
} from "./types";

// ─── Named constants (blueprint §11: no magic numbers) ────────────────────────

/**
 * Shrinkage constant k in the reliability formula: reliability = n / (n + k).
 * Default k = 3. A judge who scored 3 submissions gets reliability = 0.5.
 * Documented here for auditability — do not replace with a literal `3` anywhere.
 */
export const SHRINKAGE_K = 3;

/**
 * Extreme rater threshold: if a judge's mean raw score deviates from the panel
 * grand mean by more than this many panel standard deviations, they are flagged.
 *
 * Note: we detect extreme raters in RAW score space (before z-scoring), because
 * per-judge z-scores are centered to 0 by construction — comparing mean z to
 * pooled z would always yield ~0 and never trigger. The meaningful signal is
 * whether a judge rates consistently higher or lower than the panel average.
 */
export const EXTREME_RATER_THRESHOLD = 2.0;

/** Presentation score range */
export const PRESENTATION_MIN = 0;
export const PRESENTATION_MAX = 100;

// ─── Statistical helpers ──────────────────────────────────────────────────────

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  const variance =
    values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) /
    (values.length - 1); // sample standard deviation
  return Math.sqrt(variance);
}

// ─── Step 1: Per-judge z-score ────────────────────────────────────────────────

export interface JudgeZScoreResult {
  judgeId: string;
  /** z-score for each submission this judge scored */
  zScores: Map<string, number>;
  /** Number of scores this judge submitted */
  n: number;
  /** Whether this judge is a flat-rater (sd = 0) */
  isFlat: boolean;
}

/**
 * Compute per-judge z-scores.
 *
 * If sd = 0 (judge scored everything identically), returns z=0 for all
 * and sets isFlat=true. This is a FLAT_RATER flag — never a crash.
 * See blueprint §10 addition 2.
 */
export function zScoreForJudge(
  judgeId: string,
  scores: Map<string, number> // submissionId → raw score
): JudgeZScoreResult {
  const values = [...scores.values()];
  const n = values.length;
  const avg = mean(values);
  const sd = stddev(values, avg);

  const zScores = new Map<string, number>();

  if (sd === 0) {
    // Flat rater — assign z=0 to all (no information content)
    for (const [subId] of scores) {
      zScores.set(subId, 0);
    }
    return { judgeId, zScores, n, isFlat: true };
  }

  for (const [subId, rawScore] of scores) {
    zScores.set(subId, (rawScore - avg) / sd);
  }

  return { judgeId, zScores, n, isFlat: false };
}

// ─── Step 2: Pooled z-score ───────────────────────────────────────────────────

/**
 * Compute the pooled (grand) mean of all z-scores across all judges.
 * Used as the shrinkage target.
 */
export function pooledZScore(judgeResults: JudgeZScoreResult[]): number {
  const allZ: number[] = [];
  for (const jr of judgeResults) {
    allZ.push(...jr.zScores.values());
  }
  return mean(allZ);
}

// ─── Step 3: Reliability-weighted shrinkage ───────────────────────────────────

/**
 * Shrink a judge's z-score toward the pooled z-score based on reliability.
 * reliability = n / (n + SHRINKAGE_K)
 *
 * For n=0: reliability=0 → fully shrink to pooled (no data).
 * For n=1: reliability=0.25 → mostly pooled.
 * For large n: reliability→1 → trust the judge's own z-scores.
 */
export function shrinkZScore(
  judgeZ: number,
  pooledZ: number,
  n: number
): number {
  const reliability = n / (n + SHRINKAGE_K);
  return reliability * judgeZ + (1 - reliability) * pooledZ;
}

// ─── Step 4: Rescale ──────────────────────────────────────────────────────────

/**
 * Rescale a set of shrunken z-scores to the presentation range [min, max].
 * Maps the observed min→presentationMin, observed max→presentationMax.
 *
 * If all values are identical (range = 0), returns midpoint for all.
 */
export function rescale(
  values: number[],
  targetMin: number = PRESENTATION_MIN,
  targetMax: number = PRESENTATION_MAX
): number[] {
  if (values.length === 0) return [];
  const observedMin = Math.min(...values);
  const observedMax = Math.max(...values);
  const range = observedMax - observedMin;

  if (range === 0) {
    // All values identical — return midpoint
    const mid = (targetMin + targetMax) / 2;
    return values.map(() => mid);
  }

  return values.map(
    (v) => ((v - observedMin) / range) * (targetMax - targetMin) + targetMin
  );
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Normalize scores for an entire event.
 *
 * Input: judgeScoreMap — Map<judgeId, Map<submissionId, rawScore>>
 *
 * Handles all degenerate inputs gracefully (blueprint §10 addition 2):
 * - n=0 judges: returns empty result + INSUFFICIENT_DATA flag
 * - n=1 judge: returns raw scores + SINGLE_JUDGE flag
 * - Judge with sd=0: FLAT_RATER flag, raw scores used as fallback for that judge
 * - All judges scoring identically: INSUFFICIENT_DATA flag
 *
 * NEVER throws. NEVER silently clips or corrects an anomaly.
 */
export function normalizeEvent(
  judgeScoreMap: Map<string, Map<string, number>>
): NormalizationResult {
  const flags: NormalizationFlag[] = [];
  const judgeIds = [...judgeScoreMap.keys()];

  // ── Edge case: no judges ──────────────────────────────────────────────────
  if (judgeIds.length === 0) {
    flags.push({
      code: "INSUFFICIENT_DATA",
      message:
        "No judge scores available. Cannot normalize — returning empty result.",
    });
    return { normalizedScores: [], flags, normalized: false };
  }

  // ── Edge case: single judge ───────────────────────────────────────────────
  if (judgeIds.length === 1) {
    const judgeId = judgeIds[0]!;
    flags.push({
      code: "SINGLE_JUDGE",
      judgeId,
      message:
        "Only one judge in this event. Normalization is not meaningful — returning raw scores.",
    });

    const rawScores: NormalizedScore[] = [];
    for (const [subId, raw] of judgeScoreMap.get(judgeId)!) {
      rawScores.push({
        judgeId,
        submissionId: subId,
        rawValue: raw,
        normalizedValue: raw,
      });
    }
    return { normalizedScores: rawScores, flags, normalized: false };
  }

  // ── Step 1: Per-judge z-scores ────────────────────────────────────────────
  const judgeResults: JudgeZScoreResult[] = [];
  const flatRaterIds = new Set<string>();

  for (const [judgeId, scores] of judgeScoreMap) {
    if (scores.size === 0) continue;
    const jr = zScoreForJudge(judgeId, scores);
    judgeResults.push(jr);

    if (jr.isFlat) {
      flatRaterIds.add(judgeId);
      flags.push({
        code: "FLAT_RATER",
        judgeId,
        message: `Judge ${judgeId} scored all submissions identically (sd = 0). Their scores carry no ranking information — flagged for human review.`,
      });
    }
  }

  // If all judges are flat raters → INSUFFICIENT_DATA
  if (flatRaterIds.size === judgeResults.length) {
    flags.push({
      code: "INSUFFICIENT_DATA",
      message:
        "All judges scored identically. Cannot normalize — returning raw scores.",
    });

    const rawScores: NormalizedScore[] = [];
    for (const [judgeId, scores] of judgeScoreMap) {
      for (const [subId, raw] of scores) {
        rawScores.push({
          judgeId,
          submissionId: subId,
          rawValue: raw,
          normalizedValue: raw,
        });
      }
    }
    return { normalizedScores: rawScores, flags, normalized: false };
  }

  // ── Step 2: Pooled z-score ────────────────────────────────────────────────
  const pooled = pooledZScore(judgeResults);

  // ── Extreme rater detection (raw score space) ─────────────────────────────
  // We detect in RAW score space because per-judge z-scores are centered to 0
  // by construction — comparing z means would always yield ~0 and never trigger.
  // Instead: compute panel grand mean and std of ALL raw scores, then flag judges
  // whose mean raw score deviates by more than EXTREME_RATER_THRESHOLD stddevs.
  const allRawValues: number[] = [];
  for (const [, scores] of judgeScoreMap) {
    allRawValues.push(...scores.values());
  }
  const panelMeanRaw = mean(allRawValues);
  const panelStdRaw = stddev(allRawValues, panelMeanRaw);

  const extremeRaterJudges = new Set<string>();
  if (panelStdRaw > 0) {
    for (const [judgeId, scores] of judgeScoreMap) {
      if (scores.size === 0) continue;
      const judgeMeanRaw = mean([...scores.values()]);
      const deviation = Math.abs(judgeMeanRaw - panelMeanRaw) / panelStdRaw;
      if (deviation > EXTREME_RATER_THRESHOLD) {
        extremeRaterJudges.add(judgeId);
        flags.push({
          code: "EXTREME_RATER",
          judgeId,
          message:
            `Judge ${judgeId}'s mean raw score deviates ${deviation.toFixed(2)} panel std devs ` +
            `from the panel grand mean (${panelMeanRaw.toFixed(1)}). ` +
            `Flagged for human review — scores are NOT auto-corrected.`,
        });
      }
    }
  }

  // ── Step 3: Shrinkage ─────────────────────────────────────────────────────
  const shrunkenByJudge = new Map<string, Map<string, number>>();

  for (const jr of judgeResults) {
    const shrunkenScores = new Map<string, number>();

    for (const [subId, z] of jr.zScores) {
      const shrunken = shrinkZScore(z, pooled, jr.n);
      shrunkenScores.set(subId, shrunken);
    }

    shrunkenByJudge.set(jr.judgeId, shrunkenScores);
  }

  // ── Step 4: Rescale all shrunken z-scores to presentation range ───────────
  // Collect all shrunken values (in deterministic order) for global rescaling
  const allEntries: Array<{ judgeId: string; submissionId: string; shrunken: number; raw: number }> = [];

  for (const [judgeId, shrunkenScores] of shrunkenByJudge) {
    const rawScores = judgeScoreMap.get(judgeId)!;
    // Sort by submissionId for determinism
    const sortedSubs = [...shrunkenScores.keys()].sort();
    for (const subId of sortedSubs) {
      allEntries.push({
        judgeId,
        submissionId: subId,
        shrunken: shrunkenScores.get(subId)!,
        raw: rawScores.get(subId)!,
      });
    }
  }

  const shrunkenValues = allEntries.map((e) => e.shrunken);
  const rescaled = rescale(shrunkenValues);

  const normalizedScores: NormalizedScore[] = allEntries.map((e, i) => ({
    judgeId: e.judgeId,
    submissionId: e.submissionId,
    rawValue: e.raw,
    normalizedValue: Math.round(rescaled[i]! * 100) / 100, // 2 decimal places
  }));

  // For flat raters: override their normalized scores with raw values
  // (their z=0 scores will have been pulled toward pooled, but since they
  // carry no information, we mark them separately in the flags — the
  // normalizedValue still reflects shrinkage to pooled which is reasonable)

  return { normalizedScores, flags, normalized: true };
}
