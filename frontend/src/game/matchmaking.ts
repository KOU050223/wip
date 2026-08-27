export type MatchmakingStatus = "idle" | "waiting" | "found";
export type MatchmakingMethod = "GET" | "POST" | "DELETE";

export function matchmakingRequestInit(method: MatchmakingMethod): RequestInit {
  return {
    method,
    credentials: "include",
    ...(method === "GET" ? { cache: "no-store" as const } : {}),
  };
}

export function resolveAPIBaseURL(value: string | undefined): string {
  return value ?? "http://localhost:8080";
}

export function resolveMatchWebSocketURL(apiBaseURL: string, matchID: string): string {
  const url = new URL(`/api/matches/${encodeURIComponent(matchID)}/ws`, apiBaseURL);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export function matchmakingStatusLabel(status: MatchmakingStatus): string {
  switch (status) {
    case "idle":
      return "対戦を開始できます";
    case "waiting":
      return "対戦相手を探しています…";
    case "found":
      return "対戦相手が見つかりました";
  }
}

export function roomConnectionLabel(payload: string): string | undefined {
  let event: { type?: string; opponent_connected?: boolean };
  try {
    event = JSON.parse(payload) as typeof event;
  } catch {
    return undefined;
  }

  if (event.type === "room.joined") {
    return event.opponent_connected ? "対戦相手と接続しました" : "対戦相手の接続を待っています…";
  }
  if (event.type === "player.connected" || event.type === "player.present") {
    return "対戦相手と接続しました";
  }
  if (event.type === "player.disconnected") return "対戦相手の再接続を待っています…";
  return undefined;
}
