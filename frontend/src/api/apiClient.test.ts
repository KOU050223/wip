import { describe, expect, it } from "vitest";

import { createApiClient } from "./apiClient";

describe("apiClient", () => {
  it("throws an ApiError with the API error message for a non-success response", async () => {
    const apiClient = createApiClient(
      async () =>
        new Response(JSON.stringify({ error: "player_name is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
    );

    await expect(apiClient("/api/scores", { method: "POST" })).rejects.toMatchObject({
      data: { error: "player_name is required" },
      message: "player_name is required",
      name: "ApiError",
      status: 400,
    });
  });
});
