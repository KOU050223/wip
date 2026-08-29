# AGENTS.md

このリポジトリで作業するコーディングエージェント向けのガイドです。

## リポジトリ構成

デプロイ対象は 3 つあります。`backend/` に Go サーバーと TypeScript の Cloudflare Worker が
**同居している**点に注意してください。

| パス | 内容 |
| --- | --- |
| `frontend/` | React SPA（Vite）。Cloudflare Workers へデプロイ |
| `backend/cmd`, `backend/internal` | Go の API サーバー（Gin + GORM + PostgreSQL）。Cloudflare Containers へデプロイ |
| `backend/worker` | Cloudflare Worker（Hono）。コンテナへのルーティングと Workers AI を担当 |
| `docs/` | 設計・デプロイ手順 |

Go 側のアーキテクチャはレイヤードです。

```text
HTTP Handler（internal/httpapi）
    ↓
Usecase（internal/usecase）
    ↓
Repository（internal/repository）
    ↓
PostgreSQL
```

## 技術スタック

実際に `package.json` / `go.mod` に入っているもののみを記載します。各 README には
「採用候補」の比較表が残っていますが、そこに並ぶライブラリの多くは未導入です。

- **frontend**: React 19 / Vite 8 / react-router-dom 7 / TanStack Query 5 /
  three + `@react-three/fiber` `@react-three/drei` `@react-three/xr` / Tailwind CSS v4 /
  Vitest 4 / TypeScript 6
- **backend（Go）**: Go 1.27 / Gin / GORM / PostgreSQL 17 / Redis（マッチメイキング）
- **backend（Worker）**: Hono 4 / `@cloudflare/containers` / wrangler 4

## よく使うコマンド

```bash
task ci            # GitHub Actions と同じ品質チェックを全系統実行（変更後はまずこれ）
task generate:api  # OpenAPI定義とフロントエンドのAPI Hooksをまとめて再生成
task dev           # Postgres が healthy になるのを待ってから backend / worker / frontend を起動
task db:up         # Postgres だけ起動
task db:down       # 停止（データは残る）
task db:reset      # 停止してデータも削除
task --list        # タスク一覧
```

## 品質ゲート（3 系統）

CI・lefthook と同じ内容です。個別に流す場合は以下を実行します。

```bash
# frontend
cd frontend && npm ci && npm run lint && npm run format:check && npm test && npm run build

# backend（Go）
cd backend && test -z "$(gofmt -l .)" && go vet ./... && go test ./...

# backend（Worker）
cd backend && npm ci && npx wrangler types && npm run typecheck
```

`npx wrangler types` を先に実行するのは、`worker-configuration.d.ts` をコミットしていないためです。
これを飛ばすと typecheck が型不足で落ちます。

## API 定義の生成フロー

Go のコメントアノテーションが単一の情報源で、そこから 2 段階で生成されます。

```text
Go のアノテーション（cmd/server/main.go の全体情報 + internal/httpapi/router.go の各エンドポイント）
    ↓ swaggo/swag
backend/docs/（swagger.yaml / swagger.json / docs.go）
    ↓ orval
frontend/src/api/generated/（TanStack Query Hooks + 型）
```

エンドポイントやレスポンス型を変更したら、両方をまとめて再生成します。

```bash
task generate:api
```

段階ごとに実行する場合は次のとおりです。

```bash
task swagger                            # Go アノテーション → backend/docs
cd frontend && npm run generate:api     # backend/docs/swagger.yaml → src/api/generated
```

- `task swagger` は `go run github.com/swaggo/swag/cmd/swag@v1.16.6` で実行するため、
  `swag` コマンドのインストールは不要です。バージョンは `backend/go.mod` の
  `github.com/swaggo/swag` と揃えてください。
- API 全体の情報（title / version / host / basePath）は `cmd/server/main.go` の
  `// @title` などのコメントにあります。各エンドポイントの `// @Summary` `// @Router` は
  `internal/httpapi/router.go` にあります。
- 生成された `backend/docs` はコミット対象です（frontend 側の生成に必要なため）。
  再生成後は差分をコミットに含めてください。
- Swagger UI はローカルでは http://localhost:8080/swagger/index.html で確認できます。

## 注意点

- **`backend/docs/` と `frontend/src/api/generated/` は手で編集しない。** どちらも生成物です。
  上の「API 定義の生成フロー」を参照してください。
- DB スキーマはマイグレーションファイルではなく、GORM の `AutoMigrate`
  （`backend/internal/database/database.go`）で適用されます。スキーマ変更は
  `backend/internal/domain` の構造体を編集します。
- lefthook を入れると commit / push 時に上記チェックが自動で走ります（`lefthook install`）。
