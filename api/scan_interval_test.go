package api

import (
	"encoding/json"
	"guanlan/config"
	"guanlan/manager"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestUpdateTraderPersistsOneMinuteAndRejectsOutOfRange(t *testing.T) {
	db, err := config.NewDatabase(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, err := range []error{
		db.CreateUser(&config.User{ID: "interval-user", Email: "interval@example.invalid", PasswordHash: "test"}),
		db.CreateAIModel("interval-user", "interval-model", "test", "custom", false, "", ""),
		db.CreateExchange("interval-user", "interval-exchange", "test", "cex", false, "", "", false, "", "", "", ""),
		db.CreateTrader(&config.TraderRecord{ID: "interval-trader", UserID: "interval-user", Name: "test", AIModelID: "interval-model", ExchangeID: "interval-exchange", InitialBalance: 1000, ScanIntervalMinutes: 3, SystemPromptTemplate: "default"}),
	} {
		if err != nil {
			t.Fatal(err)
		}
	}
	s := &Server{database: db, traderManager: manager.NewTraderManager()}
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.PUT("/traders/:id", func(c *gin.Context) { c.Set("user_id", "interval-user"); s.handleUpdateTrader(c) })
	for _, minutes := range []int{1, 60, -1, 61, 0} {
		body, _ := json.Marshal(UpdateTraderRequest{Name: "test", AIModelID: "interval-model", ExchangeID: "interval-exchange", InitialBalance: 1000, ScanIntervalMinutes: minutes})
		w := httptest.NewRecorder()
		router.ServeHTTP(w, httptest.NewRequest(http.MethodPut, "/traders/interval-trader", strings.NewReader(string(body))))
		wantStatus := http.StatusOK
		if minutes < 0 || minutes > 60 {
			wantStatus = http.StatusBadRequest
		}
		if w.Code != wantStatus {
			t.Fatalf("minutes=%d status=%d body=%s", minutes, w.Code, w.Body.String())
		}
		saved, _, _, err := db.GetTraderConfig("interval-user", "interval-trader")
		wantMinutes := minutes
		if wantStatus != http.StatusOK || minutes == 0 {
			wantMinutes = 60
		}
		if err != nil || saved.ScanIntervalMinutes != wantMinutes {
			t.Fatalf("minutes=%d saved=%v err=%v", minutes, saved, err)
		}
	}
}
