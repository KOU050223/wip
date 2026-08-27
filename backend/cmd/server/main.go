package main

import (
	"log"
	"os"

	"github.com/KOU050223/wip/backend/internal/config"
	"github.com/KOU050223/wip/backend/internal/database"
	"github.com/KOU050223/wip/backend/internal/httpapi"
	"github.com/KOU050223/wip/backend/internal/repository"
	"github.com/KOU050223/wip/backend/internal/usecase"
	"github.com/joho/godotenv"
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

	scoreRepository := repository.NewGormScoreRepository(db)
	scoreUsecase := usecase.NewScoreUsecase(scoreRepository)
	router := httpapi.NewRouter(scoreUsecase, config.AllowOrigins())

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	if err := router.Run(":" + port); err != nil {
		log.Fatalf("failed to run server: %v", err)
	}
}
