package repository

import (
	"context"

	"github.com/KOU050223/wip/backend/internal/domain"
)

type ScoreRepository interface {
	Create(ctx context.Context, score *domain.Score) error
	FindRankings(ctx context.Context, limit int) ([]domain.Score, error)
}
