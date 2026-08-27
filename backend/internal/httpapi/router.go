package httpapi

import (
	"context"
	json "encoding/json/v2"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
	"uuid"

	"github.com/KOU050223/wip/backend/internal/config"
	"github.com/KOU050223/wip/backend/internal/domain"
	"github.com/KOU050223/wip/backend/internal/realtime"
	"github.com/KOU050223/wip/backend/internal/usecase"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// healthCheckTimeout は /health での DB 疎通確認に許す時間。
// DB がハングしてもヘルスチェック自体が詰まらないようにする。
const healthCheckTimeout = 2 * time.Second
const websocketMessageLimit = 64 << 10
const presenceRefreshInterval = 10 * time.Second
const websocketPongWait = 30 * time.Second

// PingFunc は DB への疎通を確認する。
type PingFunc func(context.Context) error

type Router struct {
	scoreUsecase  *usecase.ScoreUsecase
	pingDatabase  PingFunc
	pingRedis     PingFunc
	matchmaking   *realtime.MatchmakingService
	guestSessions *realtime.GuestSessions
	room          *realtime.RedisRoom
	allowOrigins  []string
}

type matchmakingResponse struct {
	Status  realtime.MatchStatus `json:"status"`
	MatchID string               `json:"match_id,omitempty"`
}

type roomJoinedEvent struct {
	Type              string `json:"type"`
	OpponentConnected bool   `json:"opponent_connected"`
}

type roomPresenceEvent struct {
	Type     string `json:"type"`
	PlayerID string `json:"player_id"`
}

type roomClientEvent struct {
	Type    string `json:"type"`
	Payload string `json:"payload"`
}

type ErrorResponse struct {
	Error string `json:"error"`
}

// RankingsResponse はスコア順のランキング一覧を返す。
type RankingsResponse struct {
	Rankings []domain.Score `json:"rankings"`
}

func NewRouter(scoreUsecase *usecase.ScoreUsecase, allowOrigins []string, pingDatabase PingFunc) *gin.Engine {
	return NewRouterWithRealtime(scoreUsecase, allowOrigins, pingDatabase, nil)
}

func NewRouterWithRealtime(scoreUsecase *usecase.ScoreUsecase, allowOrigins []string, pingDatabase PingFunc, matchmaking *realtime.MatchmakingService) *gin.Engine {
	return NewRouterWithRealtimeAndGuestSessions(scoreUsecase, allowOrigins, pingDatabase, matchmaking, realtime.NewGuestSessions("development-only-secret"))
}

func NewRouterWithRealtimeAndGuestSessions(scoreUsecase *usecase.ScoreUsecase, allowOrigins []string, pingDatabase PingFunc, matchmaking *realtime.MatchmakingService, guestSessions *realtime.GuestSessions) *gin.Engine {
	return NewRouterWithRealtimeAndRoomsAndReadiness(scoreUsecase, allowOrigins, pingDatabase, matchmaking, guestSessions, nil, nil)
}

func NewRouterWithRealtimeAndRooms(scoreUsecase *usecase.ScoreUsecase, allowOrigins []string, pingDatabase PingFunc, matchmaking *realtime.MatchmakingService, guestSessions *realtime.GuestSessions, room *realtime.RedisRoom) *gin.Engine {
	return NewRouterWithRealtimeAndRoomsAndReadiness(scoreUsecase, allowOrigins, pingDatabase, matchmaking, guestSessions, room, nil)
}

func NewRouterWithRealtimeAndRoomsAndReadiness(scoreUsecase *usecase.ScoreUsecase, allowOrigins []string, pingDatabase PingFunc, matchmaking *realtime.MatchmakingService, guestSessions *realtime.GuestSessions, room *realtime.RedisRoom, pingRedis PingFunc) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)

	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery(), config.CORSMiddleware(allowOrigins))

	r := &Router{scoreUsecase: scoreUsecase, pingDatabase: pingDatabase, pingRedis: pingRedis, matchmaking: matchmaking, guestSessions: guestSessions, room: room, allowOrigins: allowOrigins}
	router.GET("/health", r.health)
	router.GET("/livez", r.live)
	router.GET("/readyz", r.ready)
	router.POST("/api/guests", r.createGuest)
	router.POST("/api/scores", r.createScore)
	router.GET("/api/rankings", r.rankings)
	router.POST("/api/matchmaking/queue", r.joinMatchmaking)
	router.GET("/api/matchmaking/queue", r.matchmakingStatus)
	router.DELETE("/api/matchmaking/queue", r.cancelMatchmaking)
	router.GET("/api/matches/:matchID/ws", r.roomWebSocket)

	return router
}

