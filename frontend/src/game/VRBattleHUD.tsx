// VRBattleHUD.tsx
// Phase 3: HP/コンボ/スコアを表示する3Dパネル。
// 頭やコントローラーに追従させると常に視界を塞いだりVR酔いの原因になるため、
// あえて敵の近距離側の脇にワールド座標で固定し、プレイヤーが見たいときに
// 視線を向ければ読める配置にしている(要求仕様: 敵の脇に固定した3Dパネル)。

import { Text } from "@react-three/drei";
import type { BattlePhase } from "./types";

const PANEL_WIDTH = 0.9;
const PANEL_HEIGHT = 0.9;
const BAR_WIDTH = 0.7;
const BAR_HEIGHT = 0.05;

// 左端を基準に伸び縮みするHPバー。planeGeometryは中心基準なので、
// scale.xで縮めた分だけ左に寄せて「左端固定・右から減る」見た目にする。
function HealthBar({ ratio, color, y }: { ratio: number; color: string; y: number }) {
  const clamped = Math.max(0, Math.min(1, ratio));
  return (
    <group position={[0, y, 0.001]}>
      <mesh>
        <planeGeometry args={[BAR_WIDTH, BAR_HEIGHT]} />
        <meshBasicMaterial color="#111122" transparent opacity={0.8} />
      </mesh>
      <mesh scale={[clamped, 1, 1]} position={[(-BAR_WIDTH * (1 - clamped)) / 2, 0, 0.001]}>
        <planeGeometry args={[BAR_WIDTH, BAR_HEIGHT]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

function VRBattleHUD({
  position,
  rotationY,
  playerHp,
  playerMaxHp,
  enemyName,
  enemyHp,
  enemyMaxHp,
  combo,
  score,
  phase,
  incoming,
  isBoss,
  taunt,
}: {
  position: [number, number, number];
  rotationY: number;
  playerHp: number;
  playerMaxHp: number;
  enemyName: string;
  enemyHp: number;
  enemyMaxHp: number;
  combo: number;
  score: number;
  phase: BattlePhase;
  incoming: boolean;
  isBoss: boolean;
  taunt: string;
}) {
  const turnLabel =
    phase === "playerTurn" ? "YOUR TURN" : incoming ? "INCOMING! SLICE IT!" : "ENEMY TURN";
  const turnColor = phase === "playerTurn" ? "#4cc9f0" : "#ff6666";

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0, -0.01]}>
        <planeGeometry args={[PANEL_WIDTH, PANEL_HEIGHT]} />
        <meshBasicMaterial color="#02020a" transparent opacity={0.55} />
      </mesh>

      <Text
        position={[0, 0.3, 0]}
        fontSize={0.045}
        color={turnColor}
        anchorX="center"
        anchorY="middle"
      >
        {turnLabel}
      </Text>

      <Text
        position={[0, 0.21, 0]}
        fontSize={0.06}
        color={isBoss ? "#ff6666" : "#4cc9f0"}
        anchorX="center"
        anchorY="middle"
      >
        {enemyName}
      </Text>
      <HealthBar ratio={enemyHp / enemyMaxHp} color={isBoss ? "#ff4455" : "#4cc9f0"} y={0.14} />
      <Text
        position={[0, 0.07, 0]}
        fontSize={0.045}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
      >
        {`HP ${enemyHp}/${enemyMaxHp}`}
      </Text>

      <Text
        position={[0, -0.07, 0]}
        fontSize={0.06}
        color="#ffe066"
        anchorX="center"
        anchorY="middle"
      >
        YOU
      </Text>
      <HealthBar ratio={playerHp / playerMaxHp} color="#4cc9f0" y={-0.14} />
      <Text
        position={[0, -0.21, 0]}
        fontSize={0.045}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
      >
        {`HP ${playerHp}/${playerMaxHp}`}
      </Text>

      <Text
        position={[0, -0.27, 0]}
        fontSize={0.045}
        color="#ffe066"
        anchorX="center"
        anchorY="middle"
      >
        {`COMBO ${combo}  SCORE ${score}`}
      </Text>

      {taunt && (
        <Text
          position={[0, -0.38, 0]}
          fontSize={0.038}
          maxWidth={0.78}
          lineHeight={1.2}
          color={isBoss ? "#ffb3c1" : "#e9b8ff"}
          anchorX="center"
          anchorY="middle"
        >
          {`「${taunt}」`}
        </Text>
      )}
    </group>
  );
}

export default VRBattleHUD;
