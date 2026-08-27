import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import type { JoyConVector3 } from "../../lib/joycon/joyConDevice";

interface LightsaberProps {
  gyro: JoyConVector3 | null;
  resetTrigger?: boolean; // trueになった瞬間(rising edge)に姿勢を正面へリセットする
  position?: [number, number, number];
}

const DEG_TO_RAD = Math.PI / 180;
const MAX_TILT_RAD = 60 * DEG_TO_RAD; // 振り続けてもドリフトしすぎないように各軸の傾きを制限

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function Lightsaber({ gyro, resetTrigger = false, position = [0, 0, 0] }: LightsaberProps) {
  const groupRef = useRef<Group>(null);
  const wasResetPressedRef = useRef(false);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    if (resetTrigger && !wasResetPressedRef.current) {
      group.rotation.set(0, 0, 0);
    }
    wasResetPressedRef.current = resetTrigger;

    if (!gyro) return;
    // ジャイロの角速度(deg/s)を積分して姿勢を更新する簡易実装。
    // 積分だけだとドリフトし続けるため、各軸の傾きをMAX_TILT_RADで制限している。
    group.rotation.x = clamp(
      group.rotation.x + gyro.x * DEG_TO_RAD * delta,
      -MAX_TILT_RAD,
      MAX_TILT_RAD,
    );
    group.rotation.y = clamp(
      group.rotation.y + gyro.y * DEG_TO_RAD * delta,
      -MAX_TILT_RAD,
      MAX_TILT_RAD,
    );
    group.rotation.z = clamp(
      group.rotation.z + gyro.z * DEG_TO_RAD * delta,
      -MAX_TILT_RAD,
      MAX_TILT_RAD,
    );
  });

  return (
    // 回転の基準点(グループ原点)を柄の下端に合わせているため、
    // 振った際は下端が固定され、刃先が大きく弧を描く。
    <group ref={groupRef} position={position}>
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.2, 16]} />
        <meshStandardMaterial color="#888888" />
      </mesh>
      <mesh position={[0, 1.1, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 1.2, 16]} />
        <meshStandardMaterial
          color="#4cc9f0"
          emissive="#4cc9f0"
          emissiveIntensity={2}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

export default Lightsaber;
