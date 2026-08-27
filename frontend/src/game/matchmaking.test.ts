import { describe, expect, it } from "vitest";
import {
  matchmakingRequestInit,
  matchmakingStatusLabel,
  resolveAPIBaseURL,
  resolveMatchWebSocketURL,
  roomConnectionLabel,
} from "./matchmaking";

describe("matchmakingStatusLabel", () => {
  it("renders each matchmaking state in Japanese", () => {
    expect(matchmakingStatusLabel("idle")).toBe("対戦を開始できます");
    expect(matchmakingStatusLabel("waiting")).toBe("対戦相手を探しています…");
    expect(matchmakingStatusLabel("found")).toBe("対戦相手が見つかりました");
  });
});

describe("resolveAPIBaseURL", () => {
  it("uses the local Go server when the Vite environment variable is absent", () => {
    expect(resolveAPIBaseURL(undefined)).toBe("http://localhost:8080");
  });
});

describe("resolveMatchWebSocketURL", () => {
  it("converts the API URL into the matched room WebSocket URL", () => {
    expect(resolveMatchWebSocketURL("http://localhost:8080", "match-1")).toBe(
      "ws://localhost:8080/api/matches/match-1/ws",
    );
  });
});

describe("matchmakingRequestInit", () => {
  it("disables caching for queue status requests", () => {
    expect(matchmakingRequestInit("GET")).toMatchObject({
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
  });
});

describe("roomConnectionLabel", () => {
  it("waits until the opponent is actually present", () => {
    expect(roomConnectionLabel(`{"type":"room.joined","opponent_connected":false}`)).toBe(
      "対戦相手の接続を待っています…",
    );
    expect(roomConnectionLabel(`{"type":"player.connected"}`)).toBe("対戦相手と接続しました");
    expect(roomConnectionLabel(`{"type":"player.present"}`)).toBe("対戦相手と接続しました");
  });
});