func (r *Router) live(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (r *Router) ready(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), healthCheckTimeout)
	defer cancel()
	if err := r.pingDatabase(ctx); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"status": "error", "database": "unreachable"})
		return
	}
	if r.pingRedis != nil {
		if err := r.pingRedis(ctx); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "error", "redis": "unreachable"})
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (r *Router) roomWebSocket(c *gin.Context) {
	if r.room == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "rooms are unavailable"})
		return
	}
	playerID, ok := r.playerID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "guest session is required"})
		return
	}
	matchID := c.Param("matchID")
	allowed, err := r.room.CanJoin(c.Request.Context(), matchID, playerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to validate room participant"})
		return
	}
	if !allowed {
		c.JSON(http.StatusForbidden, gin.H{"error": "not a match participant"})
		return
	}

	connection, err := (&websocket.Upgrader{CheckOrigin: r.websocketOriginAllowed}).Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer connection.Close()
	connection.SetReadLimit(websocketMessageLimit)
	if err := connection.SetReadDeadline(time.Now().Add(websocketPongWait)); err != nil {
		return
	}
	connection.SetPongHandler(func(string) error {
		return connection.SetReadDeadline(time.Now().Add(websocketPongWait))
	})
	roomContext, cancel := context.WithCancel(c.Request.Context())
	defer cancel()
	subscription := r.room.Subscribe(roomContext, matchID)
	defer subscription.Close()
	if _, err := subscription.Receive(roomContext); err != nil {
		return
	}
	leaseID := uuid.NewV7().String()
	if err := r.room.SetPresence(roomContext, matchID, playerID, leaseID); err != nil {
		return
	}
	defer func() {
		cleared, clearErr := r.room.ClearPresence(context.Background(), matchID, playerID, leaseID)
		if clearErr == nil && cleared {
			event, marshalErr := json.Marshal(&roomPresenceEvent{Type: "player.disconnected", PlayerID: playerID})
			if marshalErr == nil {
				_ = r.room.Publish(context.Background(), matchID, event)
			}
		}
	}()
	opponentPresent, err := r.room.OpponentPresent(roomContext, matchID, playerID)
	if err != nil {
		return
	}
	joinedEvent, err := json.Marshal(&roomJoinedEvent{Type: "room.joined", OpponentConnected: opponentPresent})
	if err != nil {
		return
	}
	if err := connection.WriteMessage(websocket.TextMessage, joinedEvent); err != nil {
		return
	}
	connectedEvent, err := json.Marshal(&roomPresenceEvent{Type: "player.connected", PlayerID: playerID})
	if err != nil {
		return
	}
	if err := r.room.Publish(roomContext, matchID, connectedEvent); err != nil {
		return
	}

	go func() {
		presenceTicks := time.Tick(presenceRefreshInterval)
		for {
			select {
			case <-roomContext.Done():
				return
			case <-presenceTicks:
				if connection.WriteControl(websocket.PingMessage, nil, time.Now().Add(5*time.Second)) != nil {
					_ = connection.Close()
					return
				}
				refreshed, refreshErr := r.room.RefreshPresence(roomContext, matchID, playerID, leaseID)
				if refreshErr != nil || !refreshed {
					_ = connection.Close()
					return
				}
				presentEvent, marshalErr := json.Marshal(&roomPresenceEvent{Type: "player.present", PlayerID: playerID})
				if marshalErr != nil || r.room.Publish(roomContext, matchID, presentEvent) != nil {
					_ = connection.Close()
					return
				}
			}
		}
	}()
	go func() {
		for {
			message, receiveErr := subscription.ReceiveMessage(roomContext)
			if receiveErr != nil {
				return
			}
			if ownPresenceEvent([]byte(message.Payload), playerID) {
				continue
			}
			if connection.WriteMessage(websocket.TextMessage, []byte(message.Payload)) != nil {
				return
			}
		}
	}()
	for {
		_, payload, readErr := connection.ReadMessage()
		if readErr != nil {
			return
		}
		event, eventErr := clientRoomEvent(payload)
		if eventErr != nil {
			return
		}
		if r.room.Publish(roomContext, matchID, event) != nil {
			return
		}
	}
}

func clientRoomEvent(payload []byte) ([]byte, error) {
	return json.Marshal(&roomClientEvent{Type: "room.message", Payload: string(payload)})
}

