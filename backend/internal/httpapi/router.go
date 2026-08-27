package httpapi

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/KOU050223/wip/backend/internal/config"
	"github.com/KOU050223/wip/backend/internal/realtime"
	"github.com/KOU050223/wip/backend/internal/usecase"
	"github.com/gin-gonic/gin"
)

// healthCheckTimeout は /health での DB 疎通確認に許す時間。
// DB がハングしてもヘルスチェック自体が詰まらないようにする。
const healthCheckTimeout = 2 * time.Second

// PingFunc は DB への疎通を確認する。
type PingFunc func(context.Context) error

type Router struct {
	scoreUsecase *usecase.ScoreUsecase
	pingDatabase PingFunc
	matchmaking  *realtime.MatchmakingService
}

type matchmakingResponse struct {
	Status  realtime.MatchStatus `json:"status"`
	MatchID string               `json:"match_id,omitempty"`
}

func NewRouter(scoreUsecase *usecase.ScoreUsecase, allowOrigins []string, pingDatabase PingFunc) *gin.Engine {
	return NewRouterWithRealtime(scoreUsecase, allowOrigins, pingDatabase, nil)
}

func NewRouterWithRealtime(scoreUsecase *usecase.ScoreUsecase, allowOrigins []string, pingDatabase PingFunc, matchmaking *realtime.MatchmakingService) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)

	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery(), config.CORSMiddleware(allowOrigins))

	r := &Router{scoreUsecase: scoreUsecase, pingDatabase: pingDatabase, matchmaking: matchmaking}
	router.GET("/health", r.health)
	router.POST("/api/scores", r.createScore)
	router.GET("/api/rankings", r.rankings)
	router.POST("/api/matchmaking/queue", r.joinMatchmaking)
	router.GET("/api/matchmaking/queue", r.matchmakingStatus)
	router.DELETE("/api/matchmaking/queue", r.cancelMatchmaking)

	return router
}

func (r *Router) matchmakingStatus(c *gin.Context) {
	if r.matchmaking == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "matchmaking is unavailable"})
		return
	}
	playerID, err := c.Cookie("player_id")
	if err != nil || playerID == "" {
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
	playerID, err := c.Cookie("player_id")
	if err != nil || playerID == "" {
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
	playerID, err := c.Cookie("player_id")
	if err != nil || playerID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "guest session is required"})
		return
	}
	if err := r.matchmaking.Cancel(c.Request.Context(), playerID); err != nil {
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
