import { describe, expect, it, vi } from "vitest";

import { createApp } from "./app";

const env = {
  CORS_ALLOW_ORIGINS: "https://game.example",
} as Env;

describe("createApp", () => {
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
