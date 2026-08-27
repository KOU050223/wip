package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/KOU050223/wip/backend/internal/domain"
	"github.com/KOU050223/wip/backend/internal/realtime"
	"github.com/KOU050223/wip/backend/internal/usecase"
	"github.com/alicebob/miniredis/v2"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
)

var testAllowOrigins = []string{"http://localhost:3000"}

type memoryScoreRepository struct {
	scores []domain.Score
	limit  int
}

type memoryQueue struct{ waiting string }

func (q *memoryQueue) Join(_ context.Context, playerID string) (realtime.Match, error) {
	if q.waiting == playerID {
		return realtime.Match{Status: realtime.MatchWaiting}, nil
	}
	if q.waiting == "" {
		q.waiting = playerID
		return realtime.Match{Status: realtime.MatchWaiting}, nil
	}
	match := realtime.Match{Status: realtime.MatchFound, ID: "match-1", Players: [2]string{q.waiting, playerID}}
	q.waiting = ""
	return match, nil
}

func (q *memoryQueue) Cancel(_ context.Context, _ string) error { return nil }
func (q *memoryQueue) Status(_ context.Context, _ string) (realtime.Match, error) {
	return realtime.Match{Status: realtime.MatchWaiting}, nil
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

// newTestRouter は DB 疎通が成功する状態のルーターを組み立てる。
func newTestRouter(scoreUsecase *usecase.ScoreUsecase) *gin.Engine {
	return NewRouter(scoreUsecase, testAllowOrigins, func(ctx context.Context) error { return nil })
}

func TestHealth(t *testing.T) {
	router := newTestRouter(usecase.NewScoreUsecase(&memoryScoreRepository{}))

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/health", nil)
	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}

	var body struct {
		Status string `json:"status"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if body.Status != "ok" {
		t.Fatalf("status = %q, want %q", body.Status, "ok")
	}
}

func TestHealthReturnsServiceUnavailableWhenDatabaseIsDown(t *testing.T) {
	pingErr := errors.New("connection refused")
	router := NewRouter(
		usecase.NewScoreUsecase(&memoryScoreRepository{}),
		testAllowOrigins,
		func(ctx context.Context) error { return pingErr },
	)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/health", nil)
	router.ServeHTTP(response, request)

	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusServiceUnavailable)
	}

	var body struct {
		Status string `json:"status"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if body.Status != "error" {
		t.Fatalf("status = %q, want %q", body.Status, "error")
	}
}

func TestReadinessReturnsServiceUnavailableWhenRedisIsDown(t *testing.T) {
	router := NewRouterWithRealtimeAndRoomsAndReadiness(
		usecase.NewScoreUsecase(&memoryScoreRepository{}), testAllowOrigins,
		func(context.Context) error { return nil }, nil, realtime.NewGuestSessions("test"), nil,
		func(context.Context) error { return errors.New("redis unavailable") },
	)

	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/readyz", nil))
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusServiceUnavailable)
	}
}

func TestCreateScore(t *testing.T) {
	repository := &memoryScoreRepository{}
	router := newTestRouter(usecase.NewScoreUsecase(repository))

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
	router := newTestRouter(usecase.NewScoreUsecase(repository))

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
	router := newTestRouter(usecase.NewScoreUsecase(&memoryScoreRepository{}))

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/rankings", nil)
	request.Header.Set("Origin", "http://localhost:3000")
	router.ServeHTTP(response, request)

	if got := response.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:3000" {
		t.Fatalf("Access-Control-Allow-Origin = %q, want %q", got, "http://localhost:3000")
	}
}

func TestCORSPreflight(t *testing.T) {
	router := newTestRouter(usecase.NewScoreUsecase(&memoryScoreRepository{}))

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
	router := newTestRouter(usecase.NewScoreUsecase(&memoryScoreRepository{}))

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/rankings", nil)
	request.Header.Set("Origin", "http://evil.example.com")
	router.ServeHTTP(response, request)

	if got := response.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("Access-Control-Allow-Origin = %q, want empty", got)
	}
}

