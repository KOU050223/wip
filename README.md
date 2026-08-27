# WIP

このリポジトリの開発は常にWIPです...
終わりやね

環境構築は [SetupRTA](./docs/SetupRTA.md) を参照してください。

## ローカル起動

Go / Node.js / Docker が入っていれば、以下の3コマンドで DB 込みで起動できます。

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
task dev
```

`task dev` は Postgres（docker compose）を起動して healthy になるのを待ってから、バックエンドとフロントエンドを立ち上げます。

| URL | 内容 |
| --- | --- |
| http://localhost:5173 | フロントエンド（Vite） |
| http://localhost:8080 | バックエンド（Gin） |
| localhost:5432 | Postgres |

DB だけを操作したい場合は次のタスクを使います。

```bash
task db:up      # 起動
task db:down    # 停止（データは残る）
task db:reset   # 停止してデータを削除
```

環境変数の詳細は [backend/README.md](./backend/README.md) を参照してください。`.env` はコミットしません。

### ポート5432が使われている場合

すでにローカルで Postgres が動いていると `port is already allocated` で失敗します。`compose.yaml` のポート指定のホスト側と、`backend/.env` の `DATABASE_URL` のポートを揃えて変更してください。

```yaml
ports:
  - "15432:5432"
```

## 品質チェック

Lefthook をインストールすると、commit 時に frontend の lint と backend の format / vet、push 時に test / build が実行されます。frontend の formatter は `oxfmt` を導入しており、CI でフォーマットを検証します。

```bash
lefthook install
```

手動で実行する場合は以下のとおりです。

```bash
(cd frontend && npm ci && npm run lint && npm run format:check && npm test && npm run build)
(cd backend && test -z "$(gofmt -l .)" && go vet ./... && go test ./...)
```

フロントエンドを整形する場合は `cd frontend && npm run format` を実行します。
