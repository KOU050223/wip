import { describe, expect, it, vi } from "vitest";

import { createApp } from "./app";

const env = {
  CORS_ALLOW_ORIGINS: "https://game.example",
} as unknown as Env;

describe("createApp", () => {
  it("generates Japanese speech as a WAV response", async () => {
    const ai = {
      run: vi.fn().mockResolvedValue({ audio: "YXVkaW8gYnl0ZXM=" }),
    } as unknown as Ai;
    const fetchContainer = vi.fn();
    const app = createApp(fetchContainer);

    const response = await app.request(
      "https://api.example/ai/speech",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "こんにちは、Workers AIです。" }),
      },
      { ...env, AI: ai },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("audio/wav");
    await expect(response.text()).resolves.toBe("audio bytes");
    expect(ai.run).toHaveBeenCalledWith(
      "@cf/myshell-ai/melotts",
      { prompt: "こんにちは、Workers AIです。", lang: "ja" },
    );
    expect(fetchContainer).not.toHaveBeenCalled();
  });

  it("retries speech generation once after a transient Workers AI failure", async () => {
    const ai = {
      run: vi
        .fn()
        .mockRejectedValueOnce(new Error("upstream unavailable"))
        .mockResolvedValueOnce({ audio: "YXVkaW8gYnl0ZXM=" }),
    } as unknown as Ai;
    const app = createApp(vi.fn());

    const response = await app.request(
      "https://api.example/ai/speech",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "もう一度試します。" }),
      },
      { ...env, AI: ai },
    );

    expect(response.status).toBe(200);
    expect(ai.run).toHaveBeenCalledTimes(2);
  });

  it("answers an allowed AI preflight request without forwarding it to the container", async () => {
    const fetchContainer = vi.fn();
    const app = createApp(fetchContainer);

    const response = await app.request(
      "https://api.example/ai/taunt",
      {
        method: "OPTIONS",
        headers: {
          Origin: "https://game.example",
          "Access-Control-Request-Method": "POST",
        },
      },
      env,
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://game.example");
    expect(fetchContainer).not.toHaveBeenCalled();
  });

  it("keeps an unlisted local origin from reaching the container during AI preflight", async () => {
    const fetchContainer = vi.fn();
    const app = createApp(fetchContainer);

    const response = await app.request(
      "https://api.example/ai/taunt",
      {
        method: "OPTIONS",
        headers: {
          Origin: "https://192.168.1.155:5173",
          "Access-Control-Request-Method": "POST",
        },
      },
      env,
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(fetchContainer).not.toHaveBeenCalled();
  });

  it("forwards non-AI requests to the existing container", async () => {
    const fetchContainer = vi.fn().mockResolvedValue(new Response("from container"));
    const app = createApp(fetchContainer);

    const response = await app.request("https://api.example/api/rankings", {}, env);

    await expect(response.text()).resolves.toBe("from container");
    expect(fetchContainer).toHaveBeenCalledTimes(1);
  });
});
