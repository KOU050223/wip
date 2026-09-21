package database

import (
	"context"
	"fmt"

	"github.com/KOU050223/wip/backend/internal/domain"
	"github.com/KOU050223/wip/backend/internal/env"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// Open はリクエストスコープの DB 接続を開く。
//
// Cloudflare Workers では TCP ソケットをグローバルに保持できないため、pgx の
// ダイヤラを Workers の connect() に差し替えたうえで、呼び出しごとに接続を開く。
// 返り値の closer は必ず呼び出すこと。
func Open(ctx context.Context) (*gorm.DB, func(), error) {
	databaseURL := env.Get("DATABASE_URL")
	if databaseURL == "" {
		return nil, func() {}, fmt.Errorf("DATABASE_URL is required")
	}

	pgxConfig, err := pgx.ParseConfig(databaseURL)
	if err != nil {
		return nil, func() {}, fmt.Errorf("failed to parse DATABASE_URL: %w", err)
	}

	// Workers 上では Go の net.Dial が使えないため、ビルドターゲットに応じた
	// ダイヤラを差し込む（dialer_js.go / dialer_default.go）。
	applyDialer(pgxConfig)

	sqlDB := stdlib.OpenDB(*pgxConfig)
	db, err := gorm.Open(postgres.New(postgres.Config{Conn: sqlDB}), &gorm.Config{})
	if err != nil {
		_ = sqlDB.Close()
		return nil, func() {}, err
	}

	return db, func() { _ = sqlDB.Close() }, nil
}

func Migrate(db *gorm.DB) error {
	return db.AutoMigrate(&domain.Score{})
}

// Ping は DB への疎通を確認する関数を返す。
func Ping(db *gorm.DB) func(context.Context) error {
	return func(ctx context.Context) error {
		sqlDB, err := db.DB()
		if err != nil {
			return err
		}
		return sqlDB.PingContext(ctx)
	}
}
