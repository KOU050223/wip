import { describe, expect, it, vi } from "vitest";

import { requestTaunt } from "./tauntClient";

describe("requestTaunt", () => {
  it("sends the hit context to the AI endpoint and returns its phrase", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ phrase: "その程度か。" }), { status: 200 }));

    await expect(
      requestTaunt(
        { trigger: "enemyAppeared", playerHpPercent: 40, isBoss: false },
        fetchImplementation,
      ),
    ).resolves.toBe("その程度か。");

    expect(fetchImplementation).toHaveBeenCalledWith(
      `${import.meta.env.VITE_API_BASE_URL ?? ""}/ai/taunt`,
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trigger: "enemyAppeared", playerHpPercent: 40, isBoss: false }),
      }),
    );
  });

  it("uses a fixed phrase when AI generation is unavailable", async () => {
    const fetchImplementation = vi.fn().mockRejectedValue(new Error("offline"));

    await expect(
      requestTaunt(
        { trigger: "enemyAppeared", playerHpPercent: 80, isBoss: true },
        fetchImplementation,
      ),
    ).resolves.toBe("がんばりすぎだよぉ。少しだけ、ここで休んでいきな？");
  });

  it("removes outer Japanese quotes because the HUD owns the quotation marks", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ phrase: "「まだ立てるだろう。」" }), { status: 200 }),
      );

    await expect(
      requestTaunt(
        { trigger: "enemyAppeared", playerHpPercent: 50, isBoss: false },
        fetchImplementation,
      ),
    ).resolves.toBe("まだ立てるだろう。");
  });
});
