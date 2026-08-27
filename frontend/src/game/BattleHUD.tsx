// BattleHUD.tsx
// 戦闘ロジックUI(HUD)のモック実装
// 今はモックデータで表示のみ。後で実際のenemy.ts/combo.ts/score.tsの状態と接続する想定。

type BattleHUDProps = {
  hp?: number;
  maxHp?: number;
  combo: number;
  score: number;
  timeRemaining?: number; // 秒
};

function HudCorner({ className }: { className: string }) {
  return <div className={`absolute h-6 w-6 border-cyan-400/50 ${className}`} />;
}

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
    <div className="relative flex h-full min-h-[400px] w-full flex-col justify-between p-6 font-display text-cyan-50 select-none">
      <HudCorner className="top-3 left-3 border-t-2 border-l-2" />
      <HudCorner className="top-3 right-3 border-t-2 border-r-2" />
      <HudCorner className="bottom-3 left-3 border-b-2 border-l-2" />
      <HudCorner className="right-3 bottom-3 border-r-2 border-b-2" />

      {/* 上段: HP・残り時間 */}
      <div className="flex items-start justify-between">
        <div className="w-64">
          <div className="mb-1 text-xs tracking-widest text-cyan-400/70">HP</div>
          <div className="h-3 overflow-hidden rounded-full border border-cyan-400/30 bg-slate-900/60 shadow-[0_0_8px_rgba(76,201,240,0.15)]">
            <div
              className={`h-full transition-all duration-300 ${
                hpPercent > 50 ? "bg-emerald-400" : hpPercent > 20 ? "bg-amber-400" : "bg-red-500"
              }`}
              style={{ width: `${hpPercent}%` }}
            />
          </div>
          <div className="mt-1 text-xs text-cyan-400/70">
            {state.hp} / {state.maxHp}
          </div>
        </div>

        <div className="text-right">
          <div className="mb-1 text-xs tracking-widest text-cyan-400/70">TIME</div>
          <div className="text-2xl tabular-nums text-cyan-100 drop-shadow-[0_0_10px_rgba(76,201,240,0.6)]">
            {minutes}:{seconds.toString().padStart(2, "0")}
          </div>
        </div>
      </div>

      {/* 中段: コンボ表示(演出はUI担当が後で拡張する前提の最小版) */}
      <div className="flex flex-1 items-center justify-center">
        {state.combo > 0 && (
          <div className="text-center">
            <div className="text-6xl font-extrabold tracking-tight text-amber-300 italic drop-shadow-[0_0_12px_rgba(252,211,77,0.5)]">
              {state.combo}
            </div>
            <div className="mt-1 text-sm tracking-[0.3em] text-amber-200/80">COMBO</div>
          </div>
        )}
      </div>

      {/* 下段: スコア */}
      <div className="flex justify-end">
        <div className="text-right">
          <div className="mb-1 text-xs tracking-widest text-cyan-400/70">SCORE</div>
          <div className="text-3xl tabular-nums text-cyan-100 drop-shadow-[0_0_10px_rgba(76,201,240,0.6)]">
            {state.score.toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}
