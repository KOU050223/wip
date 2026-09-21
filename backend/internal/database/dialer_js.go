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
	// js/wasm には DNS リゾルバがなく、pgx 既定の LookupHost は必ず失敗する。
	// connect() はホスト名をそのまま解決できるため、名前解決は行わず素通しする。
	config.LookupFunc = func(_ context.Context, host string) ([]string, error) {
		return []string{host}, nil
	}
	// TLS は connect() の secureTransport が張るため、pgx 側の TLS は無効化する。
	// 両方が TLS ハンドシェイクを試みると "tls error: EOF" になる。
	config.TLSConfig = nil

	// SCRAM の channel binding は TLS の証明書ハッシュを必要とするが、TLS を張るのは
	// connect() 側で Go からは *tls.Conn が見えないため取得できない。接続文字列が
	// channel_binding=require でも、ここで無効化して scram-sha-256 で認証する。
	config.Config.ChannelBinding = "disable"
	config.DialFunc = func(ctx context.Context, _ string, address string) (net.Conn, error) {
		return sockets.Connect(ctx, address, &sockets.SocketOptions{
			SecureTransport: sockets.SecureTransportOn,
		})
	}
}
