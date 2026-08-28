import { describe, expect, it } from "vitest";

import { desktopDebugCamera } from "./vrDebugCamera";

describe("desktopDebugCamera", () => {
  it("looks upward at the front of the enemy from a lower position", () => {
    expect(desktopDebugCamera.position).toEqual([0, 0.35, 2]);
    expect(desktopDebugCamera.target).toEqual([0, 0.9, -2.5]);
  });
});
