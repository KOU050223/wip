import { describe, expect, it } from "vitest";

import { createApiQueryClient } from "./queryClient";

describe("createApiQueryClient", () => {
  it("creates an isolated TanStack Query client", () => {
    const firstClient = createApiQueryClient();
    const secondClient = createApiQueryClient();

    expect(firstClient).not.toBe(secondClient);
    expect(firstClient.getQueryCache()).toBeDefined();
  });
});
