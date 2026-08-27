// attackDetection.ts
// 攻撃判定ロジック
// 方針: Joy-Conの振り方向は取得しない。「強さ・タイミング」のみで判定する(案A: 近接判定)。

import { Vector3 } from "three";
import type { Enemy } from "./types";

export const SWING_POWER_THRESHOLD = 1.2; // Joy-Conの振り強度の閾値(要チューニング)

/**
 * セーバー先端の位置と振り強度から、命中した敵を判定する。
 * 「セーバー位置が敵の当たり判定内(Bounding Sphere) かつ 振り強度が閾値超え」で命中とする。
 * 複数の敵が同時に範囲内にいる場合は、最も近い敵を優先する。
 */
export function checkHit(
  saberTipPosition: Vector3,
  swingPower: number,
  enemies: Enemy[],
): Enemy | null {
  if (swingPower < SWING_POWER_THRESHOLD) return null;

  let closest: Enemy | null = null;
  let closestDistance = Infinity;

  for (const enemy of enemies) {
    if (enemy.state !== "idle") continue;
    const distance = saberTipPosition.distanceTo(enemy.position);
    if (distance <= enemy.hitRadius && distance < closestDistance) {
      closest = enemy;
      closestDistance = distance;
    }
  }

  return closest;
}

/**
 * 振り強度から与ダメージを算出する。
 * 最初は固定ダメージでよいが、強く振るほどダメージが増える形にも拡張できる。
 */
export function calculateDamage(_swingPower: number, baseDamage: number = 1): number {
  return baseDamage;
  // 拡張例: return Math.round(baseDamage * Math.min(swingPower / SWING_POWER_THRESHOLD, 2));
}
