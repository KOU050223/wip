//go:build !(js && wasm)

// Package env はビルドターゲットの差を吸収して環境変数を読む。
package env

import "os"

// Get はプロセスの環境変数を読む。
func Get(name string) string {
	return os.Getenv(name)
}
