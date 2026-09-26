# DOGFOOD 2026 | VERDIXA — Revised Master Blueprint
*Audit and redesign pass, prepared 13 September 2026. Supersedes the original VERDIXA Full Build Blueprint where noted; sections not mentioned here stand as originally written.*

---

## 1. Final product vision

VERDIXA is an integrity-first, self-hostable hackathon operating system. Unchanged from the original: this is the correct identity. It is not "another submission CRUD app" — it is trustworthy evaluation infrastructure that happens to also handle registration and galleries. Every design decision below is subordinate to that identity.

## 2. Final competitive positioning

No redesign needed. The organizer's own brief foregrounds "fair judging, role isolation, score normalization, abuse prevention" as *the* interesting engineering problem, and 65% of the score (40% tier + 25% judging integrity) lives directly in that territory. Chasing a different identity (pure DX polish, or an analytics-heavy pitch) would be optimizing for the 15% code-quality/innovation category at the expense of the two categories worth four times as much. Keep the Judging Integrity Engine as the hero feature and let everything else serve it.

## 3. Final feature set

| Category | Items | Change from original |
|---|---|---|
| Must-have | T1 complete; T2 assignment, rubrics, role isolation, normalization, CSV export | Unchanged |
| High-value | T3 voting/comments/audit; API-first T4; Normalization Proof bonus | Unchanged |
| Differentiators | Explainable rank-movement UI, anomaly flags, live "attack the API" demo beat | Unchanged |
| Stretch | Certificates, signed judge records, webhooks, embeddable widget | Unchanged, in that order |
| Downgraded | Pairwise/Bradley-Terry mode | Stays last-priority bonus, feature-flagged — unchanged from original, reaffirmed after audit |
| **Removed** | MinIO / S3-compatible object storage | New — see §7 |
| **Removed** | OAuth/social login, magic-link email in the auth layer | New — see §8 |

## 4. Final tier strategy

Unchanged: T1 complete, T2 exceptional, T3 strong, T4 API-first, bonus = Normalization Proof + API First + Threat Model, with Pairwise attempted only if the other three are done and there are still hours on the clock. The one addition: **the judging-engine pure-function core (assignment + normalization) starts at hour 0**, not after T1, because it has no dependency on anything else in the system (see §20).

## 5. Final architecture

Unchanged topology: Next.js App Router as a single deployable app (Server Components, Route Handlers under `/api/v1/*`, Server Actions behind policy checks, a domain/service layer, Postgres, local uploads volume). The original's architectural principles (domain-first, backend-enforced security, deterministic state transitions, audit-by-design, offline-by-default, one-command operation, explainability) all stand and are good.

**One structural change:** repository layout ownership is now explicit and slice-based, not layer-based (see §14).

**One addition:** every Route Handler that touches personalized or authorization-sensitive data must be explicitly `force-dynamic`. Next.js 16's Cache Components model (`"use cache"`) is powerful but dangerous here — a cached judge dashboard or leaderboard response would be a real, hard-to-notice correctness bug, not just a performance quirk. Rule: **no `"use cache"` directive anywhere in an authenticated or role-scoped path, ever.** Reserve it only for genuinely static public content (e.g., the marketing/about page, if one exists).

## 6. Final technology stack

| Layer | Original | Revised | Reasoning |
|---|---|---|---|
| Frontend + BFF | Next.js 16 | **Unchanged** | Confirmed current, stable, good Docker story. |
| UI | Tailwind + shadcn-style | **Unchanged** | Fine as-is. |
| Database | PostgreSQL | **Unchanged** | Correct call, and correct reasoning (relational integrity for assignment/scoring/normalization/audit transactions). |
| ORM | Prisma | **Unchanged, with a new checklist item** | Verify at build time that the query engine binary is vendored into the image; never let it attempt a network fetch at container start. |
| Auth | Better Auth | **Downgraded to optional, hand-rolled preferred** | See §8 for full reasoning. |
| Rate limiting | Redis optional, DB fallback | **Unchanged, but now testing-gated** | The fallback path must be part of the actual CI matrix, run with Redis absent, not just designed on paper. |
| Object/file storage | Local volume default, MinIO optional | **MinIO removed entirely** | See §7. |
| Validation | Zod | **Unchanged** | Cheap, standard, keep. |
| Testing | Vitest + Playwright | **Unchanged** | Correct choice. |
| Container | Docker Compose | **Unchanged** | Required by the brief anyway. |

## 7. Why MinIO is cut

The original blueprint listed MinIO as "optional... when you need S3-compatible project media storage or want to prove portable object-storage architecture." Audit finding: **there is no real requirement driving this.** Submissions in a hackathon judging platform are overwhelmingly links (repo URL, demo URL, video URL) plus at most a couple of small images. Adding an S3-compatible service:

