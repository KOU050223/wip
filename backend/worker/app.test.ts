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
});
