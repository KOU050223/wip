package realtime

import (
	"testing"
	"time"
)

func TestRedisRoomAllowsOnlyMatchParticipants(t *testing.T) {
	queue, _, client := newTestRedisQueue(t)
	if _, err := queue.Join(t.Context(), "alice"); err != nil {
		t.Fatalf("alice Join returned error: %v", err)
	}
	match, err := queue.Join(t.Context(), "bob")
	if err != nil {
		t.Fatalf("bob Join returned error: %v", err)
	}
	room := NewRedisRoom(client)

	for _, playerID := range []string{"alice", "bob"} {
		allowed, err := room.CanJoin(t.Context(), match.ID, playerID)
		if err != nil || !allowed {
			t.Errorf("CanJoin(%q) = %v, %v; want true, nil", playerID, allowed, err)
		}
	}
	allowed, err := room.CanJoin(t.Context(), match.ID, "mallory")
	if err != nil {
		t.Fatalf("CanJoin returned error: %v", err)
	}
	if allowed {
		t.Fatal("unmatched player was allowed to join")
	}
}

func TestRedisRoomBroadcastsBetweenSubscribers(t *testing.T) {
	_, _, client := newTestRedisQueue(t)
	room := NewRedisRoom(client)
	subscriber := room.Subscribe(t.Context(), "match-1")
	defer subscriber.Close()
	if _, err := subscriber.ReceiveTimeout(t.Context(), time.Second); err != nil {
		t.Fatalf("subscription did not become ready: %v", err)
	}

	if err := room.Publish(t.Context(), "match-1", []byte(`{"type":"player.connected"}`)); err != nil {
		t.Fatalf("Publish returned error: %v", err)
	}
	message, err := subscriber.ReceiveMessage(t.Context())
	if err != nil {
		t.Fatalf("ReceiveMessage returned error: %v", err)
	}
	if message.Payload != `{"type":"player.connected"}` {
		t.Fatalf("payload = %q", message.Payload)
	}
}

func TestRedisRoomOldConnectionCannotClearNewPresenceLease(t *testing.T) {
	_, _, client := newTestRedisQueue(t)
	room := NewRedisRoom(client)

	if err := room.SetPresence(t.Context(), "match-1", "alice", "old-lease"); err != nil {
		t.Fatalf("old SetPresence returned error: %v", err)
	}
	if err := room.SetPresence(t.Context(), "match-1", "alice", "new-lease"); err != nil {
		t.Fatalf("new SetPresence returned error: %v", err)
	}
	cleared, err := room.ClearPresence(t.Context(), "match-1", "alice", "old-lease")
	if err != nil {
		t.Fatalf("old ClearPresence returned error: %v", err)
	}
	if cleared {
		t.Fatal("old lease reported that it cleared the new presence")
	}

	lease, err := client.Get(t.Context(), "match:match-1:presence:alice").Result()
	if err != nil {
		t.Fatalf("presence was removed: %v", err)
	}
	if lease != "new-lease" {
		t.Fatalf("presence lease = %q, want %q", lease, "new-lease")
	}
}

func TestRedisRoomOldConnectionCannotRefreshNewPresenceLease(t *testing.T) {
	_, _, client := newTestRedisQueue(t)
	room := NewRedisRoom(client)
	if err := room.SetPresence(t.Context(), "match-1", "alice", "old-lease"); err != nil {
		t.Fatalf("old SetPresence returned error: %v", err)
	}
	if err := room.SetPresence(t.Context(), "match-1", "alice", "new-lease"); err != nil {
		t.Fatalf("new SetPresence returned error: %v", err)
	}

	refreshed, err := room.RefreshPresence(t.Context(), "match-1", "alice", "old-lease")
	if err != nil {
		t.Fatalf("old RefreshPresence returned error: %v", err)
	}
	if refreshed {
		t.Fatal("old lease refreshed the new presence")
	}
	lease, err := client.Get(t.Context(), "match:match-1:presence:alice").Result()
	if err != nil {
		t.Fatalf("presence is missing: %v", err)
	}
	if lease != "new-lease" {
		t.Fatalf("presence lease = %q, want %q", lease, "new-lease")
	}
}

func TestRedisRoomReportsOpponentPresence(t *testing.T) {
	queue, _, client := newTestRedisQueue(t)
	if _, err := queue.Join(t.Context(), "alice"); err != nil {
		t.Fatalf("alice Join returned error: %v", err)
	}
	match, err := queue.Join(t.Context(), "bob")
	if err != nil {
		t.Fatalf("bob Join returned error: %v", err)
	}
	room := NewRedisRoom(client)
	if err := room.SetPresence(t.Context(), match.ID, "bob", "bob-lease"); err != nil {
		t.Fatalf("SetPresence returned error: %v", err)
	}

	present, err := room.OpponentPresent(t.Context(), match.ID, "alice")
	if err != nil {
		t.Fatalf("OpponentPresent returned error: %v", err)
	}
	if !present {
		t.Fatal("online opponent was reported absent")
	}
}
