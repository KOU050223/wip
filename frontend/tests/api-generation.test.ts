import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = resolve(import.meta.dirname, "..");

describe("OpenAPI Hooks generation", () => {
  it("uses the backend OpenAPI document and exposes a generation command", () => {
    const packageJson = JSON.parse(readFileSync(resolve(frontendRoot, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    const configPath = resolve(frontendRoot, "orval.config.ts");

    expect(packageJson.scripts?.["generate:api"]).toBeDefined();
    expect(existsSync(configPath)).toBe(true);

    const config = readFileSync(configPath, "utf8");
    expect(config).toContain("../backend/docs/swagger.yaml");
    expect(config).toContain('client: "react-query"');
    expect(config).toContain('httpClient: "fetch"');
    expect(config).toContain("afterAllFilesWrite");
  });
});
