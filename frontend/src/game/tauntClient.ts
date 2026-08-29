export type TauntContext = {
  trigger: "enemyAppeared";
  playerHpPercent: number;
  isBoss: boolean;
  recentPhrases?: string[];
  opponentView?: string;
};

type TauntResponse = { phrase?: unknown };

const FALLBACK_PHRASE = "がんばりすぎだよぉ。少しだけ、ここで休んでいきな？";
// 開発時はViteが /ai をWorkers AI (8787) へ中継する。環境変数のAPIホストを使うと
// LAN上の別IPを直接参照してしまい、HTTPSのVR画面から台詞生成だけが失敗する。
const AI_ENDPOINT = "/ai/taunt";

function normalizePhrase(value: string): string {
  const phrase = value.trim();
  return phrase.startsWith("「") && phrase.endsWith("」") ? phrase.slice(1, -1).trim() : phrase;
}

function logTaunt(phrase: string): string {
  console.log("[enemy taunt]", phrase);
  return phrase;
}

export async function requestTaunt(
  context: TauntContext,
  fetchImplementation: typeof fetch = fetch,
): Promise<string> {
  try {
    const response = await fetchImplementation(AI_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(context),
    });
    if (!response.ok) return logTaunt(FALLBACK_PHRASE);

    const body = (await response.json()) as TauntResponse;
    return logTaunt(
      typeof body.phrase === "string" && body.phrase.trim()
        ? normalizePhrase(body.phrase)
        : FALLBACK_PHRASE,
    );
  } catch {
    return logTaunt(FALLBACK_PHRASE);
  }
}
