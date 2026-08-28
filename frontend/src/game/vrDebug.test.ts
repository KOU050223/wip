import { describe, expect, it } from "vitest";

import { isDesktopVRDebug } from "./vrDebug";

describe("isDesktopVRDebug", () => {
  it("enables the desktop VR preview only with debug=1", () => {
    expect(isDesktopVRDebug(new URLSearchParams("debug=1"))).toBe(true);
  });

  it("keeps the standard VR flow for other query parameters", () => {
    expect(isDesktopVRDebug(new URLSearchParams("debug=true"))).toBe(false);
  });
});
