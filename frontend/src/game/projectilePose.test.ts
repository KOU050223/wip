import { describe, expect, it } from "vitest";
import { Vector3 } from "three";

import { applyProjectileWorldPosition } from "./projectilePose";

describe("applyProjectileWorldPosition", () => {
  it("uses the identical world position for the visible mesh and Rapier sensor", () => {
    const meshPosition = new Vector3();
    const physicsPositions: Vector3[] = [];
    const worldPosition = new Vector3(0.4, 1.2, -3);

    applyProjectileWorldPosition(meshPosition, worldPosition, (position) => {
      physicsPositions.push(position.clone());
    });

    expect(meshPosition).toEqual(worldPosition);
    expect(physicsPositions).toEqual([worldPosition]);
  });
});
