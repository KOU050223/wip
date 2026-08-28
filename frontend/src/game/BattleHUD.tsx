// BattleHUD.tsx
// 戦闘ロジックUI(HUD)。ターン制バトルの状態(自分/敵のHP・コンボ・スコア・手番)を表示する。

type BattlePhase = "playerTurn" | "enemyTurn";
type DefenseButton = "a" | "b" | "x" | "y" | "r" | "zr";

const DEFENSE_BUTTON_LABELS: Record<DefenseButton, string> = {
  a: "A",
  b: "B",
  x: "X",
  y: "Y",
  r: "R",
  zr: "ZR",
};

type BattleHUDProps = {
  hp?: number;
  maxHp?: number;
  combo: number;
  score: number;
  enemyName?: string;
  enemyHp: number;
  enemyMaxHp: number;
  phase: BattlePhase;
  defenseButton: DefenseButton;
  isBoss?: boolean;
  taunt?: string;
};

function HudCorner({ className, isBoss }: { className: string; isBoss: boolean }) {
  return (
    <div
      className={`absolute h-6 w-6 ${isBoss ? "border-red-500/60" : "border-cyan-400/50"} ${className}`}
    />
  );
}

export default function BattleHUD({
  hp = 100,
  maxHp = 100,
  combo,
  score,
  enemyName = "ENEMY",
  enemyHp,
  enemyMaxHp,
  phase,
  defenseButton,
  isBoss = false,
  taunt = "",
}: BattleHUDProps) {
  const hpPercent = Math.round((hp / maxHp) * 100);
  const enemyHpPercent = Math.round((enemyHp / enemyMaxHp) * 100);

  return (
    <div className="relative flex h-full min-h-[400px] w-full flex-col justify-between p-6 font-display text-cyan-50 select-none">
      <HudCorner className="top-3 left-3 border-t-2 border-l-2" isBoss={isBoss} />
      <HudCorner className="top-3 right-3 border-t-2 border-r-2" isBoss={isBoss} />
      <HudCorner className="bottom-3 left-3 border-b-2 border-l-2" isBoss={isBoss} />
      <HudCorner className="right-3 bottom-3 border-r-2 border-b-2" isBoss={isBoss} />

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
          <div
            className={`mb-1 text-xs tracking-widest ${isBoss ? "text-red-400/80" : "text-cyan-400/70"}`}
          >
            {enemyName}
          </div>
          <div
            className={`h-3 overflow-hidden rounded-full border transition-colors duration-500 ${
              isBoss
                ? "border-red-500/40 bg-slate-900/60 shadow-[0_0_10px_rgba(239,68,68,0.25)]"
                : "border-cyan-400/30 bg-slate-900/60 shadow-[0_0_8px_rgba(76,201,240,0.15)]"
            }`}
          >
            <div
              className={`ml-auto h-full transition-all duration-300 ${isBoss ? "bg-red-500" : "bg-purple-400"}`}
              style={{ width: `${enemyHpPercent}%` }}
            />
          </div>
          <div className={`mt-1 text-xs ${isBoss ? "text-red-400/80" : "text-cyan-400/70"}`}>
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
        {taunt && (
          <div
            aria-live="polite"
            className={`max-w-md text-center text-lg tracking-wide drop-shadow-[0_0_12px_rgba(0,0,0,0.9)] ${
              isBoss ? "text-red-200" : "text-purple-200"
            }`}
          >
            「{taunt}」
          </div>
        )}
        {phase === "playerTurn" && combo > 0 && (
          <div className="text-center">
            <div className="text-6xl font-extrabold tracking-tight text-amber-300 italic drop-shadow-[0_0_12px_rgba(252,211,77,0.5)]">
              {combo}
            </div>
            <div className="mt-1 text-sm tracking-[0.3em] text-amber-200/80">COMBO</div>
          </div>
        )}
        {phase === "enemyTurn" && (
          <div className="flex flex-col items-center gap-2">
            <div
              className={`text-xs tracking-widest ${isBoss ? "text-red-400" : "text-red-300/80"}`}
            >
              PRESS TO GUARD
            </div>
            <div
              className={`flex animate-pulse items-center justify-center rounded-full font-extrabold ${
                isBoss
                  ? "h-24 w-24 border-4 border-red-500 bg-red-950/80 text-4xl text-red-100 shadow-[0_0_35px_rgba(239,68,68,0.8)]"
                  : "h-20 w-20 border-4 border-red-400/70 bg-slate-900/80 text-3xl text-red-200 shadow-[0_0_20px_rgba(248,113,113,0.5)]"
              }`}
            >
              {DEFENSE_BUTTON_LABELS[defenseButton]}
            </div>
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
