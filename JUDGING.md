# VERDIXA Judging Engine

> **Status:** Pure mathematical core implemented and verified via unit tests; database integration, rubric schemas, and judge dashboard workflows are scheduled for **Phase 3 (T2)**.
> See [docs/verdixa-revised-master-blueprint.md §10–11](file:///d:/Bhvya%20Vaish%20Documents/Proffesional/Projects/Verdixa/docs/verdixa-revised-master-blueprint.md) for the complete theoretical design.

---

## Current Status: Pure Math Core (Slice C)

The judging engine core is currently implemented entirely as **pure functions** with zero external dependencies on Prisma, Next.js, or PostgreSQL:

- **Location:** [`src/domain/judging/`](src/domain/judging/)
  - `assignment/algorithm.ts`: Greedy-seed constraint satisfaction, workload-filling, and deterministic local-swap balancing.
  - `normalization/normalize.ts`: Judge-relative z-score normalization with Bayesian reliability shrinkage ($k=3$), rescaling to [0, 100], and anomaly detection flags.

### Verified Algorithm Properties (via `tests/unit/`)

1. **Deterministic Tie-Breaking:** Every sort operation in the assignment algorithm uses an explicit secondary key (`judgeId ASC` or `submissionId ASC`). Running the algorithm twice on identical input produces byte-identical output.
2. **Conflict Exclusion:** Hard constraints ensure judges with declared conflicts are never assigned to their conflicted submissions.
3. **Degenerate-Input Handling:** Normalization never crashes or divides by zero:
   - Events with a single judge return raw scores with a `SINGLE_JUDGE` warning.
   - Flat-raters ($\sigma = 0$) are assigned $z = 0$ with a `FLAT_RATER` warning.
   - Zero-variance panels return raw scores with an `INSUFFICIENT_DATA` warning.
   - Dominant outliers produce an `EXTREME_RATER` anomaly flag surfaced to organizers, and are **never** silently clipped or overridden.

---

## Planned for Phase 3 (T2 Integration)

- **Database Schemas:** `Rubric`, `RubricCriterion`, `JudgeAssignment`, `ScoreCard`, `CriterionScore`.
- **Role Isolation:** Server-enforced protection preventing Judge B from querying Judge A's assigned scorecard or raw scores.
- **Judge Console:** Live evaluation UI with persistent rubric reference and keyboard-driven scoring.
- **CSV Export:** Normalized and raw score export for organizers.
- **Visitor Boundaries:** Unauthenticated visitors remain strictly restricted to the public gallery and cannot access scorecards or rubric details.
