import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  resolveAPIBaseURL,
  resolveMatchWebSocketURL,
  roomConnectionLabel,
} from "../game/matchmaking";

const apiBaseURL = resolveAPIBaseURL(import.meta.env.VITE_API_BASE_URL);
const opponentPresenceTimeoutMS = 25_000;

function MatchRoomPage() {
  const { matchID } = useParams();
  const [connectionState, setConnectionState] = useState("接続中…");

  useEffect(() => {
    if (!matchID) return;

    let retryTimer: number | undefined;
    let opponentTimer: number | undefined;
    let closedByPage = false;
    let socket: WebSocket | undefined;

    const connect = () => {
      setConnectionState("対戦ルームへ接続中…");
      socket = new WebSocket(resolveMatchWebSocketURL(apiBaseURL, matchID));
      socket.onopen = () => setConnectionState("対戦相手の接続を確認しています…");
      socket.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        const label = roomConnectionLabel(event.data);
        if (!label) return;
        setConnectionState(label);
        if (opponentTimer !== undefined) window.clearTimeout(opponentTimer);
        if (label === "対戦相手と接続しました") {
          opponentTimer = window.setTimeout(
            () => setConnectionState("対戦相手の再接続を待っています…"),
            opponentPresenceTimeoutMS,
          );
        }
      };
      socket.onclose = () => {
        if (closedByPage) return;
        if (opponentTimer !== undefined) window.clearTimeout(opponentTimer);
        setConnectionState("接続が切れました。再接続中…");
        retryTimer = window.setTimeout(connect, 2_000);
      };
      socket.onerror = () => socket?.close();
    };

    connect();
    return () => {
      closedByPage = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      if (opponentTimer !== undefined) window.clearTimeout(opponentTimer);
      socket?.close();
    };
  }, [matchID]);

  if (!matchID) {
    return <Link to="/matchmaking">マッチング画面へ戻る</Link>;
  }

  return (
    <section className="min-h-screen flex flex-col items-center justify-center gap-8 px-6 text-center">
      <h1 className="title-flicker font-display text-3xl md:text-5xl tracking-[0.2em] text-emerald-200">
        対戦ルーム
      </h1>
      <p className="font-mono text-sm text-emerald-300">ルーム: {matchID}</p>
      <p aria-live="polite" className="text-lg text-cyan-100">
        {connectionState}
      </p>
      <p className="max-w-md text-sm text-cyan-200/70">
        対戦ゲーム本体はこのルーム接続を使って同期します。
      </p>
      <Link to="/matchmaking" className="text-sm text-cyan-300 underline">
        マッチング画面へ戻る
      </Link>
    </section>
  );
}

export default MatchRoomPage;
