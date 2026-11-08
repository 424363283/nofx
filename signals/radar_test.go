package signals

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func radarRows(now time.Time, last float64) [][]json.RawMessage {
	rows := [][]json.RawMessage{}
	boundary := now.Truncate(radarPeriod)
	for i := 0; i < 121; i++ {
		start := boundary.Add(time.Duration(i-120) * radarPeriod).UnixMilli()
		close, volume := 100., 100.
		if i == 119 {
			close = last
			volume = 300
		}
		if i == 120 {
			close = 9999
			volume = 99999
		} // Open candle must never trigger signals.
		values := []any{start, "100", fmt.Sprint(math.Max(close, 100)), fmt.Sprint(math.Min(close, 100)), fmt.Sprint(close), "1", start + radarPeriod.Milliseconds() - 1, fmt.Sprint(volume)}
		raw := []json.RawMessage{}
		for _, v := range values {
			b, _ := json.Marshal(v)
			raw = append(raw, b)
		}
		rows = append(rows, raw)
	}
	return rows
}
func TestRadarClosedCandleCrosses(t *testing.T) {
	now := time.Now().UTC().Truncate(radarPeriod).Add(time.Minute)
	for _, tc := range []struct {
		price       float64
		cross, bias string
	}{{110, "金叉", "bull"}, {90, "死叉", "bear"}, {100, "持平", "neutral"}} {
		bars, err := closedCandles(radarRows(now, tc.price), now)
		if err != nil {
			t.Fatal(err)
		}
		if len(bars) != 120 || bars[119].Close != tc.price {
			t.Fatal("open candle included")
		}
		item := RadarItem{}
		analyzeCandles(&item, bars)
		finalizeRadar(&item)
		if item.MACD != tc.cross || item.Bias != tc.bias || *item.VolumeRatio != 3 {
			t.Fatalf("%+v", item)
		}
		if tc.price == 110 && (math.Abs(*item.DIF-0.7977207977208) > 1e-10 || math.Abs(*item.DEA-0.15954415954416) > 1e-10) {
			t.Fatal("MACD EMA calculation incorrect", *item.DIF, *item.DEA)
		}
	}
}

