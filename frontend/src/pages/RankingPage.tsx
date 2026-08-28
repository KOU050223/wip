import { Link } from "react-router-dom";
import { useGetRankings } from "../api/generated/scores/scores";

const RANKING_LIMIT = 5;

function formatPlayedAt(value: string | undefined): string {
  if (!value) {
    return "-";
  }
  const playedAt = new Date(value);
  if (Number.isNaN(playedAt.getTime())) {
    return "-";
  }
  return playedAt.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function RankingPage() {
  const { data, isPending, isError, error } = useGetRankings({ limit: RANKING_LIMIT });
  const rankings = data?.rankings ?? [];

  return (
    <section className="min-h-screen flex flex-col items-center justify-center gap-12 px-6 text-center">
      <h1 className="title-flicker font-display text-3xl md:text-5xl tracking-[0.3em] text-cyan-200 drop-shadow-[0_0_20px_rgba(76,201,240,0.5)]">
        ランキング
      </h1>

      <div className="w-full max-w-2xl">
        {isPending ? (
          <p className="text-sm tracking-widest text-cyan-400/70">読み込み中...</p>
        ) : isError ? (
          <p className="text-sm text-red-300">{error.message}</p>
        ) : rankings.length === 0 ? (
          <p className="text-sm tracking-widest text-cyan-400/70">まだスコアがありません</p>
        ) : (
          <table className="w-full border-collapse text-cyan-100">
            <thead>
              <tr className="text-xs tracking-widest text-cyan-400/70 uppercase">
                <th className="border-b border-cyan-400/30 px-3 py-2 text-center">Rank</th>
                <th className="border-b border-cyan-400/30 px-3 py-2 text-left">Name</th>
                <th className="border-b border-cyan-400/30 px-3 py-2 text-right">Score</th>
                <th className="border-b border-cyan-400/30 px-3 py-2 text-right">Date</th>
              </tr>
            </thead>
            <tbody>
              {rankings.map((entry, index) => (
                <tr key={entry.id ?? index} className="transition-colors hover:bg-cyan-400/5">
                  <td className="border-b border-cyan-400/10 px-3 py-3 text-center font-display text-lg tabular-nums text-amber-300">
                    {index + 1}
                  </td>
                  <td className="border-b border-cyan-400/10 px-3 py-3 text-left">
                    {entry.player_name ?? "-"}
                  </td>
                  <td className="border-b border-cyan-400/10 px-3 py-3 text-right font-display tabular-nums drop-shadow-[0_0_10px_rgba(76,201,240,0.5)]">
                    {(entry.score ?? 0).toLocaleString()}
                  </td>
                  <td className="border-b border-cyan-400/10 px-3 py-3 text-right text-sm text-cyan-300/80 tabular-nums">
                    {formatPlayedAt(entry.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Link
        to="/"
        className="font-display px-10 py-3 border border-cyan-400/50 text-cyan-200 tracking-[0.3em] text-sm uppercase transition-colors hover:border-cyan-300 hover:bg-cyan-400/10 hover:text-white"
      >
        タイトルへ戻る
      </Link>
    </section>
  );
}

export default RankingPage;
