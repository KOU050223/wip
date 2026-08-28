export type TauntContext = {
  trigger: "enemyAppeared";
  playerHpPercent: number;
  isBoss: boolean;
  recentPhrases?: string[];
};

type TauntResponse = { phrase?: unknown };

const FALLBACK_PHRASE = "がんばりすぎだよぉ。少しだけ、ここで休んでいきな？";
const AI_ENDPOINT = `${import.meta.env.VITE_API_BASE_URL ?? ""}/ai/taunt`;

function normalizePhrase(value: string): string {
  const phrase = value.trim();
  return phrase.startsWith("「") && phrase.endsWith("」") ? phrase.slice(1, -1).trim() : phrase;
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
    if (!response.ok) return FALLBACK_PHRASE;

    const body = (await response.json()) as TauntResponse;
    console.log("taunt response body:", body.phrase);
    return typeof body.phrase === "string" && body.phrase.trim()
      ? normalizePhrase(body.phrase)
      : FALLBACK_PHRASE;
  } catch {
    return FALLBACK_PHRASE;
  }
}
