// GameScene.tsx
// 「Joy-Conを振る → セーバーが振られる → 敵に当たる → 敵が消える」の最短ループ
//
// 前提:
// - Joy-Conの接続状態・センサー値はJoyConContext(useJoyConContext)から取得する。
// - スイング検出(useSwingDetection)が加速度から swingId/swingPower/swingDirection を算出する。
// - セーバーの当たり判定位置は固定(近接判定)だが、命中には敵ごとの指定方向とのマッチが必要。
// - 敵は奥から近づいてきて、指定方向に振らないと倒せない。

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { Vector3 } from "three";

import type { Enemy, ComboState, SwingDirection } from "./types";
import { spawnEnemy, createSpawnTimer, randomSpawnPosition } from "./enemySpawn";
import { checkHit, calculateDamage } from "./attackDetection";
import { applyDamage, finalizeDeath, isDead } from "./hp";
import { createInitialComboState, registerHit, resetCombo } from "./combo";
import { addScore } from "./score";
import BattleHUD from "./BattleHUD";
import Lightsaber from "../components/three/Lightsaber";
import { useJoyConContext } from "../contexts/JoyConContext";
import { useSwingDetection } from "../hooks/useSwingDetection";
import type { JoyConState } from "../lib/joycon/joyConDevice";

// セーバー(柄)の設置位置(方向を取らないので固定)
const SABER_HIT_POSITION = new Vector3(0, 0.7, -1);
// 刃が届く高さ(当たり判定・敵のスポーン基準に使う)。柄の位置からy方向に刃の分だけ上げている。
const SABER_TIP_POSITION = SABER_HIT_POSITION.clone().add(new Vector3(0, 1, 0));
const SPAWN_INTERVAL_MS = 3000;
const SPAWN_DISTANCE_Z = 8; // 敵が出現する、セーバーから奥(-z)方向への距離
const ENEMY_APPROACH_SPEED = 1.5; // 敵が手前(+z)へ近づく速度(units/sec)
const ENEMY_HIT_RADIUS = 1.2; // 判定点(SABER_TIP_POSITION)からこの距離以内なら当たり判定成立
const MISS_Z_OFFSET = 1.5; // セーバーの位置をこれだけ超えて手前に来たら、避けられた(見逃した)敵として消す
const MISS_DAMAGE = 10; // 見逃した敵1体につきプレイヤーが受けるダメージ
const PLAYER_MAX_HP = 100;
const DYING_DURATION_MS = 300; // 死亡演出の表示時間
const TIMER_DURATION_SEC = 180; // 制限時間(3分)
const FEINT_AMPLITUDE_PER_SCORE = 0.002; // スコアが上がるほど敵の左右フェイントを大きくする係数
const FEINT_MAX_AMPLITUDE = 1.2; // フェイントの振れ幅の上限(units)

function CameraLookAt({ target }: { target: Vector3 }) {
  // Canvasのcameraはposition指定のみだと(0,0,-1)方向を向くだけで、
  // セーバー位置を狙わないため、明示的に向きを合わせて画面中央に来るようにする。
  const { camera } = useThree();
  useEffect(() => {
    camera.lookAt(target);
  }, [camera, target]);
  return null;
}

const DIRECTION_ARROWS: Record<SwingDirection, string> = {
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
};

function EnemyMesh({ enemy }: { enemy: Enemy }) {
  const opacity = enemy.state === "dying" ? 0.3 : 1;
  const color = enemy.state === "hit" ? "#ff6b6b" : "#8855ff";

  return (
    <group position={enemy.position}>
      <mesh>
        <boxGeometry args={[0.8, 1.6, 0.8]} />
        <meshStandardMaterial color={color} transparent opacity={opacity} />
      </mesh>
      {enemy.state === "idle" && (
        <Text
          position={[0, 0.3, 0.41]}
          fontSize={0.6}
          color="#ffe066"
          anchorX="center"
          anchorY="middle"
        >
          {DIRECTION_ARROWS[enemy.requiredDirection]}
        </Text>
      )}
    </group>
  );
}

