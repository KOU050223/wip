package usecase

import (
	"context"
	"errors"
	"strings"

	"github.com/KOU050223/wip/backend/internal/domain"
	"github.com/KOU050223/wip/backend/internal/repository"
)

const defaultRankingLimit = 10

type CreateScoreInput struct {
	PlayerName string `json:"player_name"`
	Score      int    `json:"score"`
	MaxCombo   int    `json:"max_combo"`
	ClearTime  int    `json:"clear_time"`
}

type ScoreUsecase struct {
	repository repository.ScoreRepository
}

func NewScoreUsecase(repository repository.ScoreRepository) *ScoreUsecase {
	return &ScoreUsecase{repository: repository}
}

func (u *ScoreUsecase) CreateScore(ctx context.Context, input CreateScoreInput) (*domain.Score, error) {
	playerName := strings.TrimSpace(input.PlayerName)
	if playerName == "" {
		return nil, errors.New("player_name is required")
	}
	if input.Score < 0 {
		return nil, errors.New("score must be greater than or equal to 0")
	}
	if input.MaxCombo < 0 {
		return nil, errors.New("max_combo must be greater than or equal to 0")
	}
	if input.ClearTime < 0 {
		return nil, errors.New("clear_time must be greater than or equal to 0")
	}

	score := &domain.Score{
		PlayerName: playerName,
		Score:      input.Score,
		MaxCombo:   input.MaxCombo,
		ClearTime:  input.ClearTime,
	}

	if err := u.repository.Create(ctx, score); err != nil {
		return nil, err
	}
	return score, nil
}

func (u *ScoreUsecase) Rankings(ctx context.Context, limit int) ([]domain.Score, error) {
	if limit <= 0 {
		limit = defaultRankingLimit
	}
	if limit > 100 {
		limit = 100
	}
	return u.repository.FindRankings(ctx, limit)
}
