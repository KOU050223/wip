import { Link } from "react-router-dom";

function TitlePage() {
  return (
    <section className="min-h-screen flex flex-col items-center justify-center gap-12 px-6 text-center">
      <h1 className="title-flicker font-display text-4xl md:text-6xl tracking-[0.3em] text-amber-200 drop-shadow-[0_0_25px_rgba(252,211,77,0.5)]">
        イマジンブレイカー
      </h1>
      <div className="flex flex-col gap-4 sm:flex-row">
        <Link
          to="/connect"
          className="font-display px-10 py-3 border border-cyan-400/50 text-cyan-200 tracking-[0.3em] text-sm uppercase transition-colors hover:border-cyan-300 hover:bg-cyan-400/10 hover:text-white"
        >
          はじめる
        </Link>
        <Link
          to="/vr"
          className="font-display px-10 py-3 border border-red-400/50 text-red-200 tracking-[0.3em] text-sm uppercase transition-colors hover:border-red-300 hover:bg-red-400/10 hover:text-white"
        >
          VRではじめる
        </Link>
        <Link
          to="/matchmaking"
          className="font-display px-10 py-3 border border-cyan-400/50 text-cyan-200 tracking-[0.3em] text-sm uppercase transition-colors hover:border-cyan-300 hover:bg-cyan-400/10 hover:text-white"
        >
          通信対戦をはじめる
        </Link>
      </div>
    </section>
  );
}

export default TitlePage;
