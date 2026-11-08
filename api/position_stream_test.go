package api

import (
	"guanlan/auth"
	"guanlan/config"
	"guanlan/manager"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func TestPositionStreamRequiresAuthenticationAndOwnership(t *testing.T) {
	db, err := config.NewDatabase(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, err := range []error{
		db.CreateUser(&config.User{ID: "owner", Email: "owner@example.invalid", PasswordHash: "test"}),
		db.CreateAIModel("owner", "stream-model", "test", "custom", false, "", ""),
		db.CreateExchange("owner", "binance", "test", "cex", false, "", "", false, "", "", "", ""),
		db.CreateTrader(&config.TraderRecord{ID: "stream-trader", UserID: "owner", Name: "test", AIModelID: "stream-model", ExchangeID: "binance", InitialBalance: 1000, ScanIntervalMinutes: 1}),
	} {
		if err != nil {
			t.Fatal(err)
		}
	}
	previous := auth.JWTSecret
	auth.SetJWTSecret("position-stream-test-secret")
	t.Cleanup(func() { auth.JWTSecret = previous })
	s := NewServer(manager.NewTraderManager(), db, nil, 0)
	for _, user := range []string{"", "other-user", "owner"} {
		for _, endpoint := range []string{"positions/stream", "history"} {
			req := httptest.NewRequest(http.MethodGet, "/api/traders/stream-trader/"+endpoint, nil)
			want := http.StatusUnauthorized
			if user != "" {
				token, err := auth.GenerateJWT(user, "test@example.invalid")
				if err != nil {
					t.Fatal(err)
				}
				req.Header.Set("Authorization", "Bearer "+token)
				want = http.StatusNotFound
			}
			w := httptest.NewRecorder()
			s.router.ServeHTTP(w, req)
			if w.Code != want {
				t.Fatalf("user=%q status=%d body=%s", user, w.Code, w.Body.String())
			}
			if w.Header().Get("Content-Type") == "text/event-stream" {
				t.Fatal("unauthorized/unloaded account opened a stream")
			}
		}
	}
}
