# バックエンドのデプロイ

バックエンドは [Cloudflare Containers](https://developers.cloudflare.com/containers/) で配信する。
Go の API サーバーをコンテナとして動かし、その前段に置いた Worker がリクエストを中継する。

設定は `backend/wrangler.jsonc`、Worker シムは `backend/worker/index.ts`、
コンテナイメージは `backend/Dockerfile`、ワークフローは `.github/workflows/deploy-backend.yml`。

## 構成

```text
ブラウザ
   ↓ HTTPS
Worker（backend/worker/index.ts）
   ↓ getRandom で複数インスタンスに分散
Container（backend/Dockerfile / Gin + GORM）
   ↓ TLS
マネージドPostgres
```

Worker は薄い中継役で、ルーティングやCORSは従来どおり Gin 側が担当する。
ブラウザの `Origin` ヘッダーは Worker を素通りして Gin に届くため、
既存の `CORS_ALLOW_ORIGINS` の仕組みがそのまま機能する。

### なぜ Hyperdrive を使わないのか

[Hyperdrive](https://developers.cloudflare.com/hyperdrive/) は **Worker のバインディング**であり、
`env.HYPERDRIVE.connectionString` として Worker の JS ランタイム内でだけ有効な接続文字列を発行する。
コンテナの中で動く Go プロセスは Worker とは別プロセス・別のネットワーク境界にいるため、
このバインディングには到達できない。

したがって Go の pgx はマネージドPostgresへ**直接TLS接続**する。
接続プールは Go 側（`database/sql` の `SetMaxOpenConns` など）で管理する必要がある。

Hyperdrive が効くのは「Worker 内で JS のドライバから直接クエリする」構成のときだけで、
そのためには Go のバックエンドを Worker に書き直すことになる。

## デプロイの種類

| 種類 | トリガー | コマンド | 公開先 |
| --- | --- | --- | --- |
| 本番 | `main` への push | `wrangler deploy` | https://wip-backend.uozumi05.workers.dev |

### プレビューデプロイが無い理由

フロントエンドと違い、PR でのプレビューデプロイは用意していない。
[Cloudflare のドキュメント](https://developers.cloudflare.com/containers/deploy/)に次のとおり明記されている。

- **Preview URL は Durable Object を持つ Worker には発行されない**。Containers Worker は
  コンテナを Durable Object で制御するため、これに該当する。
- `wrangler versions upload` は Worker のバージョンを上げるだけで、
  **コンテナイメージの publish もインスタンスのロールアウトも行わない**。

つまり `versions upload` を回しても、新しいコンテナを動かして確認する手段が無い。
PR の段階でコンテナの動作を確認したい場合は、後述の
[ローカルで本番構成を再現する](#ローカルで本番構成を再現する)を使う。

## 事前に必要な設定

### Cloudflare プラン

Containers は **Workers Paid プラン（月$5〜）** が必要。Free プランでは `wrangler deploy` が失敗する。

### GitHub Secrets

フロントエンドと同じものを流用する（`.github/workflows/deploy-frontend.yml` と共通）。

| 名前 | 内容 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare の API トークン。権限は **Workers Scripts: Edit**。コンテナイメージの push もこの権限で行われる（Containers 専用の権限区分は無い） |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare のアカウントID |

### Cloudflare 側のシークレット

`DATABASE_URL` は機密情報なので `wrangler.jsonc` の `vars` には書かず、Worker Secret として登録する。

```bash
cd backend
npx wrangler secret put DATABASE_URL
# プロンプトに接続文字列を貼り付ける
# 例: postgres://USER:PASSWORD@HOST/DB?sslmode=require
```

登録した値は `backend/worker/index.ts` の `envVars` 経由でコンテナへ渡される。

> [!IMPORTANT]
> 本番用のマネージドPostgres自体はまだ用意していない（Issue #28）。
> `DATABASE_URL` を登録するまでコンテナは起動に失敗し続ける（後述の
> [設定不備がクラッシュループになる](#設定不備がクラッシュループになる)）。
> `/health` が 503 を返すのではなく、そもそもAPIが応答しない点に注意する。

非機密の `CORS_ALLOW_ORIGINS` は `backend/wrangler.jsonc` の `vars` に直接書いている。
フロントエンドのオリジンを変える場合はここを編集する。

## フロントエンドの接続先を切り替える

GitHub リポジトリの Settings > Secrets and variables > Actions > Variables で
`VITE_API_BASE_URL` をバックエンドの本番URLに変更する。

```
VITE_API_BASE_URL=https://wip-backend.uozumi05.workers.dev
```

この値はビルド時にバンドルへ埋め込まれるため、変更後はフロントエンドの再デプロイが必要。
`main` に push するか、`task deploy:frontend` を実行する。

## ローカルからのデプロイ

```bash
task deploy:backend  # 本番へデプロイ
```

初回は `npx wrangler login` で Cloudflare にログインしておく。

> [!NOTE]
> `wrangler deploy` はコンテナイメージをローカルでビルドして push するため、
> **Docker が起動している必要がある**。`docker info` で確認できる。

## コンテナの設定

`backend/wrangler.jsonc` の主な項目。

| 項目 | 値 | 理由 |
| --- | --- | --- |
| `instance_type` | `basic`（1/4 vCPU・1GiB・4GB） | `lite` の 256MiB は Gin + GORM + pgx にはやや窮屈なため |
| `max_instances` | `2` | `worker/index.ts` の `INSTANCE_COUNT` と揃える |
| `sleepAfter` | `5m`（`worker/index.ts`） | アイドル時に停止して課金を抑える |

`sleepAfter` の時間だけリクエストが無いとコンテナは停止する。停止中は課金されないが、
次のリクエストはコールドスタート（Goの起動 + Postgresへの TCP/TLS ハンドシェイク）を待つ。

## ローカルで本番構成を再現する

`wrangler dev` を使うと、Worker とコンテナを繋いだ**本番と同じ構成**をローカルで起動できる。
コンテナイメージのビルドから DO バインディング、`getRandom` による分散まで一通り動く。

```bash
task db:up                  # ローカルPostgresを起動
task dev:backend:container  # Worker＋コンテナを起動（初回はイメージのビルドで数分かかる）

curl http://localhost:8787/health
```

`DATABASE_URL` は `backend/.dev.vars` から読まれる。本番の Worker Secret に相当するもので、
コミットされない（`.gitignore` 済み）。手元に無い場合は次の内容で作る。

```bash
# backend/.dev.vars
DATABASE_URL="postgres://wip:wip_password@host.docker.internal:5432/wip?sslmode=disable"
```

コンテナからホストの Postgres を見るため、ホスト名は `localhost` ではなく
`host.docker.internal` になる点に注意する。

## コンテナイメージ単体を検証する

Worker を通さずイメージだけを確認したい場合。

```bash
task db:up   # ローカルPostgresを起動

cd backend
docker build --platform linux/amd64 -t wip-backend:test .
docker run --rm --platform linux/amd64 -p 18099:8080 \
  -e DATABASE_URL="postgres://wip:wip_password@host.docker.internal:5432/wip?sslmode=disable" \
  -e CORS_ALLOW_ORIGINS="http://localhost:5173" \
  wip-backend:test

curl -i http://localhost:18099/health
```

ホスト側のポートは空いていれば何でもよい。コンテナ側は `8080` 固定
（`Dockerfile` の `EXPOSE` と `worker/index.ts` の `defaultPort` を揃えてある）。

## 既知の課題

### 起動時マイグレーションがコールドスタートのたびに走る

`backend/cmd/server/main.go` は起動時に `database.Migrate`（GORM の `AutoMigrate`）を実行する。
Containers はゼロスケールするため、これは**コンテナが起動するたび**に走る。
さらに複数インスタンスが同時に起動すると、マイグレーションが並行実行される。

MVP はテーブルが `scores` ひとつだけで `AutoMigrate` は冪等に働くため実害は小さいが、
テーブルが増えたら以下のいずれかへ移行する。

- `RUN_MIGRATIONS` のような環境変数で実行を制御し、本番は別経路で流す
- golang-migrate などのマイグレーションツールを導入し、デプロイ前の単発ジョブにする

### 設定不備がクラッシュループになる

`main.go` は `DATABASE_URL` が未設定だと `log.Fatal` で終了する。
このときHTTPエラーは返らず、コンテナが起動しては落ちるだけになる。
HTTPレベルでは Worker がコンテナへ接続できないエラーとして現れるため、
`/health` の 503（DBには到達できるが疎通に失敗した状態）とは別物であることに注意する。

原因は Cloudflare ダッシュボードの Workers > wip-backend > Logs、
または `npx wrangler tail` で確認する。
