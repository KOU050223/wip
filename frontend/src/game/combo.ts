// combo.ts
// コンボ管理ロジック

import type { ComboState } from "./types";

export function createInitialComboState(): ComboState {
  return { combo: 0, score: 0, lastHitAt: 0 };
}

/**
 * 命中時に呼ぶ。時間経過では切れず、ダメージを受けるまでコンボは継続する。
 * スコア加算はscore.tsのcalculateScoreに委ねる想定なので、ここではcomboの更新のみ返す。
 */
export function registerHit(state: ComboState, now: number): ComboState {
  return {
    ...state,
    combo: state.combo + 1,
    lastHitAt: now,
  };
}

/**
 * プレイヤーがダメージを受けた時に呼ぶ。コンボを0にリセットする。
 */
export function resetCombo(state: ComboState): ComboState {
  return { ...state, combo: 0 };
}
