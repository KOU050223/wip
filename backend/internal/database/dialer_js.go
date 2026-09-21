//go:build js && wasm

package database

import (
	"context"
	"net"

	"github.com/jackc/pgx/v5"
	"github.com/syumai/workers-go/cloudflare/sockets"
)

// applyDialer は Cloudflare Workers の connect() を pgx のダイヤラとして差し込む。
// Neon のパブリックエンドポイントは TLS を要求するため secureTransport は on。
func applyDialer(config *pgx.ConnConfig) {
	config.DialFunc = func(ctx context.Context, _ string, address string) (net.Conn, error) {
		return sockets.Connect(ctx, address, &sockets.SocketOptions{
			SecureTransport: sockets.SecureTransportOn,
		})
	}
}
