import { Link } from "react-router-dom";

function RankingPage() {
  return (
    <section className="min-h-screen flex flex-col items-center justify-center gap-12 px-6 text-center">
      <h1 className="title-flicker font-display text-3xl md:text-5xl tracking-[0.3em] text-cyan-200 drop-shadow-[0_0_20px_rgba(76,201,240,0.5)]">
        ランキング
      </h1>
      <Link
        to="/"
        className="font-display px-10 py-3 border border-cyan-400/50 text-cyan-200 tracking-[0.3em] text-sm uppercase transition-colors hover:border-cyan-300 hover:bg-cyan-400/10 hover:text-white"
      >
        タイトルへ戻る
      </Link>
    </section>
  );
}

export default RankingPage;
