package usecase

import (
	"context"
	"reflect"
	"testing"

	"github.com/KOU050223/wip/backend/internal/domain"
)

type memoryScoreRepository struct {
	created  *domain.Score
	rankings []domain.Score
	limit    int
}

func (r *memoryScoreRepository) Create(ctx context.Context, score *domain.Score) error {
	r.created = score
	score.ID = 1
	return nil
}

func (r *memoryScoreRepository) FindRankings(ctx context.Context, limit int) ([]domain.Score, error) {
	r.limit = limit
	return r.rankings, nil
}

func TestCreateScoreTrimsPlayerName(t *testing.T) {
	repository := &memoryScoreRepository{}
	usecase := NewScoreUsecase(repository)

	score, err := usecase.CreateScore(context.Background(), CreateScoreInput{
		PlayerName: "  player  ",
		Score:      100,
		MaxCombo:   12,
		ClearTime:  90,
	})
	if err != nil {
		t.Fatalf("CreateScore returned error: %v", err)
	}

	if score.PlayerName != "player" {
		t.Fatalf("PlayerName = %q, want %q", score.PlayerName, "player")
	}
	if repository.created == nil {
		t.Fatal("repository.Create was not called")
	}
}

func TestCreateScoreRejectsEmptyPlayerName(t *testing.T) {
	repository := &memoryScoreRepository{}
	usecase := NewScoreUsecase(repository)

	_, err := usecase.CreateScore(context.Background(), CreateScoreInput{PlayerName: " "})
	if err == nil {
		t.Fatal("CreateScore returned nil error")
	}
	if repository.created != nil {
		t.Fatal("repository.Create was called")
	}
}

func TestRankingsUsesDefaultLimit(t *testing.T) {
	expected := []domain.Score{{ID: 1, PlayerName: "player", Score: 100}}
	repository := &memoryScoreRepository{rankings: expected}
	usecase := NewScoreUsecase(repository)

	rankings, err := usecase.Rankings(context.Background(), 0)
	if err != nil {
		t.Fatalf("Rankings returned error: %v", err)
	}

	if repository.limit != defaultRankingLimit {
		t.Fatalf("limit = %d, want %d", repository.limit, defaultRankingLimit)
	}
	if !reflect.DeepEqual(rankings, expected) {
		t.Fatalf("rankings = %#v, want %#v", rankings, expected)
	}
}
