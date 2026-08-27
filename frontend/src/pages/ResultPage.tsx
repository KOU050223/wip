import { Link, useLocation } from "react-router-dom";

type ResultLocationState = { score?: number };

function ResultPage() {
  const location = useLocation();
  const score = (location.state as ResultLocationState | null)?.score;

  return (
    <section className="min-h-screen flex flex-col items-center justify-center gap-12 px-6 text-center">
      <h1 className="title-flicker font-display text-3xl md:text-5xl tracking-[0.3em] text-cyan-200 drop-shadow-[0_0_20px_rgba(76,201,240,0.5)]">
        リザルト
      </h1>
      <div>
        <div className="text-xs tracking-widest text-cyan-400/70">SCORE</div>
        <div className="font-display text-5xl text-cyan-100 tabular-nums drop-shadow-[0_0_15px_rgba(76,201,240,0.6)]">
          {(score ?? 0).toLocaleString()}
        </div>
      </div>
      <Link
        to="/ranking"
        className="font-display px-10 py-3 border border-cyan-400/50 text-cyan-200 tracking-[0.3em] text-sm uppercase transition-colors hover:border-cyan-300 hover:bg-cyan-400/10 hover:text-white"
      >
        ランキングへ
      </Link>
    </section>
  );
}

export default ResultPage;
