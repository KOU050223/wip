package realtime

import "context"

type MatchStatus string

const (
	MatchWaiting MatchStatus = "waiting"
	MatchFound   MatchStatus = "found"
)

type Match struct {
	Status  MatchStatus
	ID      string
	Players [2]string
}

// Queue is the distributed boundary for matchmaking. Implementations must make
// joining and pairing atomic across all server instances.
type Queue interface {
	Join(context.Context, string) (Match, error)
	Cancel(context.Context, string) error
	Status(context.Context, string) (Match, error)
}

type MatchmakingService struct {
	queue Queue
}

func NewMatchmakingService(queue Queue) *MatchmakingService {
	return &MatchmakingService{queue: queue}
}

func (s *MatchmakingService) Join(ctx context.Context, playerID string) (Match, error) {
	return s.queue.Join(ctx, playerID)
}

func (s *MatchmakingService) Cancel(ctx context.Context, playerID string) error {
	return s.queue.Cancel(ctx, playerID)
}

func (s *MatchmakingService) Status(ctx context.Context, playerID string) (Match, error) {
	return s.queue.Status(ctx, playerID)
}
