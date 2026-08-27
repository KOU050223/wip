import { describe, expect, it } from "vitest";

import { calculateDamage } from "./attackDetection";

describe("calculateDamage", () => {
  it("returns the configured base damage", () => {
    expect(calculateDamage(2, 10)).toBe(10);
  });
});
