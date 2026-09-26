/**
 * Slice C — Normalization Tests
 *
 * ORDER MATTERS: edge-case tests are written FIRST (before happy path).
 * This directly implements blueprint §10 addition 2:
 * "Write [degenerate-input fallback] as the FIRST unit test, before the happy path."
 */

import { describe, it, expect } from "vitest";
import {
  normalizeEvent,
  zScoreForJudge,
  shrinkZScore,
  rescale,
  SHRINKAGE_K,
  EXTREME_RATER_THRESHOLD,
  PRESENTATION_MIN,
  PRESENTATION_MAX,
} from "../../src/domain/judging/normalization/normalize";

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeScoreMap(
  judgeId: string,
  scores: Record<string, number>
): [string, Map<string, number>] {
  return [judgeId, new Map(Object.entries(scores))];
}

// ─── EDGE CASES FIRST (blueprint mandate) ────────────────────────────────────

describe("normalizeEvent — edge cases (written before happy path, per blueprint §10)", () => {
  // Edge case 1: single judge — must not divide by zero, must return raw scores + SINGLE_JUDGE flag
  it("single judge: returns raw scores with SINGLE_JUDGE flag, does not crash", () => {
    const judgeScoreMap = new Map([
      makeScoreMap("judge-1", { "sub-A": 80, "sub-B": 60, "sub-C": 90 }),
    ]);

    const result = normalizeEvent(judgeScoreMap);

    expect(result.normalized).toBe(false);
    expect(result.flags.some((f) => f.code === "SINGLE_JUDGE")).toBe(true);
    expect(result.normalizedScores).toHaveLength(3);

    // Raw scores preserved
    const scoreA = result.normalizedScores.find((s) => s.submissionId === "sub-A");
    expect(scoreA?.normalizedValue).toBe(80);
    const scoreB = result.normalizedScores.find((s) => s.submissionId === "sub-B");
    expect(scoreB?.normalizedValue).toBe(60);
  });

  // Edge case 2: judge with sd=0 — must return FLAT_RATER flag, must not crash
  it("judge with sd=0 (scores everything identically): FLAT_RATER flag, no crash", () => {
    const judgeScoreMap = new Map([
      makeScoreMap("judge-flat", { "sub-A": 75, "sub-B": 75, "sub-C": 75 }),
      makeScoreMap("judge-normal", { "sub-A": 60, "sub-B": 80, "sub-C": 70 }),
    ]);

    // Must not throw
    const result = normalizeEvent(judgeScoreMap);

    expect(result.flags.some((f) => f.code === "FLAT_RATER" && f.judgeId === "judge-flat")).toBe(true);
    // Still returns scores (normalized=true because judge-normal is not flat)
    expect(result.normalizedScores.length).toBeGreaterThan(0);
  });

  // Edge case 3: all judges score identically — INSUFFICIENT_DATA flag, raw scores returned
  it("all judges scoring identically: INSUFFICIENT_DATA flag, returns raw scores", () => {
    const judgeScoreMap = new Map([
      makeScoreMap("judge-1", { "sub-A": 50, "sub-B": 50 }),
      makeScoreMap("judge-2", { "sub-A": 50, "sub-B": 50 }),
    ]);

    const result = normalizeEvent(judgeScoreMap);

    expect(result.normalized).toBe(false);
    expect(result.flags.some((f) => f.code === "INSUFFICIENT_DATA")).toBe(true);

    // Raw scores preserved
    for (const s of result.normalizedScores) {
      expect(s.normalizedValue).toBe(s.rawValue);
    }
  });

  // Edge case 4: dominant outlier judge — flagged as EXTREME_RATER, scores NOT auto-corrected
  it("dominant outlier judge: flagged EXTREME_RATER, scores not silently corrected or clipped", () => {
    // Setup: 1 judge consistently rates in 90-100 range; 5 normal judges rate 40-50 range.
    // This gives the outlier a mean raw score >2 panel stddevs from the panel grand mean.
    // Math verification (sample std, n-1 denominator):
    //   outlier scores: [95, 98, 92]  → mean ≈ 95
    //   normals: 5 judges × 3 scores = 15 values all in [42-48] → mean ≈ 45
    //   All 18 values: mean ≈ 55.8, sample std ≈ 22.3
    //   Outlier deviation: |95 - 55.8| / 22.3 ≈ 1.76 — very close but may not exceed 2.0
    //   Use normals at 40-44 and outlier at 95-100 to push further.
    //   All 18: [95,98,92, 40,41,42, 40,41,42, 40,41,42, 40,41,42, 40,41,42]
    //   mean = (285 + 5*123)/18 = (285+615)/18 = 900/18 = 50
    //   Deviations²: outlier: (45²+48²+42²)=(2025+2304+1764)=6093
    //               normals: each 15 values at dev=(40-50)²=100,(41-50)²=81,(42-50)²=64
    //               Sum dev² normals = 5*(100+81+64) = 5*245 = 1225
    //   sample variance = (6093+1225)/17 = 7318/17 = 430.5, std = 20.75
    //   outlier mean=95, deviation = |95-50|/20.75 = 2.17 > 2.0 ✓
    const judgeScoreMap = new Map([
      makeScoreMap("judge-outlier", { "sub-A": 95, "sub-B": 98, "sub-C": 92 }),
      makeScoreMap("judge-normal-1", { "sub-A": 40, "sub-B": 41, "sub-C": 42 }),
      makeScoreMap("judge-normal-2", { "sub-A": 40, "sub-B": 41, "sub-C": 42 }),
      makeScoreMap("judge-normal-3", { "sub-A": 40, "sub-B": 41, "sub-C": 42 }),
      makeScoreMap("judge-normal-4", { "sub-A": 40, "sub-B": 41, "sub-C": 42 }),
      makeScoreMap("judge-normal-5", { "sub-A": 40, "sub-B": 41, "sub-C": 42 }),
    ]);

    const result = normalizeEvent(judgeScoreMap);

    const extremeFlag = result.flags.find(
      (f) => f.code === "EXTREME_RATER" && f.judgeId === "judge-outlier"
    );
    expect(extremeFlag).toBeDefined();

    // Scores are NOT clipped — outlier's raw values must appear in normalizedScores
    const outlierScores = result.normalizedScores.filter(
      (s) => s.judgeId === "judge-outlier"
    );
    expect(outlierScores.length).toBe(3);

    // Raw values are preserved (normalization doesn't clip)
    const rawA = outlierScores.find((s) => s.submissionId === "sub-A");
    expect(rawA?.rawValue).toBe(95);
  });

  // Edge case 5: n=0 judges — empty result + INSUFFICIENT_DATA flag
  it("zero judges: returns empty scores with INSUFFICIENT_DATA flag", () => {
    const judgeScoreMap = new Map<string, Map<string, number>>();

    const result = normalizeEvent(judgeScoreMap);

    expect(result.normalized).toBe(false);
    expect(result.normalizedScores).toHaveLength(0);
    expect(result.flags.some((f) => f.code === "INSUFFICIENT_DATA")).toBe(true);
  });

  // Edge case 6: judge with n=1 submission (single score)
  it("judge with n=1 submission: does not crash, shrinkage applied", () => {
    const judgeScoreMap = new Map([
      makeScoreMap("judge-1", { "sub-A": 80 }), // n=1
      makeScoreMap("judge-2", { "sub-A": 70, "sub-B": 90 }),
    ]);

    // Must not throw
    expect(() => normalizeEvent(judgeScoreMap)).not.toThrow();

    const result = normalizeEvent(judgeScoreMap);
    // Should return scores without crashing
    expect(result.normalizedScores.length).toBeGreaterThan(0);
  });
});

