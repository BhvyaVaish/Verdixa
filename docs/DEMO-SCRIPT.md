# VERDIXA — Demo Script (5 minutes)

> **For the presenter:** Follow each beat in order. Every command and click-path is exact — do not improvise. Total target runtime: 5:00.

---

## [0:00–0:30] Cold Start (30 seconds)

**Narration:** "This is Verdixa — a self-hostable, integrity-first hackathon judging system. We'll demo it starting from a completely fresh Docker environment."

**Command — run in terminal:**
```bash
docker compose down -v
docker compose up --build
```

> Wait until you see: `✓ Ready in Xs` in the Next.js container log.

**URL:** Open `http://localhost:3000/gallery` — you should see the public project gallery with no login.

---

## [0:30–1:15] Organizer Creates Event & Rubric (45 seconds)

**Login as Organizer:**
- Navigate to `http://localhost:3000`
- Email: `organizer@verdixa.dev` — Password: `organizer2026`
- Navigate to `http://localhost:3000/organizer/dashboard`

**Narration:** "The organizer sees the full event dashboard — judge progress bars, project coverage, and a Run Normalization button."

**Click-path:**
1. Point to the Judge Progress section — 30 judges, all at 100% completion.
2. Point to the Flags section — show the `FLAT_RATER` badge next to `judge.07`.

---

## [1:15–2:00] Participant Submits a Project (45 seconds)

**Open new incognito / private window.**
- Navigate to `http://localhost:3000`
- Email: `participant@dogfood2026.dev` — Password: `participant2026`
- Navigate to `http://localhost:3000/gallery`

**Narration:** "Any registered participant can see the public gallery immediately."

**Show:** Scroll through the gallery listing. Find **WaveSync** — point to the title and track badge.

**Narration:** "The gallery is fully public. No auth is required to browse, consistent with the T1 spec."

**Try post-deadline submit — in terminal:**
```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/v1/projects \
  -H "Cookie: verdixa_session=<participant_cookie>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Late Entry","eventId":"evt_01"}'
```
> Expected: `400` — "Submission deadline has passed."

---

## [2:00–2:45] Judge Scores a Project (45 seconds)

**Open new incognito window.**
- Email: `judge.01@dogfood2026.dev` — Password: `judge2026`
- Navigate to `http://localhost:3000/api/v1/judges/me/assignments`

**Narration:** "Judge A can see exactly their assigned projects and score them through the API."

**Show score retrieval in terminal:**
```bash
curl -s http://localhost:3000/api/v1/scores/me \
  -H "Cookie: verdixa_session=<judge_a_cookie>"
```
> Expected: HTTP 200 + JSON array of submitted scorecards.

---

## [2:45–3:15] Live Role Isolation Demo (30 seconds — highest-stakes beat)

**Narration:** "This is the critical backend integrity check. Judge B cannot read Judge A's scores — this is enforced at the server, not just hidden in the UI."

**In terminal — as Judge B (jdg_07) reading Judge A (jdg_01) scores:**
```bash
curl -s -o /dev/null -w "%{http_code}" \
  http://localhost:3000/api/v1/scores/judge/user_jdg_01 \
  -H "Cookie: verdixa_session=sess_jdg_07.01294e6306d6b7d2d121bdede55c207aab5924fb37d04921fa9bceba0b5e9b2c"
```
> Show the terminal output: **`403`** — Forbidden.

**Narration:** "403. Not 404, not a UI redirect — a hard HTTP 403 at the API layer. Role isolation is enforced server-side."

---

## [3:15–4:00] Normalization Run + Audit Log (45 seconds)

**Switch back to Organizer window.**
- Navigate to `http://localhost:3000/organizer/dashboard`

**Narration:** "The organizer can trigger a normalization run at any time. It pulls all submitted scorecards, computes per-judge z-scores with Bayesian shrinkage (k=3), and persists a reproducible NormalizationRun record."

**Click:** "Run Normalization" button.

**Show:** The before/after rank table appears. Point to:
- A project that moved up in rank (positive `rankMovement`)
- The **`FLAT_RATER`** flag for `judge.07` — "their identical 4/4/4 scores gave them zero influence on the final ranking"

**Narration:** "Every action here writes to the audit log."

**In terminal:**
```bash
curl -s "http://localhost:3000/api/v1/organizer/audit?limit=5" \
  -H "Cookie: verdixa_session=<organizer_cookie>"
```
> Show the JSON log entries: `NORMALIZATION_RUN_COMPLETED`, `VOTING_WINDOW_CREATED`, etc.

---

## [4:00–5:00] Clean Docker Boot Proof (60 seconds)

**Narration:** "Finally — the proof it works from a cold state, not just our warm dev machine."

**In terminal:**
```bash
git clone https://github.com/BhvyaVaish/Verdixa.git verdixa-clean
cd verdixa-clean
cp .env.example .env   # or set DATABASE_URL / SESSION_SECRET
docker compose up --build
```

> Wait for `✓ Ready` — then immediately:
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/gallery
```
> **`200`** — clean boot, gallery live, no warm state.

**Narration:** "T1 and T2 verified. Self-hosted. No external email, no OAuth, no third-party auth. The entire judging engine runs inside one `docker compose up`."

---

## Timestamps Summary

| Beat | Time | Duration |
|---|---|---|
| Cold Docker start | 0:00 | 30s |
| Organizer dashboard | 0:30 | 45s |
| Participant gallery + deadline check | 1:15 | 45s |
| Judge scores via API | 2:00 | 45s |
| **Role isolation 403 demo** | 2:45 | 30s |
| Normalization + audit log | 3:15 | 45s |
| Clean `docker compose up` proof | 4:00 | 60s |