function GameLoop({
  joyConState,
  isJoyConConnected,
  onStateChange,
  onGameOver,
}: {
  joyConState: JoyConState | null;
  isJoyConConnected: boolean;
  onStateChange: (
    enemies: Enemy[],
    combo: ComboState,
    playerHp: number,
    timeRemaining: number,
  ) => void;
  onGameOver: (score: number) => void;
}) {
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const [combo, setCombo] = useState<ComboState>(createInitialComboState());
  const [playerHp, setPlayerHp] = useState(PLAYER_MAX_HP);
  const [timeRemaining, setTimeRemaining] = useState(TIMER_DURATION_SEC);
  const spawnTimerRef = useRef(createSpawnTimer(SPAWN_INTERVAL_MS));
  const lastSwingIdRef = useRef(0);
  const startTimeRef = useRef(performance.now());
  const gameOverFiredRef = useRef(false);
  const swing = useSwingDetection(joyConState);

  // 敵出現
  useFrame((_, delta) => {
    const now = performance.now();

    // 制限時間のカウントダウン
    const remainingSec = Math.max(0, TIMER_DURATION_SEC - (now - startTimeRef.current) / 1000);
    const roundedRemaining = Math.ceil(remainingSec);
    if (roundedRemaining !== timeRemaining) {
      setTimeRemaining(roundedRemaining);
    }
    if (remainingSec <= 0 && !gameOverFiredRef.current) {
      gameOverFiredRef.current = true;
      onGameOver(combo.score);
    }

    if (spawnTimerRef.current(now)) {
      // 手前方向(x)だけランダムにばらけさせ、奥(-z)から出現させる
      const horizontalJitter = randomSpawnPosition(0.8, 0).x;
      const spawnPos = new Vector3(
        SABER_TIP_POSITION.x + horizontalJitter,
        SABER_TIP_POSITION.y,
        SABER_TIP_POSITION.z - SPAWN_DISTANCE_Z,
      );
      setEnemies((prev) => [
        ...prev,
        spawnEnemy(spawnPos, { approachSpeed: ENEMY_APPROACH_SPEED, hitRadius: ENEMY_HIT_RADIUS }),
      ]);
    }

    setEnemies((prev) => {
      // 出現中(idle)の敵は奥(-z)から手前(+z)へ近づきつつ、
      // スコアが上がるほど左右のフェイント(揺さぶり)を大きくする
      const feintAmplitude = Math.min(FEINT_MAX_AMPLITUDE, combo.score * FEINT_AMPLITUDE_PER_SCORE);
      const moved = prev.map((e) => {
        if (e.state !== "idle") return e;
        const elapsedSec = (now - e.spawnedAt) / 1000;
        const feintX =
          e.baseX + Math.sin(elapsedSec * e.feintFrequency + e.feintPhase) * feintAmplitude;
        return {
          ...e,
          position: new Vector3(feintX, e.position.y, e.position.z + e.approachSpeed * delta),
        };
      });

      // セーバーの位置を通り過ぎて避けられた(見逃した)敵の数だけプレイヤーがダメージを受ける
      const missedCount = moved.filter(
        (e) => e.state === "idle" && e.position.z >= SABER_TIP_POSITION.z + MISS_Z_OFFSET,
      ).length;
      if (missedCount > 0) {
        const nextHp = Math.max(0, playerHp - missedCount * MISS_DAMAGE);
        setPlayerHp(nextHp);
        setCombo((prev) => resetCombo(prev));
        if (nextHp <= 0 && !gameOverFiredRef.current) {
          gameOverFiredRef.current = true;
          onGameOver(combo.score);
        }
      }

      return (
        moved
          // dying状態の敵を一定時間後に配列から削除
          .map((e) =>
            e.state === "dying" && now - e.spawnedAt > DYING_DURATION_MS ? finalizeDeath(e) : e,
          )
          // 死んだ敵、および見逃した敵を配列から削除
          .filter((e) => !isDead(e) && e.position.z < SABER_TIP_POSITION.z + MISS_Z_OFFSET)
      );
    });
  });

  // Joy-Conの振り検出 → 攻撃判定
  useEffect(() => {
    if (!isJoyConConnected) return;
    if (swing.swingId === lastSwingIdRef.current) return;
    lastSwingIdRef.current = swing.swingId;

    const hitEnemy = checkHit(SABER_TIP_POSITION, swing.swingPower, enemies);
    if (!hitEnemy) return;
    // 指定された方向と振った方向が一致しないと不発(ダメージなし)
    if (swing.swingDirection !== hitEnemy.requiredDirection) return;

    const damage = calculateDamage(swing.swingPower);
    const now = performance.now();

    setEnemies((prev) => prev.map((e) => (e.id === hitEnemy.id ? applyDamage(e, damage) : e)));
    setCombo((prev) => {
      const next = registerHit(prev, now);
      return { ...next, score: addScore(prev.score, next.combo) };
    });
  }, [swing.swingId, swing.swingPower, swing.swingDirection, isJoyConConnected, enemies]);

  useEffect(() => {
    onStateChange(enemies, combo, playerHp, timeRemaining);
  }, [enemies, combo, playerHp, timeRemaining, onStateChange]);

  return (
    <>
      <CameraLookAt target={SABER_HIT_POSITION} />
      <ambientLight intensity={0.6} />
      <pointLight position={[2, 3, 2]} intensity={1} />
      <Lightsaber
        gyro={joyConState?.gyro ?? null}
        resetTrigger={joyConState?.buttons.plus ?? false}
        position={[SABER_HIT_POSITION.x, SABER_HIT_POSITION.y, SABER_HIT_POSITION.z]}
      />
      {enemies.map((enemy) => (
        <EnemyMesh key={enemy.id} enemy={enemy} />
      ))}
    </>
  );
}

export default function GameScene() {
  const joyCon = useJoyConContext();
  const navigate = useNavigate();
  const [hudCombo, setHudCombo] = useState<ComboState>(createInitialComboState());
  const [hudHp, setHudHp] = useState(PLAYER_MAX_HP);
  const [hudTimeRemaining, setHudTimeRemaining] = useState(TIMER_DURATION_SEC);

  return (
    <div className="relative w-full h-[70vh] min-h-[500px]">
      <Canvas camera={{ position: [0, 1.5, 2], fov: 75 }}>
        <GameLoop
          joyConState={joyCon.state}
          isJoyConConnected={joyCon.isConnected}
          onStateChange={(_enemies, combo, playerHp, timeRemaining) => {
            setHudCombo(combo);
            setHudHp(playerHp);
            setHudTimeRemaining(timeRemaining);
          }}
          onGameOver={(score) => navigate("/result", { state: { score } })}
        />
      </Canvas>
      <div className="absolute inset-0 pointer-events-none">
        <BattleHUD
          combo={hudCombo.combo}
          score={hudCombo.score}
          hp={hudHp}
          maxHp={PLAYER_MAX_HP}
          timeRemaining={hudTimeRemaining}
        />
      </div>
    </div>
  );
}
