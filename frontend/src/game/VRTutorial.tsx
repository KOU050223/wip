// VRTutorial.tsx
// VR開始直後、実際のバトルの前に表示する操作説明。
// ヘッドセット内のテキストはdrei/troikaの既定フォントだと日本語グリフを持たないため、
// Google FontsのNoto Sans JP(TTF直リンク)を明示的に指定して描画する。
// 右手コントローラーのトリガーを引くとバトルへ進む(赤=トリガーの練習を兼ねる)。

import { Component, Suspense, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { Image, Text } from "@react-three/drei";
import { useXRInputSourceState } from "@react-three/xr";

// コントローラーの見た目を示す1枚絵(834x640)。3Dモデルではなく画像なので、
// 板ポリゴンにテクスチャとして貼るdrei/Imageで表示する。
const CONTROLLER_IMAGE_PATH = "/models/controller.png";
const CONTROLLER_IMAGE_ASPECT = 640 / 834;
const CONTROLLER_IMAGE_WIDTH = 0.5;

// Google Fonts "Noto Sans JP" Bold のTTF直リンク。日本語(ひらがな・カタカナ・漢字)を
// 描画するためだけに必要で、初回表示時にネットワーク経由で取得される(数MB程度)。
const JP_FONT_URL =
  "https://fonts.gstatic.com/s/notosansjp/v56/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFPYk75s.ttf";

// 画像未配置/読み込み失敗の場合でも、チュートリアル全体
// (テキスト・トリガーでの進行)がクラッシュしないようにするためのガード。
class ControllerImageBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

function VRTutorial({ onComplete }: { onComplete: () => void }) {
  const rightController = useXRInputSourceState("controller", "right");
  const wasPressedRef = useRef(false);

  // 右手トリガーの立ち上がりエッジでバトル開始。ボタン説明(赤=トリガー)の
  // 練習を兼ねて、まさにそのボタンで次へ進む形にしている。
  useFrame(() => {
    const pressed = rightController?.gamepad["xr-standard-trigger"]?.state === "pressed";
    if (pressed && !wasPressedRef.current) {
      onComplete();
    }
    wasPressedRef.current = pressed;
  });

  return (
    <>
      <ambientLight intensity={0.8} />
      <pointLight position={[0, 2, 1]} intensity={1} />

      <Text
        font={JP_FONT_URL}
        position={[0, 2.0, -1.2]}
        fontSize={0.1}
        color="#ffe066"
        anchorX="center"
        anchorY="middle"
      >
        操作説明
      </Text>

      <Text
        font={JP_FONT_URL}
        position={[0, 1.7, -1.2]}
        fontSize={0.055}
        color="#4cc9f0"
        anchorX="center"
        anchorY="middle"
      >
        攻撃: 敵の矢印と同じ方向に剣を振る
      </Text>

      <ControllerImageBoundary>
        <Suspense fallback={null}>
          <Image
            url={CONTROLLER_IMAGE_PATH}
            position={[0, 1.1, -1.2]}
            scale={[CONTROLLER_IMAGE_WIDTH, CONTROLLER_IMAGE_WIDTH * CONTROLLER_IMAGE_ASPECT]}
            transparent
          />
        </Suspense>
      </ControllerImageBoundary>

      <Text
        font={JP_FONT_URL}
        position={[0, 0.6, -1.2]}
        fontSize={0.055}
        color="#ff3344"
        anchorX="center"
        anchorY="middle"
      >
        赤いボール: トリガーを押しながら斬る
      </Text>
      <Text
        font={JP_FONT_URL}
        position={[0, 0.42, -1.2]}
        fontSize={0.055}
        color="#3388ff"
        anchorX="center"
        anchorY="middle"
      >
        青いボール: グリップを押しながら斬る
      </Text>

      <Text
        font={JP_FONT_URL}
        position={[0, 0.1, -1.2]}
        fontSize={0.05}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
      >
        準備ができたらトリガーを引いてスタート
      </Text>
    </>
  );
}

export default VRTutorial;
