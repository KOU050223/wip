// GameScene.tsx
// 「Joy-Conを振る → セーバーが振られる → 敵に当たる → 敵が消える」の最短ループ
//
// 前提:
// - Joy-Conの接続状態・センサー値はJoyConContext(useJoyConContext)から取得する。
// - スイング検出(useSwingDetection)が加速度から swingId/swingPower を算出する。
// - 方向は取得しないため、セーバーの当たり判定は固定位置の近接判定(案A)。
// - 敵はまずは「静止したまま出現し、当たったら消える」だけの最小構成。

import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";

import type { Enemy, ComboState } from "./types";
import { spawnEnemy, createSpawnTimer, randomSpawnPosition } from "./enemySpawn";
import { checkHit, calculateDamage } from "./attackDetection";
import { applyDamage, finalizeDeath, isDead } from "./hp";
import { createInitialComboState, registerHit, checkComboTimeout } from "./combo";
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
const MISS_Z_OFFSET = 1.5; // セーバーの位置をこれだけ超えて手前に来たら、避けられた(見逃した)敵として消す
const DYING_DURATION_MS = 300; // 死亡演出の表示時間

function CameraLookAt({ target }: { target: Vector3 }) {
  // Canvasのcameraはposition指定のみだと(0,0,-1)方向を向くだけで、
  // セーバー位置を狙わないため、明示的に向きを合わせて画面中央に来るようにする。
  const { camera } = useThree();
  useEffect(() => {
    camera.lookAt(target);
  }, [camera, target]);
  return null;
}

function EnemyMesh({ enemy }: { enemy: Enemy }) {
  const opacity = enemy.state === "dying" ? 0.3 : 1;
  const color = enemy.state === "hit" ? "#ff6b6b" : "#8855ff";

  return (
    <mesh position={enemy.position}>
      <boxGeometry args={[0.8, 1.6, 0.8]} />
      <meshStandardMaterial color={color} transparent opacity={opacity} />
    </mesh>
  );
}

function GameLoop({
  joyConState,
  isJoyConConnected,
  onStateChange,
}: {
  joyConState: JoyConState | null;
  isJoyConConnected: boolean;
  onStateChange: (enemies: Enemy[], combo: ComboState) => void;
}) {
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const [combo, setCombo] = useState<ComboState>(createInitialComboState());
  const spawnTimerRef = useRef(createSpawnTimer(SPAWN_INTERVAL_MS));
  const lastSwingIdRef = useRef(0);
  const swing = useSwingDetection(joyConState);

  // 敵出現
  useFrame((_, delta) => {
    const now = performance.now();
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
        spawnEnemy(spawnPos, { approachSpeed: ENEMY_APPROACH_SPEED }),
      ]);
    }

    // コンボのタイムアウトチェック
    setCombo((prev) => checkComboTimeout(prev, now));

    setEnemies((prev) =>
      prev
        // 出現中(idle)の敵は奥(-z)から手前(+z)へ近づく
        .map((e) =>
          e.state === "idle"
            ? { ...e, position: e.position.clone().add(new Vector3(0, 0, e.approachSpeed * delta)) }
            : e,
        )
        // dying状態の敵を一定時間後に配列から削除
        .map((e) =>
          e.state === "dying" && now - e.spawnedAt > DYING_DURATION_MS ? finalizeDeath(e) : e,
        )
        // 死んだ敵、およびセーバーの位置を通り過ぎて避けられた(見逃した)敵を配列から削除
        .filter((e) => !isDead(e) && e.position.z < SABER_TIP_POSITION.z + MISS_Z_OFFSET),
    );
  });

  // Joy-Conの振り検出 → 攻撃判定
  useEffect(() => {
    if (!isJoyConConnected) return;
    if (swing.swingId === lastSwingIdRef.current) return;
    lastSwingIdRef.current = swing.swingId;

    const hitEnemy = checkHit(SABER_TIP_POSITION, swing.swingPower, enemies);
    if (!hitEnemy) return;

    const damage = calculateDamage(swing.swingPower);
    const now = performance.now();

    setEnemies((prev) => prev.map((e) => (e.id === hitEnemy.id ? applyDamage(e, damage) : e)));
    setCombo((prev) => {
      const next = registerHit(prev, now);
      return { ...next, score: addScore(prev.score, next.combo) };
    });
  }, [swing.swingId, swing.swingPower, isJoyConConnected, enemies]);

  useEffect(() => {
    onStateChange(enemies, combo);
  }, [enemies, combo, onStateChange]);

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
  const [hudCombo, setHudCombo] = useState<ComboState>(createInitialComboState());

  return (
    <div className="relative w-full h-[70vh] min-h-[500px]">
      <Canvas camera={{ position: [0, 1.5, 2], fov: 75 }}>
        <GameLoop
          joyConState={joyCon.state}
          isJoyConConnected={joyCon.isConnected}
          onStateChange={(_enemies, combo) => {
            setHudCombo(combo);
          }}
        />
      </Canvas>
      <div className="absolute inset-0 pointer-events-none">
        <BattleHUD combo={hudCombo.combo} score={hudCombo.score} />
      </div>
    </div>
  );
}
