import { describe, expect, it } from "vitest";

import { addScore, calculateHitScore } from "./score";

describe("score", () => {
  it("increases the hit score by 10 percent for each combo after the first", () => {
    expect(calculateHitScore(1)).toBe(100);
    expect(calculateHitScore(3)).toBe(120);
  });

  it("adds the calculated hit score to the current score", () => {
    expect(addScore(500, 2)).toBe(610);
  });
});
