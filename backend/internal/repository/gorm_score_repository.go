package repository

import (
	"context"

	"github.com/KOU050223/wip/backend/internal/domain"
	"gorm.io/gorm"
)

type GormScoreRepository struct {
	db *gorm.DB
}

func NewGormScoreRepository(db *gorm.DB) *GormScoreRepository {
	return &GormScoreRepository{db: db}
}

func (r *GormScoreRepository) Create(ctx context.Context, score *domain.Score) error {
	return r.db.WithContext(ctx).Create(score).Error
}

func (r *GormScoreRepository) FindRankings(ctx context.Context, limit int) ([]domain.Score, error) {
	var scores []domain.Score
	err := r.db.WithContext(ctx).
		Order("score DESC").
		Order("clear_time ASC").
		Order("created_at ASC").
		Limit(limit).
		Find(&scores).
		Error
	return scores, err
}
