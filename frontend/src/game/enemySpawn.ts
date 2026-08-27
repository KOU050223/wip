// enemySpawn.ts
// 敵出現ロジック(ターン制バトル用)

import { Vector3 } from "three";
import type { Enemy, SwingDirection } from "./types";

let enemyIdCounter = 0;

const SWING_DIRECTIONS: SwingDirection[] = ["up", "down", "left", "right"];

export function randomDirection(): SwingDirection {
  return SWING_DIRECTIONS[Math.floor(Math.random() * SWING_DIRECTIONS.length)];
}

/**
 * 敵を1体生成する。ターン制なので固定位置に出現し、切るべき方向をランダムに割り当てる。
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
  };
}
