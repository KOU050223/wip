//go:build !(js && wasm)

// Package main の swagger spec 登録。
//
// swaggo のランタイム登録は go/ast などを引き込み Wasm バイナリを 30MB 近く
// 肥大化させるため、Workers 向けの js/wasm ビルドからは除外する。OpenAPI 定義の
// 生成（task swagger）はソースコードのアノテーションを読むため影響を受けない。
package main

import _ "github.com/KOU050223/wip/backend/docs"
