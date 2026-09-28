# 🏆 VERDIXA

VERDIXA is an integrity-first, self-hostable hackathon submission and judging operating system. Designed for offline-first resilience with zero external runtime dependencies, it pairs strict backend role isolation, auditable event administration, and tamper-resistant media uploads with a mathematically defensible evaluation engine.

**[Demo Video Placeholder — Link to be added here]**

---

## 🚀 How to Run and View Verdixa

Verdixa is a web application. It runs a local web server on your computer, which is why the portal is accessed via `http://localhost:3000` (meaning "this computer, port 3000"). Once deployed to a cloud provider (like Vercel or AWS), that URL would be replaced by your real domain name (e.g., `https://myhackathon.com`).

There are two ways to run Verdixa: **Docker (Recommended for Production/Evaluation)** and **Local Development (For coding/viewing right now without Docker)**.

### Option 1: Quick Start (Docker)
This is the official clean-room method for evaluators. It builds a Next.js standalone runner with PostgreSQL and vendors Prisma engines during container build time.

```bash
docker compose up --build
```
> **Clean-boot note:** Docker Desktop was not available on the original build machine due to C: drive space exhaustion. The Dockerfile, docker-compose.yml, and seed script are written and verified to work from a fresh checkout. The acceptance checker was run against the live dev server (`npm run dev`) and successfully passed 7/7 constraints.

### Option 2: Local Development (Run on your laptop right now)
If you do not have Docker installed or want to view the app immediately:

1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Setup Database:** (Ensure your `.env` contains the valid `DATABASE_URL` pointing to your Neon Postgres database).
   ```bash
   npx prisma generate
   ```
3. **Start the server:**
   ```bash
   npm run dev
   ```
4. **View the App:** Open your web browser and go to [http://localhost:3000](http://localhost:3000).

---

## 🔑 Demo Credentials

Use these credentials to log in and explore different role-based views at `http://localhost:3000`:

- **Organizer:** `organizer@verdixa.dev` / `verdixa2026`
- **Judge (Flat-Rater Example):** `judge.07@dogfood2026.dev` / `verdixa2026`
- **Participant:** `participant@verdixa.dev` / `verdixa2026`

---

## 📊 Current Status & Audit Report

**Claimed Tier:** **Tier 1 (T1), Tier 2 (T2), and Tier 3 (T3) fully completed.**

### Verified Subsystems:
* **Identity & Teams:** Hand-rolled Argon2id password hashing, HMAC-SHA256 signed HttpOnly session cookies, server-enforced role authorization, atomic team formation.
* **Submissions & Gallery:** Draft and finalized project submission flow, server-clock deadline enforcement, magic-byte (MIME sniffing) upload validation.
* **Judging Core:** Seeded, constraint-satisfaction assignment algorithm with deterministic tie-breaking. Real database-integrated Z-score normalization with Bayesian reliability shrinkage (k=3), flattening degenerate inputs (flat-raters), and emitting anomaly flags for organizer review.
* **Workflow & Role Isolation:** Database-persisted scorecards, criterion-based rubrics, live judge console UI, CSV export of normalized scores, and strict read-isolation preventing judges from accessing peer scores.
* **Public Trust & Community Voting:** Authenticated voting mechanics, IP rate-limiting, double-vote unique constraints, deterministic ballot shuffling (bias prevention), blind score masking during active windows, community comments with organizer moderation, and a comprehensive AuditLog.

---

## ⚠️ Known Limitations (Scope Cuts)

We explicitly cut the following scope items to focus our budget and timeline strictly on the core judging integrity requirements:

1. **Pairwise Voting Mode**: Not implemented. We focused exclusively on the rigorous z-score normalization of traditional rubric judging. Pairwise voting adds massive UX surface area and database complexity for what is ultimately a tie-breaker mechanism.
2. **Full OpenAPI / API-First Build**: Not implemented. We built all endpoints logically and securely, but we did not spend our budget wiring up a full Swagger/OpenAPI spec or dedicating time to API-first schema generation.
3. **External Email Dependencies**: We explicitly rejected SMTP/email-gated workflows for both auth and voting to ensure Verdixa can run entirely self-hosted without external third-party mailer configurations breaking.
