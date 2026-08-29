import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useSaveScore } from "../api/generated/scores/scores";
import { createResultScoreSubmission } from "./resultScoreSubmission";

type ResultLocationState = {
  score?: number;
  result?: "clear" | "over";
  // 再挑戦ボタンの遷移先。VRからのリザルトは "/vr"、未指定(Joy-Con)は "/game"。
  retryTo?: string;
};

function ResultPage() {
  const location = useLocation();
  const state = location.state as ResultLocationState | null;
  const score = state?.score;
  const isClear = state?.result === "clear";
  const retryTo = state?.retryTo ?? "/game";
  const [playerName, setPlayerName] = useState("");
  const saveScoreMutation = useSaveScore();
  const resultScore = score ?? 0;
  const hasPlayerName = playerName.trim().length > 0;

  return (
    <section className="min-h-screen flex flex-col items-center justify-center gap-12 px-6 text-center">
      <h1
        className={`title-flicker font-display text-3xl md:text-5xl tracking-[0.3em] drop-shadow-[0_0_20px_rgba(76,201,240,0.5)] ${
          isClear ? "text-amber-300" : "text-cyan-200"
        }`}
      >
        {isClear ? "MISSION CLEAR" : "GAME OVER"}
      </h1>
      <div>
        <div className="text-xs tracking-widest text-cyan-400/70">SCORE</div>
        <div className="font-display text-5xl text-cyan-100 tabular-nums drop-shadow-[0_0_15px_rgba(76,201,240,0.6)]">
          {resultScore.toLocaleString()}
        </div>
      </div>
      <form
        className="flex w-full max-w-sm flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!hasPlayerName) {
            return;
          }
          saveScoreMutation.mutate({ data: createResultScoreSubmission(playerName, resultScore) });
        }}
      >
        <label className="text-left text-xs tracking-widest text-cyan-400/70" htmlFor="player-name">
          PLAYER NAME
        </label>
        <input
          id="player-name"
          value={playerName}
          onChange={(event) => setPlayerName(event.target.value)}
          maxLength={64}
          placeholder="名前を入力"
          className="border border-cyan-400/50 bg-slate-950/60 px-4 py-3 text-center text-cyan-100 outline-none transition-colors focus:border-cyan-300"
        />
        <button
          type="submit"
          disabled={!hasPlayerName || saveScoreMutation.isPending || saveScoreMutation.isSuccess}
          className="font-display border border-cyan-400/50 px-8 py-3 text-sm tracking-[0.3em] text-cyan-200 uppercase transition-colors enabled:hover:border-cyan-300 enabled:hover:bg-cyan-400/10 enabled:hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saveScoreMutation.isPending
            ? "保存中..."
            : saveScoreMutation.isSuccess
              ? "保存しました"
              : "スコアを保存"}
        </button>
        {saveScoreMutation.isError && (
          <p className="text-sm text-red-300">{saveScoreMutation.error.message}</p>
        )}
      </form>
      <div className="flex flex-col gap-4 sm:flex-row">
        <Link
          to={retryTo}
          className="font-display px-10 py-3 border border-cyan-400/50 text-cyan-200 tracking-[0.3em] text-sm uppercase transition-colors hover:border-cyan-300 hover:bg-cyan-400/10 hover:text-white"
        >
          もう一度挑戦
        </Link>
        <Link
          to="/ranking"
          className="font-display px-10 py-3 border border-cyan-400/50 text-cyan-200 tracking-[0.3em] text-sm uppercase transition-colors hover:border-cyan-300 hover:bg-cyan-400/10 hover:text-white"
        >
          ランキングへ
        </Link>
        <Link
          to="/"
          className="font-display px-10 py-3 border border-amber-400/50 text-amber-200 tracking-[0.3em] text-sm uppercase transition-colors hover:border-amber-300 hover:bg-amber-400/10 hover:text-white"
        >
          タイトルに戻る
        </Link>
      </div>
    </section>
  );
}

export default ResultPage;
