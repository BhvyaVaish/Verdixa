
---

## Phase 3 Prompt — T2 Integration: Rubrics, Assignment, Scorecards, Isolation

```
PHASE 3 — Wire Slice C's judging math into real data; build the judge/organizer-facing T2 workflow.
Reference docs/verdixa-revised-master-blueprint.md §10 (judging engine design), §11 (normalization strategy, the k=3
shrinkage constant and edge-case handling), and §17 (security model / role-isolation test cases).

CONTEXT: T1 should be complete and passing its own acceptance pass from Phase 2. Slice C's assignment
and normalization functions should already exist as tested pure functions from Phase 1 — this phase
connects them to real judges, real projects, and real UI. Do not rewrite the math; wire it up.

GOAL FOR THIS PHASE
A judge can be invited, assigned to specific projects with a documented algorithm, and score them
against a weighted rubric — with every step backend-enforced and every role boundary actually tested,
not assumed.

PART 1 — Rubrics
- Prisma schema: Rubric (event, versioned), RubricCriterion (name, weight, maxScore). Weights must be
  positive and sum to something greater than zero — enforce this as a real constraint, not just a UI
  hint.
- Organizer UI to configure a rubric per event before assignments are generated. If a rubric changes
  after judging has started, either freeze the existing run or require an explicit new rubric version
  — do not silently let old scorecards drift out of sync with a changed rubric.

PART 2 — Judge onboarding and assignment
- Judge invitation flow (organizer invites, judge accepts). JudgeConflict entity for
  conflict-of-interest declarations (a judge cannot be assigned to their own team's project).
- Wire Phase 1's assignment algorithm to real Project/Judge/Event data. Persist assignments plus the
  algorithm version and any seed used, in one transaction, so a run is reproducible and auditable.
- Judge progress dashboard: what's assigned, what's done, what's outstanding.

PART 3 — Scorecards and role isolation
- ScoreCard (per judge, per assignment, referencing the exact rubric version in effect) and
  CriterionScore. A judge can only submit a score for a project they are actually assigned to —
  enforce this server-side even if the client sends a plausible-looking request for an unassigned
  project.
- A judge must never be able to retrieve another judge's scorecard by guessing or incrementing an ID.
  Write this exact attack as a test: authenticate as Judge A, request Judge B's scorecard by ID,
  assert the server rejects it.
- Judge console UI: persistent rubric sidebar, one project at a time, autosave, keyboard shortcuts
  (1-5 for the current criterion score, N for next assignment) if time allows — functionality over
  polish at this stage.

END OF PHASE — before reporting back
Run the full role-isolation test suite (participant attempting judge actions, judge attempting
organizer actions, judge attempting to see another judge's data) and report pass/fail for each, not
just "looks fine." Update JUDGING.md with the actual assignment strategy and rubric model as
implemented, including any deviation from the original design and why.

```

---

*End of Part 1. When you're ready to continue, ask for the next phases (4–8: normalization integration + CSV export, T3 public trust layer, T4/bonus, polish/docs/demo, and final freeze) — they'll pick up exactly where Phase 3 leaves off.*