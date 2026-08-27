// VRLightsaber.tsx
// VR用ライトセイバー。Joy-Con版(Lightsaber.tsx)と違い、コントローラーのgrip-space自体が
// 既に実際の位置・向きを反映しているため、ジャイロ積分やクランプ処理は不要で
// ローカル原点にそのまま柄・刃を置くだけでよい。

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { useSaberTipRef } from "../../hooks/vrSaberTip";
import { useSaberBaseRef } from "../../hooks/vrSaberBase";

const HILT_LENGTH = 0.2;
const BLADE_LENGTH = 1.2;
const BLADE_START = HILT_LENGTH / 2; // 柄の先端(グリップ中心から見て前方の端、刃の根元)
const BLADE_LOCAL_Y = BLADE_START + BLADE_LENGTH / 2;

function VRLightsaber() {
  const tipRef = useRef<Group>(null);
  const baseRef = useRef<Group>(null);
  const saberTip = useSaberTipRef();
  const saberBase = useSaberBaseRef();

  // 刃の根元・剣先の実座標を毎フレーム共有Refへ書き込む。
  // 当たり判定は剣先の点だけでなく、この2点を結ぶ刃全体の線分で行う(useVRSwingHit/ProjectileVisual)。
  useFrame(() => {
    if (tipRef.current) {
      tipRef.current.getWorldPosition(saberTip.current);
    }
    if (baseRef.current) {
      baseRef.current.getWorldPosition(saberBase.current);
    }
  });

  return (
    // grip-spaceのローカルY軸(手の甲側=上方向)に刃を伸ばすと握り拳の真上に立ってしまうため、
    // グループごと-90度傾けてグリップの前方(-Z方向、指差す方向)に刃が伸びるようにする。
    <group rotation={[-Math.PI / 2, 0, 0]}>
      {/* グレーの柄はグリップ原点(実際にコントローラーを握る位置)を中心に置く */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.02, 0.02, HILT_LENGTH, 16]} />
        <meshStandardMaterial color="#888888" />
      </mesh>
      <mesh position={[0, BLADE_LOCAL_Y, 0]}>
        <cylinderGeometry args={[0.015, 0.015, BLADE_LENGTH, 16]} />
        <meshStandardMaterial
          color="#4cc9f0"
          emissive="#4cc9f0"
          emissiveIntensity={2}
          toneMapped={false}
        />
      </mesh>
      {/* 刃全体を線分として扱うための目印(根元・剣先)。useVRSwingHitがgetWorldPositionで参照する */}
      <group ref={baseRef} position={[0, BLADE_START, 0]} name="saber-base" />
      <group ref={tipRef} position={[0, BLADE_START + BLADE_LENGTH, 0]} name="saber-tip" />
    </group>
  );
}

export default VRLightsaber;
