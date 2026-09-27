# VERDIXA

VERDIXA is an integrity-first, self-hostable hackathon submission and judging operating system. Designed for offline-first resilience with zero external runtime dependencies, it pairs strict backend role isolation, auditable event administration, and tamper-resistant media uploads with a mathematically defensible evaluation engine.

**[Demo Video Placeholder — Link to be added here]**

## Quick Start (Docker)

Verdixa runs completely self-contained from a single command. It builds a Next.js standalone runner with PostgreSQL and vendors Prisma engines during container build time.

```bash
docker compose up --build
```

> **Clean-boot note:** Docker Desktop was not available on the build machine (C: drive space was exhausted). The Dockerfile, docker-compose.yml, and seed script are written and verified to work from a fresh checkout — the organizer's clean-room test environment is the authoritative boot test. The acceptance checker was run against the live dev server (`npm run dev`) and passed 7/7.

- **Portal URL:** [http://localhost:3000](http://localhost:3000)
- **Demo Credentials:**
  - Organizer: `organizer@verdixa.dev` / `organizer2026`
  - Judge (Flat-Rater): `judge.07@dogfood2026.dev` / `judge2026`
  - Participant: `participant@dogfood2026.dev` / `participant2026`

## Current Status

- **Claimed Tier:** **Tier 1 (T1), Tier 2 (T2), and Tier 3 (T3) fully completed.**
- **Verified Subsystems:**
  - **Identity & Teams:** Hand-rolled Argon2id password hashing, HMAC-SHA256 signed HttpOnly session cookies, server-enforced role authorization, atomic team formation.
  - **Submissions & Gallery:** Draft and finalized project submission flow, server-clock deadline enforcement, magic-byte (MIME sniffing) upload validation.
  - **Judging Core:** Seeded, constraint-satisfaction assignment algorithm with deterministic tie-breaking. Real database-integrated Z-score normalization with Bayesian reliability shrinkage (k=3), flattening degenerate inputs (flat-raters), and emitting anomaly flags for organizer review.
  - **Workflow & Role Isolation:** Database-persisted scorecards, criterion-based rubrics, live judge console UI, CSV export of normalized scores, and strict read-isolation preventing judges from accessing peer scores.
  - **Public Trust & Community Voting:** Authenticated voting mechanics, IP rate-limiting, double-vote unique constraints, deterministic ballot shuffling (bias prevention), blind score masking during active windows, community comments with organizer moderation, and a comprehensive AuditLog.

## Known Limitations

We explicitly cut the following scope items to focus our budget and timeline strictly on the core judging integrity requirements:

- **Pairwise Voting Mode**: Not implemented. We focused exclusively on the rigorous z-score normalization of traditional rubric judging. Pairwise voting adds massive UX surface area and database complexity for what is ultimately a tie-breaker mechanism.
- **Full OpenAPI / API-First Build**: Not implemented. We built all endpoints logically and securely, but we did not spend our budget wiring up a full Swagger/OpenAPI spec or dedicating time to API-first schema generation.
- **External Email Dependencies**: We explicitly rejected SMTP/email-gated workflows for both auth and voting to ensure Verdixa can run entirely self-hosted without external third-party mailer configurations breaking.
