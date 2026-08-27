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
const roomLifetime = 15 * time.Minute

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
local key, player, matchID, stale, resultTTL, roomTTL = KEYS[1], ARGV[1], ARGV[2], ARGV[3], ARGV[4], ARGV[5]
local redisTime = redis.call('TIME')
local now = tonumber(redisTime[1]) * 1000 + math.floor(tonumber(redisTime[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', key, 0, now - stale)
local existing = redis.call('GET', 'matchmaking:player:' .. player)
if existing then return { 'found', existing } end
redis.call('ZADD', key, 'NX', now, player)
local players = redis.call('ZRANGE', key, 0, 1)
if #players < 2 then return { 'waiting' } end
redis.call('ZREM', key, players[1], players[2])
redis.call('SET', 'matchmaking:player:' .. players[1], matchID, 'PX', resultTTL)
redis.call('SET', 'matchmaking:player:' .. players[2], matchID, 'PX', resultTTL)
redis.call('HSET', 'match:' .. matchID, 'player:1', players[1], 'player:2', players[2], 'state', 'found')
redis.call('PEXPIRE', 'match:' .. matchID, roomTTL)
return { 'found', matchID }
`, []string{q.key}, playerID, matchID, queueStaleAfter.Milliseconds(), matchResultLifetime.Milliseconds(), roomLifetime.Milliseconds()).StringSlice()
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
	result, err := q.client.Eval(ctx, `
local key, player, stale = KEYS[1], ARGV[1], ARGV[2]
local matchID = redis.call('GET', 'matchmaking:player:' .. player)
if matchID then return { 'found', matchID } end
local score = redis.call('ZSCORE', key, player)
if not score then return { 'idle' } end
local redisTime = redis.call('TIME')
local now = tonumber(redisTime[1]) * 1000 + math.floor(tonumber(redisTime[2]) / 1000)
if tonumber(score) <= now - stale then
  redis.call('ZREM', key, player)
  return { 'idle' }
end
redis.call('ZADD', key, 'XX', now, player)
return { 'waiting' }
`, []string{q.key}, playerID, queueStaleAfter.Milliseconds()).StringSlice()
	if err != nil {
		return Match{}, err
	}
	match := Match{Status: MatchStatus(result[0])}
	if len(result) > 1 {
		match.ID = result[1]
	}
	return match, nil
}
