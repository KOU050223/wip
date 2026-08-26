// combo.ts
// コンボ管理ロジック

import type{ ComboState } from "./types";

const COMBO_RESET_MS = 1500; // この時間ヒットがないとコンボが切れる

export function createInitialComboState(): ComboState {
return { combo: 0, score: 0, lastHitAt: 0 };
}

/**
 * 命中時に呼ぶ。前回のヒットからCOMBO_RESET_MS以内ならコンボ継続、それ以外は1にリセット。
 * スコア加算はscore.tsのcalculateScoreに委ねる想定なので、ここではcomboの更新のみ返す。
 */
export function registerHit(state: ComboState, now: number): ComboState {
const isComboContinued = now - state.lastHitAt <= COMBO_RESET_MS;
const nextCombo = isComboContinued ? state.combo + 1 : 1;

return {
    ...state,
    combo: nextCombo,
    lastHitAt: now,
};
}

/**
 * ゲームループ側で定期的に呼び、コンボ切れをチェックする。
 * 切れた場合は呼び出し側で comboReset イベントを発火するとよい。
 */
export function checkComboTimeout(state: ComboState, now: number): ComboState {
if (state.combo > 0 && now - state.lastHitAt > COMBO_RESET_MS) {
    return { ...state, combo: 0 };
}
return state;
}

export function resetCombo(state: ComboState): ComboState {
return { ...state, combo: 0 };
}