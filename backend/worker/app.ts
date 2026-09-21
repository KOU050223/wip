import { Hono } from "hono";
import { cors } from "hono/cors";

import { createTaunt } from "./taunt";

// Hono が公開する ExecutionContext は Workers の型と定義が異なるため、
// 生成物へ渡す際は unknown を経由する。
type FetchBackend = (request: Request, env: Env, ctx: unknown) => Promise<Response>;

function allowedCors(origin: string | undefined, env: Env) {
  if (!origin || !env.CORS_ALLOW_ORIGINS.split(",").includes(origin)) return undefined;
  return cors({
    origin,
    allowHeaders: ["Content-Type"],
    allowMethods: ["POST", "OPTIONS"],
  });
}

export function createApp(fetchBackend: FetchBackend) {
  const app = new Hono<{ Bindings: Env }>();

  
  app.use("/ai/*", async (c, next) => {
    const middleware = allowedCors(c.req.header("Origin"), c.env);
    return middleware ? middleware(c, next) : next();
  });

  // Viteの同一オリジンプロキシ経由ではCORSヘッダーを返す必要はないが、
  // preflightをGo側へ流さずここで終端する。
  app.options("/ai/*", (c) => c.body(null, 204));
  app.post("/ai/taunt", (c) => createTaunt(c.req.raw, c.env.AI));
  
  // /ai/* 以外のリクエストは Go/Wasm のハンドラに委譲する。
  // c.executionCtx はテストなど ExecutionContext のない実行環境では
  // 例外を投げるため、取得できないときは undefined を渡す。
  app.all("*", (c) => {
    let executionCtx: unknown;
    try {
      executionCtx = c.executionCtx;
    } catch {
      executionCtx = undefined;
    }
    return fetchBackend(c.req.raw, c.env, executionCtx);
  });

  return app;
}
