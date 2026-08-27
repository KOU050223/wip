import { useXRSessionModeSupported } from "@react-three/xr";
import VRGameScene from "../game/VRGameScene";

function VRPage() {
  const isSupported = useXRSessionModeSupported("immersive-vr");

  return (
    <section className="min-h-screen flex flex-col items-center gap-6 px-6 py-10 text-center">
      <h1 className="title-flicker font-display text-2xl md:text-3xl tracking-[0.3em] text-cyan-200 drop-shadow-[0_0_20px_rgba(76,201,240,0.5)]">
        VRモード
      </h1>

      {isSupported === false && (
        <p className="text-amber-300">
          この端末・ブラウザはVR(WebXR)に対応していません。VR対応ヘッドセットのブラウザで開いてください。
        </p>
      )}

      <VRGameScene />
    </section>
  );
}

export default VRPage;
