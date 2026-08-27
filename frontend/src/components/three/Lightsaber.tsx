import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import type { JoyConVector3 } from "../../lib/joycon/joyConDevice";

interface LightsaberProps {
  gyro: JoyConVector3 | null;
}

const DEG_TO_RAD = Math.PI / 180;

function Lightsaber({ gyro }: LightsaberProps) {
  const groupRef = useRef<Group>(null);

  useFrame((_, delta) => {
    if (!gyro || !groupRef.current) return;
    // ジャイロの角速度(deg/s)をそのまま積分して姿勢を更新する簡易実装。
    // ドリフトは考慮していないため、長時間振り続けると姿勢がずれていく。
    groupRef.current.rotation.x += gyro.x * DEG_TO_RAD * delta;
    groupRef.current.rotation.y += gyro.y * DEG_TO_RAD * delta;
    groupRef.current.rotation.z += gyro.z * DEG_TO_RAD * delta;
  });

  return (
    <group ref={groupRef}>
      <mesh position={[0, -0.6, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.2, 16]} />
        <meshStandardMaterial color="#888888" />
      </mesh>
      <mesh position={[0, 0.4, 0]}>
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
