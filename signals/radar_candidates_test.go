package signals

import (
	"testing"
	"time"
)

func TestRadarCandidateFreshnessAndUniverse(t *testing.T) {
	now := time.Now()
	candle := now.Add(-time.Minute)
	good := RadarItem{Symbol: "TSLAUSDT", Category: "equity", Price: 1, CandleAt: &candle, Signals: []RadarSignal{{Kind: "macd"}}, Bias: "bull"}
	crypto := good
	crypto.Symbol = "BTCUSDT"
	crypto.Category = "crypto"
	quiet := good
	quiet.Symbol = "ETHUSDT"
	quiet.Signals = nil
	snap := RadarSnapshot{Result: &RadarResult{AsOf: now, Items: []RadarItem{good, crypto, quiet, good}}}
	items, err := RadarCandidates(snap, now)
	if err != nil || len(items) != 2 {
		t.Fatalf("items=%v error=%v", items, err)
	}
	snap.Result.AsOf = now.Add(-6 * time.Minute)
	if _, err = RadarCandidates(snap, now); err == nil {
		t.Fatal("stale accepted")
	}
	snap.Result.AsOf = now
	snap.Error = "scan failed"
	if _, err = RadarCandidates(snap, now); err == nil {
		t.Fatal("failed scan accepted")
	}
	snap.Error = ""
	old := now.Add(-21 * time.Minute)
	snap.Result.Items[0].CandleAt = &old
	snap.Result.Items = snap.Result.Items[:1]
	items, err = RadarCandidates(snap, now)
	if err != nil || len(items) != 0 {
		t.Fatal("old candle accepted")
	}
}
