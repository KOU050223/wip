package main

import (
	"log"
	"os"

	"github.com/KOU050223/wip/backend/internal/database"
	"github.com/KOU050223/wip/backend/internal/httpapi"
	"github.com/KOU050223/wip/backend/internal/repository"
	"github.com/KOU050223/wip/backend/internal/usecase"
)

func main() {
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
	router := httpapi.NewRouter(scoreUsecase)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	if err := router.Run(":" + port); err != nil {
		log.Fatalf("failed to run server: %v", err)
	}
}
