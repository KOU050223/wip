import { describe, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";

import { KINEMATIC_SENSOR_COLLISION_TYPES } from "./rapierCollision";

describe("KINEMATIC_SENSOR_COLLISION_TYPES", () => {
  it("enables sensor intersections between two kinematic VR colliders", async () => {
    await RAPIER.init();

    expect(KINEMATIC_SENSOR_COLLISION_TYPES & RAPIER.ActiveCollisionTypes.KINEMATIC_KINEMATIC).toBe(
      RAPIER.ActiveCollisionTypes.KINEMATIC_KINEMATIC,
    );
  });
});
