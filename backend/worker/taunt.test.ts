import { describe, expect, it } from "vitest";

import { buildMessages, createVisionTauntRequest, extractPhrase, gatewayOptions } from "./taunt";

describe("gatewayOptions", () => {
  it("sends taunt generation through the default gateway with logs", () => {
    expect(gatewayOptions()).toEqual({
      gateway: { id: "default", collectLog: true, metadata: { feature: "enemy-taunt" } },
    });
  });
});

describe("extractPhrase", () => {
  it("reads the generated message from a chat-completion response", () => {
    expect(extractPhrase({ choices: [{ message: { content: "こちらへ来い。苦しみは終わる。" } }] })).toBe(
      "こちらへ来い。苦しみは終わる。",
    );
  });
});

describe("buildMessages", () => {
  it("tells the model to avoid the player's recent phrases and use a different taunt style", () => {
    const messages = buildMessages(
      { trigger: "enemyAppeared", playerHpPercent: 40, isBoss: false, recentPhrases: ["そんなに震えてどうしたの？"] },
      "冷静な戦術分析",
    );
    expect(messages[1]?.content).toContain("冷静な戦術分析");
    expect(messages[1]?.content).toContain("そんなに震えてどうしたの？");
    expect(messages[1]?.content).toContain("言い換えも避ける");
  });

  it("frames the enemy as a playful adult devil rather than a sexualized character", () => {
    const messages = buildMessages(
      { trigger: "enemyAppeared", playerHpPercent: 40, isBoss: false },
      "遊びに誘う軽薄さ",
    );
    expect(messages[0]?.content).toContain("成人の小悪魔的な敵");
    expect(messages[0]?.content).toContain("性的な表現");
    expect(messages[0]?.content).toContain("♥は最大一つ");
  });

  it("has the enemy offer an appealing escape from reality instead of taunting the hit", () => {
    const messages = buildMessages(
      { trigger: "enemyAppeared", playerHpPercent: 40, isBoss: false },
      "眠りへ誘う休息の約束",
    );
    expect(messages[0]?.content).toContain("被弾や弱さを煽る台詞ではない");
    expect(messages[0]?.content).toContain("辛い現実を忘れたくなる");
    expect(messages[1]?.content).toContain("眠りへ誘う休息の約束");
  });
});

describe("createVisionTauntRequest", () => {
  it("asks the enemy to speak from its view of the player", () => {
    expect(
      createVisionTauntRequest({
        trigger: "enemyAppeared",
        playerHpPercent: 40,
        isBoss: false,
        opponentView: "data:image/jpeg;base64,enemy-eye",
      }),
    ).toMatchObject({
      image: "data:image/jpeg;base64,enemy-eye",
      max_tokens: 80,
      messages: expect.arrayContaining([
        expect.objectContaining({ content: expect.stringContaining("観測内容を台詞の主役にする") }),
      ]),
    });
  });
});
