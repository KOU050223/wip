package config

import (
	"slices"
	"testing"
)

func TestAllowOriginsIncludesHTTPSViteDevelopmentOrigin(t *testing.T) {
	t.Setenv("CORS_ALLOW_ORIGINS", "")

	if !slices.Contains(AllowOrigins(), "https://localhost:5173") {
		t.Fatal("default CORS origins must allow the HTTPS Vite development server")
	}
}

func TestAllowOriginsIncludesLANViteDevelopmentOrigins(t *testing.T) {
	t.Setenv("CORS_ALLOW_ORIGINS", "")

	for _, want := range []string{"http://192.168.1.155:5173", "https://192.168.1.155:5173"} {
		if !slices.Contains(AllowOrigins(), want) {
			t.Fatalf("default CORS origins must allow %q", want)
		}
	}
}

func TestGuestSessionCookieSecureDefaultsToTrueAndCanBeDisabledForLANDevelopment(t *testing.T) {
	t.Setenv("GUEST_SESSION_COOKIE_SECURE", "")
	if !GuestSessionCookieSecure() {
		t.Fatal("guest session cookie must be secure by default")
	}

	t.Setenv("GUEST_SESSION_COOKIE_SECURE", "false")
	if GuestSessionCookieSecure() {
		t.Fatal("guest session cookie should allow an explicit LAN development override")
	}
}