- adds a container that can fail independently of the "does the portal work" acceptance test,
- adds a second storage abstraction to secure and test (the original's own threat model lists "malicious media / executable upload" as a threat — more storage surface is more attack surface, not less),
- buys nothing that the acceptance suite or judges are actually likely to check for.

**Revised design:** uploads (screenshots only) go to a single local volume, validated by extension + MIME sniffing + size cap, stored under randomized non-executable filenames, served through a route that sets `Content-Disposition: attachment` or a locked-down image content-type — never served as an executable path. If Hackathon Raptors later wants S3-compatible storage for multi-instance scaling, that's a fork-time enhancement, not a hackathon-weekend one. This is exactly the "premature scalability engineering" the brief told you to reject.

## 8. Final authentication/authorization design

**This is the most consequential change in this revision.**

The original recommends Better Auth, correctly noting it's self-hosted and avoids external providers. That's true of the *library* — but Better Auth ships a plugin architecture that includes OAuth social providers, magic-link email, and other networked flows. None of those are things you'll use, but "we didn't configure them" is a weaker claim under a security audit than "they don't exist in our dependency tree at all." For a project whose entire pitch is *auditable, explainable, defensible*, the auth layer should meet the same bar as the judging engine.

**Recommendation:** Build authentication by hand. The actual surface needed is small:

- `User` table with `passwordHash` (argon2id), `role` (server-owned enum).
- Opaque session tokens in signed, HttpOnly, SameSite=Lax cookies, stored server-side with an expiry, revocable on logout.
- A single `requireRole(session, [...roles])` policy helper used at the top of every sensitive Route Handler and Server Action — never inferred from the UI.
- Login throttling implemented the same way as vote rate-limiting (shared mechanism, less code).

This is maybe a day-one afternoon of work for one agent, it's fully auditable line-by-line by your own Security Red Team agent, and it removes an entire dependency's worth of "did it try to phone home" uncertainty from your offline-network acceptance test.

*If you'd rather not build this from scratch under time pressure*, the fallback is: keep Better Auth, but explicitly disable every plugin except email/password credentials + session + a minimal roles plugin, and add a CI check that greps the built output / runtime network log for any outbound connection attempt during the full auth lifecycle test. Either path is acceptable; silently trusting the library's defaults is not.

Everything else in the original's authorization model — the capability table, the `canX(user, resource)` policy functions, backend-enforced checks over UI hiding, the security test-case list — is well-designed and unchanged.

## 9. Final API architecture

Unchanged in shape (`/api/v1/*`, resource-oriented, OpenAPI for T4). One addition: **DTOs are allow-list, not deny-list.** Every serializer starts from an empty object and explicitly adds fields appropriate to the caller's role, rather than starting from the Prisma model and stripping sensitive fields. This matters most for the embeddable gallery widget (T4), which is likely to be the one endpoint an unauthenticated caller can hit — an allow-list default means a future field added to the `Project` model can never leak there by accident.

## 10. Final judging engine

Unchanged core design — this was the strongest part of the original blueprint and survives the audit almost intact:

- Deterministic, seeded, constraint-satisfaction-then-local-swap assignment algorithm.
- Versioned rubrics, scorecards pinned to the rubric version used at judging time.
- Judge-relative z-score normalization with a flat-rater fallback and reliability-weighted shrinkage for small samples.
- Anomaly flags (flat-rater, extreme-rater, completion gaps, duplicate assignment, coverage gaps, late edits, suspiciously identical patterns, post-hoc conflicts) surfaced to the organizer, never auto-corrected.

**Two additions, both edge-case hardening the original didn't fully specify:**

1. **Deterministic tie-breaking.** Every place the algorithm sorts (workload balancing, final rankings, local-swap candidate selection) needs an explicit secondary sort key (e.g., submission ID) so two runs on identical input always produce identical output. Without this, "deterministic, reproducible" is only true most of the time, which is worse than not claiming it.
2. **Degenerate-input fallback.** If an event has only one judge, or a judge scores every submission identically (`sd = 0`), the normalization function must not throw — it should short-circuit to "insufficient data for normalization; showing raw scores" with a visible banner, rather than crash or silently divide by zero. Write this as the *first* unit test, before the happy path.

## 11. Final normalization strategy

The pipeline stands as originally specified (per-judge z-score → `reliability = n/(n+k)` shrinkage toward pooled z → rescale). Make `k` a named, documented constant (default `k = 3`) rather than a magic number, and unit-test it against: `n=0`, `n=1`, `sd=0` for one judge in a multi-judge panel, all-judges-identical, and a single dominant outlier. **Outlier handling stays a flag, never a silent correction** — state this explicitly in JUDGING.md, because it's a defensible design choice ("we surface anomalies for human judgment rather than have an algorithm quietly override a human judge's opinion") that also happens to be less code.

## 12. Final voting/anti-abuse strategy

Unchanged: rate limiting, duplicate-vote heuristics (account + IP/device fingerprint), hidden results during active voting, randomized ordering, audit trail. No changes justified by the audit — this section of the original was already appropriately scoped (not over-built, not under-built).

## 13. Final UI/UX structure

Unchanged screen map, judge console layout (persistent rubric sidebar, keyboard shortcuts), and organizer dashboard. One addition worth the small effort: an "undo last score" affordance in the judge console — cheap to build, meaningfully reduces judge anxiety about fast keyboard-driven scoring, and is the kind of small UX detail that differentiates "serious operations software" from "a form."

## 14. Final Antigravity agent architecture

**This is the second major change.**

The original splits agents by *technical layer*: Backend agent, Frontend agent, Judging agent, Security agent, QA agent, DevOps agent, Docs agent — eight roles total. The problem: most real features (e.g., "judge scoring") touch backend *and* frontend *and* the judging domain simultaneously, so a layer-split guarantees that three agents are working in overlapping territory on the same feature at the same time — precisely the "agents overwriting each other" and "inconsistent architectural decisions" failure modes the original's own risk section warns against.

**Revised structure: vertical slices, not horizontal layers.**

| Slice owner | Owns end-to-end (schema → API → UI → tests → docs) | Directories |
|---|---|---|
| Slice A — Identity & Teams | Auth, sessions, roles, event config, team formation/invites | `domain/events`, `domain/teams`, `lib/auth`, `app/(auth)`, `app/dashboard` |
| Slice B — Submissions & Gallery | Submission draft/edit/lock, public gallery, media upload | `domain/submissions`, `app/gallery`, `app/dashboard/project` |
| Slice C — Judging Engine (highest priority, starts hour 0) | Assignment, rubrics, scorecards, normalization, anomaly detection | `domain/judging`, `app/judge`, `app/organizer/assignments`, `app/organizer/normalization` |
| Slice D — Public Trust Layer | Voting, comments, audit log surfacing | `domain/voting`, `app/gallery` (voting UI), `app/organizer/audit` |

**Cross-cutting reviewer roles** (not builders, not tied to a directory): **Security Red Team** (attacks every slice as it lands), **QA/Acceptance** (turns the official spec into a living pass/fail matrix and writes Playwright flows against whatever exists), **Chief Architect** (you, plus your strongest-reasoning model, owns the Prisma schema and any cross-slice contract — no slice agent may change a shared schema field without an ADR entry).

Each slice agent writes its own section of ARCHITECTURE.md/DATA-MODEL.md/JUDGING.md as part of that slice's definition of done, rather than a single Docs agent trying to reconstruct everything from four codebases in the last two hours — this directly de-risks the original's own "polish/docs consumes hours" risk item.

## 15. Final testing strategy

Unchanged (unit/integration/API/E2E/security/operational layers). One addition: **run the full test matrix twice in the final hours — once with Redis present, once without** — so "Redis is optional" is a tested fact, not an architectural assumption nobody verified under time pressure.

## 16. Final Docker/offline architecture

Unchanged contract (`docker compose up` → migrate → seed if empty → healthcheck → usable, no network). Additions to the checklist:

- Verify Prisma's query engine binaries are baked into the built image at `docker build` time; the *build* is allowed network access (pulling base images, `npm install`), the *running container* is not. Confirm no lazy binary download happens on first request.
- Postgres readiness: use `depends_on: condition: service_healthy` with a real healthcheck, not a fixed sleep — this is a common, entirely avoidable source of "works on my machine, fails on a clean clone" bugs.
- Seed script must be idempotent (safe to run against an already-seeded database) so restart behavior is predictable.

## 17. Final security model

Unchanged capability table, policy functions, and security test-case list — these were already well-designed. The one net-new item is the auth-layer change in §8, which is really a security decision as much as an architecture one: fewer third-party runtime dependencies in the identity layer means fewer unknowns for the Security Red Team agent to have to trust rather than verify.

## 18. Final documentation strategy

Unchanged file list (README, ARCHITECTURE, DATA-MODEL, JUDGING, THREAT-MODEL, acceptance-report, LICENSE). Process change per §14: documentation is written incrementally by whichever slice agent owns that subsystem, not batched at the end.

## 19. Final pre-kickoff preparation

Unchanged calendar (13–24 Sept prep schedule from the original). Two additions:

- Finalize the auth decision (hand-rolled vs. stripped-down Better Auth) *before* kickoff — don't debate this mid-event.
- Draft the judging engine's pure functions (assignment scorer, normalization math) as pseudocode/TypeScript-shaped notes now, so Slice C can start writing real, unit-tested code in the first hour rather than the first design conversation happening live.

## 20. Final 72-hour execution plan

The original's hour blocks are reasonable and the math checks out (18:00 UTC = 23:30 IST, 72 hours ends 28 Sept 23:30 IST). One structural change:

**Hour 0 parallel start, not sequential:**
- Slice A begins bootstrap + auth + event/team scaffolding (as originally planned for the first block).
- **Slice C begins immediately, in parallel, on the judging engine's pure functions** — assignment algorithm and normalization math, fully unit-tested against synthetic data, with zero dependency on the database or UI existing yet. This is your highest-weighted, hardest-to-get-right subsystem; giving it the full 72 hours instead of ~48 is the single highest-leverage schedule change in this revision.
- Slice C's *integration* work (wiring the engine to real submissions/judges/UI) still waits for Slice A/B primitives to exist, as originally sequenced — only the algorithmic core moves earlier.

Everything after that (T1 hardening → T2 integration → T3 → T4/bonus → polish → freeze) proceeds as the original laid out, with the freeze discipline unchanged: once T2 is stable, every new feature must justify itself against the score rubric.

## 21. Final demo strategy

Unchanged five-minute script. It was already well-constructed: it shows a configurable rubric (not hardcoded), a real submission workflow, conflict-aware assignment, low-friction judging, a **live unauthorized API request demonstrating backend-enforced isolation** (this beat is the single best differentiator in the whole demo — keep it exactly as designed), a normalization run with visible rank movement, and a from-scratch `docker compose up`. No changes justified.

## 22. Final risks and mitigations

Original risk register stands. Additions:

| Risk | Severity | Mitigation |
|---|---|---|
| Third-party auth library makes an unexpected network call during the offline acceptance test | High | Resolved by §8 — hand-rolled auth or a stripped, audited Better Auth config |
| Vertical-slice agents still collide on the shared Prisma schema | Medium | Chief Architect is the sole owner of schema changes; slice agents propose, don't commit, schema edits |
| Judging engine gets deprioritized behind T1 under time pressure, despite being the highest-weighted subsystem | High | Resolved by §20 — Slice C starts at hour 0, not after T1 |
| "Optional" Redis path is never actually exercised without Redis | Medium | Resolved by §15 — dual test-matrix run |

## 23. What was removed and why

- **MinIO/object storage abstraction** — no real requirement drives it; it adds a failure-prone service and attack surface for a benefit (S3-compatibility) nobody is asking for this weekend. See §7.
- **OAuth/social login and magic-link email as default auth surface** — networked-by-design features in an offline-only product are a liability, not a convenience, here. See §8.
- **The 8-role, layer-based agent table as a literal execution plan** — replaced by 4 vertical slices plus 2–3 cross-cutting reviewers, because layer-splitting a feature guarantees overlapping-file conflicts, which was the original's own top-listed multi-agent risk.

## 24. What was added and why

- Deterministic tie-breaking and degenerate-input (n=1, sd=0) handling in the judging engine — the original's math was right but under-specified at the edges, and edge cases are exactly what an acceptance suite probes.
- Allow-list DTO philosophy — cheap to state, prevents an entire bug class (accidental field leakage) especially on the one endpoint a stranger can hit unauthenticated.
- Explicit Prisma binary-vendoring and Postgres healthcheck items in the Docker checklist — both are common, boring, entirely avoidable causes of "works on my machine" failures.
- Dual-mode (Redis present/absent) test run — turns "optional" from an architecture diagram claim into a verified fact.

## 25. What architectural decisions changed and why

Two changes, both driven by the same underlying principle — **the identity of this product is "explainable and defensible," and that standard should apply to every subsystem, not just the judging engine:**

1. **Auth moved from a third-party library's default trust to a smaller, fully-owned, fully-auditable surface.** A system whose entire pitch is trustworthy evaluation shouldn't have a black box sitting in front of its role system.
2. **Agent parallelization moved from layer-based to vertical-slice-based**, and the judging engine's algorithmic core moved from "after T1" to "hour 0, in parallel with T1." Both changes exist to protect the 65% of the score (tier correctness + judging integrity) that depends most heavily on the judging engine actually being solid, well-tested, and built without the merge-conflict churn that a layer-split invites.

---

## Final recommendation

> **This is the architecture and strategy I would build for VERDIXA: Next.js 16 + TypeScript + PostgreSQL + Prisma, hand-rolled (or stripped-and-audited) local authentication, no object-storage service, four vertical-slice AI agents plus Security/QA reviewers instead of a layer-split team, and the judging engine's assignment and normalization core built and unit-tested starting at hour zero in parallel with T1 — because the two things this competition actually rewards, tier correctness and judging integrity, both live inside that engine, and every other decision in this plan exists to protect the time and clarity needed to get it right.**
