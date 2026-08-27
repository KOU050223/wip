package realtime

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"strconv"
	"strings"
	"time"
)

const GuestSessionCookieName = "guest_session"

// GuestSessions signs opaque guest identities so a client cannot choose another
// player's identifier by setting a cookie value itself.
type GuestSessions struct {
	secret []byte
}

func NewGuestSessions(secret string) *GuestSessions {
	return &GuestSessions{secret: []byte(secret)}
}

func (s *GuestSessions) New() (string, error) {
	identifier := make([]byte, 16)
	if _, err := rand.Read(identifier); err != nil {
		return "", err
	}
	playerID := base64.RawURLEncoding.EncodeToString(identifier)
	return s.Sign(playerID, time.Now().Add(24*time.Hour)), nil
}

func (s *GuestSessions) Sign(playerID string, expiresAt time.Time) string {
	payload := playerID + "." + strconv.FormatInt(expiresAt.Unix(), 10)
	mac := hmac.New(sha256.New, s.secret)
	_, _ = mac.Write([]byte(payload))
	return payload + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (s *GuestSessions) PlayerID(token string, now time.Time) (string, bool) {
	playerID, rest, ok := strings.Cut(token, ".")
	if !ok || playerID == "" {
		return "", false
	}
	expiresRaw, signature, ok := strings.Cut(rest, ".")
	if !ok {
		return "", false
	}
	expiresAt, err := strconv.ParseInt(expiresRaw, 10, 64)
	if err != nil || now.Unix() > expiresAt {
		return "", false
	}
	payload := playerID + "." + expiresRaw
	mac := hmac.New(sha256.New, s.secret)
	_, _ = mac.Write([]byte(payload))
	expected, err := base64.RawURLEncoding.DecodeString(signature)
	if err != nil || !hmac.Equal(expected, mac.Sum(nil)) {
		return "", false
	}
	return playerID, true
}
