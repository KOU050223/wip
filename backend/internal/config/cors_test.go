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
