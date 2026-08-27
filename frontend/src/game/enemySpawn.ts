// enemySpawn.ts
// 敵出現ロジック(ターン制バトル用)

import { Vector3 } from "three";
import type { Enemy, SwingDirection } from "./types";

let enemyIdCounter = 0;

const SWING_DIRECTIONS: SwingDirection[] = ["up", "down", "left", "right"];

// 通常敵として使うモデル(ラスボス用のDV.glbは含めない)
const ENEMY_MODEL_PATHS = [
  "/models/food.glb",
  "/models/gamema.glb",
  "/models/hitonoakui.glb",
  "/models/sabori.glb",
  "/models/suima.glb",
];

export function randomDirection(): SwingDirection {
  return SWING_DIRECTIONS[Math.floor(Math.random() * SWING_DIRECTIONS.length)];
}

export function randomEnemyModel(): string {
  return ENEMY_MODEL_PATHS[Math.floor(Math.random() * ENEMY_MODEL_PATHS.length)];
}

/**
 * 敵を1体生成する。ターン制なので固定位置に出現し、切るべき方向・表示モデルをランダムに割り当てる。
 */
export function spawnEnemy(position: Vector3, options?: { maxHp?: number }): Enemy {
  const maxHp = options?.maxHp ?? 500;

  return {
    id: `enemy-${enemyIdCounter++}`,
    position,
    hp: maxHp,
    maxHp,
    state: "idle",
    spawnedAt: performance.now(),
    requiredDirection: randomDirection(),
    modelPath: randomEnemyModel(),
  };
}
