// workers-assets-gen が生成する Go/Wasm のエントリポイント。
// `npm run build` で ./build 以下に生成されるため、リポジトリにはコミットしない。
// @ts-expect-error -- 生成物のため型定義を持たない。
import goWorker from '../build/worker.mjs';
import { createApp } from './app';

// Hono のルーター構築は 1 度で済むため、モジュールスコープで組み立てる。
// ExecutionContext はリクエストごとに異なるので、Hono の Context 経由で
// 受け取って Go 側へ渡す（同一 isolate で複数リクエストが並行しても混ざらない）。
const app = createApp((request, env, ctx) => goWorker.fetch(request, env, ctx));

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
