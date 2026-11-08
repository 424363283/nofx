package api

import (
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
	"time"
)

func TestFuturesSymbolsFiltersAndCaches(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"symbols":[
   {"symbol":"TSLAUSDT","status":"TRADING","contractType":"TRADIFI_PERPETUAL","quoteAsset":"USDT","marginAsset":"USDT","underlyingType":"EQUITY"},
   {"symbol":"XAUUSDT","status":"TRADING","contractType":"TRADIFI_PERPETUAL","quoteAsset":"USDT","marginAsset":"USDT","underlyingType":"COMMODITY"},
   {"symbol":"ETHUSDT","status":"TRADING","contractType":"PERPETUAL","quoteAsset":"USDT","marginAsset":"USDT"},
   {"symbol":"BTCUSDT","status":"TRADING","contractType":"PERPETUAL","quoteAsset":"USDT","marginAsset":"USDT"},
   {"symbol":"BTCUSDT","status":"TRADING","contractType":"PERPETUAL","quoteAsset":"USDT","marginAsset":"USDT"},
   {"symbol":"OLDUSDT","status":"SETTLING","contractType":"PERPETUAL","quoteAsset":"USDT","marginAsset":"USDT"},
   {"symbol":"BTCUSDT_QUARTER","status":"TRADING","contractType":"CURRENT_QUARTER","quoteAsset":"USDT","marginAsset":"USDT"},
   {"symbol":"BTCUSDC","status":"TRADING","contractType":"PERPETUAL","quoteAsset":"USDC","marginAsset":"USDC"}
  ]}`))
	}))
	defer server.Close()
	source := &futuresSymbolSource{client: server.Client(), url: server.URL}
	for i := 0; i < 2; i++ {
		symbols, err := source.load()
		if err != nil || !reflect.DeepEqual(symbols, []string{"BTCUSDT", "ETHUSDT", "TSLAUSDT", "XAUUSDT"}) {
			t.Fatalf("symbols=%v error=%v", symbols, err)
		}
	}
	if source.categories["TSLAUSDT"] != "equity" || source.categories["XAUUSDT"] != "commodity" {
		t.Fatal("incorrect TradFi classification")
	}
	if calls != 1 {
		t.Fatalf("cache missed: %d calls", calls)
	}
	source.updatedAt = time.Now().Add(-6 * time.Minute)
	if _, err := source.load(); err != nil {
		t.Fatal(err)
	}
	if calls != 2 {
		t.Fatal("expired cache was not refreshed")
	}
}

func TestFuturesSymbolsRejectsInvalidResponses(t *testing.T) {
	for _, response := range []struct {
		name, body string
		status     int
	}{
		{"rate limit", `{}`, 429}, {"invalid JSON", `<html>`, 200}, {"empty", `{"symbols":[]}`, 200},
	} {
		t.Run(response.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(response.status)
				w.Write([]byte(response.body))
			}))
			defer server.Close()
			source := &futuresSymbolSource{client: server.Client(), url: server.URL}
			if _, err := source.load(); err == nil {
				t.Fatal("expected an error")
			}
			if len(source.symbols) != 0 {
				t.Fatal("bad response cached")
			}
		})
	}
}
