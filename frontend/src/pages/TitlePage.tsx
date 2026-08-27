import { Link } from "react-router-dom";

function TitlePage() {
  return (
    <section className="min-h-screen flex flex-col items-center justify-center gap-12 px-6 text-center">
      <h1 className="title-flicker font-display text-4xl md:text-6xl tracking-[0.3em] text-amber-200 drop-shadow-[0_0_25px_rgba(252,211,77,0.5)]">
        タイトル
      </h1>
      <Link
        to="/matchmaking"
        className="font-display px-10 py-3 border border-cyan-400/50 text-cyan-200 tracking-[0.3em] text-sm uppercase transition-colors hover:border-cyan-300 hover:bg-cyan-400/10 hover:text-white"
      >
        はじめる
      </Link>
    </section>
  );
}

export default TitlePage;
