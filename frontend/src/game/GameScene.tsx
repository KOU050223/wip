// GameScene.tsx
// 「Joy-Conを振る → セーバーが振られる → 敵に当たる → 敵が消える」の最短ループ
//
// 前提:
// - useJoyCon() は既存のJoy-Con接続コードを想定したカスタムフック。
//   1振りごとに swingId がインクリメントされ、その時の swingPower が取れる形。
//   (実際のフックのインターフェースが違う場合はここだけ差し替えればOK)
// - 方向は取得しないため、セーバーの当たり判定は固定位置の近接判定(案A)。
// - 敵はまずは「静止したまま出現し、当たったら消える」だけの最小構成。

import React, { useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Vector3 } from "three";

import type { Enemy, ComboState } from "./types";
import { spawnEnemy, createSpawnTimer, randomSpawnPosition } from "./enemySpawn";
import { checkHit, calculateDamage } from "./attackDetection";
import { applyDamage, finalizeDeath, isDead } from "./hp";
import { createInitialComboState, registerHit, checkComboTimeout } from "./combo";
import { addScore } from "./score";
import BattleHUD from "./BattleHUD";

// ---- Joy-Conフックの想定インターフェース ----
// 実際のuseJoyConの返り値に合わせて調整してください。
type JoyConHookResult = {
  isConnected: boolean;
  swingPower: number; // 直近の振りの強さ
  swingId: number; // 振りが検出されるたびに増える(edge検出用)
};

declare function useJoyCon(): JoyConHookResult;

// セーバーの当たり判定の中心位置(方向を取らないので固定)
const SABER_HIT_POSITION = new Vector3(0, 1, -2);
const SPAWN_INTERVAL_MS = 3000;
const DYING_DURATION_MS = 300; // 死亡演出の表示時間

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

function SaberMarker() {
  // 当たり判定の範囲を目視確認するための仮表示(デバッグ用、後で見た目のセーバーに差し替え)
  return (
    <mesh position={SABER_HIT_POSITION}>
      <sphereGeometry args={[0.5, 16, 16]} />
      <meshBasicMaterial color="#ffffff" wireframe />
    </mesh>
  );
}

function GameLoop({
  onStateChange,
}: {
  onStateChange: (enemies: Enemy[], combo: ComboState) => void;
}) {
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const [combo, setCombo] = useState<ComboState>(createInitialComboState());
  const spawnTimerRef = useRef(createSpawnTimer(SPAWN_INTERVAL_MS));
  const lastSwingIdRef = useRef(0);
  const joyCon = useJoyCon();

  // 敵出現
  useFrame(() => {
    const now = performance.now();
    if (spawnTimerRef.current(now)) {
      // 方向を取らない前提なので、当たり判定位置の近くにスポーンさせる
      const offset = randomSpawnPosition(0.8, 1);
      const spawnPos = SABER_HIT_POSITION.clone().add(offset);
      setEnemies((prev) => [...prev, spawnEnemy(spawnPos)]);
    }

    // コンボのタイムアウトチェック
    setCombo((prev) => checkComboTimeout(prev, now));

    // dying状態の敵を一定時間後に配列から削除
    setEnemies((prev) =>
      prev
        .map((e) =>
          e.state === "dying" && now - e.spawnedAt > DYING_DURATION_MS
            ? finalizeDeath(e)
            : e
        )
        .filter((e) => !isDead(e))
    );
  });

  // Joy-Conの振り検出 → 攻撃判定
  useEffect(() => {
    if (!joyCon.isConnected) return;
    if (joyCon.swingId === lastSwingIdRef.current) return;
    lastSwingIdRef.current = joyCon.swingId;

    const hitEnemy = checkHit(SABER_HIT_POSITION, joyCon.swingPower, enemies);
    if (!hitEnemy) return;

    const damage = calculateDamage(joyCon.swingPower);
    const now = performance.now();

    setEnemies((prev) =>
      prev.map((e) => (e.id === hitEnemy.id ? applyDamage(e, damage) : e))
    );
    setCombo((prev) => {
      const next = registerHit(prev, now);
      return { ...next, score: addScore(prev.score, next.combo) };
    });
  }, [joyCon.swingId, joyCon.swingPower, joyCon.isConnected, enemies]);

  useEffect(() => {
    onStateChange(enemies, combo);
  }, [enemies, combo, onStateChange]);

  return (
    <>
      <ambientLight intensity={0.6} />
      <pointLight position={[2, 3, 2]} intensity={1} />
      <SaberMarker />
      {enemies.map((enemy) => (
        <EnemyMesh key={enemy.id} enemy={enemy} />
      ))}
    </>
  );
}

export default function GameScene() {
  const [hudEnemies, setHudEnemies] = useState<Enemy[]>([]);
  const [hudCombo, setHudCombo] = useState<ComboState>(createInitialComboState());

  return (
    <div className="relative w-full h-full min-h-[500px]">
      <Canvas camera={{ position: [0, 1.5, 2], fov: 60 }}>
        <GameLoop
          onStateChange={(enemies, combo) => {
            setHudEnemies(enemies);
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