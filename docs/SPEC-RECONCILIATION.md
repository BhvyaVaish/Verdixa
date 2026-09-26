# Specification Reconciliation (Phase R)

*Recorded 26 September 2026. This document reconciles the initial `verdixa-revised-master-blueprint.md` against the finalized, confirmed Dogfood 2026 specification.*

## 1. Acceptance Mechanism Formalized
The official checker is a standard Python script (`run.py`), invoked via `python3 run.py .dogfood.toml > acceptance-report.txt`.
- It executes exactly seven HTTP requests without logging in.
- Authentication relies on raw header strings defined in `.dogfood.toml`.
- **Requirement:** Session tokens in the database seed MUST be deterministic so that the `.dogfood.toml` headers continue to work across fresh `docker compose up --build` runs.

## 2. The Seven Checks (T1 and T2)
Design must prioritize these checks above all else:
- **T1 Gallery (Public):** Returns 200, no auth. The response body must contain a known fixture project title.
- **T1 Deadline Check:** A POST by a participant to the submit route must return a 4xx error because the fixture event's `submissions_close` time is intentionally in the past. This confirms server-side, real-time deadline validation against the DB, not client-trusted logic.
- **T2 Judge A Read:** Judge A can GET their own scores (200).
- **T2 Judge B Isolation (Highest Paranoia):** Judge B hitting Judge A's exact score URL MUST get 401 or 403. This is the most common failure point in hackathons.
- **T2 Participant Isolation:** A participant hitting a judge-scores route must get 401 or 403.
- **T2 CSV Export:** Organizer can GET a CSV export (200, comma present in the first line).

## 3. Tier Gating is Strict
Tiers are waterfall-gated. A single T1 failure invalidates all T2 credit. The T1 checks (gallery, deadline enforcement) are just as critical to the final score as the T2 role isolation checks. 

## 4. Real Fixture Importer
We cannot use purely synthetic seed data. The seed script must read from the official `fixtures.json` (a known flat shape of event/tracks/judges/teams/projects/scores containing intentional edge cases like flat-raters and missing reviews). The seed step is now an explicit ETL transform from the spec's flat JSON to our normalized relational schema.

## 5. Bonus Mechanics Re-Prioritized
Bonus challenges (Normalization Proof, Pairwise Mode, Threat Model, API First) act as tie-breakers and decide a side prize, not the primary score.
- Normalization Proof and Threat Model remain high priority because they serve the main 25% Judging Integrity criterion.
- Pairwise Mode and full API-First builds are relegated to "if time allows after T1-T3 are fully secured".

## 6. "Visitor" Role Acknowledged
The spec officially lists "visitor" as a fifth role alongside `participant`, `judge`, `organizer`, and `admin`. We do not need a DB enum for this—it simply denotes unauthenticated access. 
- *Action:* `ARCHITECTURE.md` and `JUDGING.md` will be updated to explicitly define the limits of the visitor role (gallery access only).

## 7. Scrubbing of Placeholder Data
Any placeholder figures, dates, or prize amounts from early planning drafts will be scrubbed from `README.md` and all documentation. Only confirmed facts from the live spec will be mentioned.
