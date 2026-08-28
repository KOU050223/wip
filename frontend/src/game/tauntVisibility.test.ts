import { describe, expect, it } from "vitest";

import {
  pendingTauntForEnemy,
  shouldDisplayTaunt,
  shouldRequestTauntForEnemy,
  tauntForEnemy,
} from "./tauntVisibility";

describe("shouldDisplayTaunt", () => {
  it("rejects a late taunt generated for an enemy that has already been defeated", () => {
    expect(shouldDisplayTaunt("enemy-2", "enemy-1")).toBe(false);
  });

  it("accepts a taunt generated for the current enemy", () => {
    expect(shouldDisplayTaunt("enemy-2", "enemy-2")).toBe(true);
  });

  it("requests one temptation when a new enemy appears", () => {
    expect(shouldRequestTauntForEnemy("enemy-1", "enemy-2")).toBe(true);
  });

  it("does not request another temptation while the same enemy remains", () => {
    expect(shouldRequestTauntForEnemy("enemy-1", "enemy-1")).toBe(false);
  });

  it("hides the previous enemy's temptation while the next one is loading", () => {
    expect(tauntForEnemy({ enemyId: "enemy-1", phrase: "ちょっと休んでいきな？" }, "enemy-2")).toBe(
      "",
    );
  });

  it("shows an immediate temptation while AI generation is pending", () => {
    expect(pendingTauntForEnemy("enemy-2")).toEqual({
      enemyId: "enemy-2",
      phrase: "ふふっ、少しだけ、ここにいてよ？",
    });
  });
});
