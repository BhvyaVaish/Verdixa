import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { normalizeEvent } from "../../src/domain/judging/normalization/normalize";
import type { RawScore } from "../../src/domain/judging/normalization/types";

describe("Normalization - Flat Rater (Phase 3 T2)", () => {
  it("should handle the flat-rater from fixtures (jdg_07) without crashing and flag them", () => {
    // 1. Load fixtures
    const fixturePath = path.join(process.cwd(), "tools", "acceptance", "fixtures.json");
    const data = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));

    // 2. Extract scores for jdg_07 and another judge for baseline.
    // The normalization expects a single flat score per submission from a judge,
    // so we aggregate the functionality, quality, innovation into an average raw score
    // before passing to normalizeEvent, just like the real system will do.
    
    // We will pass ALL scores to the normalizer to ensure the pooled variance works.
    const judgeScoreMap = new Map<string, Map<string, number>>();
    
    for (const s of data.scores) {
      if (s.functionality !== undefined && s.quality !== undefined && s.innovation !== undefined) {
        const score = (s.functionality + s.quality + s.innovation) / 3;
        
        let judgeScores = judgeScoreMap.get(s.judge_id);
        if (!judgeScores) {
          judgeScores = new Map<string, number>();
          judgeScoreMap.set(s.judge_id, judgeScores);
        }
        judgeScores.set(s.project_id, score);
      }
    }
    
    // Ensure jdg_07 has scores in the input
    const jdg07Scores = judgeScoreMap.get("jdg_07");
    expect(jdg07Scores).toBeDefined();
    // Ensure they are truly flat
    expect(new Set(jdg07Scores!.values()).size).toBe(1); // Should only have one distinct value (4.0)

    // 3. Run normalization
    const result = normalizeEvent(judgeScoreMap);

    // 5. System shouldn't crash (we got a result)
    expect(result).toBeDefined();
    
    // 4. Assert FLAT_RATER flag fired
    let flatRaterFlagFound = false;
    for (const flag of result.flags) {
      if (flag.code === "FLAT_RATER" && flag.judgeId === "jdg_07") {
        flatRaterFlagFound = true;
        break;
      }
    }
    
    expect(flatRaterFlagFound).toBe(true);
  });
});
