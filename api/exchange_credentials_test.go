package api

import (
	"encoding/json"
	"guanlan/auth"
	"guanlan/config"
	"guanlan/manager"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func TestExchangeEditCredentialsAreOwnerOnlyAndNotInLists(t *testing.T) {
	db, err := config.NewDatabase(filepath.Join(t.TempDir(), "credentials.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := db.CreateUser(&config.User{ID: "key-owner", Email: "keys@example.invalid", PasswordHash: "test"}); err != nil {
		t.Fatal(err)
	}
	if err := db.CreateExchange("key-owner", "binance", "Binance", "cex", true, "demo-key", "demo-secret", false, "", "", "", ""); err != nil {
		t.Fatal(err)
	}
	prior := auth.JWTSecret
	auth.SetJWTSecret("edit-credentials-test")
	t.Cleanup(func() { auth.JWTSecret = prior })
	server := NewServer(manager.NewTraderManager(), db, nil, 0)
	for _, user := range []string{"", "other-user", "key-owner"} {
		req := httptest.NewRequest(http.MethodGet, "/api/exchanges/binance/credentials", nil)
		if user != "" {
			token, _ := auth.GenerateJWT(user, "test@example.invalid")
			req.Header.Set("Authorization", "Bearer "+token)
		}
		w := httptest.NewRecorder()
		server.router.ServeHTTP(w, req)
		want := http.StatusOK
		if user == "" {
			want = http.StatusUnauthorized
		} else if user != "key-owner" {
			want = http.StatusNotFound
		}
		if w.Code != want {
			t.Fatalf("user=%q status=%d", user, w.Code)
		}
		if want == http.StatusOK {
			var fields map[string]interface{}
			json.Unmarshal(w.Body.Bytes(), &fields)
			if fields["apiKey"] != "demo-key" || fields["secretKey"] != "demo-secret" || w.Header().Get("Cache-Control") != "no-store, private" {
				t.Fatal("edit credentials or cache policy incorrect")
			}
		}
	}
	token, _ := auth.GenerateJWT("key-owner", "test@example.invalid")
	req := httptest.NewRequest(http.MethodGet, "/api/exchanges", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	server.router.ServeHTTP(w, req)
	var list []map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &list)
	if w.Code != 200 || len(list) != 1 {
		t.Fatal("list request failed")
	}
	if _, ok := list[0]["apiKey"]; ok {
		t.Fatal("credentials leaked into list")
	}
	if _, ok := list[0]["secretKey"]; ok {
		t.Fatal("secret leaked into list")
	}
}
