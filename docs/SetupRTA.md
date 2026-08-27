# Setup RTA

このプロジェクトで必要な環境:

- Go 1.26 なはず...
- Node.js 24 LTS

## Go

### Windows

[Go公式のインストーラー](https://go.dev/doc/install)からGoを導入する。PowerShellを開き直して確認する。

```powershell
go version
# go version go1.26.x windows/amd64
```

### macOS

Homebrewがある場合:

```bash
brew install go
go version
# go version go1.26.x darwin/arm64
```

Homebrewがない場合は、[Go公式のインストーラー](https://go.dev/doc/install)を使う。

## Node.js 24 LTS

Node.jsはバージョン管理ツール（fnm）で導入する。プロジェクトごとにNodeのバージョンを揃えやすくなるため、Node.js単体のインストーラーよりこちらを推奨する。

### Windows

PowerShellで次を実行する。

```powershell
winget install Schniz.fnm
```

インストール後、PowerShellを開き直し、Node.js 24 LTSを導入して使う。
きっとみんな環境ある...はず...

```powershell
fnm install 24
fnm use 24
node --version
npm --version
# v24.x.x
```

`fnm` が認識されない場合は、Windows Terminal / PowerShellを再起動する。それでも解消しない場合は、[fnmのリリースページ](https://github.com/Schniz/fnm/releases)からWindows向けバイナリを導入する。

### macOS

Homebrewでfnmを導入する。

```bash
brew install fnm
```

zshを使っている場合は、`~/.zshrc` に次を一度だけ追加してから、新しいターミナルを開く。

```bash
eval "$(fnm env --use-on-cd --shell zsh)"
```

Node.js 24 LTSを導入して確認する。

```bash
fnm install 24
fnm use 24
node --version
npm --version
# v24.x.x
```

Homebrewがない場合は、[Node.js公式ダウンロードページ](https://nodejs.org/en/download)からNode.js 24 LTSを導入する。

## Docker

ローカル開発用の PostgreSQL は docker compose で起動する。Docker Desktop を導入する。

### Windows

```powershell
winget install Docker.DockerDesktop
```

### macOS

```bash
brew install --cask docker
```

Homebrewがない場合は、[Docker Desktop公式ダウンロードページ](https://www.docker.com/products/docker-desktop/)から導入する。

導入後、Docker Desktop を一度起動してから確認する。

```bash
docker --version
docker compose version
```

## プロジェクトを起動する前の確認

任意の作業フォルダで、リポジトリをcloneする。

```bash
git clone https://github.com/KOU050223/wip.git
cd wip
```

リポジトリのルートで、必要なバージョンが揃っていることを確認する。

```bash
go version
node --version
npm --version
docker compose version
```

その後、リポジトリルートの [README](../README.md) の「ローカル起動」に従って `.env` を用意し、`task dev` で開発サーバーを起動する。Joy-Conを使う機能は、Bluetoothで接続したうえでChromeまたはEdgeから確認する。
