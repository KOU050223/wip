import { describe, expect, it, vi } from "vitest";

import { requestTaunt } from "./tauntClient";

describe("requestTaunt", () => {
  it("sends the enemy's view of the player to the AI endpoint and returns its phrase", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ phrase: "その程度か。" }), { status: 200 }));

    await expect(
      requestTaunt(
        {
          trigger: "enemyAppeared",
          playerHpPercent: 40,
          isBoss: false,
          opponentView: "data:image/png;base64,enemy-eye",
        },
        fetchImplementation,
      ),
    ).resolves.toBe("その程度か。");

    expect(fetchImplementation).toHaveBeenCalledWith(
      "/ai/taunt",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          trigger: "enemyAppeared",
          playerHpPercent: 40,
          isBoss: false,
          opponentView: "data:image/png;base64,enemy-eye",
        }),
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

  it("logs every phrase that will be displayed to the browser console", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchImplementation = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ phrase: "鎧が眩しいね。" }), { status: 200 }));

    await requestTaunt(
      { trigger: "enemyAppeared", playerHpPercent: 50, isBoss: false },
      fetchImplementation,
    );

    expect(log).toHaveBeenCalledWith("[enemy taunt]", "鎧が眩しいね。");
    log.mockRestore();
  });
});
