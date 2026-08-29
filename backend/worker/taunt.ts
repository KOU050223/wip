const MODEL = "@cf/google/gemma-4-26b-a4b-it";

type TauntContext = {
  trigger: "enemyAppeared";
  playerHpPercent: number;
  isBoss: boolean;
  recentPhrases?: string[];
  opponentView?: string;
};

type AiResponse = {
  choices?: { message?: { content?: unknown } }[];
};

const FALLBACK_PHRASE = "がんばりすぎだよぉ。少しだけ、ここで休んでいきな？";
const TEMPTATION_STYLES = [
  "眠りへ誘う休息の約束",
  "気になる通知を見せるスマホの誘惑",
  "あと一回だけ遊べるゲームの誘惑",
  "あたたかいご褒美を味わう食欲の誘惑",
  "なにもしなくていい怠ける幸福の誘惑",
  "失敗も心配も忘れられる安らぎの誘惑",
] as const;

export function gatewayOptions() {
  return {
    gateway: {
      // `default` は初回の認証済みリクエストで自動作成される。
      id: "default",
      collectLog: true,
      metadata: { feature: "enemy-taunt" },
    },
  } as const;
}

// `unknown` 型の値が `TauntContext` 型であるかを判定する。
function isTauntContext(value: unknown): value is TauntContext {
  if (typeof value !== "object" || value === null) return false;
  const context = value as Record<string, unknown>;
  return (
    context.trigger === "enemyAppeared" &&
    typeof context.playerHpPercent === "number" &&
    Number.isFinite(context.playerHpPercent) &&
    typeof context.isBoss === "boolean" &&
    (context.opponentView === undefined ||
      (typeof context.opponentView === "string" &&
        context.opponentView.startsWith("data:image/") &&
        context.opponentView.length <= 700_000)) &&
    (context.recentPhrases === undefined ||
      (Array.isArray(context.recentPhrases) &&
        context.recentPhrases.length <= 3 &&
        context.recentPhrases.every(
          (phrase) => typeof phrase === "string" && phrase.length <= 80,
        )))
  );
}

function sanitizePhrase(value: unknown): string {
  if (typeof value !== "string") return FALLBACK_PHRASE;
  const phrase = value.replaceAll(/[\r\n]+/g, " ").trim().slice(0, 80);
  return phrase || FALLBACK_PHRASE;
}

export function extractPhrase(response: AiResponse): string {
  return sanitizePhrase(response.choices?.[0]?.message?.content);
}

export function buildMessages(context: TauntContext, style: string) {
  const recentPhrases = context.recentPhrases?.length
    ? `直近の台詞: ${context.recentPhrases.map((phrase) => `「${phrase}」`).join("、")}`
    : "直近の台詞はない。";
  return [
    {
      role: "system" as const,
      content:
        "あなたは近未来剣戟ゲームの成人の小悪魔的な敵。被弾や弱さを煽る台詞ではない。プレイヤーが辛い現実を忘れたくなるよう、休息、楽しい遊び、ご褒美、安心できる居場所など、魅力的な逃避先を可愛く提案する。提案はゲーム世界の演出であり、現実の金銭、個人情報、実在サービスへの誘導はしない。台詞だけを1、2文、60文字以内で返す。ひらがな・〜は可愛さのアクセントとして使ってよいが、各一つまで。♥は最大一つ。性的な表現、身体への言及、未成年を示唆する表現、現実の人格否定は使わない。出力に「」や引用符を含めない。",
    },
    {
      role: "user" as const,
      content: `状況: ${context.isBoss ? "ボス" : "通常の敵"}が出現した。今回の誘惑: ${style}。${recentPhrases}。${context.opponentView ? "添付画像は敵の視点から見たプレイヤー。観測内容を台詞の主役にする。最初に、画像で確認できる鎧、ライトセーバー、構え、距離のいずれか一つを具体名で言及し、敵がそれをどう解釈したかを添える。その観測から自然に誘惑へつなげる。観測と無関係な夢・お菓子・休息だけの汎用台詞は禁止。見えない事実を断定しない。" : ""}直近の台詞と同じ書き出し・単語・比喩・語尾は使わず、言い換えも避ける。`,
    },
  ];
}

export function createVisionTauntRequest(context: TauntContext) {
  return {
    messages: buildMessages(context, chooseTauntStyle()),
    ...(context.opponentView ? { image: context.opponentView } : {}),
    max_tokens: 80,
    temperature: 0.9,
    chat_template_kwargs: { enable_thinking: false },
  };
}

function chooseTauntStyle(): string {
  return TEMPTATION_STYLES[Math.floor(Math.random() * TEMPTATION_STYLES.length)]!;
}

export async function createTaunt(request: Request, ai: Ai): Promise<Response> {
  let context: unknown;
  try {
    context = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!isTauntContext(context)) {
    return Response.json({ error: "invalid taunt context" }, { status: 400 });
  }

  const response = (await ai.run(MODEL, createVisionTauntRequest(context), gatewayOptions())) as AiResponse;

  return Response.json({ phrase: extractPhrase(response) });
}
