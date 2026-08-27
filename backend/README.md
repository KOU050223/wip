# backend

Goを使用して、ゲームのスコア保存・ランキング取得・将来的なリアルタイム対戦機能を構築する。

わかりやすさ重視でレイヤードアーキテクチャを採用する予定です。

```text
HTTP Handler
    ↓
Usecase（ゲームのルール・処理）
    ↓
Repository（DBアクセス）
    ↓
PostgreSQL
```

## HTTP基盤・ルーター

HTTP基盤・ルーターは Gin を採用予定です。

| 採用予定 | 特徴 | 採用理由 |
| --- | --- | --- |
| [Gin](https://github.com/gin-gonic/gin) | ルーティング、JSONバインド・バリデーション、ミドルウェアをまとめて使えるWebフレームワーク。 | 最小限の記述でHTTP APIを作りやすく、MVPで必要な `GET /health`、`POST /api/scores`、`GET /api/rankings` を素早く実装できる。 |

`net/http` や chi よりもフレームワーク側の機能がまとまっているため、まずはGinで実装速度とわかりやすさを優先する。将来的にWebSocketを入れる場合も、HTTPの入口はGinに集約する。

## DBアクセス

DBアクセスは GORM を採用予定です。

| 採用予定 | 特徴 | 採用理由 |
| --- | --- | --- |
| [GORM](https://gorm.io/) | Goの構造体を中心にDB操作できるORM。 | スコア保存・ランキング取得のCRUDを短く書きやすく、Repository層の実装をシンプルに保ちやすい。複雑な集計が必要になった場合は、生SQLやクエリビルダーの併用を検討する。 |

最初に必要なテーブルはスコアだけでよい。

```text
scores
├── id
├── player_name
├── score
├── max_combo
├── clear_time
└── created_at
```

## リアルタイム通信の候補（対戦機能を作る場合）

| 選択肢 | 特徴 | 確認すること |
| --- | --- | --- |
| WebSocket | プレイヤーごとのスコア更新や誘惑イベントを双方向で即時同期できる。 | 対戦・観戦など、HTTPのリクエスト/レスポンスだけでは足りないか。 |
| HTTP APIのみ | `POST /scores`、`GET /rankings` のような通常のAPIで完結する。 | MVPではリアルタイム同期を後回しにできるか。 |

MVPではHTTP APIのみでもよい。WebSocketを使う場合は、Room管理、切断、再接続、メッセージ形式まで設計対象に含める。

## 実装タスク

担当者は、以下を実装してPRまたはIssueに残す。

1. GinでHTTPサーバーを起動し、ルーティングを定義する。
2. GORMでPostgreSQLに接続し、スコア保存に必要な最小テーブルをマイグレーションとして作る。
3. MVPではHTTP APIのみで進め、WebSocketのPoCは対戦機能を作る段階で検討する。
4. 次のAPIを実装し、`go test ./...` が通る状態にする。

```text
GET  /health
POST /api/scores
GET  /api/rankings
```

実装時は、Goの学習コスト、APIの実装速度、レイヤードアーキテクチャとの相性、テストの書きやすさ、PostgreSQLとの接続、WebSocketへの拡張性を確認する。

## 開発開始

依存関係を取得する。

```bash
go mod tidy
```

テストを実行する。

```bash
go test ./...
```

## 環境変数

| 変数名 | 必須 | デフォルト | 説明 |
| --- | --- | --- | --- |
| `DATABASE_URL` | 必須 | なし | PostgreSQLの接続先。未設定の場合は起動時に終了する。 |
| `PORT` | 任意 | `8080` | HTTPサーバーの待ち受けポート。 |
| `CORS_ALLOW_ORIGINS` | 任意 | `http://localhost:3000,http://localhost:5173` | CORSで許可するオリジン。カンマ区切りで複数指定できる。`*` を指定するとすべてのオリジンを許可する。 |

`.env.example` をコピーして `.env` を作ると、値をシェルに書かずに開発できる。

```bash
cp .env.example .env
```

`.env` はプロセスのカレントディレクトリから読み込むため、`backend/` ディレクトリでコマンドを実行する。
また `.env` は既存の環境変数を **上書きしない** ため、シェルやdirenv（リポジトリルートの `.envrc`）で設定済みの値のほうが優先される。
`.env` はコミットしない（`.gitignore` 済み）。

サーバーを起動する。

```bash
go run ./cmd/server
```

`.env` を使わず、環境変数を直接指定して起動することもできる。

```bash
DATABASE_URL="postgres://wip:wip_password@localhost:5432/wip?sslmode=disable" go run ./cmd/server
```

PowerShellの場合は以下のように指定する。

```powershell
$env:DATABASE_URL = "postgres://wip:wip_password@localhost:5432/wip?sslmode=disable"
go run ./cmd/server
```

## デプロイ

Cloudflare Containers へデプロイする。手順・構成・既知の課題は
[docs/backend-deploy.md](../docs/backend-deploy.md) を参照。

```bash
task deploy:backend          # 本番へデプロイ
task deploy:backend:preview  # プレビュー版をアップロード
```

`main` への push で自動デプロイされるため、通常は手動実行は不要。

## 目的

- ゲームのスコアを保存する
- ランキングを取得する
- 余裕があれば、WebSocketで対人スコアや誘惑イベントを同期する
