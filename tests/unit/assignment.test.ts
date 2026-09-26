/**
 * Slice C — Assignment Algorithm Tests
 *
 * Tests determinism, conflict exclusion, coverage, workload balance,
 * and edge cases.
 */

import { describe, it, expect } from "vitest";
import {
  buildEdges,
  runAssignment,
  localSwapPass,
  validateConstraints,
} from "../../src/domain/judging/assignment/algorithm";
import type {
  Judge,
  Submission,
  Conflict,
  AssignmentConfig,
} from "../../src/domain/judging/assignment/types";

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeJudges(n: number): Judge[] {
  return Array.from({ length: n }, (_, i) => ({ id: `judge-${String(i + 1).padStart(2, "0")}` }));
}

function makeSubmissions(n: number): Submission[] {
  return Array.from({ length: n }, (_, i) => ({ id: `sub-${String(i + 1).padStart(2, "0")}` }));
}

const DEFAULT_CONFIG: AssignmentConfig = {
  minJudgesPerSubmission: 2,
  targetJudgesPerSubmission: 3,
};

// ─── Test 1: DETERMINISM — identical inputs always produce identical output ───

describe("Assignment determinism (blueprint §10 addition 1)", () => {
  it("running the algorithm twice on identical input produces identical output", () => {
    const judges = makeJudges(5);
    const submissions = makeSubmissions(8);
    const conflicts: Conflict[] = [
      { judgeId: "judge-01", submissionId: "sub-03" },
      { judgeId: "judge-03", submissionId: "sub-06" },
    ];

    const result1 = runAssignment(judges, submissions, conflicts, DEFAULT_CONFIG);
    const result2 = runAssignment(judges, submissions, conflicts, DEFAULT_CONFIG);

    // Compare sorted assignment arrays
    const sort = (a: typeof result1.assignments) =>
      [...a].sort((x, y) =>
        x.judgeId !== y.judgeId
          ? x.judgeId.localeCompare(y.judgeId)
          : x.submissionId.localeCompare(y.submissionId)
      );

    expect(sort(result1.assignments)).toEqual(sort(result2.assignments));
    expect(result1.warnings).toEqual(result2.warnings);
  });

  it("deterministic with larger input (10 judges, 20 submissions)", () => {
    const judges = makeJudges(10);
    const submissions = makeSubmissions(20);
    const conflicts: Conflict[] = [
      { judgeId: "judge-02", submissionId: "sub-07" },
      { judgeId: "judge-05", submissionId: "sub-12" },
      { judgeId: "judge-08", submissionId: "sub-15" },
    ];

    const r1 = runAssignment(judges, submissions, conflicts, DEFAULT_CONFIG);
    const r2 = runAssignment(judges, submissions, conflicts, DEFAULT_CONFIG);

    const sort = (a: typeof r1.assignments) =>
      [...a].sort((x, y) =>
        x.judgeId !== y.judgeId
          ? x.judgeId.localeCompare(y.judgeId)
          : x.submissionId.localeCompare(y.submissionId)
      );

    expect(sort(r1.assignments)).toEqual(sort(r2.assignments));
  });
});

// ─── Test 2: Conflict exclusion ───────────────────────────────────────────────

describe("Conflict exclusion", () => {
  it("conflicted judge is never assigned to conflicted submission", () => {
    const judges = makeJudges(4);
    const submissions = makeSubmissions(4);
    const conflicts: Conflict[] = [
      { judgeId: "judge-01", submissionId: "sub-02" },
      { judgeId: "judge-03", submissionId: "sub-04" },
    ];

    const { assignments } = runAssignment(judges, submissions, conflicts, DEFAULT_CONFIG);

    for (const conflict of conflicts) {
      const violating = assignments.find(
        (a) => a.judgeId === conflict.judgeId && a.submissionId === conflict.submissionId
      );
      expect(violating).toBeUndefined();
    }
  });

  it("validateConstraints throws on a conflict violation", () => {
    const conflicts: Conflict[] = [{ judgeId: "j1", submissionId: "s1" }];
    const badAssignments = [{ judgeId: "j1", submissionId: "s1" }];

    expect(() => validateConstraints(badAssignments, conflicts)).toThrow(
      "CONSTRAINT_VIOLATION"
    );
  });
});

// ─── Test 3: Coverage guarantee ───────────────────────────────────────────────

