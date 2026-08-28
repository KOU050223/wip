import { Link } from "react-router-dom";

const DIRECTION_ARROWS = ["↑", "↓", "←", "→"];
const DEFENSE_BUTTON_LABELS = ["A", "B", "X", "Y", "R", "ZR"];

function TutorialPage() {
  return (
    <section className="min-h-screen flex flex-col items-center justify-center gap-10 px-6 py-10 text-center">
      <h1 className="title-flicker font-display text-2xl md:text-3xl tracking-[0.3em] text-cyan-200 drop-shadow-[0_0_20px_rgba(76,201,240,0.5)]">
        操作方法
      </h1>

      <div className="flex w-full max-w-md flex-col gap-6 text-left">
        <div className="border border-cyan-400/30 bg-cyan-950/20 px-6 py-5">
          <p className="font-display mb-2 tracking-[0.2em] text-cyan-300">攻撃(自分のターン)</p>
          <p className="mb-3 text-sm text-cyan-100">
            敵の上に表示される矢印と同じ方向にJoy-Conを振ろう。
          </p>
          <div className="flex justify-center gap-4 text-2xl text-amber-200">
            {DIRECTION_ARROWS.map((arrow) => (
              <span key={arrow}>{arrow}</span>
            ))}
          </div>
        </div>

        <div className="border border-cyan-400/30 bg-cyan-950/20 px-6 py-5">
          <p className="font-display mb-2 tracking-[0.2em] text-cyan-300">防御(相手のターン)</p>
          <p className="mb-3 text-sm text-cyan-100">
            相手のターンになると表示されるボタンを、時間内に押して防ごう。
          </p>
          <div className="flex flex-wrap justify-center gap-3 text-lg font-bold text-amber-200">
            {DEFENSE_BUTTON_LABELS.map((label) => (
              <span
                key={label}
                className="flex h-9 w-9 items-center justify-center border border-amber-300/50"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <Link
          to="/game"
          className="font-display px-10 py-3 border border-cyan-400/50 text-cyan-200 tracking-[0.3em] text-sm uppercase transition-colors hover:border-cyan-300 hover:bg-cyan-400/10 hover:text-white"
        >
          バトルへ
        </Link>
      </div>
    </section>
  );
}

export default TutorialPage;
