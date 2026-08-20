# アイデア

元ページ: <https://app.notion.com/p/2026-08-20-3c24e56633d780b48c06c8d1066fc35b?source=copy_link>

## 目標

Joy-Conなどの物理コントローラーを振ってライトセーバーを操作する、Webベースのアクションゲームを作る。妄想や誘惑を敵として斬り、気持ちよい斬撃・UI演出を楽しむことが主目的。

開発開始前の目標は、作品内容の確定、タスク分解、技術方針の決定。最初の完成条件は次の流れが通ること。

```text
Joy-Conを振る
↓
画面のライトセーバーが振られる
↓
敵に当たる
↓
敵が消える
```

## ゲーム内容

- ライトセーバーを実際に振り回して遊ぶ。ボタンを押すだけの操作にはしない。
- 敵は「睡眠の誘惑」「明日やればよくない？」のような、雑念・誘惑・現実の憂鬱なことをモチーフにする。
- 敵を斬ると `SLASH`、コンボ、画面揺れ、フラッシュなどの演出を出す。
- 基本は対NPC。余裕があればスコア対戦、相手への「誘惑」送信、リアルタイム対戦も追加する。
- 将来的にはVR（WebXR）にも対応可能な構成にする。

表示例:

```text
「明日やればよくない？」

       😈
    睡眠の誘惑

──── WARNING ────

Joy-Conを振る → ＼ SLASH!! ／ → COMBO ×12
```

## 技術方針

- フロントエンド: React / TypeScript
- 3D戦闘画面: React Three Fiber
- コントローラー入力: WebHID（Joy-Conのジャイロ・加速度）
- UI・演出: Tailwind CSS、Motion等
- バックエンド: Go
- リアルタイム通信: WebSocket
- DB: PostgreSQL（最初はスコアのみ）
- デプロイ候補: フロントエンドは Cloudflare Pages / Vercel、Goは Cloud Run / Fly.io / Render
- Unityは使わず、Webで作る。

WebHID / WebXRを使うため、公開環境ではHTTPSを早めに用意し、実機で検証する。

## 役割と初期タスク

| 担当 | 主な責務 | 初期タスク |
| --- | --- | --- |
| FE①（ゲーム・入力） | 3D戦闘、Joy-Con、戦闘ロジック | R3Fセットアップ、ライトセーバー表示、Joy-Con接続、gyro取得、SLASH判定、敵を斬る |
| FE②（UI・演出） | 画面UI、キャラクター、演出 | デザイン方向、タイトル、Battle HUD、誘惑セリフ、Slash / Combo演出、リザルト |
| BE（Go） | スコアAPI、ランキング、リアルタイム対戦 | Goプロジェクト、`/health`、Scoreモデル、`POST /scores`、`GET /rankings`、WebSocket PoC |
| Infra | 開発環境、CI/CD、デプロイ | リポジトリ構成、CI、Preview Deploy、Go Deploy、HTTPS、`.env` / secrets |

UI担当とゲーム担当の境界はイベントで接続する。例えばゲーム担当が「敵撃破」イベントを発火し、UI担当が画面揺れ・`SLASH`表示・コンボ演出を担う。

## バックエンドの段階

### Phase 1: MVP

- ヘルスチェック
- スコア保存・取得・ランキングAPI
- `scores`: `id`, `player_name`, `score`, `max_combo`, `clear_time`, `created_at`

### Phase 2: リアルタイムスコア

- プレイヤー管理、Room作成・参加
- WebSocketによるスコア同期

### Phase 3: 余裕があれば対戦

- 相手への誘惑送信、誘惑イベント同期
- マッチング、勝敗管理、切断・再接続処理

## インフラの完了条件

- monorepo、`.env.example`、Docker、README、formatter / linter を整備する。
- PRごとにフロントエンドの lint / test / build、バックエンドの gofmt / go vet / go test を実行する。
- Preview / Production のデプロイ、ログ確認、CORS、HTTPS、WebSocket、環境変数管理を準備する。