describe("Coverage guarantee", () => {
  it("every submission gets at least minJudgesPerSubmission judges", () => {
    const judges = makeJudges(6);
    const submissions = makeSubmissions(5);

    const { assignments, warnings } = runAssignment(judges, submissions, [], DEFAULT_CONFIG);

    // No warnings expected for a feasible configuration
    const coverageWarnings = warnings.filter((w) => w.code === "COVERAGE_GAP");
    expect(coverageWarnings).toHaveLength(0);

    // Count judges per submission
    const coverageMap = new Map<string, number>();
    for (const a of assignments) {
      coverageMap.set(a.submissionId, (coverageMap.get(a.submissionId) ?? 0) + 1);
    }

    for (const sub of submissions) {
      expect(coverageMap.get(sub.id) ?? 0).toBeGreaterThanOrEqual(
        DEFAULT_CONFIG.minJudgesPerSubmission
      );
    }
  });

  it("issues COVERAGE_GAP warning when impossible to meet minimum (all conflicts)", () => {
    // 1 judge, 1 submission, but judge has a conflict
    const judges: Judge[] = [{ id: "j1" }];
    const submissions: Submission[] = [{ id: "s1" }];
    const conflicts: Conflict[] = [{ judgeId: "j1", submissionId: "s1" }];

    const { warnings } = runAssignment(judges, submissions, conflicts, {
      minJudgesPerSubmission: 1,
      targetJudgesPerSubmission: 1,
    });

    expect(warnings.some((w) => w.code === "NO_ELIGIBLE_JUDGES")).toBe(true);
  });
});

// ─── Test 4: Workload balance ─────────────────────────────────────────────────

describe("Workload balance after local-swap", () => {
  it("max-min judge load differs by at most 1 for balanced inputs", () => {
    // 4 judges, 8 submissions, 2 judges per submission target = 4 each (perfectly balanced)
    const judges = makeJudges(4);
    const submissions = makeSubmissions(8);

    const { assignments } = runAssignment(judges, submissions, [], {
      minJudgesPerSubmission: 2,
      targetJudgesPerSubmission: 2,
    });

    const loadMap = new Map<string, number>();
    for (const j of judges) loadMap.set(j.id, 0);
    for (const a of assignments) {
      loadMap.set(a.judgeId, (loadMap.get(a.judgeId) ?? 0) + 1);
    }

    const loads = [...loadMap.values()];
    const maxLoad = Math.max(...loads);
    const minLoad = Math.min(...loads);
    expect(maxLoad - minLoad).toBeLessThanOrEqual(1);
  });
});

// ─── Test 5: Edge — 1 judge, 1 submission, 0 conflicts ───────────────────────

describe("Edge cases", () => {
  it("1 judge, 1 submission, 0 conflicts → single valid assignment", () => {
    const judges: Judge[] = [{ id: "j1" }];
    const submissions: Submission[] = [{ id: "s1" }];

    const { assignments, warnings } = runAssignment(judges, submissions, [], {
      minJudgesPerSubmission: 1,
      targetJudgesPerSubmission: 1,
    });

    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toEqual({ judgeId: "j1", submissionId: "s1" });
    expect(warnings).toHaveLength(0);
  });

  it("0 judges → empty result with no crash", () => {
    const { assignments, warnings } = runAssignment([], makeSubmissions(3), [], DEFAULT_CONFIG);
    expect(assignments).toHaveLength(0);
  });

  it("0 submissions → empty result with no crash", () => {
    const { assignments } = runAssignment(makeJudges(3), [], [], DEFAULT_CONFIG);
    expect(assignments).toHaveLength(0);
  });

  it("no duplicate assignments for the same (judge, submission) pair", () => {
    const judges = makeJudges(3);
    const submissions = makeSubmissions(4);
    const { assignments } = runAssignment(judges, submissions, [], DEFAULT_CONFIG);

    const seen = new Set<string>();
    for (const a of assignments) {
      const key = `${a.judgeId}:${a.submissionId}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});

// ─── Test 6: buildEdges correctness ──────────────────────────────────────────

describe("buildEdges", () => {
  it("excludes conflicted pairs and includes all others", () => {
    const judges: Judge[] = [{ id: "j1" }, { id: "j2" }];
    const submissions: Submission[] = [{ id: "s1" }, { id: "s2" }];
    const conflicts: Conflict[] = [{ judgeId: "j1", submissionId: "s2" }];

    const edges = buildEdges(judges, submissions, conflicts);

    // 4 possible edges − 1 conflict = 3
    expect(edges).toHaveLength(3);

    // The conflicted pair must not appear
    const conflicted = edges.find((e) => e.judgeId === "j1" && e.submissionId === "s2");
    expect(conflicted).toBeUndefined();
  });
});
