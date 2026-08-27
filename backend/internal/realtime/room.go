package realtime

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

const presenceLifetime = 30 * time.Second

// RedisRoom owns the distributed room boundary. It deliberately keeps the
// room's member list in Redis so every container authorizes the same players.
type RedisRoom struct {
	client redis.UniversalClient
}

func NewRedisRoom(client redis.UniversalClient) *RedisRoom {
	return &RedisRoom{client: client}
}

func (r *RedisRoom) CanJoin(ctx context.Context, matchID, playerID string) (bool, error) {
	players, err := r.client.HMGet(ctx, "match:"+matchID, "player:1", "player:2").Result()
	if err != nil {
		return false, err
	}
	for _, player := range players {
		if player == playerID {
			return true, nil
		}
	}
	return false, nil
}

func (r *RedisRoom) SetPresence(ctx context.Context, matchID, playerID, leaseID string) error {
	return r.client.Set(ctx, "match:"+matchID+":presence:"+playerID, leaseID, presenceLifetime).Err()
}

func (r *RedisRoom) RefreshPresence(ctx context.Context, matchID, playerID, leaseID string) (bool, error) {
	refreshed, err := r.client.Eval(ctx, `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0
`, []string{"match:" + matchID + ":presence:" + playerID}, leaseID, presenceLifetime.Milliseconds()).Int()
	return refreshed == 1, err
}

func (r *RedisRoom) ClearPresence(ctx context.Context, matchID, playerID, leaseID string) (bool, error) {
	deleted, err := r.client.Eval(ctx, `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`, []string{"match:" + matchID + ":presence:" + playerID}, leaseID).Int()
	return deleted == 1, err
}

func (r *RedisRoom) OpponentPresent(ctx context.Context, matchID, playerID string) (bool, error) {
	players, err := r.client.HMGet(ctx, "match:"+matchID, "player:1", "player:2").Result()
	if err != nil {
		return false, err
	}
	var opponentID string
	for _, player := range players {
		candidate, ok := player.(string)
		if ok && candidate != "" && candidate != playerID {
			opponentID = candidate
			break
		}
	}
	if opponentID == "" {
		return false, nil
	}
	exists, err := r.client.Exists(ctx, "match:"+matchID+":presence:"+opponentID).Result()
	return exists == 1, err
}

func (r *RedisRoom) Publish(ctx context.Context, matchID string, event []byte) error {
	return r.client.Publish(ctx, "match:"+matchID+":events", event).Err()
}

func (r *RedisRoom) Subscribe(ctx context.Context, matchID string) *redis.PubSub {
	return r.client.Subscribe(ctx, "match:"+matchID+":events")
}
