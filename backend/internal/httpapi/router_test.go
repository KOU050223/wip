package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/KOU050223/wip/backend/internal/domain"
	"github.com/KOU050223/wip/backend/internal/usecase"
)

var testAllowOrigins = []string{"http://localhost:3000"}

type memoryScoreRepository struct {
	scores []domain.Score
	limit  int
}

func (r *memoryScoreRepository) Create(ctx context.Context, score *domain.Score) error {
	score.ID = uint(len(r.scores) + 1)
	r.scores = append(r.scores, *score)
	return nil
}

func (r *memoryScoreRepository) FindRankings(ctx context.Context, limit int) ([]domain.Score, error) {
	r.limit = limit
	return r.scores, nil
}

func TestHealth(t *testing.T) {
	router := NewRouter(usecase.NewScoreUsecase(&memoryScoreRepository{}), testAllowOrigins)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/health", nil)
	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}
}

func TestCreateScore(t *testing.T) {
	repository := &memoryScoreRepository{}
	router := NewRouter(usecase.NewScoreUsecase(repository), testAllowOrigins)

	response := httptest.NewRecorder()
	body := strings.NewReader(`{"player_name":"player","score":100,"max_combo":12,"clear_time":90}`)
	request := httptest.NewRequest(http.MethodPost, "/api/scores", body)
	request.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusCreated)
	}
	if len(repository.scores) != 1 {
		t.Fatalf("created scores = %d, want %d", len(repository.scores), 1)
	}
}

func TestRankings(t *testing.T) {
	repository := &memoryScoreRepository{
		scores: []domain.Score{{ID: 1, PlayerName: "player", Score: 100}},
	}
	router := NewRouter(usecase.NewScoreUsecase(repository), testAllowOrigins)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/rankings?limit=5", nil)
	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}
	if repository.limit != 5 {
		t.Fatalf("limit = %d, want %d", repository.limit, 5)
	}

	var body struct {
		Rankings []domain.Score `json:"rankings"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if len(body.Rankings) != 1 {
		t.Fatalf("rankings = %d, want %d", len(body.Rankings), 1)
	}
}

func TestCORSAllowsConfiguredOrigin(t *testing.T) {
	router := NewRouter(usecase.NewScoreUsecase(&memoryScoreRepository{}), testAllowOrigins)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/rankings", nil)
	request.Header.Set("Origin", "http://localhost:3000")
	router.ServeHTTP(response, request)

	if got := response.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:3000" {
		t.Fatalf("Access-Control-Allow-Origin = %q, want %q", got, "http://localhost:3000")
	}
}

func TestCORSPreflight(t *testing.T) {
	router := NewRouter(usecase.NewScoreUsecase(&memoryScoreRepository{}), testAllowOrigins)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodOptions, "/api/scores", nil)
	request.Header.Set("Origin", "http://localhost:3000")
	request.Header.Set("Access-Control-Request-Method", http.MethodPost)
	router.ServeHTTP(response, request)

	if response.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusNoContent)
	}
}

func TestCORSRejectsUnknownOrigin(t *testing.T) {
	router := NewRouter(usecase.NewScoreUsecase(&memoryScoreRepository{}), testAllowOrigins)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/rankings", nil)
	request.Header.Set("Origin", "http://evil.example.com")
	router.ServeHTTP(response, request)

	if got := response.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("Access-Control-Allow-Origin = %q, want empty", got)
	}
}