func TestMatchmakingQueueUsesGuestPlayerCookie(t *testing.T) {
	router := NewRouterWithRealtime(
		usecase.NewScoreUsecase(&memoryScoreRepository{}),
		testAllowOrigins,
		func(context.Context) error { return nil },
		realtime.NewMatchmakingService(&memoryQueue{}),
	)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/matchmaking/queue", nil)
	request.AddCookie(guestCookie(t, router))
	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}
}

func TestGuestSessionIssuesSignedCookieAndRejectsForgedPlayerID(t *testing.T) {
	router := newMatchmakingTestRouter(&memoryQueue{})

	guestResponse := httptest.NewRecorder()
	router.ServeHTTP(guestResponse, httptest.NewRequest(http.MethodPost, "/api/guests", nil))
	if guestResponse.Code != http.StatusCreated {
		t.Fatalf("guest status = %d, want %d", guestResponse.Code, http.StatusCreated)
	}
	cookies := guestResponse.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != "guest_session" {
		t.Fatalf("cookies = %#v, want signed guest cookie", cookies)
	}

	forged := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/matchmaking/queue", nil)
	request.AddCookie(&http.Cookie{Name: "player_id", Value: "victim"})
	router.ServeHTTP(forged, request)
	if forged.Code != http.StatusUnauthorized {
		t.Fatalf("forged cookie status = %d, want %d", forged.Code, http.StatusUnauthorized)
	}

	authenticated := httptest.NewRecorder()
	request = httptest.NewRequest(http.MethodPost, "/api/matchmaking/queue", nil)
	request.AddCookie(cookies[0])
	router.ServeHTTP(authenticated, request)
	if authenticated.Code != http.StatusOK {
		t.Fatalf("signed cookie status = %d, want %d", authenticated.Code, http.StatusOK)
	}

	tampered := httptest.NewRecorder()
	request = httptest.NewRequest(http.MethodPost, "/api/matchmaking/queue", nil)
	request.AddCookie(&http.Cookie{Name: cookies[0].Name, Value: cookies[0].Value + "x"})
	router.ServeHTTP(tampered, request)
	if tampered.Code != http.StatusUnauthorized {
		t.Fatalf("tampered cookie status = %d, want %d", tampered.Code, http.StatusUnauthorized)
	}
}

func TestRoomWebSocketRejectsPlayerOutsideMatch(t *testing.T) {
	server := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	t.Cleanup(func() { _ = client.Close() })
	queue := realtime.NewRedisQueue(client)
	if _, err := queue.Join(t.Context(), "alice"); err != nil {
		t.Fatalf("alice Join returned error: %v", err)
	}
	match, err := queue.Join(t.Context(), "bob")
	if err != nil {
		t.Fatalf("bob Join returned error: %v", err)
	}
	sessions := realtime.NewGuestSessions("test-secret")
	router := NewRouterWithRealtimeAndRooms(
		usecase.NewScoreUsecase(&memoryScoreRepository{}), testAllowOrigins,
		func(context.Context) error { return nil }, realtime.NewMatchmakingService(queue), sessions, realtime.NewRedisRoom(client),
	)
	httpServer := httptest.NewServer(router)
	t.Cleanup(httpServer.Close)

	wsURL := "ws" + strings.TrimPrefix(httpServer.URL, "http") + "/api/matches/" + match.ID + "/ws"
	header := http.Header{}
	header.Add("Cookie", (&http.Cookie{Name: realtime.GuestSessionCookieName, Value: sessions.Sign("mallory", time.Now().Add(time.Hour))}).String())
	connection, response, err := websocket.DefaultDialer.Dial(wsURL, header)
	if connection != nil {
		_ = connection.Close()
	}
	if err == nil {
		t.Fatal("WebSocket connection for an unrelated player succeeded")
	}
	if response == nil || response.StatusCode != http.StatusForbidden {
		t.Fatalf("WebSocket response = %#v, want 403", response)
	}
}

