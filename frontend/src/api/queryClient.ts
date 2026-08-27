import { QueryClient } from "@tanstack/react-query";

export function createApiQueryClient() {
  return new QueryClient();
}