func TestRadarStructureExcludesTriggerFromReferenceWindow(t *testing.T) {
	now := time.Now().UTC().Truncate(radarPeriod).Add(time.Minute)
	bars, err := closedCandles(radarRows(now, 110), now)
	if err != nil {
		t.Fatal(err)
	}
	item := RadarItem{}
	analyzeCandles(&item, bars)
	s := item.Structure
	if s == nil || s.PreviousHigh20 != 100 || s.PreviousLow20 != 100 || s.AverageQuoteVolume20 != 100 {
		t.Fatalf("reference window includes breakout candle: %+v", s)
	}
	if len(s.Bars) != 8 || s.Bars[7].Close != 110 || s.Bars[7].QuoteVolume != 300 || !s.Bars[7].CloseAt.Equal(*item.CandleAt) {
		t.Fatalf("closed evidence incomplete or includes live candle: %+v", s)
	}
	if math.Abs(s.EMA20-(100+10.*2/21)) > 1e-10 || math.Abs(s.EMA50-(100+10.*2/51)) > 1e-10 {
		t.Fatalf("incorrect seeded EMA: %+v", s)
	}
}
func TestRadarRejectsStaleGappedMalformedCandles(t *testing.T) {
	now := time.Now().UTC()
	rows := radarRows(now, 110)
	if _, err := closedCandles(rows, now.Add(2*radarPeriod)); err == nil {
		t.Fatal("stale candles accepted")
	}
	gap := append(append([][]json.RawMessage{}, rows[:10]...), rows[11:]...)
	if _, err := closedCandles(gap, now); err == nil {
		t.Fatal("gap accepted")
	}
	rows[10][4] = json.RawMessage(`"NaN"`)
	if _, err := closedCandles(rows, now); err == nil {
		t.Fatal("invalid close accepted")
	}
	if _, err := closedCandles(radarRows(now, 110)[:50], now); err == nil {
		t.Fatal("short warmup accepted")
	}
}
func TestRadarOIRequiresAlignedSnapshots(t *testing.T) {
	end := time.Now().UTC().Truncate(radarPeriod)
	change := 1.
	item := RadarItem{CandleAt: &end, Change: &change}
	rows := []oiPoint{{"100", end.Add(-radarPeriod).UnixMilli()}, {"105", end.UnixMilli()}}
	if !analyzeOI(&item, rows) || math.Abs(*item.OIChange-5) > 1e-9 || item.Bull != 1 {
		t.Fatalf("%+v", item)
	}
	item = RadarItem{CandleAt: &end, Change: &change}
	rows[1].SumOpenInterest = "90"
	if !analyzeOI(&item, rows) || item.Bull != 0 || item.Bear != 0 || len(item.Signals) != 1 {
		t.Fatal("OI reduction must not invent direction", item)
	}
	item = RadarItem{CandleAt: &end}
	rows[1].Timestamp += 1
	if analyzeOI(&item, rows) || item.OIChange != nil {
		t.Fatal("unaligned OI accepted")
	}
	rows[1].Timestamp = end.UnixMilli()
	rows[0].SumOpenInterest = "0"
	if analyzeOI(&item, rows) {
		t.Fatal("zero denominator accepted")
	}
}
func TestRadarScanScopeAndPartialFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		now := time.Now().UTC()
		switch r.URL.Path {
		case "/fapi/v1/exchangeInfo":
			fmt.Fprint(w, `{"symbols":[{"symbol":"BTCUSDT","status":"TRADING","contractType":"PERPETUAL","quoteAsset":"USDT","marginAsset":"USDT"},{"symbol":"ETHUSDT","status":"TRADING","contractType":"PERPETUAL","quoteAsset":"USDT","marginAsset":"USDT"},{"symbol":"TSLAUSDT","status":"TRADING","contractType":"TRADIFI_PERPETUAL","quoteAsset":"USDT","marginAsset":"USDT","underlyingType":"EQUITY"}]}`)
		case "/fapi/v1/ticker/24hr":
			fmt.Fprintf(w, `[{"symbol":"BTCUSDT","quoteVolume":"2000","lastPrice":"110","closeTime":%d},{"symbol":"ETHUSDT","quoteVolume":"1000","lastPrice":"100","closeTime":%d},{"symbol":"TSLAUSDT","quoteVolume":"99999","lastPrice":"100","closeTime":%d}]`, now.UnixMilli(), now.UnixMilli(), now.UnixMilli())
		case "/fapi/v1/klines":
			if r.URL.Query().Get("symbol") == "ETHUSDT" {
				w.WriteHeader(503)
				return
			}
			json.NewEncoder(w).Encode(radarRows(now, 110))
		case "/futures/data/openInterestHist":
			w.WriteHeader(429)
		default:
			t.Errorf("unexpected endpoint %s", r.URL.Path)
			w.WriteHeader(404)
		}
	}))
	defer server.Close()
	c := &Client{BaseURL: server.URL, HTTP: server.Client()}
	result, err := c.ScanRadar(context.Background())
	if err != nil || result.Eligible != 3 || result.Scanned != 3 || result.Analyzed != 2 || len(result.Warnings) != 1 {
		t.Fatalf("%+v %v", result, err)
	}
	for _, item := range result.Items {
		if item.Symbol == "TSLAUSDT" && (item.Category != "equity" || item.CandleAt == nil) {
			t.Fatal("equity missing analysis", item)
		}
		if item.Symbol == "BTCUSDT" && (item.OIChange != nil || item.MACD != "金叉") {
			t.Fatal(item)
		}
		if item.Symbol == "ETHUSDT" && (item.Bias != "unavailable" || len(item.Signals) > 0) {
			t.Fatal(item)
		}
	}
}

func TestRadarIndependentAssetQuotas(t *testing.T) {
	items := []RadarItem{}
	for i := 0; i < 100; i++ {
		items = append(items, RadarItem{Symbol: fmt.Sprint(i), Category: "crypto"})
	}
	for i := 0; i < 80; i++ {
		items = append(items, RadarItem{Symbol: fmt.Sprint(i), Category: "equity"})
	}
	selected := selectRadarUniverse(items)
	counts := map[string]int{}
	for _, i := range selected {
		counts[i.Category]++
	}
	if len(selected) != 120 || counts["crypto"] != 60 || counts["equity"] != 60 {
		t.Fatal(counts)
	}
}
