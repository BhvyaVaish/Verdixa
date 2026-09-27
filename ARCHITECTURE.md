# VERDIXA Architecture

> **Incremental document** — updated at the end of Phase 5 (Final Hardening).
> Reference [docs/verdixa-revised-master-blueprint.md](file:///d:/Bhvya%20Vaish%20Documents/Proffesional/Projects/Verdixa/docs/verdixa-revised-master-blueprint.md) for the foundational product identity, architectural constraints, and engineering rationale.

## System Overview

VERDIXA is an integrity-first, self-hostable hackathon operating system. Single `docker compose up` deployment with zero runtime network dependencies.

```
┌─────────────────────────────────────────────────────────────┐
│                     docker compose up                       │
│                                                             │
│  ┌──────────────────┐         ┌────────────────────────┐   │
│  │   app (Next.js)  │◄───────►│  postgres:16-alpine    │   │
│  │   port 3000      │         │  port 5432 (internal)  │   │
│  │   standalone     │         │  volume: pgdata         │   │
│  └──────────────────┘         └────────────────────────┘   │
│           │                                                  │
│  volume: uploads (local disk, no MinIO)                     │
└─────────────────────────────────────────────────────────────┘
```

## Current Technology Stack

| Layer | Technology | Status & Notes |
|---|---|---|
| Frontend & BFF | Next.js 16 (App Router) | `output: 'standalone'` for Docker container |
| Styling | Tailwind CSS | Utility-first styling; responsive layout |
| Database | PostgreSQL 16 | Self-hosted via Docker Compose |
| ORM | Prisma 6 | Query engine binary vendored at build time; zero network access at runtime |
| Auth & Permissions | Hand-rolled | Argon2id password hashing + HMAC-SHA256 signed HttpOnly session cookies |
| Upload Storage | Local Volume | Validated via magic bytes (MIME sniffing) + size cap (5MB) + randomized UUID |
| Testing | Vitest + Playwright | Vitest for pure math; Playwright for API acceptance & role-isolation sweeps |
| Containerization | Docker Compose | Healthcheck-gated startup (`pg_isready`) |

## Repository Layout (Standard Submission Tree)

```
Verdixa/
├── .dogfood.toml                  # Official acceptance configuration
├── .gitignore
├── acceptance-report.txt          # Acceptance verification report (Phase 1-5)
├── docker-compose.yml             # Single-command local environment
├── Dockerfile                     # Multi-stage standalone build
├── README.md                      # Overview & quick start
├── ARCHITECTURE.md                # System design & slice status
├── DATA-MODEL.md                  # Active schema documentation
├── JUDGING.md                     # Judging engine specification & status
├── THREAT-MODEL.md                # Anti-abuse and manipulation controls
├── LICENSE                        # MIT License
├── src/                           # All product code written during the window
│   ├── app/                       # Next.js App Router (force-dynamic routes)
│   │   ├── api/v1/                # REST endpoints (auth, events, teams, projects, uploads, judging, voting)
│   │   └── gallery/               # Public gallery server component
│   ├── components/                # Reusable UI widgets
│   ├── lib/                       # Infrastructure & cross-cutting utilities
│   │   ├── auth/                  # Password hashing, HMAC sessions, requireRole
│   │   ├── db/                    # Prisma client singleton
│   │   ├── permissions/           # Centralized authorization policies
│   │   ├── audit/                 # Transactional audit logging helper
│   │   └── validation/            # Common Zod validation schemas
│   └── domain/                    # Slice domain logic
│       ├── events/                # Event creation, rules & deadline assertions
│       ├── teams/                 # Team formation & invite acceptance
│       ├── submissions/           # Project drafting, finalization, media handling
│       ├── judging/               # Pure math core: assignment & normalization
│       ├── voting/                # Community voting mechanics, shuffle algorithm, and rate limiting
│       └── results/               # Leaderboard & export scaffolding
├── prisma/
│   ├── schema.prisma              # Relational schema
│   ├── migrations/                # Migration history
│   └── seed.ts                    # Idempotent fixture importer & token seeder
├── tests/
│   ├── unit/                      # Fast pure-function tests (Slice C math core)
│   ├── integration/               # Database-level service tests
│   └── e2e/                       # Playwright API acceptance & role-isolation tests
├── tools/
│   └── acceptance/
│       ├── run.py                 # Official Dogfood 2026 stdlib acceptance checker
│       ├── fixtures.json          # Official test data fixture
│       └── example.dogfood.toml   # Reference toml format
└── docs/
    ├── verdixa-revised-master-blueprint.md  # Authoritative architecture & plan
    └── SPEC-RECONCILIATION.md               # Record of changes against confirmed spec
```

## Security Architecture

- **Hand-Rolled Authentication:** Argon2id password hashing, opaque 32-byte HMAC-SHA256 signed session tokens, HttpOnly/SameSite=Lax cookies, revocable server-side sessions.
- **Server-Owned Roles:** `visitor` (unauthenticated, public gallery only), `participant`, `judge`, `organizer`, `admin`.
- **Policy Enforcement:** `requireRole(session, allowedRoles)` helper executed at the top of every sensitive route handler and service method before input parsing or database interaction.
- **No Client Timestamps:** Deadlines are verified against the authoritative server clock and the event's stored `submissionDeadline`.
- **Media Upload Safety:** First 8 bytes of all uploads are sniffed for valid magic numbers to block disguised scripts; served as binary attachment or non-executable MIME type.
- **Strict Allow-List DTOs:** All public serializers explicitly select public-safe fields to eliminate accidental data leakage.

## Slice Implementation Status

| Slice | Scope | Current Status |
|---|---|---|
| **Slice A — Identity & Teams** | Auth, sessions, roles, event config, team creation, invite links | ✅ **Complete & Verified (T1)** |
| **Slice B — Submissions & Gallery** | Project drafting, server deadline lock, local uploads, public gallery | ✅ **Complete & Verified (T1)** |
| **Slice C — Judging Engine** | Assignment algorithm, rubrics, scorecards, normalization math, anomaly flags | ✅ **Complete & Verified (T2)** |
| **Slice D — Public Trust Layer** | Voting, audit log surfacing, anti-abuse heuristics | ✅ **Complete & Verified (T3)** |
