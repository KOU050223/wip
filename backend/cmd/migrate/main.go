// Command migrate は GORM の AutoMigrate でスキーマを適用する。
//
// Workers 上の API はリクエストごとに DB 接続を開くため、マイグレーションは
// 実行しない。スキーマ変更時はローカルや CI からこのコマンドを実行する。
//
//	DATABASE_URL=postgres://... go run ./cmd/migrate
package main

import (
	"context"
	"log"

	"github.com/KOU050223/wip/backend/internal/database"
)

func main() {
	db, closeDB, err := database.Open(context.Background())
	if err != nil {
		log.Fatalf("failed to connect database: %v", err)
	}
	defer closeDB()

	if err := database.Migrate(db); err != nil {
		log.Fatalf("failed to migrate database: %v", err)
	}
	log.Println("migration completed")
}