func ownPresenceEvent(payload []byte, playerID string) bool {
	var event roomPresenceEvent
	if err := json.Unmarshal(payload, &event); err != nil {
		return false
	}
	return (event.Type == "player.connected" || event.Type == "player.disconnected" || event.Type == "player.present") && event.PlayerID == playerID
}

func (r *Router) websocketOriginAllowed(request *http.Request) bool {
	origin := request.Header.Get("Origin")
	if origin == "" {
		return true
	}
	for _, allowedOrigin := range r.allowOrigins {
		if strings.EqualFold(origin, allowedOrigin) {
			return true
		}
	}
	return false
}

func (r *Router) createGuest(c *gin.Context) {
	c.SetSameSite(http.SameSiteNoneMode)
	if token, err := c.Cookie(realtime.GuestSessionCookieName); err == nil {
		if _, valid := r.guestSessions.PlayerID(token, time.Now()); valid {
			c.SetCookie(realtime.GuestSessionCookieName, token, 24*60*60, "/", "", true, true)
			c.Status(http.StatusCreated)
			return
		}
	}
	token, err := r.guestSessions.New()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create guest session"})
		return
	}
	c.SetCookie(realtime.GuestSessionCookieName, token, 24*60*60, "/", "", true, true)
	c.Status(http.StatusCreated)
}

func (r *Router) playerID(c *gin.Context) (string, bool) {
	token, err := c.Cookie(realtime.GuestSessionCookieName)
	if err != nil {
		return "", false
	}
	return r.guestSessions.PlayerID(token, time.Now())
}

func (r *Router) matchmakingStatus(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	if r.matchmaking == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "matchmaking is unavailable"})
		return
	}
	playerID, ok := r.playerID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "guest session is required"})
		return
	}
	match, err := r.matchmaking.Status(c.Request.Context(), playerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get matchmaking status"})
		return
	}
	c.JSON(http.StatusOK, matchmakingResponse{Status: match.Status, MatchID: match.ID})
}

func (r *Router) joinMatchmaking(c *gin.Context) {
	if r.matchmaking == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "matchmaking is unavailable"})
		return
	}
	playerID, ok := r.playerID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "guest session is required"})
		return
	}
	match, err := r.matchmaking.Join(c.Request.Context(), playerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to join matchmaking"})
		return
	}
	c.JSON(http.StatusOK, matchmakingResponse{Status: match.Status, MatchID: match.ID})
}

func (r *Router) cancelMatchmaking(c *gin.Context) {
	if r.matchmaking == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "matchmaking is unavailable"})
		return
	}
	playerID, ok := r.playerID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "guest session is required"})
		return
	}
	if err := r.matchmaking.Cancel(c.Request.Context(), playerID); errors.Is(err, realtime.ErrMatchAlreadyFound) {
		c.JSON(http.StatusConflict, gin.H{"error": "match has already been found"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to cancel matchmaking"})
		return
	}
	c.Status(http.StatusNoContent)
}

func (r *Router) health(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), healthCheckTimeout)
	defer cancel()

	if err := r.pingDatabase(ctx); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"status": "error", "database": "unreachable"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// createScore saves a player's game score.
//
// @Summary      Save score
// @Description  Saves a player's score, max combo, and clear time.
// @Tags         scores
// @ID           saveScore
// @Accept       json
// @Produce      json
// @Param        score  body      usecase.CreateScoreInput  true  "Score payload"
// @Success      201    {object}  domain.Score
// @Failure      400    {object}  ErrorResponse
// @Router       /api/scores [post]
func (r *Router) createScore(c *gin.Context) {
	var input usecase.CreateScoreInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	score, err := r.scoreUsecase.CreateScore(c.Request.Context(), input)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, score)
}

// rankings returns the score ranking.
//
// @Summary      Get rankings
// @Description  Returns scores ordered by score (desc), then clear time (asc), then created time (asc).
// @Tags         scores
// @ID           getRankings
// @Produce      json
// @Param        limit  query     int  false  "Max number of entries to return (1-100, default 10)"
// @Success      200    {object}  RankingsResponse
// @Failure      400    {object}  ErrorResponse
// @Failure      500    {object}  ErrorResponse
// @Router       /api/rankings [get]
func (r *Router) rankings(c *gin.Context) {
	limit := 0
	if rawLimit := c.Query("limit"); rawLimit != "" {
		parsedLimit, err := strconv.Atoi(rawLimit)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "limit must be a number"})
			return
		}
		limit = parsedLimit
	}

	scores, err := r.scoreUsecase.Rankings(c.Request.Context(), limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get rankings"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"rankings": scores})
}
