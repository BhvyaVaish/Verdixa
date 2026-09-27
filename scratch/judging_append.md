
## Normalization Proof (Phase 4 Run)

Using the actual database seeded from `fixtures.json`, a real Normalization Run produces concrete changes to the final leaderboard.

### The `jdg_07` Flat-Rater Case
Judge `user_jdg_07` is seeded as a mathematical flat-rater, submitting exactly 4/4/4 across all criteria for all their 21 assigned projects. Because their standard deviation is exactly 0, their raw scores provide zero pairwise differentiation.

When normalization is triggered, the engine correctly handles the degenerate input without crashing:
1. **Flagging**: The engine emits an anomaly flag surfaced in the Organizer Dashboard:
   ```json
   {
     "code": "FLAT_RATER",
     "judgeId": "user_jdg_07",
     "message": "Judge user_jdg_07 scored all submissions identically (sd = 0). Their scores carry no ranking information — flagged for human review."
   }
   ```
2. **Fallback & Shrinkage**: Their z-score is mathematically forced to 0 (the mean). The Bayesian reliability shrinkage (k=3) applies normally. 
3. **Ranking Influence**: Because all their normalized scores become exactly 50.00 on the [0, 100] scale, `jdg_07` has **zero effective influence** on the relative ranking of their assigned projects. The final rank of those projects is entirely dictated by the other judges on the panel, neutralizing the flat-rater lazy voting pattern without deleting their data.
