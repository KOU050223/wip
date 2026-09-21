//go:build !(js && wasm)

package database

import "github.com/jackc/pgx/v5"

// applyDialer は Workers 以外では何もしない。pgx 既定の net.Dialer を使う。
func applyDialer(config *pgx.ConnConfig) {}
