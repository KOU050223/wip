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

## HTTP基盤・ルーターの候補

| 選択肢 | 特徴 | 確認すること |
| --- | --- | --- |
| [net/http](https://pkg.go.dev/net/http) | Go標準ライブラリだけでHTTPサーバーを作る。依存が少なく、HTTPの基礎を理解しやすい。 | 小規模なAPIを標準ライブラリだけで実装・保守できるか。 |
| [chi](https://github.com/go-chi/chi) | `net/http` と互換性のある、軽量で組み合わせやすいルーター。 | 標準ライブラリに近い書き味のまま、ルーティングとミドルウェアを整理したいか。 |
| [Gin](https://github.com/gin-gonic/gin) | ルーティング、JSONバインド・バリデーション、ミドルウェアをまとめて使えるWebフレームワーク。 | チュートリアルやチーム内の利用経験を活かし、素早くAPIを作りたいか。 |
| [Echo](https://echo.labstack.com/) | ルーティング、バインド、バリデーション、ミドルウェアを提供するWebフレームワーク。 | EchoのAPIや周辺ライブラリがチームに合うか。 |

`net/http` は標準ライブラリ、chiはその上に組み合わせるルーターです。Gin / Echoは、ルーティング等をまとめて提供するフレームワークです。この中からHTTPの入口を一つ選ぶ。

## DBアクセスの候補

| 選択肢 | 特徴 | 確認すること |
| --- | --- | --- |
| [`database/sql` + pgx](https://github.com/jackc/pgx) | 標準的なSQLインターフェースとPostgreSQLドライバを使う。SQLを自分で書く。 | SQLを学びながら、依存を少なく明示的に実装したいか。 |
| [sqlc](https://sqlc.dev/) | 書いたSQLから型安全なGoコードを生成する。 | SQLを主役にしつつ、手書きのスキャン処理を減らしたいか。 |
| [GORM](https://gorm.io/) | Goの構造体を中心にDB操作できるORM。 | SQLよりGoのコードでCRUDを素早く書きたいか。複雑なSQLが必要になったときの扱いも確認する。 |

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

## 選定タスク

担当者は、以下を決めてPRまたはIssueに残す。

1. HTTP基盤・ルーターを一つ選び、採用理由と不採用候補との差をそれぞれ2〜3行で書く。
2. DBアクセス方式を一つ選び、スコア保存に必要な最小テーブルをマイグレーションとして作る。
3. まずHTTP APIのみで進めるか、WebSocketのPoCも並行して作るかを決める。
4. 選んだ構成で、次のAPIを実装し、`go test ./...` が通る状態にする。

```text
GET  /health
POST /api/scores
GET  /api/rankings
```

比較の観点は、Goの学習コスト、APIの実装速度、レイヤードアーキテクチャとの相性、テストの書きやすさ、PostgreSQLとの接続、WebSocketへの拡張性とする。

## 開発開始

以下のコマンドで `go.mod` を作成してから開発を始めることができます。

```bash
go mod init github.com/KOU050223/wip/backend
```

## 目的

- ゲームのスコアを保存する
- ランキングを取得する
- 余裕があれば、WebSocketで対人スコアや誘惑イベントを同期する
