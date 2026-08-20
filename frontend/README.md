# frontend

React, TypeScript を使用してフロントエンドを構築します。

## 基盤の候補

まず、次の3種類は役割が異なる。

- **ビルド基盤**: 開発サーバー・本番ビルドを担う。ほかのライブラリと組み合わせる。
- **ルーター**: タイトル、ゲーム、結果、ランキングなどの画面遷移を担う。
- **Reactフレームワーク**: ビルド・ルーティング・SSR・サーバー機能などをまとめて提供する。通常、別のビルド基盤やルーターは不要になる。

### ビルド基盤

| 選択肢 | 特徴 | 確認すること |
| --- | --- | --- |
| [Vite](https://vite.dev/guide/) | React / TypeScriptでよく使われる高速な開発・ビルド基盤。ライブラリを自由に組み合わせられる。 | 3D・WebHIDを使うSPAを、必要最小限の構成で作りたいか。 |
| [Rsbuild](https://rsbuild.dev/) | Rspackベースのビルド基盤。Viteと同様にReactアプリの土台として使える。 | Rspack系の高速ビルドや設定を試したいか。 |
| [Parcel](https://parceljs.org/) | 設定を少なく始められるビルドツール。 | 細かな設定より、まず素早く試作することを優先するか。 |

### ルーター（Vite / Rsbuild / Parcelを選ぶ場合）

| 選択肢 | 特徴 | 確認すること |
| --- | --- | --- |
| [React Router](https://reactrouter.com/start/modes) | Reactの代表的なルーター。基本的な画面遷移から、データ取得・SSRまで段階的に拡張できる。 | チームが使った経験を重視するか。まずは単純な画面遷移で十分か。 |
| [TanStack Router](https://tanstack.com/router) | URLパラメータや検索条件をTypeScriptで型安全に扱いやすい。 | ルーティングの型安全性を強く重視するか。 |

### Reactフレームワーク（ビルド基盤・ルーターをまとめて選ぶ場合）

| 選択肢 | 特徴 | 確認すること |
| --- | --- | --- |
| [Next.js](https://nextjs.org/docs/app) | ファイルベースルーティング、SSR、Server Components、API機能を提供する。 | ゲーム以外に、SEOが必要な紹介・ランキングページやサーバー側の機能も同居させたいか。 |
| [React Router Framework Mode](https://reactrouter.com/start/modes) | React Routerを中心に、ViteプラグインでSPA・SSR・静的生成を選べる。 | React Routerの流儀を保ちつつ、将来のSSR/SSGも選択肢にしたいか。 |
| [TanStack Start](https://tanstack.com/start) | TanStack Router / Queryと組み合わせる型安全なフルスタック構成。 | TanStack製品群を中心に、型安全なデータ取得・ルーティングを揃えたいか。 |
| [Astro](https://astro.build/) | コンテンツ中心のサイトを軽く作り、必要な箇所だけReactを動かせる。 | ゲーム本体より、LP・紹介ページが主役か。 |

## 選定タスク

担当者は、上の候補から以下を決めてPRまたはIssueに残す。

1. ビルド基盤、ルーター、またはReactフレームワークを一つずつ選ぶ。
2. 「このゲームの最初のMVPに合う理由」と「採用しなかった候補との差」をそれぞれ2〜3行で書く。
3. 選んだ構成で、タイトル・接続・ゲーム・リザルト・ランキングの5画面を遷移できる最小アプリを作る。

比較の観点は、Joy-Con / WebHIDとの相性、React Three Fiberの組み込みやすさ、Go APIとの接続、学習コスト、デプロイ先、将来的なSSR/SEOの必要性とする。

## 機能別ライブラリ候補

| 用途 | 候補 | 採用の目安 |
| --- | --- | --- |
| 3D描画 | React Three Fiber、`@react-three/drei` | ライトセーバー、敵、カメラ、斬撃エフェクトに使う。 |
| 3D物理 | `@react-three/rapier` | 当たり判定や物理的な演出が必要になったときに追加する。 |
| 状態管理 | Zustand、Jotai | HP、スコア、コンボ、Joy-Con接続状態などを複数画面で共有する場合に使う。小さく始めるならReactの`useState` / Contextでもよい。 |
| サーバー状態 | TanStack Query | Go APIのランキングやスコア取得のキャッシュ・再取得を扱う場合に使う。 |
| UI / CSS | Tailwind CSS | HUD、タイトル、リザルトなどを素早く作る第一候補。 |
| アニメーション | Motion | 画面揺れ、文字、画面遷移などの2D UI演出に使う。3D演出はReact Three Fiber側で実装する。 |
| フォーム | React Hook Form + Zod | プレイヤー名入力や設定画面でバリデーションが必要になった場合に使う。 |
| テスト | Vitest、React Testing Library、Playwright | ロジックの単体テスト、UIテスト、ブラウザでの動作確認に使う。 |

## 画面構成の案

- `/`: タイトル
- `/connect`: Joy-Con接続
- `/game`: ゲーム本体
- `/result`: リザルト
- `/ranking`: ランキング

WebHIDは対応ブラウザ上でのみ動作するため、非対応環境では接続画面で案内を出す。
