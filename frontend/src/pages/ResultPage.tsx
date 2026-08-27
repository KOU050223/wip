import { Link, useLocation } from "react-router-dom";

type ResultLocationState = { score?: number; result?: "clear" | "over" };

function ResultPage() {
  const location = useLocation();
  const state = location.state as ResultLocationState | null;
  const score = state?.score;
  const isClear = state?.result === "clear";

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
          {(score ?? 0).toLocaleString()}
        </div>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row">
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
