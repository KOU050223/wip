package realtime

import (
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func newTestRedisQueue(t *testing.T) (*RedisQueue, *miniredis.Miniredis, *redis.Client) {
	t.Helper()

	server := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	t.Cleanup(func() { _ = client.Close() })
	return NewRedisQueue(client), server, client
}

func TestRedisQueueFirstJoinReturnsWaiting(t *testing.T) {
	queue, _, _ := newTestRedisQueue(t)

	match, err := queue.Join(t.Context(), "alice")
	if err != nil {
		t.Fatalf("Join returned error: %v", err)
	}
	if match.Status != MatchWaiting {
		t.Fatalf("status = %q, want %q", match.Status, MatchWaiting)
	}
	if match.ID != "" {
		t.Fatalf("match ID = %q, want empty", match.ID)
	}
}

func TestRedisQueueSecondJoinReturnsFoundMatchID(t *testing.T) {
	queue, _, _ := newTestRedisQueue(t)
	if _, err := queue.Join(t.Context(), "alice"); err != nil {
		t.Fatalf("alice Join returned error: %v", err)
	}

	match, err := queue.Join(t.Context(), "bob")
	if err != nil {
		t.Fatalf("bob Join returned error: %v", err)
	}
	if match.Status != MatchFound {
		t.Fatalf("status = %q, want %q", match.Status, MatchFound)
	}
	if match.ID == "" {
		t.Fatal("match ID is empty")
	}
}

func TestRedisQueueLetsFirstPlayerReadTheirMatchedRoom(t *testing.T) {
	queue, _, _ := newTestRedisQueue(t)

	if _, err := queue.Join(t.Context(), "alice"); err != nil {
		t.Fatalf("alice Join returned error: %v", err)
	}
	matched, err := queue.Join(t.Context(), "bob")
	if err != nil {
		t.Fatalf("bob Join returned error: %v", err)
	}
	if matched.Status != MatchFound {
		t.Fatalf("bob status = %q, want %q", matched.Status, MatchFound)
	}

	alice, err := queue.Status(t.Context(), "alice")
	if err != nil {
		t.Fatalf("alice Status returned error: %v", err)
	}
	if alice.ID != matched.ID || alice.Status != MatchFound {
		t.Fatalf("alice match = %#v, want ID %q", alice, matched.ID)
	}
}

func TestRedisQueueFoundMatchDoesNotExposeOpponentPlayerID(t *testing.T) {
	queue, _, _ := newTestRedisQueue(t)
	if _, err := queue.Join(t.Context(), "alice"); err != nil {
		t.Fatalf("alice Join returned error: %v", err)
	}

	match, err := queue.Join(t.Context(), "bob")
	if err != nil {
		t.Fatalf("bob Join returned error: %v", err)
	}
	if match.Players != [2]string{} {
		t.Fatalf("players = %#v, want no player IDs", match.Players)
	}
}

func TestRedisQueueRepeatedJoinDoesNotMatchPlayerWithThemselves(t *testing.T) {
	queue, _, _ := newTestRedisQueue(t)
	if _, err := queue.Join(t.Context(), "alice"); err != nil {
		t.Fatalf("first Join returned error: %v", err)
	}

	match, err := queue.Join(t.Context(), "alice")
	if err != nil {
		t.Fatalf("second Join returned error: %v", err)
	}
	if match.Status != MatchWaiting {
		t.Fatalf("status = %q, want %q", match.Status, MatchWaiting)
	}
	if match.ID != "" {
		t.Fatalf("match ID = %q, want empty", match.ID)
	}
}

func TestRedisQueueDropsStaleWaitingPlayers(t *testing.T) {
	queue, _, client := newTestRedisQueue(t)

	if err := client.ZAdd(t.Context(), queue.key, redis.Z{Score: float64(time.Now().Add(-queueStaleAfter).UnixMilli()), Member: "gone"}).Err(); err != nil {
		t.Fatalf("failed to create stale player: %v", err)
	}

	match, err := queue.Join(t.Context(), "new")
	if err != nil {
		t.Fatalf("new Join returned error: %v", err)
	}
	if match.Status != MatchWaiting {
		t.Fatalf("status = %q, want %q", match.Status, MatchWaiting)
	}
}

func TestRedisQueueStatusRefreshesActiveWaitingPlayer(t *testing.T) {
	queue, _, client := newTestRedisQueue(t)
	if _, err := queue.Join(t.Context(), "alice"); err != nil {
		t.Fatalf("alice Join returned error: %v", err)
	}

	originalScore := float64(time.Now().Add(-20 * time.Second).UnixMilli())
	if err := client.ZAdd(t.Context(), queue.key, redis.Z{Score: originalScore, Member: "alice"}).Err(); err != nil {
		t.Fatalf("failed to age waiting player: %v", err)
	}
	status, err := queue.Status(t.Context(), "alice")
	if err != nil {
		t.Fatalf("alice Status returned error: %v", err)
	}
	if status.Status != MatchWaiting {
		t.Fatalf("alice status = %q, want %q", status.Status, MatchWaiting)
	}
	refreshedScore, err := client.ZScore(t.Context(), queue.key, "alice").Result()
	if err != nil {
		t.Fatalf("failed to read refreshed score: %v", err)
	}
	if refreshedScore <= originalScore {
		t.Fatalf("refreshed score = %v, want greater than %v", refreshedScore, originalScore)
	}

	match, err := queue.Join(t.Context(), "bob")
	if err != nil {
		t.Fatalf("bob Join returned error: %v", err)
	}
	if match.Status != MatchFound {
		t.Fatalf("bob status = %q, want %q", match.Status, MatchFound)
	}
}

func TestRedisQueueStatusExpiresUnpolledWaitingPlayer(t *testing.T) {
	queue, _, client := newTestRedisQueue(t)
	if _, err := queue.Join(t.Context(), "alice"); err != nil {
		t.Fatalf("alice Join returned error: %v", err)
	}

	if err := client.ZAdd(t.Context(), queue.key, redis.Z{Score: float64(time.Now().Add(-queueStaleAfter - time.Millisecond).UnixMilli()), Member: "alice"}).Err(); err != nil {
		t.Fatalf("failed to expire waiting player: %v", err)
	}
	status, err := queue.Status(t.Context(), "alice")
	if err != nil {
		t.Fatalf("Status returned error: %v", err)
	}
	if status.Status != MatchIdle {
		t.Fatalf("status = %q, want %q", status.Status, MatchIdle)
	}
}

func TestRedisQueueRoomAuthorizationOutlivesMatchResult(t *testing.T) {
	queue, server, client := newTestRedisQueue(t)
	if _, err := queue.Join(t.Context(), "alice"); err != nil {
		t.Fatalf("alice Join returned error: %v", err)
	}
	match, err := queue.Join(t.Context(), "bob")
	if err != nil {
		t.Fatalf("bob Join returned error: %v", err)
	}

	server.FastForward(matchResultLifetime + time.Millisecond)
	allowed, err := NewRedisRoom(client).CanJoin(t.Context(), match.ID, "alice")
	if err != nil {
		t.Fatalf("CanJoin returned error: %v", err)
	}
	if !allowed {
		t.Fatal("room authorization expired with the matchmaking result")
	}
}

func TestRedisQueueCancelRemovesWaitingPlayer(t *testing.T) {
	queue, _, client := newTestRedisQueue(t)
	if _, err := queue.Join(t.Context(), "alice"); err != nil {
		t.Fatalf("alice Join returned error: %v", err)
	}
	if err := queue.Cancel(t.Context(), "alice"); err != nil {
		t.Fatalf("Cancel returned error: %v", err)
	}

	status, err := queue.Status(t.Context(), "alice")
	if err != nil {
		t.Fatalf("Status returned error: %v", err)
	}
	if status.Status != MatchIdle {
		t.Fatalf("status = %q, want %q", status.Status, MatchIdle)
	}
	if err := client.ZScore(t.Context(), queue.key, "alice").Err(); err != redis.Nil {
		t.Fatalf("waiting player remains in queue: %v", err)
	}

	match, err := queue.Join(t.Context(), "bob")
	if err != nil {
		t.Fatalf("bob Join returned error: %v", err)
	}
	if match.Status != MatchWaiting {
		t.Fatalf("bob status = %q, want %q", match.Status, MatchWaiting)
	}
}

func TestRedisQueueMatchResultExpires(t *testing.T) {
	queue, server, _ := newTestRedisQueue(t)
	if _, err := queue.Join(t.Context(), "alice"); err != nil {
		t.Fatalf("alice Join returned error: %v", err)
	}
	if _, err := queue.Join(t.Context(), "bob"); err != nil {
		t.Fatalf("bob Join returned error: %v", err)
	}

	server.FastForward(matchResultLifetime)
	status, err := queue.Status(t.Context(), "alice")
	if err != nil {
		t.Fatalf("Status returned error: %v", err)
	}
	if status.Status != MatchIdle {
		t.Fatalf("status after expiration = %q, want %q", status.Status, MatchIdle)
	}
}

func TestRedisQueueStatusIsIdleBeforeJoining(t *testing.T) {
	queue, _, _ := newTestRedisQueue(t)

	match, err := queue.Status(t.Context(), "alice")
	if err != nil {
		t.Fatalf("Status returned error: %v", err)
	}
	if match.Status != MatchStatus("idle") {
		t.Fatalf("status = %q, want %q", match.Status, "idle")
	}
}

func TestRedisQueueCancelAfterMatchKeepsMatchResult(t *testing.T) {
	queue, _, _ := newTestRedisQueue(t)
	if _, err := queue.Join(t.Context(), "alice"); err != nil {
		t.Fatalf("alice Join returned error: %v", err)
	}
	matched, err := queue.Join(t.Context(), "bob")
	if err != nil {
		t.Fatalf("bob Join returned error: %v", err)
	}

	if err := queue.Cancel(t.Context(), "alice"); err == nil {
		t.Fatal("Cancel returned nil after a match was found")
	}
	status, err := queue.Status(t.Context(), "alice")
	if err != nil {
		t.Fatalf("Status returned error: %v", err)
	}
	if status.Status != MatchFound || status.ID != matched.ID {
		t.Fatalf("status = %#v, want found match %q", status, matched.ID)
	}
}

func TestRedisQueueReturnsClientErrors(t *testing.T) {
	client := redis.NewClient(&redis.Options{Addr: "127.0.0.1:1"})
	if err := client.Close(); err != nil {
		t.Fatalf("failed to close Redis client: %v", err)
	}
	queue := NewRedisQueue(client)

	if _, err := queue.Join(t.Context(), "alice"); err == nil {
		t.Fatal("Join returned nil error for a closed Redis client")
	}
}
