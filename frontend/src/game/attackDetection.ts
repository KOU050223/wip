// attackDetection.ts
// 攻撃判定ロジック(ターン制バトル用)
// 方針: Joy-Conの振り方向は取得する(useSwingDetection)が、位置による近接判定は行わない。
// ターン制では相手は常に1体・目の前にいるため、「振り強度が閾値を超えているか」「方向が一致しているか」だけで判定する。

export const SWING_POWER_THRESHOLD = 1.2; // Joy-Conの振り強度の閾値(要チューニング)

/**
 * 振り強度から与ダメージを算出する。
 * ターン制では基本的にbaseDamageをそのまま返す(固定ダメージ)想定。
 */
export function calculateDamage(_swingPower: number, baseDamage: number = 1): number {
  return baseDamage;
  // 拡張例: return Math.round(baseDamage * Math.min(swingPower / SWING_POWER_THRESHOLD, 2));
}
