import { describe, expect, it } from "vitest";
import { Vector3 } from "three";

import { getProjectileWorldPosition } from "./projectileMotion";

describe("getProjectileWorldPosition", () => {
  it("returns one world-space position for the kinematic rigid body", () => {
    expect(
      getProjectileWorldPosition({
        spawnPosition: new Vector3(0, 0, -6),
        targetPosition: new Vector3(0, 1, 2),
        curveAxis: new Vector3(1, 0, 0),
        elapsedMs: 500,
        travelMs: 1000,
      }).toArray(),
    ).toEqual([1, 0.5, -2]);
  });
});
