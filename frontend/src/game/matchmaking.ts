export type MatchmakingStatus = "idle" | "waiting" | "found";

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
