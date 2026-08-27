import { Container, getRandom } from '@cloudflare/containers';
import { env } from 'cloudflare:workers';

/**
 * リクエストを分散させるコンテナインスタンス数。
 * wrangler.jsonc の containers[].max_instances 以下にすること。
 */
const INSTANCE_COUNT = 2;

export class BackendContainer extends Container {
  // backend/Dockerfile の EXPOSE と、Go 側の PORT デフォルトに揃える。
  defaultPort = 8080;

  /**
   * 最終リクエストからこの時間アイドルだとコンテナを停止する。
   * 停止中は課金されないが、次のリクエストはコールドスタート（Go の起動＋
   * Postgres への TCP/TLS ハンドシェイク）を待つことになる。
   * MVP ではコスト優先で短めにしている。
   */
  sleepAfter = '5m';

  /**
   * コンテナへ渡す環境変数。
   * DATABASE_URL は `wrangler secret put DATABASE_URL` で登録した Worker Secret を
   * 中継している。値そのものはこのリポジトリには含めない。
   */
  envVars = {
    DATABASE_URL: env.DATABASE_URL,
    CORS_ALLOW_ORIGINS: env.CORS_ALLOW_ORIGINS,
  };

  override onStart() {
    console.log('backend container started');
  }

  override onStop(stopParams: { exitCode: number; reason: string }) {
    console.log('backend container stopped', stopParams);
  }

  override onError(error: unknown) {
    console.error('backend container error:', error);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // APIサーバーはステートレスなので、パスで固定インスタンスに寄せず
    // ランダムに分散させる（getByName だとパスごとにインスタンスが割れる）。
    const container = await getRandom(env.BACKEND, INSTANCE_COUNT);
    return container.fetch(request);
  },
} satisfies ExportedHandler<Env>;
