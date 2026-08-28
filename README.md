# WIP

このリポジトリの開発は常にWIPです...
終わりやね

環境構築は [SetupRTA](./docs/SetupRTA.md) を参照してください。

## 関連URL

- [Frontend](https://wip-frontend.uozumi05.workers.dev)
- [Backend API](https://wip-backend.uozumi05.workers.dev)
- [Swagger UI](https://wip-backend.uozumi05.workers.dev/swagger/index.html)


## ローカル起動

Go / Node.js / Docker が入っていれば、以下の3コマンドで DB 込みで起動できます。

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
task dev
```

`task dev` は PostgresとRedis（docker compose）を起動して healthy になるのを待ってから、バックエンドとフロントエンドを立ち上げます。LAN対戦のPose同期はローカルRedisを使うため、クラウドRedisを経由せず低遅延です。

| URL | 内容 |
| --- | --- |
| http://localhost:5173 | フロントエンド（Vite） |
| http://localhost:8080 | バックエンド（Gin） |
| localhost:5432 | Postgres |

## VR / PC リアルタイム対戦

1. 2台のブラウザ（またはPCとVRヘッドセット）で `/matchmaking` を開き、両方で「ゲストで対戦開始」を選びます。
2. マッチ成立後、両者が「対戦へ接続」→「準備する」を選ぶと、3秒後に開始します。
3. PCは対戦画面の3Dエリア上でマウスを動かして剣を振り、VRは「VRで参加」から右手コントローラーで剣を振ります。相手アバターの身体に刃を振り抜いて3回当てると勝利です。

VRとPCは同じWebSocket対戦ルームに参加でき、剣の根元・先端のPoseをリアルタイム同期します。PC操作はVR実機を使わないデバッグ参加者向けです。

LAN上のQuest/PCから使う場合は、`https://192.168.1.155:5173` を開いて証明書警告を一度許可します。Viteが `/api` とWebSocketを `localhost:8080` のバックエンドへプロキシするため、HTTPS画面からHTTP APIへの混在コンテンツやCookieのCORS問題は発生しません。

`backend/.env` の `GUEST_SESSION_COOKIE_SECURE=false` は、この自己署名証明書を使うLAN開発向けです。公開環境では削除または `true` に戻してください。

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
