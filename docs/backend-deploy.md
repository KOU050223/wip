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

### なぜ Hyperdrive や D1 を使わないのか

[Hyperdrive](https://developers.cloudflare.com/hyperdrive/) も [D1](https://developers.cloudflare.com/d1/) も
**Worker のバインディング**として提供される。バインディングは Worker の JS ランタイム内でのみ有効で、
SQL のワイヤプロトコルを喋るものではない。

コンテナからバインディングを使う手段自体は存在する
（[Outbound Workers](https://developers.cloudflare.com/containers/platform-details/outbound-traffic/)。
コンテナからの HTTP リクエストを Worker 側のハンドラで受け、`env` 経由でバインディングを叩く）。
ただしその場合、**クエリを実行するのは Worker 側の JavaScript** になり、
コンテナの Go が受け取るのは JSON である。つまり **GORM が使えなくなる**。

そのため本構成では Go の pgx がマネージドPostgresへ**直接TLS接続**する。
接続プールは Go 側（`database/sql` の `SetMaxOpenConns` など）で管理する。

判断の詳細は [DBの選定](#dbの選定) を参照。

### DBの選定

「full Cloudflare 構成にするため D1（SQLite）を使えないか」を検討した結果、
**マネージドPostgres を採用した**。

前提として、**D1 は SQLite ファイルとしては開けない**。バインディングか HTTP API 経由でしか
アクセスできないため、`gorm.io/driver/sqlite` では到達できない。

| 案 | DBへの到達手段 | GORM | 判断 |
| --- | --- | --- | --- |
| **A（採用）** | pgx で Postgres へ直接TLS接続 | **維持** | 追加コストなし |
| B′ | Outbound Worker → D1 バインディング | 破棄 | 下記の作り直しが発生 |
| C | Worker から D1 バインディング（Goをやめる） | Go ごと破棄 | API全書き直し |

B′ は同一マシン内のホップで済み、APIトークンをコンテナに置かなくてよい利点がある。
しかし repository 層の書き直しに加えて、`AutoMigrate` から `wrangler d1 migrations` への移行、
`database.Ping` と `/health` の作り直し、`ContainerProxy` の export が必要になる。
`backend/README.md` が掲げる「Go でレイヤードアーキテクチャ」という前提とも合わない。

得られるものがマネージドPostgres 1契約分の削減にとどまるため、A を選んだ。

> [!NOTE]
> B′ に将来的に移る場合、`outboundByHost` が `wrangler dev` のローカル D1 バインディングに対して
> 機能するかを先に確認すること。動かない場合、
> [ローカルで本番構成を再現する](#ローカルで本番構成を再現する)の手順が使えなくなる。

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
> `DATABASE_URL` を登録しないままデプロイすると、コンテナは起動に失敗し続ける（後述の
> [設定不備がクラッシュループになる](#設定不備がクラッシュループになる)）。
> `/health` が 503 を返すのではなく、そもそもAPIが応答しない点に注意する。
> 接続先には**外部から到達できるマネージドPostgres**を指定すること。
> ローカル用の値（`localhost` や `host.docker.internal`）はコンテナから解決できない。

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

ローカル用の設定は `backend/.dev.vars` から読まれる。コミットされない（`.gitignore` 済み）ので、
手元に無い場合は次の内容で作る。

```bash
# backend/.dev.vars
DATABASE_URL="postgres://wip:wip_password@host.docker.internal:5432/wip?sslmode=disable"
CORS_ALLOW_ORIGINS="http://localhost:3000,http://localhost:5173"
```

2点とも `wrangler.jsonc` の設定を上書きするために必要になる。

- `DATABASE_URL` は本番の Worker Secret に相当する。コンテナからホストの Postgres を見るため、
  ホスト名は `localhost` ではなく `host.docker.internal` を使う。
- `CORS_ALLOW_ORIGINS` は `wrangler.jsonc` の `vars` が**本番オリジンのみ**を指しているため、
  上書きしないとローカルの Vite（`localhost:5173`）からのリクエストが 403 になる。

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

## 残作業

1. **バックエンドをデプロイする**。`main` への push で自動実行される（`task deploy:backend` でも可）。
   `/health` が 200 を返すことを確認する。
2. **`VITE_API_BASE_URL` を切り替える**。現在は `http://localhost:8080` のままなので、
   本番URLに更新する（[フロントエンドの接続先を切り替える](#フロントエンドの接続先を切り替える)）。
3. **フロントエンドを再デプロイする**。`VITE_API_BASE_URL` はビルド時に埋め込まれるため、
   変数を変えるだけでは反映されない。

> [!NOTE]
> `wrangler deploy` を一度も実行していない状態で `wrangler secret put` を実行すると、
> **中身のないプレースホルダWorkerが自動生成される**。この状態では
> `wip-backend.uozumi05.workers.dev` は 404 を返し、`wrangler containers list` にも何も出ない。
> 設定ミスではなく、初回デプロイで解消する。登録済みのシークレットはデプロイをまたいで保持される。

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
このときHTTPエラーは返らず、コンテナが起動しては落ちるだけになると考えられる
（未デプロイのため未検証。コンテナ起動の時点で失敗する可能性もあるが、
いずれにせよAPIが応答しない状態になる）。
HTTPレベルでは Worker がコンテナへ接続できないエラーとして現れるため、
`/health` の 503（DBには到達できるが疎通に失敗した状態）とは別物であることに注意する。

原因は Cloudflare ダッシュボードの Workers > wip-backend > Logs、
または `npx wrangler tail` で確認する。
