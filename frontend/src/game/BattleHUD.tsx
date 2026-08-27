// BattleHUD.tsx
// 戦闘ロジックUI(HUD)のモック実装
// 今はモックデータで表示のみ。後で実際のenemy.ts/combo.ts/score.tsの状態と接続する想定。

import React from "react";

type BattleHUDProps = {
hp?: number;
maxHp?: number;
combo: number;
score: number;
  timeRemaining?: number; // 秒
};

export default function BattleHUD({
hp = 100,
maxHp = 100,
combo,
score,
timeRemaining = 0,
}: BattleHUDProps) {
const state = { hp, maxHp, combo, score, timeRemaining };

  const hpPercent = Math.round((state.hp / state.maxHp) * 100);
const minutes = Math.floor(state.timeRemaining / 60);
const seconds = state.timeRemaining % 60;

return (
    <div className="w-full h-full min-h-[400px] bg-neutral-950 text-white p-6 flex flex-col justify-between font-sans select-none">
      {/* 上段: HP・残り時間 */}
    <div className="flex items-start justify-between">
        <div className="w-64">
        <div className="text-xs tracking-widest text-neutral-400 mb-1">HP</div>
        <div className="h-3 bg-neutral-800 rounded-full overflow-hidden border border-neutral-700">
            <div
            className={`h-full transition-all duration-300 ${
                hpPercent > 50
                ? "bg-emerald-400"
                : hpPercent > 20
                ? "bg-amber-400"
                : "bg-red-500"
            }`}
            style={{ width: `${hpPercent}%` }}
            />
        </div>
        <div className="text-xs text-neutral-400 mt-1">
            {state.hp} / {state.maxHp}
        </div>
        </div>

        <div className="text-right">
        <div className="text-xs tracking-widest text-neutral-400 mb-1">TIME</div>
        <div className="text-2xl font-mono tabular-nums">
            {minutes}:{seconds.toString().padStart(2, "0")}
        </div>
        </div>
    </div>

      {/* 中段: コンボ表示(演出はUI担当が後で拡張する前提の最小版) */}
    <div className="flex-1 flex items-center justify-center">
        {state.combo > 0 && (
        <div className="text-center">
            <div className="text-6xl font-extrabold italic tracking-tight text-amber-300 drop-shadow-[0_0_12px_rgba(252,211,77,0.5)]">
            {state.combo}
            </div>
            <div className="text-sm tracking-[0.3em] text-neutral-300 mt-1">
            COMBO
            </div>
        </div>
        )}
    </div>

      {/* 下段: スコア */}
    <div className="flex justify-end">
        <div className="text-right">
        <div className="text-xs tracking-widest text-neutral-400 mb-1">SCORE</div>
        <div className="text-3xl font-mono tabular-nums">
            {state.score.toLocaleString()}
        </div>
        </div>
    </div>
    </div>
);
}