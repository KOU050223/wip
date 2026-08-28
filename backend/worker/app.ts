import { Hono } from "hono";
import { cors } from "hono/cors";

import { createSpeech } from "./speech";
import { createTaunt } from "./taunt";

type FetchContainer = (request: Request, env: Env) => Promise<Response>;

function allowedCors(origin: string | undefined, env: Env) {
  if (!origin || !env.CORS_ALLOW_ORIGINS.split(",").includes(origin)) return undefined;
  return cors({
    origin,
    allowHeaders: ["Content-Type"],
    allowMethods: ["POST", "OPTIONS"],
  });
}

export function createApp(fetchContainer: FetchContainer) {
  const app = new Hono<{ Bindings: Env }>();

  
  app.use("/ai/*", async (c, next) => {
    const middleware = allowedCors(c.req.header("Origin"), c.env);
    return middleware ? middleware(c, next) : next();
  });

  // Viteの同一オリジンプロキシ経由ではCORSヘッダーを返す必要はないが、
  // preflightをContainerへ流さずここで終端する。
  app.options("/ai/*", (c) => c.body(null, 204));
  app.post("/ai/taunt", (c) => createTaunt(c.req.raw, c.env.AI));
  app.post("/ai/speech", (c) => createSpeech(c.req.raw, c.env.AI));
  
  // /ai/* 以外のリクエストは、コンテナに転送する
  app.all("*", (c) => fetchContainer(c.req.raw, c.env));

  return app;
}
