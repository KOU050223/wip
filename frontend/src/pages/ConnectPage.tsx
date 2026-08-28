import { Link } from "react-router-dom";
import { useJoyConContext } from "../contexts/JoyConContext";

function ConnectPage() {
  const { isSupported, isConnected, state, error, connect } = useJoyConContext();

  return (
    <section className="min-h-screen flex flex-col items-center justify-center gap-8 px-6 text-center">
      <h1 className="title-flicker font-display text-3xl md:text-5xl tracking-[0.3em] text-cyan-200 drop-shadow-[0_0_20px_rgba(76,201,240,0.5)]">
        Joy-Con接続
      </h1>

      {!isSupported && (
        <p className="max-w-md text-amber-300">
          このブラウザはWebHIDに対応していません。Chrome / Edgeで開いてください。
        </p>
      )}

      {isSupported && !isConnected && (
        <button
          type="button"
          onClick={connect}
          className="font-display px-10 py-3 border border-cyan-400/50 text-cyan-200 tracking-[0.3em] text-sm uppercase transition-colors hover:border-cyan-300 hover:bg-cyan-400/10 hover:text-white"
        >
          Joy-Conを接続する
        </button>
      )}

      {error && (
        <p role="alert" className="text-red-400">
          {error}
        </p>
      )}

      {isConnected && (
        <div className="flex flex-col items-center gap-6">
          <p className="font-display tracking-[0.3em] text-emerald-300">接続済み</p>
          {state && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border border-cyan-400/30 bg-cyan-950/20 px-6 py-4 text-left font-mono text-sm text-cyan-100 shadow-[0_0_20px_rgba(76,201,240,0.1)]">
              <dt className="text-cyan-400/70 tracking-widest">加速度 (G)</dt>
              <dd>
                x: {state.accel.x.toFixed(2)} / y: {state.accel.y.toFixed(2)} / z:{" "}
                {state.accel.z.toFixed(2)}
              </dd>
              <dt className="text-cyan-400/70 tracking-widest">ジャイロ (deg/s)</dt>
              <dd>
                x: {state.gyro.x.toFixed(1)} / y: {state.gyro.y.toFixed(1)} / z:{" "}
                {state.gyro.z.toFixed(1)}
              </dd>
            </dl>
          )}
          <Link
            to="/tutorial"
            className="font-display px-10 py-3 border border-cyan-400/50 text-cyan-200 tracking-[0.3em] text-sm uppercase transition-colors hover:border-cyan-300 hover:bg-cyan-400/10 hover:text-white"
          >
            ゲームへ
          </Link>
        </div>
      )}
    </section>
  );
}

export default ConnectPage;
