//go:build js && wasm

// Package env はビルドターゲットの差を吸収して環境変数を読む。
package env

import "github.com/syumai/workers-go/cloudflare"

// Get は Workers のバインディング（vars / secret）から値を読む。
// Workers では環境変数がプロセスの環境ではなく env オブジェクトで渡るため、
// os.Getenv では取得できない。
func Get(name string) string {
	return cloudflare.Getenv(name)
}
