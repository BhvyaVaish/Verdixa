/**
 * Slice C — Judging Engine: Normalization Types
 * Pure TypeScript. Zero dependency on Prisma, Next.js, or any DB.
 */

/** A raw score as entered by a judge */
export interface RawScore {
  judgeId: string;
  submissionId: string;
  /** Numeric score, e.g. 0–100 */
  value: number;
}

/** A normalized score after per-judge z-score and shrinkage */
export interface NormalizedScore {
  judgeId: string;
  submissionId: string;
  /** Raw value, preserved for audit */
  rawValue: number;
  /** Final normalized value rescaled to presentation range */
  normalizedValue: number;
}

/** Flags raised by the normalization pipeline. Never auto-corrected — surfaced to organizer. */
export type NormalizationFlagCode =
  | "INSUFFICIENT_DATA" // Not enough judges/scores for meaningful normalization
  | "FLAT_RATER" // A judge scored all submissions identically (sd = 0)
  | "EXTREME_RATER" // A judge's scores are statistical outliers from the panel
  | "SINGLE_JUDGE"; // Event has only one judge — normalization not meaningful

export interface NormalizationFlag {
  code: NormalizationFlagCode;
  judgeId?: string; // If judge-specific
  message: string;
}

/**
 * Result of a normalization run for the whole event.
 * If flags are present, normalizedScores may fall back to raw scores.
 */
export interface NormalizationResult {
  normalizedScores: NormalizedScore[];
  flags: NormalizationFlag[];
  /** True if normalization was applied; false if raw scores were used as fallback */
  normalized: boolean;
}
