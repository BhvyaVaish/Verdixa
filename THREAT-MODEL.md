# Verdixa Threat Model

This document outlines the threat model for the Verdixa judging and voting platform, focusing on the specific risks associated with hackathons and community voting, and the **actual controls** implemented in the system (Phases 1-5).

## 1. Sybil Voting & Ballot Stuffing
**Threat**: A user creates multiple accounts or uses bots to repeatedly vote for their own project in the community voting phase, unfairly skewing the Community Choice award.
- **Primary Control**: **Authenticated Voting**. Link-based and email-gated voting were rejected. Voting requires a fully authenticated session (`Cookie: verdixa_session=...`), anchoring every vote to a unique registered `User` identity. The database enforces a `UNIQUE(votingWindowId, voterId, projectId)` constraint to absolutely prevent double-voting by the same account.
- **Secondary Control**: **IP Rate-Limiting**. The `VoteRateLimit` table tracks voting attempts by hashed IP address (`ipHash`), preventing botnets from spamming the `/api/v1/voting` endpoint even if they rotate accounts.

## 2. Judge Collusion & Position Bias
**Threat**: Judges coordinate to score certain projects higher, or judges simply vote for the first project they see on the ballot due to fatigue (Position Bias).
- **Primary Control (Collusion)**: **Role Isolation & Blind Scoring**. The system implements strict role isolation. A judge cannot query another judge's raw scores or assignments (`peer_scores` returns 403 Forbidden). Normalization (`k=3` shrinkage) further mathematically dilutes the impact of isolated outlier scores.
- **Primary Control (Bias)**: **Deterministic Shuffling**. The public voting ballot (`/api/v1/voting?eventId=...`) is randomized per voter using a seeded Linear Congruential Generator (`seed = voterId:windowId`). This ensures every voter sees projects in a completely different order, but the order is stable across page reloads for that specific voter to prevent confusion.
- **Secondary Control**: **Hidden Results**. During an active voting window, the `voteCount` for all projects is mathematically masked (`null`) for all non-organizer roles, preventing bandwagon voting.

## 3. Flat-Rater / Lazy Judging
**Threat**: A judge assigns the exact same score (e.g., 4/4/4) to every single project they review just to get through their workload, adding noise to the final ranking.
- **Primary Control**: **Normalization Z-Score Fallback**. As verified in the `jdg_07` test case, flat-raters have a standard deviation ($\sigma$) of exactly $0$. The normalization algorithm forces their z-score to $0$ (the mean), scaling their effective scores to a flat 50.00. This grants them **zero influence** over the relative ranking of their assigned projects.
- **Secondary Control**: **Anomaly Flagging**. The system detects $\sigma = 0$ and emits a `FLAT_RATER` flag directly to the Organizer Dashboard, prompting human review of that judge's workload.

## 4. Deadline Gaming & Late Submissions
**Threat**: Participants try to submit votes or projects after the deadline has officially passed.
- **Primary Control**: **Server-Side Timestamp Enforcement**. The `VotingWindow` model strictly checks the current server time against `opensAt` and `closesAt`. Voting outside this window returns a `403 voting_window_closed` at the API layer. Client-side timestamps are ignored.

## 5. Inappropriate Content & Comment Spam
**Threat**: Participants leave abusive or spammy comments on project pages.
- **Primary Control**: **Organizer Moderation**. Organizers have a dedicated moderation endpoint (`PATCH /api/v1/comments/[commentId]`) to hide inappropriate comments with a documented `hideReason`. Hidden comments are immediately omitted from the public `getProjectComments` fetch.
- **Secondary Control**: **Audit Trail**. Every comment created, hidden, or restored emits an immutable `AuditLog` event, ensuring transparency and accountability for both the commenter and the moderator.
