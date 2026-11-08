package signals

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func fixture(t *testing.T, failOI bool) *Client {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		now := time.Now().UnixMilli()
		switch r.URL.Path {
		case "/fapi/v1/exchangeInfo":
			fmt.Fprint(w, `{"symbols":[{"symbol":"TSLAUSDT","status":"TRADING","contractType":"TRADIFI_PERPETUAL","quoteAsset":"USDT","marginAsset":"USDT","underlyingType":"EQUITY"},{"symbol":"BTCUSDT","status":"TRADING","contractType":"PERPETUAL","quoteAsset":"USDT","marginAsset":"USDT"},{"symbol":"OLDUSDT","status":"SETTLING","contractType":"PERPETUAL","quoteAsset":"USDT","marginAsset":"USDT"}]}`)
		case "/fapi/v1/ticker/24hr":
			fmt.Fprintf(w, `[{"symbol":"TSLAUSDT","quoteVolume":"1000","lastPrice":"105","closeTime":%d},{"symbol":"BTCUSDT","quoteVolume":"2000","lastPrice":"100","closeTime":%d}]`, now, now)
		case "/fapi/v1/premiumIndex":
			fmt.Fprintf(w, `[{"symbol":"TSLAUSDT","lastFundingRate":"-0.001","time":%d}]`, now)
		case "/futures/data/openInterestHist":
			if failOI {
				w.WriteHeader(429)
				return
			}
			fmt.Fprintf(w, `[{"sumOpenInterest":"100","timestamp":%d},{"sumOpenInterest":"110","timestamp":%d}]`, now-3600000, now)
		case "/fapi/v1/klines":
			rows := [][]any{}
			for i := 21; i >= 1; i-- {
				rows = append(rows, []any{0, "90", "100", "80", "90", "100", now - int64(i)*3600000 + 3599999})
			}
			json.NewEncoder(w).Encode(rows)
		default:
			t.Errorf("unexpected path %s", r.URL.Path)
			w.WriteHeader(404)
		}
	}))
	t.Cleanup(server.Close)
	return &Client{BaseURL: server.URL, HTTP: server.Client()}
}
func TestScanMetricsAndScope(t *testing.T) {
	c := fixture(t, false)
	cfg := Config{Enabled: true, Category: "equity", Limit: 5, Volume: true, OI: true, Funding: true, Breakout: true, OIMin: 3, FundingMin: .03}
	result, err := c.Scan(context.Background(), cfg, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Items) != 1 {
		t.Fatalf("%+v", result)
	}
	v := result.Items[0]
	if v.Symbol != "TSLAUSDT" || len(v.Reasons) != 4 || v.OIChange == nil || *v.OIChange < 9.99 || v.FundingRate == nil || *v.FundingRate != -.1 || v.Breakout != "向上突破" {
		t.Fatalf("bad metrics %+v", v)
	}
	result, err = c.Scan(context.Background(), cfg, []string{"BTCUSDT"})
	if err != nil || len(result.Items) != 0 {
		t.Fatal("explicit symbols must intersect asset scope", result, err)
	}
}
func TestScanFailureDoesNotInventSignals(t *testing.T) {
	c := fixture(t, true)
	cfg := Config{Enabled: true, Category: "equity", Limit: 5, OI: true, OIMin: 3}
	result, err := c.Scan(context.Background(), cfg, nil)
	if err != nil || len(result.Items) != 0 || len(result.Warnings) != 1 {
		t.Fatalf("%+v %v", result, err)
	}
	cfg.Funding = true
	cfg.FundingMin = 1
	result, err = c.Scan(context.Background(), cfg, nil)
	if err != nil || len(result.Items) != 0 {
		t.Fatal("below threshold must not match")
	}
}
func TestConfigValidation(t *testing.T) {
	c, err := Parse("{}")
	if err != nil || c.Enabled || c.Limit != 10 || !c.Volume {
		t.Fatal(c, err)
	}
	c.Enabled = true
	c.Limit = 100
	if c.Validate() == nil {
		t.Fatal("unbounded limit")
	}
	c.Limit = 10
	c.Volume = false
	if c.Validate() == nil {
		t.Fatal("no metrics")
	}
}
