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
      target: "src/api/generated/client.ts",
      schemas: "src/api/generated/models",
      baseUrl: {
        runtime: 'import.meta.env.VITE_API_BASE_URL ?? ""',
      },
      override: {
        fetch: {
          includeHttpResponseReturnType: false,
        },
        mutator: {
          path: "./src/api/apiClient.ts",
          name: "apiClient",
        },
      },
    },
    hooks: {
      afterAllFilesWrite: "oxfmt",
    },
  },
});
