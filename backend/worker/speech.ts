const MODEL = "@cf/myshell-ai/melotts";

function hasAudio(value: unknown): value is { audio: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "audio" in value &&
    typeof value.audio === "string"
  );
}

export async function createSpeech(request: Request, ai: Ai): Promise<Response> {
  let body: { text?: unknown };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON形式の本文を指定してください。" }, { status: 400 });
  }

  if (typeof body.text !== "string" || body.text.trim() === "") {
    return Response.json({ error: "textには空でない文字列を指定してください。" }, { status: 400 });
  }

  let result: unknown;
  try {
    result = await ai.run(MODEL, { prompt: body.text, lang: "ja" });
  } catch {
    try {
      result = await ai.run(MODEL, { prompt: body.text, lang: "ja" });
    } catch {
      return Response.json(
        { error: "音声生成サービスが一時的に利用できません。" },
        { status: 503 },
      );
    }
  }

  if (!hasAudio(result)) {
    throw new Error("Workers AI returned an unexpected speech response.");
  }

  const binary = atob(result.audio);
  const audio = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new Response(audio, { headers: { "Content-Type": "audio/wav" } });
}
