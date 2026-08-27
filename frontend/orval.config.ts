import { defineConfig } from "orval";

export default defineConfig({
  scoreApi: {
    input: {
      target: "../backend/docs/swagger.yaml",
    },
    output: {
      client: "react-query",
      httpClient: "fetch",
      mode: "tags-split",
      target: "src/api/generated/scores.ts",
      schemas: "src/api/generated/model",
      baseUrl: {
        runtime: 'import.meta.env.VITE_API_BASE_URL ?? ""',
      },
    },
    hooks: {
      afterAllFilesWrite: "oxfmt",
    },
  },
});