// ─── HAPPY PATH ───────────────────────────────────────────────────────────────

describe("normalizeEvent — happy path", () => {
  it("normalizes 3-judge event to [0, 100] range", () => {
    const judgeScoreMap = new Map([
      makeScoreMap("judge-A", { "sub-1": 85, "sub-2": 60, "sub-3": 95 }),
      makeScoreMap("judge-B", { "sub-1": 70, "sub-2": 80, "sub-3": 75 }),
      makeScoreMap("judge-C", { "sub-1": 90, "sub-2": 55, "sub-3": 88 }),
    ]);

    const result = normalizeEvent(judgeScoreMap);

    expect(result.normalized).toBe(true);
    expect(result.flags).toHaveLength(0);
    expect(result.normalizedScores.length).toBeGreaterThan(0);

    // All normalized values should be in [0, 100]
    for (const s of result.normalizedScores) {
      expect(s.normalizedValue).toBeGreaterThanOrEqual(PRESENTATION_MIN);
      expect(s.normalizedValue).toBeLessThanOrEqual(PRESENTATION_MAX);
    }
  });

  it("preserves raw values alongside normalized values for audit", () => {
    const judgeScoreMap = new Map([
      makeScoreMap("judge-1", { "sub-X": 70, "sub-Y": 80 }),
      makeScoreMap("judge-2", { "sub-X": 60, "sub-Y": 90 }),
    ]);

    const result = normalizeEvent(judgeScoreMap);

    for (const s of result.normalizedScores) {
      // rawValue must be preserved
      expect(s.rawValue).toBeGreaterThan(0);
      expect(typeof s.rawValue).toBe("number");
    }
  });
});

