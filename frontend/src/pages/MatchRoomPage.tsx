import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  applyDuelEvent,
  createDuelState,
  DUEL_MAX_HP,
  parseDuelEvent,
  type SaberPose,
  type DuelEvent,
} from "../game/duel";
import DuelArena from "../game/DuelArena";
import {
  resolveAPIBaseURL,
  resolveMatchWebSocketURL,
  roomConnectionLabel,
} from "../game/matchmaking";

const apiBaseURL = resolveAPIBaseURL(import.meta.env.VITE_API_BASE_URL);
const opponentPresenceTimeoutMS = 25_000;
const duelCountdownMS = 3_000;
const strikeCooldownMS = 700;

function playerIDForMatch(matchID: string): string {
  const key = `duel-player:${matchID}`;
  const stored = sessionStorage.getItem(key);
  if (stored) return stored;
  const playerID = crypto.randomUUID();
  sessionStorage.setItem(key, playerID);
  return playerID;
}

function MatchRoomPage() {
  const { matchID } = useParams();
  const [connectionState, setConnectionState] = useState("接続中…");
  const [duel, setDuel] = useState(createDuelState);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(0);
  const opponentPoseRef = useRef<SaberPose | undefined>(undefined);
  const socketRef = useRef<WebSocket | undefined>(undefined);
  const playerIDRef = useRef<string | undefined>(undefined);
  const lastStrikeAtRef = useRef(0);
  const startSentRef = useRef(false);

  useEffect(() => {
    if (!matchID) return;
    playerIDRef.current = playerIDForMatch(matchID);

    let retryTimer: number | undefined;
    let opponentTimer: number | undefined;
    let closedByPage = false;

    const connect = () => {
      setConnectionState("対戦ルームへ接続中…");
      const socket = new WebSocket(resolveMatchWebSocketURL(apiBaseURL, matchID));
      socketRef.current = socket;
      socket.onopen = () => setConnectionState("対戦相手の接続を確認しています…");
      socket.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        const label = roomConnectionLabel(event.data);
        if (label) {
          setConnectionState(label);
          if (opponentTimer !== undefined) window.clearTimeout(opponentTimer);
          if (label === "対戦相手と接続しました") {
            opponentTimer = window.setTimeout(
              () => setConnectionState("対戦相手の再接続を待っています…"),
              opponentPresenceTimeoutMS,
            );
          }
        }
        const duelEvent = parseDuelEvent(event.data);
        if (duelEvent && playerIDRef.current) {
          setDuel((current) => applyDuelEvent(current, duelEvent, playerIDRef.current!));
          if (duelEvent.type === "duel.start") setNow(Date.now());
          if (duelEvent.type === "duel.pose" && duelEvent.playerID !== playerIDRef.current) {
            opponentPoseRef.current = { base: duelEvent.base, tip: duelEvent.tip };
          }
        }
      };
      socket.onclose = () => {
        if (closedByPage) return;
        if (opponentTimer !== undefined) window.clearTimeout(opponentTimer);
        setConnectionState("接続が切れました。再接続中…");
        retryTimer = window.setTimeout(connect, 2_000);
      };
      socket.onerror = () => socket.close();
    };

    connect();
    return () => {
      closedByPage = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      if (opponentTimer !== undefined) window.clearTimeout(opponentTimer);
      socketRef.current?.close();
      socketRef.current = undefined;
    };
  }, [matchID]);

  useEffect(() => {
    if (duel.phase !== "active" || duel.playerHP === 0 || duel.opponentHP === 0) return;
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [duel.opponentHP, duel.phase, duel.playerHP]);

  useEffect(() => {
    if (!ready || !duel.opponentReady || duel.phase !== "lobby" || startSentRef.current) return;
    startSentRef.current = true;
    const event: DuelEvent = { type: "duel.start", startsAt: Date.now() + duelCountdownMS };
    socketRef.current?.send(JSON.stringify(event));
  }, [duel.opponentReady, duel.phase, ready]);

  if (!matchID) {
    return <Link to="/matchmaking">マッチング画面へ戻る</Link>;
  }

  const send = (event: DuelEvent) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return false;
    socketRef.current.send(JSON.stringify(event));
    return true;
  };
  const remainingSeconds = duel.startsAt
    ? Math.max(0, Math.ceil((duel.startsAt - now) / 1_000))
    : 0;
  const duelStarted = duel.phase === "active" && remainingSeconds === 0;
  const finished = duel.playerHP === 0 || duel.opponentHP === 0;
  const won = duel.opponentHP === 0;

  return (
    <section className="min-h-screen flex flex-col items-center justify-center gap-8 px-6 text-center">
      <h1 className="title-flicker font-display text-3xl md:text-5xl tracking-[0.2em] text-emerald-200">
        チャンバラ対戦
      </h1>
      <p className="font-mono text-sm text-emerald-300">ルーム: {matchID}</p>
      <p aria-live="polite" className="text-lg text-cyan-100">
        {connectionState}
      </p>
      {duel.phase === "lobby" ? (
        <div className="flex flex-col items-center gap-4">
          <p className="text-cyan-200">
            {ready
              ? duel.opponentReady
                ? "開始を同期しています…"
                : "相手の準備を待っています…"
              : "両者が準備完了すると、3秒後に開始します"}
          </p>
          <button
            type="button"
            disabled={ready || connectionState.includes("再接続")}
            onClick={() => {
              if (
                !playerIDRef.current ||
                !send({ type: "duel.ready", playerID: playerIDRef.current })
              )
                return;
              setReady(true);
            }}
            className="font-display border border-emerald-400/50 px-8 py-3 tracking-[0.2em] text-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {ready ? "準備完了" : "準備する"}
          </button>
        </div>
      ) : finished ? (
        <div className="flex flex-col items-center gap-4">
          <p
            className={`font-display text-3xl tracking-[0.2em] ${won ? "text-amber-300" : "text-rose-300"}`}
          >
            {won ? "VICTORY" : "DEFEAT"}
          </p>
          <Link
            to="/result"
            state={{
              score: (DUEL_MAX_HP - duel.opponentHP) * 1_000,
              result: won ? "clear" : "over",
            }}
            className="border border-cyan-400/50 px-8 py-3 text-cyan-200"
          >
            リザルトへ
          </Link>
        </div>
      ) : (
        <div className="flex w-full max-w-lg flex-col gap-6">
          <p className="font-display text-2xl tracking-[0.2em] text-amber-200">
            {duelStarted ? "斬り合え！" : `${remainingSeconds}`}
          </p>
          <div className="grid grid-cols-2 gap-4 text-left">
            <p className="border border-cyan-400/40 p-4 text-cyan-100">
              あなた HP: {duel.playerHP}
            </p>
            <p className="border border-rose-400/40 p-4 text-rose-100">
              相手 HP: {duel.opponentHP}
            </p>
          </div>
          <DuelArena
            active={duelStarted}
            opponentPoseRef={opponentPoseRef}
            onPose={(base, tip) => {
              if (!playerIDRef.current || !duelStarted) return;
              send({ type: "duel.pose", playerID: playerIDRef.current, base, tip });
            }}
            onStrike={() => {
              if (!playerIDRef.current || Date.now() - lastStrikeAtRef.current < strikeCooldownMS)
                return;
              const event: DuelEvent = {
                type: "duel.strike",
                playerID: playerIDRef.current,
                id: crypto.randomUUID(),
              };
              if (send(event)) lastStrikeAtRef.current = Date.now();
            }}
          />
          <p className="text-sm text-cyan-200/70">先に3本、有効打を取った方の勝利です。</p>
        </div>
      )}
      <Link to="/matchmaking" className="text-sm text-cyan-300 underline">
        マッチング画面へ戻る
      </Link>
    </section>
  );
}

export default MatchRoomPage;
