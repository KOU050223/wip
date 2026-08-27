/**
 * `wrangler secret put DATABASE_URL` で登録する Worker Secret の型宣言。
 *
 * シークレットは wrangler.jsonc に書かないため `wrangler types` が生成する
 * worker-configuration.d.ts には現れない。ここで Cloudflare.Env を拡張して
 * `env.DATABASE_URL` を型安全に参照できるようにする。
 */
declare namespace Cloudflare {
  interface Env {
    DATABASE_URL: string;
  }
}
