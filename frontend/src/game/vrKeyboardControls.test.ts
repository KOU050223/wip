import { describe, expect, it } from "vitest";

import { directionForKeyboardCode, guardColorForKeyboardCode } from "./vrKeyboardControls";

describe("desktop VR keyboard controls", () => {
  it("maps arrow keys and WASD to sword directions", () => {
    expect(directionForKeyboardCode("ArrowUp")).toBe("up");
    expect(directionForKeyboardCode("KeyA")).toBe("left");
    expect(directionForKeyboardCode("KeyS")).toBe("down");
    expect(directionForKeyboardCode("KeyD")).toBe("right");
  });

  it("maps F and G to the red and blue guard controls", () => {
    expect(guardColorForKeyboardCode("KeyF")).toBe("red");
    expect(guardColorForKeyboardCode("KeyG")).toBe("blue");
    expect(guardColorForKeyboardCode("Space")).toBeNull();
  });
});
