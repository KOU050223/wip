import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  matchmakingStatusLabel,
  resolveAPIBaseURL,
  type MatchmakingStatus,
} from "../game/matchmaking";

const apiBaseURL = resolveAPIBaseURL(import.meta.env.VITE_API_BASE_URL);

type QueueResponse = {
  status: MatchmakingStatus;
  match_id?: string;
};

async function request(path: string, method: "GET" | "POST" | "DELETE") {
  return fetch(`${apiBaseURL}${path}`, { method, credentials: "include" });
}

function MatchmakingPage() {
  const [status, setStatus] = useState<MatchmakingStatus>("idle");
  const [matchID, setMatchID] = useState<string>();
  const [error, setError] = useState<string>();
  const [reconnecting, setReconnecting] = useState(false);

  const refresh = useCallback(async () => {
    const response = await request("/api/matchmaking/queue", "GET");
    if (!response.ok) throw new Error("対戦状態を取得できませんでした");
    const queue = (await response.json()) as QueueResponse;
    setStatus(queue.status);
    setMatchID(queue.match_id);
  }, []);

  const start = useCallback(async () => {
    setError(undefined);
    setReconnecting(true);
    try {
      await request("/api/guests", "POST");
      const response = await request("/api/matchmaking/queue", "POST");
      if (!response.ok) throw new Error("対戦待機を開始できませんでした");
      const queue = (await response.json()) as QueueResponse;
      setStatus(queue.status);
      setMatchID(queue.match_id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "接続に失敗しました");
    } finally {
      setReconnecting(false);
    }
  }, []);

  const cancel = useCallback(async () => {
    setError(undefined);
    const response = await request("/api/matchmaking/queue", "DELETE");
    if (!response.ok) {
      setError("成立済みの対戦はキャンセルできません");
      return;
    }
    setStatus("idle");
    setMatchID(undefined);
  }, []);

  useEffect(() => {
    if (status !== "waiting") return;
    const interval = window.setInterval(() => {
      void refresh().catch(() => setError("再接続を試みています…"));
    }, 2_000);
    return () => window.clearInterval(interval);
  }, [refresh, status]);

  return (
    <section className="min-h-screen flex flex-col items-center justify-center gap-8 px-6 text-center">
      <h1 className="title-flicker font-display text-3xl md:text-5xl tracking-[0.2em] text-cyan-200">
        リアルタイム対戦
      </h1>
      <p aria-live="polite" className="text-lg text-cyan-100">
        {reconnecting ? "接続中…" : matchmakingStatusLabel(status)}
      </p>
      {matchID && <p className="font-mono text-sm text-emerald-300">ルーム: {matchID}</p>}
      {error && (
        <p role="alert" className="text-amber-300">
          {error}
        </p>
      )}
      <div className="flex gap-4">
        {status === "idle" && (
          <button
            type="button"
            onClick={() => void start()}
            className="font-display px-8 py-3 border border-cyan-400/50 text-cyan-200"
          >
            ゲストで対戦開始
          </button>
        )}
        {status === "waiting" && (
          <button
            type="button"
            onClick={() => void cancel()}
            className="font-display px-8 py-3 border border-amber-400/50 text-amber-200"
          >
            キャンセル
          </button>
        )}
        {status === "found" && (
          <Link
            to={`/matches/${matchID}`}
            className="font-display px-8 py-3 border border-emerald-400/50 text-emerald-200"
          >
            対戦へ接続
          </Link>
        )}
      </div>
      <Link to="/" className="text-sm text-cyan-300 underline">
        タイトルへ戻る
      </Link>
    </section>
  );
}

export default MatchmakingPage;
