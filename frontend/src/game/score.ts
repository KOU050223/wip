// score.ts
// スコア計算ロジック

const BASE_SCORE = 100;
const COMBO_BONUS_RATE = 0.1; // コンボ1につき+10%

/**
 * 現在のコンボ数から、今回のヒットで加算するスコアを計算する。
 */
export function calculateHitScore(combo: number): number {
  const comboMultiplier = 1 + Math.max(combo - 1, 0) * COMBO_BONUS_RATE;
  return Math.round(BASE_SCORE * comboMultiplier);
}

/**
 * スコアを加算した新しい合計値を返す。
 */
export function addScore(currentScore: number, combo: number): number {
return currentScore + calculateHitScore(combo);
}