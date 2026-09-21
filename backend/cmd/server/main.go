package main

import (
	"log"
	"net/http"

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
// @host            api.uomi.dev
// @BasePath        /

// Cloudflare Workers ではリクエストの外側で I/O を行えず、TCP ソケットを
// グローバルに保持して使い回すこともできない。そのため DB 接続はグローバルに
// 張らず、リクエストごとに開いて閉じる。
func main() {
	handler := http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		db, closeDB, err := database.Open(req.Context())
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
			config.AllowOrigins(),
			database.Ping(db),
		)
		router.ServeHTTP(w, req)
	})

	workers.Serve(handler)
}
