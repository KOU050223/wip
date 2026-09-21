import { Hono } from "hono";
import { cors } from "hono/cors";

import { createTaunt } from "./taunt";

// Hono が公開する ExecutionContext は Workers の型と定義が異なるため、
// 生成物へ渡す際は unknown を経由する。
type FetchBackend = (request: Request, env: Env, ctx: unknown) => Promise<Response>;

/** "https://example.com" を scheme と host に分ける。ポートは host 側に残す。 */
function splitOrigin(origin: string): { scheme: string; host: string } | undefined {
  const separator = origin.indexOf("://");
  if (separator <= 0) return undefined;
  const scheme = origin.slice(0, separator);
  const rest = origin.slice(separator + 3);
  const slash = rest.indexOf("/");
  const host = slash >= 0 ? rest.slice(0, slash) : rest;
  return host ? { scheme, host } : undefined;
}

/**
 * origin が許可パターンに一致するかを判定する。
 * `https://*.example.com` は example.com のサブドメインに一致する
 * （internal/config/cors.go の matchOrigin と同じ規則）。
 */
function matchOrigin(pattern: string, origin: string): boolean {
  const patternParts = splitOrigin(pattern);
  const originParts = splitOrigin(origin);
  if (!patternParts || !originParts) return false;
  if (patternParts.scheme !== originParts.scheme) return false;

  if (!patternParts.host.startsWith("*.")) {
    return patternParts.host === originParts.host;
  }
  // 部分一致を避けるためドット区切りを要求する。
  const suffix = patternParts.host.slice(1);
  return originParts.host.endsWith(suffix);
}

function allowedCors(origin: string | undefined, env: Env) {
  if (!origin) return undefined;
  const allowed = env.CORS_ALLOW_ORIGINS.split(",")
    .map((value) => value.trim())
    .some((pattern) => pattern && matchOrigin(pattern, origin));
  if (!allowed) return undefined;
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
