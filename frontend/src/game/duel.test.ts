import { describe, expect, it } from "vitest";
import {
  applyDuelEvent,
  bladeHitsBody,
  bladeTipToward,
  createDuelState,
  opponentSaberPose,
  parseDuelEvent,
  poseSmoothingAlpha,
  type DuelEvent,
} from "./duel";

const opponentReady: DuelEvent = { type: "duel.ready", playerID: "opponent" };

describe("applyDuelEvent", () => {
  it("marks the opponent ready without treating the local player's echo as an opponent", () => {
    const state = createDuelState();

    expect(applyDuelEvent(state, { type: "duel.ready", playerID: "me" }, "me").opponentReady).toBe(
      false,
    );
    expect(applyDuelEvent(state, opponentReady, "me").opponentReady).toBe(true);
  });

  it("starts a duel at the synchronized start time", () => {
    const state = applyDuelEvent(createDuelState(), opponentReady, "me");

    expect(applyDuelEvent(state, { type: "duel.start", startsAt: 1_000 }, "me")).toMatchObject({
      phase: "active",
      startsAt: 1_000,
    });
  });

  it("applies an opponent strike only after the duel has started", () => {
    const active = applyDuelEvent(createDuelState(), { type: "duel.start", startsAt: 1_000 }, "me");

    expect(
      applyDuelEvent(active, { type: "duel.strike", playerID: "opponent", id: "hit-1" }, "me"),
    ).toMatchObject({ playerHP: 2, lastOpponentStrikeID: "hit-1" });
  });

  it("does not apply duplicate or local strike events", () => {
    const active = {
      ...applyDuelEvent(createDuelState(), { type: "duel.start", startsAt: 1_000 }, "me"),
      lastOpponentStrikeID: "hit-1",
    };

    expect(
      applyDuelEvent(active, { type: "duel.strike", playerID: "opponent", id: "hit-1" }, "me")
        .playerHP,
    ).toBe(3);
    expect(
      applyDuelEvent(active, { type: "duel.strike", playerID: "me", id: "hit-2" }, "me").playerHP,
    ).toBe(3);
  });

  it("does not treat a pose update as a strike", () => {
    const active = applyDuelEvent(createDuelState(), { type: "duel.start", startsAt: 1_000 }, "me");

    expect(
      applyDuelEvent(
        active,
        { type: "duel.pose", playerID: "opponent", base: [0, 1, 0], tip: [0, 2, -1] },
        "me",
      ),
    ).toEqual(active);
  });
});

describe("parseDuelEvent", () => {
  it("unwraps validated duel events from a room message", () => {
    expect(
      parseDuelEvent(
        JSON.stringify({
          type: "room.message",
          payload: JSON.stringify({ type: "duel.strike", playerID: "opponent", id: "hit-1" }),
        }),
      ),
    ).toEqual({ type: "duel.strike", playerID: "opponent", id: "hit-1" });
  });

  it("unwraps an opponent saber pose", () => {
    expect(
      parseDuelEvent(
        JSON.stringify({
          type: "room.message",
          payload: JSON.stringify({
            type: "duel.pose",
            playerID: "opponent",
            base: [0, 1, 2],
            tip: [0, 2, 1],
          }),
        }),
      ),
    ).toEqual({
      type: "duel.pose",
      playerID: "opponent",
      base: [0, 1, 2],
      tip: [0, 2, 1],
    });
  });
});

describe("bladeHitsBody", () => {
  it("recognizes a blade segment crossing the opponent body", () => {
    expect(bladeHitsBody([0, 1.5, -1], [0, 1.5, -3], [0, 1.5, -2], 0.5)).toBe(true);
  });

  it("does not treat a distant blade as a hit", () => {
    expect(bladeHitsBody([3, 1.5, -1], [3, 1.5, -3], [0, 1.5, -2], 0.5)).toBe(false);
  });
});

describe("bladeTipToward", () => {
  it("keeps the hilt fixed and points the blade at the control target", () => {
    expect(bladeTipToward([0, 0, 0], [3, 0, 0], 1.2)).toEqual([1.2, 0, 0]);
  });
});

describe("poseSmoothingAlpha", () => {
  it("moves most of the remaining distance at the configured follow rate without overshooting", () => {
    const alpha = poseSmoothingAlpha(1 / 60, 24);

    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThan(1);
    expect(alpha).toBeCloseTo(0.33, 1);
  });
});

describe("opponentSaberPose", () => {
  it("anchors the remote saber to the opponent hand while preserving its mirrored direction", () => {
    const pose = opponentSaberPose({ base: [0, 0, 0], tip: [1, 0, -1] });

    expect(pose.base).toEqual([0.45, 1.35, -0.35]);
    expect(pose.tip[0]).toBeLessThan(pose.base[0]);
    expect(pose.tip[2]).toBeGreaterThan(pose.base[2]);
  });
});
