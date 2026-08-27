# フロントエンドのデプロイ

フロントエンドは Cloudflare Workers の [Static Assets](https://developers.cloudflare.com/workers/static-assets/) として配信する。
設定は `frontend/wrangler.jsonc`、ワークフローは `.github/workflows/deploy-frontend.yml`。

## デプロイの種類

| 種類 | トリガー | コマンド | 公開先 |
| --- | --- | --- | --- |
| プレビュー | `frontend/**` を変更した Pull Request | `wrangler versions upload` | [Preview URL](https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/)（`https://<バージョン>-wip-frontend.uozumi05.workers.dev`） |
| 本番 | `main` への push | `wrangler deploy` | https://wip-frontend.uomi.dev （+ https://wip-frontend.uozumi05.workers.dev） |

`versions upload` は新しいバージョンをアップロードするだけで、本番トラフィックの向き先は変更しない。
そのため PR のプレビューが本番へ影響することはない。

プレビューURLは PR に自動でコメントされる。同じ PR に何度 push しても、コメントは追加ではなく更新される。

## 事前に必要な設定

GitHub リポジトリの Settings > Secrets and variables > Actions に以下を登録する。

### Secrets

| 名前 | 内容 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare の API トークン。権限は **Workers Scripts: Edit** が必要 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare のアカウントID |

### Variables

| 名前 | 内容 |
| --- | --- |
| `VITE_API_BASE_URL` | バックエンドAPIのベースURL |

`VITE_API_BASE_URL` はビルド時にバンドルへ埋め込まれるため、ランタイムでは変更できない。
未設定の場合、デプロイされたフロントエンドからAPIを呼び出せない点に注意する。

## バックエンド側のCORS設定

バックエンドの `CORS_ALLOW_ORIGINS` にフロントエンドのオリジンを設定する。

```
CORS_ALLOW_ORIGINS="https://wip-frontend.uozumi05.workers.dev,https://wip-frontend.uomi.dev"
```

プレビューURLはバージョンごとにサブドメインが変わるため、
プレビュー環境からAPIを叩く必要が出た場合は都度追加するか、
バックエンド側でパターンマッチを検討する。

## ローカルからのデプロイ

```bash
task deploy:frontend          # 本番へデプロイ
task deploy:frontend:preview  # プレビュー版をアップロード
```

初回は `npx wrangler login` で Cloudflare にログインしておく。

## Custom Domain

`wrangler.jsonc` の `routes` に `wip-frontend.uomi.dev` を `custom_domain: true` で設定している。
`wrangler deploy` の実行時に Cloudflare が DNS レコードと証明書を自動で発行するため、
ダッシュボードでの手動設定は不要。

前提として `uomi.dev` が Cloudflare 上のアクティブなゾーンであり、
かつ `wip-frontend.uomi.dev` に既存の CNAME レコードが無いことが必要。

workers.dev のURL（`wip-frontend.uozumi05.workers.dev`）も引き続き有効なままにしている。
Preview URL が workers.dev サブドメインで配信される都合上、`workers_dev` を無効化できないため。

## Preview URL の有効化について

Preview URL は workers.dev サブドメインで配信されるため、`wrangler.jsonc` で
`workers_dev` と `preview_urls` の両方を `true` に設定している。

この設定は `wrangler deploy` の実行時に Cloudflare 側へ反映される。
そのため **Worker をまだ一度もデプロイしていない状態では、PR のプレビューが機能しない**。
初回デプロイは実施済みなので、通常運用で意識する必要はない。
Worker を作り直した場合のみ、先に `task deploy:frontend` を一度実行すること。

反映されているかは Cloudflare ダッシュボードの
Workers & Pages > `wip-frontend` > Settings > Domains & Routes で確認できる。

## 補足

- fork からの Pull Request では Secrets が渡されないため、プレビューのデプロイは失敗する。
- wrangler のバージョンは `frontend/package.json` の devDependencies とワークフローの
  `wranglerVersion` の両方で固定している。更新する際は両方を揃えること。
