package trader

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/adshao/go-binance/v2/common"
	"github.com/adshao/go-binance/v2/futures"
)

func TestBinanceRestrictionCooldownAndRecovery(t *testing.T) {
	var requests atomic.Int64
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if requests.Add(1) == 1 {
			w.WriteHeader(http.StatusUnavailableForLegalReasons)
			fmt.Fprint(w, `{"code":0,"msg":"Service unavailable from a restricted location according to Eligibility"}`)
			return
		}
		fmt.Fprint(w, `{"totalWalletBalance":"100","availableBalance":"90","totalUnrealizedProfit":"0"}`)
	}))
	defer server.Close()
	c := futures.NewClient("test", "test")
	c.BaseURL = server.URL
	tr := &FuturesTrader{client: c, lastClockSync: time.Now(), cacheDuration: 15 * time.Second}
	_, err := tr.GetBalance()
	var apiErr *common.APIError
	if !errors.As(err, &apiErr) || !strings.Contains(err.Error(), "访问地区") {
		t.Fatalf("restriction not explained: %v", err)
	}
	var callers sync.WaitGroup
	for i := 0; i < 10; i++ {
		callers.Add(1)
		go func() {
			defer callers.Done()
			if _, err := tr.GetBalance(); err == nil {
				t.Error("restricted balance accepted")
			}
			if _, err := tr.GetPositions(); err == nil {
				t.Error("restricted positions accepted")
			}
		}()
	}
	callers.Wait()
	if requests.Load() != 1 {
		t.Fatalf("restriction retried %d times", requests.Load())
	}
	// Even a still-valid cache must not conceal a known access failure.
	tr.cachedBalance, tr.balanceCacheTime = map[string]interface{}{"availableBalance": 999.0}, time.Now()
	if _, err := tr.GetBalance(); err == nil {
		t.Fatal("served cached balance during restriction")
	}
	tr.balanceCacheTime = time.Now().Add(-time.Minute)
	tr.readMutex.Lock()
	tr.readRetryAt = time.Now().Add(-time.Second)
	tr.readMutex.Unlock()
	balance, err := tr.GetBalance()
	if err != nil || balance["availableBalance"] != 90.0 || requests.Load() != 2 {
		t.Fatalf("recovery: %v %v requests=%d", balance, err, requests.Load())
	}
	if tr.binanceReadUnavailable() != nil {
		t.Fatal("recovered client still blocked")
	}
}

func TestBinanceOtherErrorsDoNotTriggerLocationCooldown(t *testing.T) {
	c := futures.NewClient("test", "test")
	tr := &FuturesTrader{client: c, lastClockSync: time.Now()}
	for _, err := range []error{&common.APIError{Code: -2015, Message: "Invalid API-key"}, &common.APIError{Code: 0, Message: "unknown error"}, errors.New("EOF")} {
		_, got := binanceRead(tr, func(*futures.Client, context.Context) (int, error) { return 0, err })
		if !errors.Is(got, err) || tr.binanceReadUnavailable() != nil {
			t.Fatalf("unrelated error classified as region failure: %v", got)
		}
	}
}