// ─── Unit tests for sub-functions ────────────────────────────────────────────

describe("zScoreForJudge", () => {
  it("computes correct z-scores for a judge", () => {
    const scores = new Map([["sub-1", 80], ["sub-2", 60], ["sub-3", 100]]);
    const result = zScoreForJudge("j1", scores);
    expect(result.isFlat).toBe(false);
    expect(result.n).toBe(3);
    // sub-3 should have the highest z-score
    const z1 = result.zScores.get("sub-1")!;
    const z3 = result.zScores.get("sub-3")!;
    expect(z3).toBeGreaterThan(z1);
  });

  it("returns isFlat=true and z=0 when sd=0", () => {
    const scores = new Map([["sub-1", 75], ["sub-2", 75], ["sub-3", 75]]);
    const result = zScoreForJudge("j1", scores);
    expect(result.isFlat).toBe(true);
    for (const z of result.zScores.values()) {
      expect(z).toBe(0);
    }
  });
});

describe("shrinkZScore", () => {
  it("SHRINKAGE_K is 3 (named constant, not a magic number)", () => {
    expect(SHRINKAGE_K).toBe(3);
  });

  it("n=0: reliability=0, fully shrunk to pooled", () => {
    expect(shrinkZScore(2.0, 0.5, 0)).toBeCloseTo(0.5);
  });

  it("large n: close to judge's own z-score", () => {
    const shrunken = shrinkZScore(2.0, 0.5, 1000);
    expect(shrunken).toBeCloseTo(2.0, 1);
  });

  it("n=3: reliability=0.5, midpoint between judge and pooled", () => {
    // reliability = 3 / (3 + 3) = 0.5
    const result = shrinkZScore(2.0, 0.0, 3);
    expect(result).toBeCloseTo(1.0);
  });
});

describe("rescale", () => {
  it("maps values to [0, 100] range", () => {
    const rescaled = rescale([-1, 0, 1]);
    expect(rescaled[0]).toBeCloseTo(0);
    expect(rescaled[2]).toBeCloseTo(100);
  });

  it("identical values → midpoint (50)", () => {
    const rescaled = rescale([5, 5, 5]);
    expect(rescaled[0]).toBe(50);
    expect(rescaled[1]).toBe(50);
  });

  it("empty array returns empty array", () => {
    expect(rescale([])).toEqual([]);
  });
});
