import { describe, expect, it } from "vitest";

import { ENEMY_SPEECH_BUBBLE_FONT_SIZE, ENEMY_SPEECH_BUBBLE_OFFSET } from "./EnemySpeechBubble";

describe("enemy speech bubble layout", () => {
  it("places a large line of dialogue clearly above the enemy", () => {
    expect(ENEMY_SPEECH_BUBBLE_FONT_SIZE).toBeGreaterThanOrEqual(0.12);
    expect(ENEMY_SPEECH_BUBBLE_OFFSET[0]).toBeLessThan(0);
    expect(ENEMY_SPEECH_BUBBLE_OFFSET[1]).toBeGreaterThanOrEqual(2.5);
  });
});
