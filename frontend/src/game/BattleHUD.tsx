// BattleHUD.tsx
// 戦闘ロジックUI(HUD)。ターン制バトルの状態(自分/敵のHP・コンボ・スコア・手番)を表示する。

type BattlePhase = "playerTurn" | "enemyTurn";

type BattleHUDProps = {
  hp?: number;
  maxHp?: number;
  combo: number;
  score: number;
  enemyHp: number;
  enemyMaxHp: number;
  phase: BattlePhase;
};

function HudCorner({ className }: { className: string }) {
  return <div className={`absolute h-6 w-6 border-cyan-400/50 ${className}`} />;
}

export default function BattleHUD({
  hp = 100,
  maxHp = 100,
  combo,
  score,
  enemyHp,
  enemyMaxHp,
  phase,
}: BattleHUDProps) {
  const hpPercent = Math.round((hp / maxHp) * 100);
  const enemyHpPercent = Math.round((enemyHp / enemyMaxHp) * 100);

  return (
    <div className="relative flex h-full min-h-[400px] w-full flex-col justify-between p-6 font-display text-cyan-50 select-none">
      <HudCorner className="top-3 left-3 border-t-2 border-l-2" />
      <HudCorner className="top-3 right-3 border-t-2 border-r-2" />
      <HudCorner className="bottom-3 left-3 border-b-2 border-l-2" />
      <HudCorner className="right-3 bottom-3 border-r-2 border-b-2" />

      {/* 上段: 自分のHP・敵のHP */}
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
            {hp} / {maxHp}
          </div>
        </div>

        <div className="w-64 text-right">
          <div className="mb-1 text-xs tracking-widest text-cyan-400/70">ENEMY</div>
          <div className="h-3 overflow-hidden rounded-full border border-cyan-400/30 bg-slate-900/60 shadow-[0_0_8px_rgba(76,201,240,0.15)]">
            <div
              className="ml-auto h-full bg-purple-400 transition-all duration-300"
              style={{ width: `${enemyHpPercent}%` }}
            />
          </div>
          <div className="mt-1 text-xs text-cyan-400/70">
            {enemyHp} / {enemyMaxHp}
          </div>
        </div>
      </div>

      {/* 中段: 手番表示・コンボ表示 */}
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <div
          className={`text-sm tracking-[0.4em] ${
            phase === "playerTurn" ? "text-cyan-300" : "text-red-400"
          }`}
        >
          {phase === "playerTurn" ? "YOUR TURN" : "ENEMY TURN"}
        </div>
        {combo > 0 && (
          <div className="text-center">
            <div className="text-6xl font-extrabold tracking-tight text-amber-300 italic drop-shadow-[0_0_12px_rgba(252,211,77,0.5)]">
              {combo}
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
            {score.toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}
