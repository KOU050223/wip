import { Link } from "react-router-dom";
import GameScene from "../game/GameScene";
import { useJoyConContext } from "../contexts/JoyConContext";

function GamePage() {
  const { isConnected } = useJoyConContext();

  return (
    <section className="min-h-screen flex flex-col items-center gap-6 px-6 py-10 text-center">
      <h1 className="title-flicker font-display text-2xl md:text-3xl tracking-[0.3em] text-cyan-200 drop-shadow-[0_0_20px_rgba(76,201,240,0.5)]">
        ゲーム
      </h1>

      {!isConnected && (
        <p className="text-amber-300">Joy-Conが未接続です。先に接続画面で接続してください。</p>
      )}

      <GameScene />

      <Link
        to="/result"
        className="font-display px-10 py-3 border border-cyan-400/50 text-cyan-200 tracking-[0.3em] text-sm uppercase transition-colors hover:border-cyan-300 hover:bg-cyan-400/10 hover:text-white"
      >
        リザルトへ
      </Link>
    </section>
  );
}

export default GamePage;
