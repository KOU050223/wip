package config

import (
	"cmp"
	"os"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// defaultAllowOrigins はCORS_ALLOW_ORIGINSが未設定のときに使うローカル開発用オリジン。
const defaultAllowOrigins = "http://localhost:3000,http://localhost:5173,https://localhost:5173"

// AllowOrigins は環境変数CORS_ALLOW_ORIGINSをカンマ区切りで解釈して許可オリジンを返す。
// 未設定の場合はローカル開発用のオリジンにフォールバックする。
func AllowOrigins() []string {
	raw := cmp.Or(os.Getenv("CORS_ALLOW_ORIGINS"), defaultAllowOrigins)

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

// CORSMiddleware は指定したオリジンを許可するCORSミドルウェアを生成する。
func CORSMiddleware(allowOrigins []string) gin.HandlerFunc {
	config := cors.DefaultConfig()
	config.AllowOrigins = allowOrigins
	config.AllowMethods = []string{"GET", "POST", "DELETE", "OPTIONS"}
	config.AllowHeaders = []string{"Origin", "Content-Type", "Accept", "Authorization"}
	config.AllowCredentials = true
	config.MaxAge = 12 * time.Hour
	return cors.New(config)
}
