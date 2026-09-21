package config

import (
	"cmp"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/KOU050223/wip/backend/internal/env"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// defaultAllowOrigins はCORS_ALLOW_ORIGINSが未設定のときに使うローカル開発用オリジン。
const defaultAllowOrigins = "http://localhost:3000,http://localhost:5173,https://localhost:5173"

// AllowOrigins は環境変数CORS_ALLOW_ORIGINSをカンマ区切りで解釈して許可オリジンを返す。
// 未設定の場合はローカル開発用のオリジンにフォールバックする。
//
// 各要素は先頭に `*.` を付けるとサブドメインのワイルドカードとして扱う。
// Workers のプレビューURLは `<ハッシュ>-wip-frontend.uozumi05.workers.dev` のように
// デプロイごとに変わるため、列挙では追随できない。
func AllowOrigins() []string {
	raw := cmp.Or(env.Get("CORS_ALLOW_ORIGINS"), defaultAllowOrigins)

	var origins []string
	for origin := range strings.SplitSeq(raw, ",") {
		if trimmed := strings.TrimSpace(origin); trimmed != "" && trimmed != "*" {
			origins = append(origins, trimmed)
		}
	}

	// 空リストはcors.Newがpanicするため、フォールバックを保証する。
	if len(origins) == 0 {
		origins = strings.Split(defaultAllowOrigins, ",")
	}

	return origins
}

// OriginAllowed は origin が許可リストのいずれかに一致するかを判定する。
//
// `*.example.com` は example.com のサブドメインすべてに一致する。
// Workers のプレビューURLは `<ハッシュ>-<worker名>.<アカウント>.workers.dev` という
// ホスト名になるため、`*.uozumi05.workers.dev` のような指定で受けられる。
func OriginAllowed(allowOrigins []string, origin string) bool {
	for _, allowed := range allowOrigins {
		if matchOrigin(allowed, origin) {
			return true
		}
	}
	return false
}

func matchOrigin(pattern, origin string) bool {
	scheme, host, ok := splitOrigin(pattern)
	if !ok {
		return false
	}
	originScheme, originHost, ok := splitOrigin(origin)
	if !ok || originScheme != scheme {
		return false
	}

	// ワイルドカードでない場合は完全一致。
	suffix, found := strings.CutPrefix(host, "*.")
	if !found {
		return host == originHost
	}

	// `*.example.com` は example.com 自身には一致させない（意図を明示するため、
	// 必要なら許可リストに example.com も並べる）。
	// また `evil-example.com` のような部分一致も避けるため、ドット区切りを要求する。
	return strings.HasSuffix(originHost, "."+suffix)
}

// splitOrigin は "https://example.com" を scheme と host に分ける。
// ポート番号は host 側に残すため、`https://localhost:5173` も正しく扱える。
func splitOrigin(origin string) (scheme, host string, ok bool) {
	scheme, host, ok = strings.Cut(origin, "://")
	if !ok || scheme == "" || host == "" {
		return "", "", false
	}
	// パスが付いていてもホスト部分だけを見る。
	if slash := strings.IndexByte(host, '/'); slash >= 0 {
		host = host[:slash]
	}
	return scheme, host, host != ""
}

// corsAllowMethods と corsAllowHeaders は CORSMiddleware と HandlePreflight で
// 同じ値を返すために共有する。
var (
	corsAllowMethods = []string{"GET", "POST", "DELETE", "OPTIONS"}
	corsAllowHeaders = []string{"Origin", "Content-Type", "Accept", "Authorization"}
)

// corsMaxAge は preflight のキャッシュ時間。
const corsMaxAge = 12 * time.Hour

// HandlePreflight は CORS preflight を処理し、応答したかどうかを返す。
//
// preflight は DB を必要としないため、DB 接続を開く前にここで終端する。
// preflight でないリクエストや、許可されていないオリジンからの preflight は
// false を返し、通常の経路（CORSMiddleware）に委ねる。
func HandlePreflight(w http.ResponseWriter, req *http.Request, allowOrigins []string) bool {
	if req.Method != http.MethodOptions {
		return false
	}
	// Access-Control-Request-Method を伴わない OPTIONS は preflight ではない。
	if req.Header.Get("Access-Control-Request-Method") == "" {
		return false
	}
	origin := req.Header.Get("Origin")
	if origin == "" || !OriginAllowed(allowOrigins, origin) {
		return false
	}

	header := w.Header()
	header.Set("Access-Control-Allow-Origin", origin)
	header.Set("Access-Control-Allow-Methods", strings.Join(corsAllowMethods, ","))
	header.Set("Access-Control-Allow-Headers", strings.Join(corsAllowHeaders, ","))
	header.Set("Access-Control-Allow-Credentials", "true")
	header.Set("Access-Control-Max-Age", strconv.Itoa(int(corsMaxAge.Seconds())))
	// オリジンごとに応答が変わることをキャッシュに伝える。
	header.Add("Vary", "Origin")
	header.Add("Vary", "Access-Control-Request-Method")
	header.Add("Vary", "Access-Control-Request-Headers")
	w.WriteHeader(http.StatusNoContent)
	return true
}

// CORSMiddleware は指定したオリジンを許可するCORSミドルウェアを生成する。
func CORSMiddleware(allowOrigins []string) gin.HandlerFunc {
	config := cors.DefaultConfig()
	// ワイルドカードを解釈するため、AllowOrigins ではなく判定関数を渡す。
	config.AllowOrigins = nil
	config.AllowOriginFunc = func(origin string) bool {
		return OriginAllowed(allowOrigins, origin)
	}
	config.AllowMethods = corsAllowMethods
	config.AllowHeaders = corsAllowHeaders
	config.AllowCredentials = true
	config.MaxAge = corsMaxAge
	return cors.New(config)
}
