/**
 * Slice C — Judging Engine: Assignment Algorithm Types
 * Pure TypeScript. Zero dependency on Prisma, Next.js, or any DB.
 * These types are the contract between the pure algorithm and the integration layer.
 */

/** A judge who can be assigned to evaluate submissions */
export interface Judge {
  /** Stable identifier — used as deterministic tie-break key */
  id: string;
  /** Pre-existing assignment count from prior runs (for incremental assignment) */
  existingLoad?: number;
}

/** A submission that needs to be evaluated */
export interface Submission {
  /** Stable identifier */
  id: string;
}

/**
 * A conflict that prevents a judge from evaluating a submission.
 * Examples: judge is a submitter, judge declared a conflict of interest.
 */
export interface Conflict {
  judgeId: string;
  submissionId: string;
}

/** A resolved assignment: this judge evaluates this submission */
export interface Assignment {
  judgeId: string;
  submissionId: string;
}

/** Configuration for the assignment algorithm */
export interface AssignmentConfig {
  /** Minimum number of judge evaluations per submission (hard constraint) */
  minJudgesPerSubmission: number;
  /** Target number of judge evaluations per submission (soft target) */
  targetJudgesPerSubmission: number;
}

/** Result returned by runAssignment() */
export interface AssignmentResult {
  assignments: Assignment[];
  /** Warnings about coverage gaps or other soft-constraint violations */
  warnings: AssignmentWarning[];
}

export type AssignmentWarningCode =
  | "COVERAGE_GAP" // A submission could not get minJudgesPerSubmission judges
  | "IMBALANCE" // Judge workload differs by more than 1 after swap pass
  | "NO_ELIGIBLE_JUDGES"; // No judges can be assigned to a submission

export interface AssignmentWarning {
  code: AssignmentWarningCode;
  submissionId?: string;
  message: string;
}
