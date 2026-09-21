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

func TestOriginAllowed(t *testing.T) {
	allowOrigins := []string{
		"https://wip-frontend.uomi.dev",
		"https://wip-frontend.uozumi05.workers.dev",
		"https://*.uozumi05.workers.dev",
		"http://localhost:5173",
	}

	tests := []struct {
		name   string
		origin string
		want   bool
	}{
		{"本番のカスタムドメイン", "https://wip-frontend.uomi.dev", true},
		{"本番の workers.dev", "https://wip-frontend.uozumi05.workers.dev", true},
		{"プレビューURL", "https://036c9650-wip-frontend.uozumi05.workers.dev", true},
		{"ポート付きのローカル", "http://localhost:5173", true},

		{"未登録のドメイン", "https://evil.example.com", false},
		{"スキームが違う", "http://wip-frontend.uomi.dev", false},
		{"ポートが違う", "http://localhost:3000", false},
		// ホスト名の末尾に許可ドメインを付けただけの偽装を弾く。
		{"サフィックスを装ったドメイン", "https://wip-frontend.uozumi05.workers.dev.evil.com", false},
		// `https://*.uozumi05.workers.dev` がドット区切りを要求することを確認する。
		{"部分一致を狙ったドメイン", "https://evil-uozumi05.workers.dev", false},
		{"空文字", "", false},
		{"スキームなし", "wip-frontend.uomi.dev", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := OriginAllowed(allowOrigins, tt.origin); got != tt.want {
				t.Fatalf("OriginAllowed(%q) = %v, want %v", tt.origin, got, tt.want)
			}
		})
	}
}

// ワイルドカードは自身のドメインには一致させない。
// 本番URLは許可リストに個別に並べてあるため実運用では影響しない。
func TestWildcardDoesNotMatchBareDomain(t *testing.T) {
	if OriginAllowed([]string{"https://*.uozumi05.workers.dev"}, "https://uozumi05.workers.dev") {
		t.Fatal("wildcard must not match the bare domain")
	}
}
