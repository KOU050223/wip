package httpapi

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/KOU050223/wip/backend/internal/config"
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
}

type ErrorResponse struct {
	Error string `json:"error"`
}

func NewRouter(scoreUsecase *usecase.ScoreUsecase, allowOrigins []string, pingDatabase PingFunc) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)

	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery(), config.CORSMiddleware(allowOrigins))

	r := &Router{scoreUsecase: scoreUsecase, pingDatabase: pingDatabase}
	router.GET("/health", r.health)
	router.POST("/api/scores", r.createScore)
	router.GET("/api/rankings", r.rankings)

	return router
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
