/**
 * Slice C — Judging Engine: Assignment Algorithm
 *
 * Pure functions only. Zero imports from Prisma, Next.js, or any DB layer.
 * The integration layer (wiring to real judges/submissions from the DB) is Slice C phase 2.
 *
 * Algorithm:
 * 1. Build eligible (judge, submission) edges by removing conflicts
 * 2. Greedy seed: ensure every submission gets minJudgesPerSubmission judges
 * 3. Fill by workload: fill remaining slots targeting targetJudgesPerSubmission,
 *    always picking the judge with lowest projected load (ties broken by judgeId ASC)
 * 4. Local-swap pass: reduce max-min workload imbalance
 * 5. Validate hard constraints
 *
 * DETERMINISM GUARANTEE:
 * Every sort in this module uses an explicit secondary key (judgeId or submissionId, ASC)
 * so that two runs on identical input always produce identical output.
 * See blueprint §10 addition 1.
 */

import type {
  Judge,
  Submission,
  Conflict,
  Assignment,
  AssignmentConfig,
  AssignmentResult,
  AssignmentWarning,
} from "./types";

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Set of "judgeId:submissionId" strings for O(1) conflict lookup */
function buildConflictSet(conflicts: Conflict[]): Set<string> {
  const set = new Set<string>();
  for (const c of conflicts) {
    set.add(`${c.judgeId}:${c.submissionId}`);
  }
  return set;
}

function isConflict(
  judgeId: string,
  submissionId: string,
  conflictSet: Set<string>
): boolean {
  return conflictSet.has(`${judgeId}:${submissionId}`);
}

/** Key for an assignment edge (used for deduplication) */
function edgeKey(judgeId: string, submissionId: string): string {
  return `${judgeId}:${submissionId}`;
}

/**
 * Compute current judge loads from a list of assignments.
 * Returns a Map<judgeId, count>.
 */
function computeLoads(
  judges: Judge[],
  assignments: Assignment[]
): Map<string, number> {
  const loads = new Map<string, number>(
    judges.map((j) => [j.id, j.existingLoad ?? 0])
  );
  for (const a of assignments) {
    loads.set(a.judgeId, (loads.get(a.judgeId) ?? 0) + 1);
  }
  return loads;
}

/**
 * Compute current submission coverage counts.
 * Returns a Map<submissionId, count>.
 */
function computeCoverage(
  submissions: Submission[],
  assignments: Assignment[]
): Map<string, number> {
  const coverage = new Map<string, number>(
    submissions.map((s) => [s.id, 0])
  );
  for (const a of assignments) {
    coverage.set(a.submissionId, (coverage.get(a.submissionId) ?? 0) + 1);
  }
  return coverage;
}

// ─── Step 1: Build eligible edges ────────────────────────────────────────────

/**
 * Build all eligible (judge, submission) pairs, excluding conflicts.
 * Result is sorted deterministically: by submissionId ASC, then judgeId ASC.
 */
export function buildEdges(
  judges: Judge[],
  submissions: Submission[],
  conflicts: Conflict[]
): Array<{ judgeId: string; submissionId: string }> {
  const conflictSet = buildConflictSet(conflicts);
  const edges: Array<{ judgeId: string; submissionId: string }> = [];

  for (const sub of submissions) {
    for (const judge of judges) {
      if (!isConflict(judge.id, sub.id, conflictSet)) {
        edges.push({ judgeId: judge.id, submissionId: sub.id });
      }
    }
  }

  // Deterministic sort: submissionId ASC, then judgeId ASC
  edges.sort((a, b) => {
    const subCmp = a.submissionId.localeCompare(b.submissionId);
    if (subCmp !== 0) return subCmp;
    return a.judgeId.localeCompare(b.judgeId);
  });

  return edges;
}

// ─── Step 2: Greedy seed (minimum coverage) ──────────────────────────────────

/**
 * Greedy seed pass: for each submission that needs more coverage, assign the
 * eligible judge with the lowest current load (ties broken by judgeId ASC).
 * Modifies the assignments set in-place (represented as a Set of edge keys
 * and an array for return).
 */
