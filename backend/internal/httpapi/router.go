package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/KOU050223/wip/backend/internal/config"
	"github.com/KOU050223/wip/backend/internal/realtime"
	"github.com/KOU050223/wip/backend/internal/usecase"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// healthCheckTimeout は /health での DB 疎通確認に許す時間。
// DB がハングしてもヘルスチェック自体が詰まらないようにする。
const healthCheckTimeout = 2 * time.Second

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
	roomContext, cancel := context.WithCancel(c.Request.Context())
	defer cancel()
	if err := r.room.SetPresence(roomContext, matchID, playerID); err != nil {
		return
	}
	defer r.room.ClearPresence(context.Background(), matchID, playerID)
	defer r.room.Publish(context.Background(), matchID, []byte(`{"type":"player.disconnected"}`))
	if err := r.room.Publish(roomContext, matchID, []byte(`{"type":"player.connected"}`)); err != nil {
		return
	}

	subscription := r.room.Subscribe(roomContext, matchID)
	defer subscription.Close()
	go func() {
		for {
			message, receiveErr := subscription.ReceiveMessage(roomContext)
			if receiveErr != nil {
				return
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
		if r.room.SetPresence(roomContext, matchID, playerID) != nil {
			return
		}
		if r.room.Publish(roomContext, matchID, payload) != nil {
			return
		}
	}
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
	if token, err := c.Cookie(realtime.GuestSessionCookieName); err == nil {
		if _, valid := r.guestSessions.PlayerID(token, time.Now()); valid {
			c.SetCookie(realtime.GuestSessionCookieName, token, 24*60*60, "/", "", false, true)
			c.Status(http.StatusCreated)
			return
		}
	}
	token, err := r.guestSessions.New()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create guest session"})
		return
	}
	c.SetCookie(realtime.GuestSessionCookieName, token, 24*60*60, "/", "", false, true)
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
