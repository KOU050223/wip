import { describe, expect, it } from "vitest";
import { Vector3 } from "three";

import { classifyVRSwingDirection } from "./vrSwingDirection";

describe("classifyVRSwingDirection", () => {
  it("returns the dominant horizontal direction for a sufficiently long blade movement", () => {
    expect(classifyVRSwingDirection([new Vector3(0, 1, 0), new Vector3(0.3, 1.1, 0)])).toBe(
      "right",
    );
  });

  it("rejects controller jitter as an attack", () => {
    expect(classifyVRSwingDirection([new Vector3(0, 1, 0), new Vector3(0.05, 1.02, 0)])).toBeNull();
  });
});