export function greedySeed(
  judges: Judge[],
  submissions: Submission[],
  edges: Array<{ judgeId: string; submissionId: string }>,
  minPerSubmission: number
): { assignments: Assignment[]; warnings: AssignmentWarning[] } {
  const assigned = new Set<string>(); // edge keys already assigned
  const result: Assignment[] = [];
  const warnings: AssignmentWarning[] = [];

  // Build per-submission eligible judges map
  const eligibleForSubmission = new Map<string, string[]>();
  for (const sub of submissions) {
    eligibleForSubmission.set(sub.id, []);
  }
  for (const e of edges) {
    eligibleForSubmission.get(e.submissionId)?.push(e.judgeId);
  }

  // Process submissions in deterministic order (submissionId ASC)
  const sortedSubmissions = [...submissions].sort((a, b) =>
    a.id.localeCompare(b.id)
  );

  // Track loads including previously assigned
  const loads = computeLoads(judges, result);

  for (const sub of sortedSubmissions) {
    const eligible = (eligibleForSubmission.get(sub.id) ?? []).filter(
      (jid) => !assigned.has(edgeKey(jid, sub.id))
    );

    let coverage = 0;
    // Sort eligible by current load ASC, ties by judgeId ASC (deterministic)
    const byLoad = [...eligible].sort((a, b) => {
      const loadDiff = (loads.get(a) ?? 0) - (loads.get(b) ?? 0);
      if (loadDiff !== 0) return loadDiff;
      return a.localeCompare(b);
    });

    for (const judgeId of byLoad) {
      if (coverage >= minPerSubmission) break;
      const key = edgeKey(judgeId, sub.id);
      if (!assigned.has(key)) {
        assigned.add(key);
        result.push({ judgeId, submissionId: sub.id });
        loads.set(judgeId, (loads.get(judgeId) ?? 0) + 1);
        coverage++;
      }
    }

    if (coverage < minPerSubmission) {
      warnings.push({
        code:
          eligible.length === 0
            ? "NO_ELIGIBLE_JUDGES"
            : "COVERAGE_GAP",
        submissionId: sub.id,
        message:
          eligible.length === 0
            ? `Submission ${sub.id} has no eligible judges (all judges have conflicts).`
            : `Submission ${sub.id} has only ${coverage}/${minPerSubmission} judges after seed pass.`,
      });
    }
  }

  return { assignments: result, warnings };
}

// ─── Step 3: Fill by workload ─────────────────────────────────────────────────

/**
 * Fill remaining assignment slots up to targetPerSubmission.
 * Always picks the eligible judge with the lowest current load.
 * Ties broken by judgeId ASC for determinism.
 */
export function fillByWorkload(
  judges: Judge[],
  submissions: Submission[],
  edges: Array<{ judgeId: string; submissionId: string }>,
  existing: Assignment[],
  targetPerSubmission: number
): Assignment[] {
  const assigned = new Set<string>(existing.map((a) => edgeKey(a.judgeId, a.submissionId)));
  const result: Assignment[] = [...existing];
  const loads = computeLoads(judges, existing);
  const coverage = computeCoverage(submissions, existing);

  // Build per-submission eligible judge map
  const eligibleMap = new Map<string, string[]>();
  for (const e of edges) {
    if (!eligibleMap.has(e.submissionId)) eligibleMap.set(e.submissionId, []);
    eligibleMap.get(e.submissionId)!.push(e.judgeId);
  }

  // Process submissions in deterministic order
  const sortedSubmissions = [...submissions].sort((a, b) =>
    a.id.localeCompare(b.id)
  );

  for (const sub of sortedSubmissions) {
    const current = coverage.get(sub.id) ?? 0;
    if (current >= targetPerSubmission) continue;

    const eligible = (eligibleMap.get(sub.id) ?? []).filter(
      (jid) => !assigned.has(edgeKey(jid, sub.id))
    );

    // Sort by load ASC, then judgeId ASC
    const sorted = [...eligible].sort((a, b) => {
      const loadDiff = (loads.get(a) ?? 0) - (loads.get(b) ?? 0);
      if (loadDiff !== 0) return loadDiff;
      return a.localeCompare(b);
    });

    let added = current;
    for (const judgeId of sorted) {
      if (added >= targetPerSubmission) break;
      const key = edgeKey(judgeId, sub.id);
      if (!assigned.has(key)) {
        assigned.add(key);
        result.push({ judgeId, submissionId: sub.id });
        loads.set(judgeId, (loads.get(judgeId) ?? 0) + 1);
        coverage.set(sub.id, (coverage.get(sub.id) ?? 0) + 1);
        added++;
      }
    }
  }

  return result;
}

// ─── Step 4: Local-swap pass ──────────────────────────────────────────────────

/**
 * Reduce workload imbalance between judges by swapping assignments.
 * For each assignment of the most-loaded judge, check if there's an eligible
 * judge with a lower load who could take it. If swapping reduces imbalance, do it.
 *
 * This is a single-pass O(n²) heuristic — sufficient for hackathon scale.
 * Sort order for candidate selection: load ASC, then judgeId ASC (deterministic).
 */
