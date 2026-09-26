# VERDIXA

VERDIXA is an integrity-first, self-hostable hackathon submission and judging operating system built for Dogfood 2026. Designed for offline-first resilience with zero external runtime dependencies, it pairs strict backend role isolation, auditable event administration, and tamper-resistant media uploads with a mathematically defensible evaluation engine.

## Quick Start (Docker)

Verdixa runs completely self-contained from a single command. It builds a Next.js standalone runner with PostgreSQL and vendors Prisma engines during container build time.

```bash
docker compose up --build
```

- **Portal URL:** [http://localhost:3000](http://localhost:3000)
- **Demo Credentials:**
  - Admin: `admin@verdixa.dev` / `verdixa2026`
  - Organizer: `organizer@verdixa.dev` / `organizer2026`
  - *Standard Judge & Participant deterministic tokens are pending Phase 3.*

## Current Status (End of Phase G / Post-Phase 2)

- **Claimed Tier:** **Tier 1 (T1) — Submissions & Public Gallery**
- **Verified Subsystems:**
  - **Slice A (Identity & Teams):** Hand-rolled Argon2id password hashing, HMAC-SHA256 signed HttpOnly session cookies, server-enforced role authorization (`visitor`, `participant`, `judge`, `organizer`, `admin`), atomic team formation, and single-use invite tokens.
  - **Slice B (Submissions & Gallery):** Draft and finalized project submission flow, strict server-clock deadline enforcement, magic-byte (MIME sniffing) upload validation stored on local disk under randomized UUIDs, and an allow-list public gallery DTO.
  - **Slice C (Judging Core - Pure Math):** Seeded, constraint-satisfaction assignment algorithm with deterministic tie-breaking and local workload balancing; judge-relative z-score normalization with Bayesian reliability shrinkage ($k=3$), and degenerate input handling ($n=1, \text{sd}=0$, flat-rater and extreme-rater anomaly flags).

## Known Limitations (What Is Genuinely Not Built Yet)

- **Tier 2 (Judging Workflow & Role Isolation):** Judge onboarding invitation flows, database-persisted scorecards, criterion-based rubrics, live judge console UI, and CSV export of normalized scores are not yet integrated into the database and UI (scheduled for Phase 3).
- **Tier 3 (Public Trust & Community Voting):** Live voting mechanics, anti-abuse/sybil heuristics, rate-limiting overlays, and public audit trails are planned for Phase 4-5.
- **Tier 4 (API-First & Polish):** Full OpenAPI specification and embeddable widgets are planned for Phase 6.
