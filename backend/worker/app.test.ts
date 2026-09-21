import { describe, expect, it, vi } from "vitest";

import { createApp } from "./app";

const env = {
  CORS_ALLOW_ORIGINS: "https://game.example",
} as unknown as Env;

describe("createApp", () => {
  it("answers an allowed AI preflight request without forwarding it to the container", async () => {
    const fetchBackend = vi.fn();
    const app = createApp(fetchBackend);

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
    expect(fetchBackend).not.toHaveBeenCalled();
  });

  it("keeps an unlisted local origin from reaching the container during AI preflight", async () => {
    const fetchBackend = vi.fn();
    const app = createApp(fetchBackend);

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
    expect(fetchBackend).not.toHaveBeenCalled();
  });

  it("forwards non-AI requests to the Go handler", async () => {
    const fetchBackend = vi.fn().mockResolvedValue(new Response("from go handler"));
    const app = createApp(fetchBackend);

    const response = await app.request("https://api.example/api/rankings", {}, env);

    await expect(response.text()).resolves.toBe("from go handler");
    expect(fetchBackend).toHaveBeenCalledTimes(1);
  });

  describe("ワイルドカードのオリジン", () => {
    // Workers のプレビューURLはデプロイごとにホスト名が変わるため、
    // 列挙ではなくサブドメインのパターンで許可する。
    const wildcardEnv = {
      CORS_ALLOW_ORIGINS: "https://wip-frontend.uomi.dev,https://*.uozumi05.workers.dev",
    } as unknown as Env;

    const preflight = (origin: string) =>
      createApp(vi.fn()).request(
        "https://api.example/ai/taunt",
        {
          method: "OPTIONS",
          headers: { Origin: origin, "Access-Control-Request-Method": "POST" },
        },
        wildcardEnv,
      );

    it.each([
      ["プレビューURL", "https://036c9650-wip-frontend.uozumi05.workers.dev"],
      ["本番のカスタムドメイン", "https://wip-frontend.uomi.dev"],
    ])("%s を許可する", async (_name, origin) => {
      const response = await preflight(origin);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    });

    it.each([
      ["未登録のドメイン", "https://evil.example.com"],
      ["サフィックスを装ったドメイン", "https://wip-frontend.uozumi05.workers.dev.evil.com"],
      ["部分一致を狙ったドメイン", "https://evil-uozumi05.workers.dev"],
      ["スキームが違う", "http://wip-frontend.uomi.dev"],
    ])("%s を拒否する", async (_name, origin) => {
      const response = await preflight(origin);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });
  });
});