func TestMatchmakingQueuePostReturnsOnlyStatusWhileWaiting(t *testing.T) {
	router := newMatchmakingTestRouter(&memoryQueue{})

	response := performMatchmakingRequest(t, router, http.MethodPost, "player-1")
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}

	var body map[string]json.RawMessage
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if got := string(body["status"]); got != `"waiting"` {
		t.Fatalf("status = %s, want %q", got, "waiting")
	}
	if _, ok := body["match_id"]; ok {
		t.Fatalf("waiting response includes match_id: %s", response.Body.String())
	}
}

func TestMatchmakingQueuePostFoundResponseDoesNotExposePlayers(t *testing.T) {
	router := newMatchmakingTestRouter(&memoryQueue{})
	if response := performMatchmakingRequest(t, router, http.MethodPost, "player-1"); response.Code != http.StatusOK {
		t.Fatalf("first POST status = %d, want %d", response.Code, http.StatusOK)
	}

	response := performMatchmakingRequest(t, router, http.MethodPost, "player-2")
	if response.Code != http.StatusOK {
		t.Fatalf("second POST status = %d, want %d", response.Code, http.StatusOK)
	}
	var body map[string]json.RawMessage
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if got := string(body["status"]); got != `"found"` {
		t.Fatalf("status = %s, want %q", got, "found")
	}
	if got := string(body["match_id"]); got == "" || got == `""` {
		t.Fatalf("match_id = %s, want non-empty", got)
	}
	for _, key := range []string{"Players", "players"} {
		if _, ok := body[key]; ok {
			t.Fatalf("response contains %q: %s", key, response.Body.String())
		}
	}
	if strings.Contains(response.Body.String(), "player-1") {
		t.Fatalf("response exposes opponent player ID: %s", response.Body.String())
	}
}

func TestMatchmakingQueueRejectsRequestsWithoutPlayerCookie(t *testing.T) {
	router := newMatchmakingTestRouter(&memoryQueue{})

	for _, method := range []string{http.MethodPost, http.MethodGet, http.MethodDelete} {
		response := httptest.NewRecorder()
		request := httptest.NewRequest(method, "/api/matchmaking/queue", nil)
		router.ServeHTTP(response, request)
		if response.Code != http.StatusUnauthorized {
			t.Errorf("%s status = %d, want %d", method, response.Code, http.StatusUnauthorized)
		}
	}
}

func TestMatchmakingQueueDeleteReturnsNoContentAndIsIdempotent(t *testing.T) {
	router := newMatchmakingTestRouter(&memoryQueue{})
	if response := performMatchmakingRequest(t, router, http.MethodPost, "player-1"); response.Code != http.StatusOK {
		t.Fatalf("POST status = %d, want %d", response.Code, http.StatusOK)
	}

	for range 2 {
		response := performMatchmakingRequest(t, router, http.MethodDelete, "player-1")
		if response.Code != http.StatusNoContent {
			t.Errorf("DELETE status = %d, want %d", response.Code, http.StatusNoContent)
		}
	}
}

func newMatchmakingTestRouter(queue realtime.Queue) *gin.Engine {
	return NewRouterWithRealtime(
		usecase.NewScoreUsecase(&memoryScoreRepository{}),
		testAllowOrigins,
		func(context.Context) error { return nil },
		realtime.NewMatchmakingService(queue),
	)
}

func performMatchmakingRequest(t *testing.T, router *gin.Engine, method, playerID string) *httptest.ResponseRecorder {
	t.Helper()
	response := httptest.NewRecorder()
	request := httptest.NewRequest(method, "/api/matchmaking/queue", nil)
	request.AddCookie(guestCookie(t, router))
	router.ServeHTTP(response, request)
	return response
}

func guestCookie(t *testing.T, router *gin.Engine) *http.Cookie {
	t.Helper()
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/guests", nil))
	if response.Code != http.StatusCreated {
		t.Fatalf("guest status = %d, want %d", response.Code, http.StatusCreated)
	}
	cookies := response.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("guest cookies = %#v, want one", cookies)
	}
	return cookies[0]
}
