package httpapi

import (
	"net/http"
	"strconv"

	"github.com/KOU050223/wip/backend/internal/config"
	"github.com/KOU050223/wip/backend/internal/usecase"
	"github.com/gin-gonic/gin"
)

type Router struct {
	scoreUsecase *usecase.ScoreUsecase
}

func NewRouter(scoreUsecase *usecase.ScoreUsecase, allowOrigins []string) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)

	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery(), config.CORSMiddleware(allowOrigins))

	r := &Router{scoreUsecase: scoreUsecase}
	router.GET("/health", r.health)
	router.POST("/api/scores", r.createScore)
	router.GET("/api/rankings", r.rankings)

	return router
}

func (r *Router) health(c *gin.Context) {
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
