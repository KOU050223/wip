package main

import (
	"context"
	"log"
	"os"
	"time"

	"github.com/KOU050223/wip/backend/internal/config"
	"github.com/KOU050223/wip/backend/internal/database"
	"github.com/KOU050223/wip/backend/internal/httpapi"
	"github.com/KOU050223/wip/backend/internal/realtime"
	"github.com/KOU050223/wip/backend/internal/repository"
	"github.com/KOU050223/wip/backend/internal/usecase"
	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
)

func main() {
	_ = godotenv.Load()

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}

	db, err := database.Open(databaseURL)
	if err != nil {
		log.Fatalf("failed to connect database: %v", err)
	}

	if err := database.Migrate(db); err != nil {
		log.Fatalf("failed to migrate database: %v", err)
	}

	redisURL := os.Getenv("UPSTASH_REDIS_URL")
	if redisURL == "" {
		log.Fatal("UPSTASH_REDIS_URL is required")
	}
	redisOptions, err := redis.ParseURL(redisURL)
	if err != nil {
		log.Fatalf("failed to parse UPSTASH_REDIS_URL: %v", err)
	}
	redisClient := redis.NewClient(redisOptions)
	defer redisClient.Close()
	redisContext, cancelRedis := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancelRedis()
	if err := redisClient.Ping(redisContext).Err(); err != nil {
		log.Fatalf("failed to connect redis: %v", err)
	}

	scoreRepository := repository.NewGormScoreRepository(db)
	scoreUsecase := usecase.NewScoreUsecase(scoreRepository)
	router := httpapi.NewRouterWithRealtime(
		scoreUsecase,
		config.AllowOrigins(),
		database.Ping(db),
		realtime.NewMatchmakingService(realtime.NewRedisQueue(redisClient)),
	)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	if err := router.Run(":" + port); err != nil {
		log.Fatalf("failed to run server: %v", err)
	}
}
