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

## Phase 3 (T2) Additions

- **Duplicate Submissions**: The system now supports explicit duplicates via the `duplicateOf` relation on the `Project` model. Both projects appear in the gallery and database (e.g. "Dry Harbour"), and the organizer is warned via the AuditLog, preventing data loss.
- **Role Isolation**: Strictly enforced. Judge B cannot query Judge A's assigned scorecard or raw scores. Any such request immediately returns a 403 Forbidden.
- **Flat-Rater Flags**: Fully tested and implemented. The flag surfaces `FLAT_RATER` to organizers without quietly overwriting data.
- **Rubric Versioning**: Implemented in schema. If an organizer changes criteria, a new `Rubric` version is created. Existing scorecards maintain a reference to the exact version they were scored against.
- **API Endpoints**: Full API suite (`/api/v1/scores/me`, `/api/v1/scores/judge/[judgeId]`, `/api/v1/scores/[assignmentId]`, `/api/v1/export/scores.csv`, `/api/v1/judges/me/assignments`).

## Phase 4 Additions

- **Normalization Engine**: Wired the pure math normalization into actual database models using NormalizationRun. Triggering the process outputs ankMovement, correctly flags anomalies (like jdg_07 as FLAT_RATER), and dynamically re-arranges the final leaderboard based on =3$ shrinkage.
- **Organizer Dashboard**: Live judge assignment coverage, completed vs outstanding progress tracker, and side-by-side Raw vs Normalized score comparisons with a clear Rank Movement indicator.

## Phase 5 Additions

### Voting Mechanism
Verdixa uses **authenticated voting** (via the existing secure session cookies). 
- **Rationale**: All participants and judges already have verified accounts. Reusing the session avoids the UX friction and deliverability risk of a secondary email-verification flow, whilst providing a hard account-level deduplication anchor. 
- **Anti-Abuse**: IP heuristics (SHA-256 hashed for privacy) provide an additional layer of rate-limiting against automated high-frequency abuse.
- **Bias Prevention**: Results are strictly hidden from non-organizers while the voting window is active, and the project ballot is deterministically shuffled per-voter to eliminate position bias.
- **Audit Trail**: Every cast vote, retracted vote, posted comment, and moderation action writes an immutable event to the \AuditLog\.
