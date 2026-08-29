export type TauntContext = {
  trigger: "enemyAppeared";
  playerHpPercent: number;
  isBoss: boolean;
  recentPhrases?: string[];
  opponentView?: string;
};

type TauntResponse = { phrase?: unknown };

const FALLBACK_PHRASE = "がんばりすぎだよぉ。少しだけ、ここで休んでいきな？";
const TAUNT_PATH = "/ai/taunt";

// 開発時はAPIホスト未設定のため、Viteが同一オリジンの /ai を Workers AI (8787) へ中継する。
// 本番はフロントとバックエンドが別Workerなので、設定されたAPIホストへ送らないと
// 静的フロントのSPA HTMLをJSONとして読んでしまい、常にフォールバック台詞になる。
export function resolveTauntEndpoint(apiBaseURL?: string): string {
  return apiBaseURL ? new URL(TAUNT_PATH, apiBaseURL).toString() : TAUNT_PATH;
}

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
  endpoint: string = TAUNT_PATH,
): Promise<string> {
  try {
    const response = await fetchImplementation(endpoint, {
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
