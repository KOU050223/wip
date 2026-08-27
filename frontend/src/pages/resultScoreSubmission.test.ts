import { describe, expect, it } from "vitest";

import { createResultScoreSubmission } from "./resultScoreSubmission";

describe("ResultScoreSubmissionを作成する", () => {
  it("trims the player name and includes the result score", () => {
    expect(createResultScoreSubmission("  Luke  ", 12_340)).toEqual({
      player_name: "Luke",
      score: 12_340,
      max_combo: 0,
      clear_time: 0,
    });
  });
});
