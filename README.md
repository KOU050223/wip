# WIP

このリポジトリの開発は常にWIPです...
終わりやね

環境構築は [SetupRTA](./docs/SetupRTA.md) を参照してください。

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
