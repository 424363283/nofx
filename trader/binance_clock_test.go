package trader

import (
	"context"
	"fmt"
	"github.com/adshao/go-binance/v2/common"
	"github.com/adshao/go-binance/v2/futures"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestBinanceReadClockRecovery(t *testing.T) {
	for _, code := range []int{-1021, -2015} {
		t.Run(fmt.Sprint(code), func(t *testing.T) {
			syncs := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				syncs++
				fmt.Fprintf(w, `{"serverTime":%d}`, time.Now().Add(-10*time.Second).UnixMilli())
			}))
			defer server.Close()
			c := futures.NewClient("test", "test")
			c.BaseURL = server.URL
			tr := &FuturesTrader{client: c, lastClockSync: time.Now()}
			attempts := 0
			_, err := binanceRead(tr, func(c *futures.Client, ctx context.Context) (int, error) {
				attempts++
				if attempts == 1 {
					return 0, &common.APIError{Code: int64(code), Message: "rejected"}
				}
				if c.TimeOffset < 9000 || c.TimeOffset > 11000 {
					t.Fatalf("offset = %d", c.TimeOffset)
				}
				return 42, nil
			})
			if code == -1021 {
				if err != nil || attempts != 2 || syncs != 1 {
					t.Fatalf("%v attempts=%d syncs=%d", err, attempts, syncs)
				}
			} else if err == nil || attempts != 1 || syncs != 0 {
				t.Fatal("non-clock error retried")
			}
		})
	}
}

func TestBinanceReadDoesNotLoop(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, `{"serverTime":%d}`, time.Now().UnixMilli())
	}))
	defer server.Close()
	c := futures.NewClient("test", "test")
	c.BaseURL = server.URL
	tr := &FuturesTrader{client: c, lastClockSync: time.Now()}
	attempts := 0
	_, err := binanceRead(tr, func(*futures.Client, context.Context) (int, error) {
		attempts++
		return 0, &common.APIError{Code: -1021}
	})
	if err == nil || attempts != 2 {
		t.Fatalf("err=%v attempts=%d", err, attempts)
	}
}
