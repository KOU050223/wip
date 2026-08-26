// enemySpawn.ts
// 敵出現ロジック

import { Vector3 } from "three";
import type { Enemy } from "./types";

let enemyIdCounter = 0;

/**
 * 敵を1体生成する。最初はスポーン位置を固定/ランダム範囲から選ぶだけのシンプル実装。
 * 将来的にウェーブ制やスポーンパターンを追加する場合はここを拡張する。
 */
export function spawnEnemy(
  position: Vector3,
  options?: { maxHp?: number; hitRadius?: number },
): Enemy {
  const maxHp = options?.maxHp ?? 1; // 最初はHP=1で「1発で倒せる」構成

  return {
    id: `enemy-${enemyIdCounter++}`,
    position,
    hp: maxHp,
    maxHp,
    state: "idle",
    spawnedAt: performance.now(),
    hitRadius: options?.hitRadius ?? 0.5,
  };
}

/**
 * 一定間隔で敵を出現させるためのシンプルなスポーナー。
 * ゲームループ側で毎フレーム呼び、trueが返ったタイミングでspawnEnemyを呼ぶ想定。
 */
export function createSpawnTimer(intervalMs: number) {
  let lastSpawnAt = 0;

  return function shouldSpawn(now: number): boolean {
    if (now - lastSpawnAt >= intervalMs) {
      lastSpawnAt = now;
      return true;
    }
    return false;
  };
}

/**
 * ランダムなスポーン位置を返すヘルパー(円形範囲内)。
 */
export function randomSpawnPosition(radius: number, y: number = 0): Vector3 {
  const angle = Math.random() * Math.PI * 2;
  const r = Math.random() * radius;
  return new Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r);
}
