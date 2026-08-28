import { describe, expect, it, vi } from "vitest";

import { requestSpeech, speechEndpoint } from "./speechClient";

describe("requestSpeech", () => {
  it("sends the taunt text to the speech endpoint and returns its MP3 blob", async () => {
    const audio = new Blob(["audio bytes"], { type: "audio/mpeg" });
    const fetchImplementation = vi.fn().mockResolvedValue(new Response(audio, { status: 200 }));

    await expect(requestSpeech("休んでいきな？", fetchImplementation)).resolves.toEqual(audio);

    expect(fetchImplementation).toHaveBeenCalledWith(
      "/ai/speech",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "休んでいきな？" }),
      },
    );
  });

  it("uses Vite's same-origin proxy during local development", () => {
    expect(speechEndpoint(true)).toBe("/ai/speech");
  });

  it("returns null when speech generation is unavailable", async () => {
    const fetchImplementation = vi.fn().mockRejectedValue(new Error("offline"));

    await expect(requestSpeech("休んでいきな？", fetchImplementation)).resolves.toBeNull();
  });
});
