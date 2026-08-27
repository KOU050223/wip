package realtime

import (
	"context"
	"testing"
)

type fakeQueue struct {
	waiting string
}

func (q *fakeQueue) Join(_ context.Context, playerID string) (Match, error) {
	if q.waiting == "" || q.waiting == playerID {
		q.waiting = playerID
		return Match{Status: MatchWaiting}, nil
	}
	match := Match{Status: MatchFound, Players: [2]string{q.waiting, playerID}}
	q.waiting = ""
	return match, nil
}

func (q *fakeQueue) Cancel(_ context.Context, playerID string) error {
	if q.waiting == playerID {
		q.waiting = ""
	}
	return nil
}

func (q *fakeQueue) Status(_ context.Context, playerID string) (Match, error) {
	if q.waiting == playerID {
		return Match{Status: MatchWaiting}, nil
	}
	return Match{}, nil
}

func TestMatchmakingJoinsTwoPlayers(t *testing.T) {
	service := NewMatchmakingService(&fakeQueue{})

	first, err := service.Join(t.Context(), "player-1")
	if err != nil {
		t.Fatalf("first Join returned error: %v", err)
	}
	if first.Status != MatchWaiting {
		t.Fatalf("first status = %q, want %q", first.Status, MatchWaiting)
	}

	second, err := service.Join(t.Context(), "player-2")
	if err != nil {
		t.Fatalf("second Join returned error: %v", err)
	}
	if second.Status != MatchFound {
		t.Fatalf("second status = %q, want %q", second.Status, MatchFound)
	}
	if second.Players != [2]string{"player-1", "player-2"} {
		t.Fatalf("players = %#v", second.Players)
	}
}
