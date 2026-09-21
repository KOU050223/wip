# バックエンドのデプロイ

バックエンドは [Cloudflare Workers](https://developers.cloudflare.com/workers/) で配信する。
Go の API サーバーを [syumai/workers-go](https://github.com/syumai/workers-go) で Wasm にビルドし、
同じ Worker 上の Hono から呼び出す。

設定は `backend/wrangler.jsonc`、エントリポイントは `backend/worker/index.ts`、
ワークフローは `.github/workflows/deploy-backend.yml`。

## 構成

```text
ブラウザ
   ↓ HTTPS
Worker（backend/worker/index.ts）
   ├── /ai/*  → Hono + Workers AI
   └── その他 → Go/Wasm（Gin + GORM）
                  ↓ connect() で TCP + TLS
               マネージドPostgres（Neon）
```

ルーティングとCORSは Gin 側が担当する。ブラウザの `Origin` ヘッダーは
Wasm のハンドラまで届くため、`CORS_ALLOW_ORIGINS` の仕組みがそのまま機能する。
`/ai/*` だけは Workers AI のバインディングを使う必要があるため Hono 側で終端する。

### Go を Wasm で動かすための制約

`GOOS=js GOARCH=wasm` でビルドするため、通常の Go サーバーとは次の点が異なる。

| 制約 | 対応 |
| --- | --- |
| リクエストの外側で I/O ができず、TCPソケットも共有できない | DB接続をリクエストごとに開閉する |
| 環境変数が `env` バインディングで渡る | `internal/env` の `env.Get` を使う（`os.Getenv` では読めない） |
| DNSリゾルバが無い | `LookupFunc` でホスト名を素通しし、解決は `connect()` に任せる |
| `connect()` が TLS を張る | pgx 側の TLS は無効化する（二重に張ると `tls error: EOF`） |
| TLSの証明書ハッシュを取得できない | SCRAM の channel binding を `disable` にする |

実装は `backend/internal/database/dialer_js.go` にまとまっている。

### なぜ Hyperdrive を使わないのか

Cloudflare は Postgres への接続に [Hyperdrive](https://developers.cloudflare.com/hyperdrive/)
を推奨している。接続プーリングとクエリキャッシュが入るため、
リクエストごとに接続を開く現構成よりレイテンシ面で有利になる。

ただし導入すると設定が一段増えるため、まずは素の
[`connect()`](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/) で動かしている。
必要になった時点で `dialer_js.go` の差し替えで移行できる。

### Wasm のサイズ制限

Workers の Wasm は**非圧縮 64MiB** が上限。現状は約 54MB で収まっている。

`swaggo` のランタイム登録は `go/ast` 一式を引き込み約 30MB を占めるため、
js/wasm ビルドから除外している（`backend/cmd/server/docs_default.go`）。
OpenAPI の生成はソースのアノテーションを読むため影響しない。

依存を増やす場合はサイズに注意する。ビルド後のサイズは次で確認できる。

```bash
cd backend && npm run build:go && wc -c build/app.wasm
```

## デプロイの種類

| 種類 | トリガー | コマンド | 公開先 |
| --- | --- | --- | --- |
| 本番 | `main` への push | `wrangler deploy` | https://wip-backend.uozumi05.workers.dev |
| プレビュー | PR | `wrangler versions upload` | バージョンごとの Preview URL |

APIはフロントエンドから呼ばれるだけでユーザーが直接開くものではないため、
カスタムドメインは割り当てていない。

## 事前に必要な設定

### GitHub Secrets

フロントエンドと同じものを流用する（`.github/workflows/deploy-frontend.yml` と共通）。

| 名前 | 内容 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare の API トークン。権限は **Workers Scripts: Edit** |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare のアカウントID |

### Cloudflare 側のシークレット

`DATABASE_URL` は機密情報なので `wrangler.jsonc` の `vars` には書かず、
Worker Secret として登録する。

```bash
cd backend
npx wrangler secret put DATABASE_URL
# プロンプトに接続文字列を貼り付ける
# 例: postgres://USER:PASSWORD@HOST/DB?sslmode=require
```

> [!IMPORTANT]
> 接続先には**外部から到達できるマネージドPostgres**を指定すること。
> `connect()` は `localhost` と private IP への接続をブロックするため、
> ローカルの Postgres は指定できない。

非機密の `CORS_ALLOW_ORIGINS` は `backend/wrangler.jsonc` の `vars` に直接書いている。
フロントエンドのオリジンを変える場合はここを編集する。

## フロントエンドの接続先

`frontend/.env.production` に本番URLを書いている。

```
VITE_API_BASE_URL="https://wip-backend.uozumi05.workers.dev"
```

この値はビルド時にバンドルへ埋め込まれるため、変更後はフロントエンドの再デプロイが必要。
`main` に push するか、`task deploy:frontend` を実行する。

## ローカルからのデプロイ

```bash
task deploy:backend  # 本番へデプロイ
```

初回は `npx wrangler login` で Cloudflare にログインしておく。
`wrangler deploy` は `build` フックで Go を Wasm にビルドするため、**Go が必要**。

## ローカルでの動作確認

```bash
cd backend && npm run dev

curl http://localhost:8787/health
```

ローカル用の設定は `backend/.dev.vars` から読まれる。コミットされない（`.gitignore` 済み）ので、
手元に無い場合は次の内容で作る。

```bash
# backend/.dev.vars
DATABASE_URL="postgres://USER:PASSWORD@HOST/DB?sslmode=require"
CORS_ALLOW_ORIGINS="http://localhost:3000,http://localhost:5173"
```

- `DATABASE_URL` は本番の Worker Secret に相当する。
  **`connect()` は localhost に到達できないため、ローカルのPostgresは使えない**。
  疎通確認にはマネージドPostgresを指定する。
- `CORS_ALLOW_ORIGINS` は `wrangler.jsonc` の `vars` が**本番オリジンのみ**を指しているため、
  上書きしないとローカルの Vite（`localhost:5173`）からのリクエストが 403 になる。

> [!NOTE]
> `task dev` の `go run ./cmd/server` は動かない。`workers.Serve` が Workers の
> ランタイムコンテキストを要求するため、通常のGoバイナリとしては起動できない。

## データベースのマイグレーション

Workers 上のAPIはマイグレーションを実行しない。スキーマを変更したときは
`backend/internal/domain` の構造体を編集し、次を実行する。

```bash
cd backend
DATABASE_URL='postgres://...' go run ./cmd/migrate
```

`task db:migrate` でも同じ。通常のGoバイナリとして動くため、
`connect()` の制約を受けずローカルのPostgresにも適用できる。

## トラブルシューティング

原因は Cloudflare ダッシュボードの Workers > wip-backend > Logs、
または `npx wrangler tail` で確認する。

`/health` は PostgreSQL への疎通を確認し、失敗時は 503 と
`{"status":"error","database":"unreachable"}` を返す。
DB接続に関わる問題はここに現れる。

### よくある失敗

| 症状 | 原因 |
| --- | --- |
| `DATABASE_URL is required` | Secret が未登録、または `os.Getenv` を使っている |
| `hostname resolving error` | `LookupFunc` が設定されていない |
| `tls error: EOF` | pgx 側の TLS が有効なまま（`connect()` と二重） |
| `channel binding required` | `ChannelBinding` が `disable` になっていない |
| デプロイ時に Wasm のサイズ超過 | 依存が増えた。64MiB 制限を確認する |
