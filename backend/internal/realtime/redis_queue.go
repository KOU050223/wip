package realtime

import (
	"context"
	"time"
	"uuid"

	"github.com/redis/go-redis/v9"
)

const defaultQueueKey = "matchmaking:queue:default"

const queueStaleAfter = 30 * time.Second
const matchResultLifetime = time.Minute

// RedisQueue stores only short-lived matching state. PostgreSQL remains the
// source of truth for users, scores, and completed matches.
type RedisQueue struct {
	client redis.UniversalClient
	key    string
}

func NewRedisQueue(client redis.UniversalClient) *RedisQueue {
	return &RedisQueue{client: client, key: defaultQueueKey}
}

func (q *RedisQueue) Join(ctx context.Context, playerID string) (Match, error) {
	matchID := uuid.NewV7().String()
	result, err := q.client.Eval(ctx, `
local key, player, matchID, now, stale, ttl = KEYS[1], ARGV[1], ARGV[2], ARGV[3], ARGV[4], ARGV[5]
redis.call('ZREMRANGEBYSCORE', key, 0, now - stale)
	local existing = redis.call('GET', 'matchmaking:player:' .. player)
if existing then return { 'found', existing } end
redis.call('ZADD', key, 'NX', now, player)
local players = redis.call('ZRANGE', key, 0, 1)
if #players < 2 then return { 'waiting' } end
redis.call('ZREM', key, players[1], players[2])
redis.call('SET', 'matchmaking:player:' .. players[1], matchID, 'PX', ttl)
redis.call('SET', 'matchmaking:player:' .. players[2], matchID, 'PX', ttl)
redis.call('HSET', 'match:' .. matchID, 'player:1', players[1], 'player:2', players[2], 'state', 'found')
redis.call('PEXPIRE', 'match:' .. matchID, ttl)
return { 'found', matchID }
`, []string{q.key}, playerID, matchID, time.Now().UnixMilli(), queueStaleAfter.Milliseconds(), matchResultLifetime.Milliseconds()).StringSlice()
	if err != nil {
		return Match{}, err
	}
	if len(result) == 1 {
		return Match{Status: MatchWaiting}, nil
	}
	return Match{Status: MatchFound, ID: result[1]}, nil
}

func (q *RedisQueue) Cancel(ctx context.Context, playerID string) error {
	result, err := q.client.Eval(ctx, `
local key, player = KEYS[1], ARGV[1]
if redis.call('GET', 'matchmaking:player:' .. player) then return 0 end
redis.call('ZREM', key, player)
return 1
`, []string{q.key}, playerID).Int()
	if err != nil {
		return err
	}
	if result == 0 {
		return ErrMatchAlreadyFound
	}
	return nil
}

func (q *RedisQueue) Status(ctx context.Context, playerID string) (Match, error) {
	matchID, err := q.client.Get(ctx, "matchmaking:player:"+playerID).Result()
	if err == redis.Nil {
		waiting, waitingErr := q.client.ZScore(ctx, q.key, playerID).Result()
		if waitingErr == nil && waiting >= 0 {
			return Match{Status: MatchWaiting}, nil
		}
		if waitingErr != nil && waitingErr != redis.Nil {
			return Match{}, waitingErr
		}
		return Match{Status: MatchIdle}, nil
	}
	if err != nil {
		return Match{}, err
	}
	return Match{Status: MatchFound, ID: matchID}, nil
}
