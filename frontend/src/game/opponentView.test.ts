import { describe, expect, it } from "vitest";

import { opponentEyePosition, STORMTROOPER_MODEL_PATH } from "./opponentView";

describe("opponentEyePosition", () => {
  it("places the observation camera at the enemy's eye height", () => {
    expect(opponentEyePosition([2, 0, -3])).toEqual([2, 1.45, -3]);
  });

  it("uses the bundled stormtrooper model for the enemy's player view", () => {
    expect(STORMTROOPER_MODEL_PATH).toBe("/models/first-order-stormtrooper.glb");
  });
});