export function localSwapPass(
  judges: Judge[],
  assignments: Assignment[],
  edges: Array<{ judgeId: string; submissionId: string }>
): Assignment[] {
  if (assignments.length === 0) return assignments;

  const result = [...assignments];
  // eligibilitySet: set of "judgeId:submissionId" keys that are ELIGIBLE (no conflict).
  // Conflicts were already removed in buildEdges; this set contains only valid pairs.
  const eligibilitySet = new Set<string>(edges.map((e) => edgeKey(e.judgeId, e.submissionId)));

  // Build per-judge assignment list for fast lookup
  const judgeAssignments = new Map<string, Set<string>>();
  for (const j of judges) judgeAssignments.set(j.id, new Set());
  for (const a of result) {
    judgeAssignments.get(a.judgeId)?.add(a.submissionId);
  }

  const getLoad = (judgeId: string) => judgeAssignments.get(judgeId)?.size ?? 0;

  // Process judges sorted by load DESC (heaviest first), id ASC for determinism.
  // Note: we re-sort inside the loop so that load changes from prior swaps are reflected.
  const judgeIds = judges.map((j) => j.id);

  for (let pass = 0; pass < judgeIds.length; pass++) {
    // Re-sort each iteration to reflect updated loads
    const sortedByLoad = [...judgeIds].sort((a, b) => {
      const loadDiff = getLoad(b) - getLoad(a);
      if (loadDiff !== 0) return loadDiff;
      return a.localeCompare(b);
    });

    const heavyId = sortedByLoad[0]!;
    const lightId = sortedByLoad[sortedByLoad.length - 1]!;

    if (heavyId === lightId) break;

    const heavyLoad = getLoad(heavyId);
    const lightLoad = getLoad(lightId);

    // Only swap if imbalance > 1
    if (heavyLoad - lightLoad <= 1) break;

    // Find a submission the heavy judge has that the light judge can take
    const swappableSubmissions = [...(judgeAssignments.get(heavyId) ?? [])]
      .filter((subId) => {
        const lightEligible = eligibilitySet.has(edgeKey(lightId, subId));
        const lightAlreadyAssigned = judgeAssignments.get(lightId)?.has(subId);
        return lightEligible && !lightAlreadyAssigned;
      })
      .sort(); // deterministic: submissionId ASC

    if (swappableSubmissions.length === 0) break;

    const subId = swappableSubmissions[0]!;

    // Perform swap
    judgeAssignments.get(heavyId)?.delete(subId);
    judgeAssignments.get(lightId)?.add(subId);

    // Update result array
    const idx = result.findIndex(
      (a) => a.judgeId === heavyId && a.submissionId === subId
    );
    if (idx !== -1) {
      result[idx] = { judgeId: lightId, submissionId: subId };
    }
  }

  return result;
}


// ─── Step 5: Validate hard constraints ───────────────────────────────────────

/**
 * Validate that no assignment violates a declared conflict.
 * Throws if any conflict is violated — this is a hard constraint, not a warning.
 */
export function validateConstraints(
  assignments: Assignment[],
  conflicts: Conflict[]
): void {
  const conflictSet = buildConflictSet(conflicts);
  for (const a of assignments) {
    if (isConflict(a.judgeId, a.submissionId, conflictSet)) {
      throw new Error(
        `CONSTRAINT_VIOLATION: Judge ${a.judgeId} is assigned to submission ${a.submissionId} but has a declared conflict.`
      );
    }
  }
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Run the full assignment algorithm.
 *
 * DETERMINISM: identical inputs always produce identical output.
 * Run this function twice on the same input — the result must be byte-identical
 * (after sorting assignments by [judgeId ASC, submissionId ASC]).
 *
 * See blueprint §10 addition 1: "Every sort needs an explicit secondary sort key."
 */
export function runAssignment(
  judges: Judge[],
  submissions: Submission[],
  conflicts: Conflict[],
  config: AssignmentConfig
): AssignmentResult {
  if (judges.length === 0 || submissions.length === 0) {
    return { assignments: [], warnings: [] };
  }

  const edges = buildEdges(judges, submissions, conflicts);

  // Step 2: greedy seed for minimum coverage
  const { assignments: seeded, warnings } = greedySeed(
    judges,
    submissions,
    edges,
    config.minJudgesPerSubmission
  );

  // Step 3: fill up to target
  const filled = fillByWorkload(
    judges,
    submissions,
    edges,
    seeded,
    config.targetJudgesPerSubmission
  );

  // Step 4: local swap to reduce imbalance
  const swapped = localSwapPass(judges, filled, edges);

  // Step 5: validate hard constraints (will throw on violation)
  validateConstraints(swapped, conflicts);

  // Sort final assignments deterministically for stable output
  const sorted = [...swapped].sort((a, b) => {
    const jCmp = a.judgeId.localeCompare(b.judgeId);
    if (jCmp !== 0) return jCmp;
    return a.submissionId.localeCompare(b.submissionId);
  });

  return { assignments: sorted, warnings };
}
