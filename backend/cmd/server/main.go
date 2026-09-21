package main

import (
	"context"
	"log"
	"net/http"
	"time"

	"github.com/KOU050223/wip/backend/internal/config"
	"github.com/KOU050223/wip/backend/internal/database"
	"github.com/KOU050223/wip/backend/internal/httpapi"
	"github.com/KOU050223/wip/backend/internal/repository"
	"github.com/KOU050223/wip/backend/internal/usecase"
	"github.com/syumai/workers-go"
)

// @title           Score API
// @version         1.0
// @description     Score management API.
// @host            wip-backend.uozumi05.workers.dev
// @BasePath        /

// databaseConnectTimeout は DB 接続の確立に許す時間。
// Workers のリクエストが DB の応答待ちで張り付くのを防ぐ。
const databaseConnectTimeout = 5 * time.Second

// Cloudflare Workers ではリクエストの外側で I/O を行えず、TCP ソケットを
// グローバルに保持して使い回すこともできない。そのため DB 接続はグローバルに
// 張らず、リクエストごとに開いて閉じる。
func main() {
	handler := http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		allowOrigins := config.AllowOrigins()

		// CORS preflight は DB を必要としないため、接続を開く前に返す。
		// ここで終端しないと、preflight のたびに TLS と認証のハンドシェイクを
		// 払ううえ、DB 障害時に CORS ヘッダーの無い 503 を返してしまう。
		if config.HandlePreflight(w, req, allowOrigins) {
			return
		}

		// DB がハングしてもリクエストが張り付かないよう、接続の確立に上限を設ける。
		connectCtx, cancel := context.WithTimeout(req.Context(), databaseConnectTimeout)
		defer cancel()

		db, closeDB, err := database.Open(connectCtx)
		if err != nil {
			log.Printf("failed to connect database: %v", err)
			http.Error(w, `{"status":"error","database":"unreachable"}`, http.StatusServiceUnavailable)
			return
		}
		defer closeDB()

		scoreRepository := repository.NewGormScoreRepository(db)
		scoreUsecase := usecase.NewScoreUsecase(scoreRepository)
		router := httpapi.NewRouter(
			scoreUsecase,
			allowOrigins,
			database.Ping(db),
		)
		router.ServeHTTP(w, req)
	})

	workers.Serve(handler)
}
