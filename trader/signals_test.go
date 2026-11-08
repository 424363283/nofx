package trader

import (
	"encoding/json"
	"guanlan/decision"
	"guanlan/market"
	"guanlan/signals"
	"testing"
	"time"
)

func TestNativeSignalOpenGuard(t *testing.T) {
	ctx := &decision.Context{CandidateCoins: []decision.CandidateCoin{{Symbol: "TSLAUSDT"}}, MarketDataMap: map[string]*market.Data{"TSLAUSDT": {}, "BTCUSDT": {}}}
	if !nativeSignalAllowsOpen(ctx, "TSLAUSDT") || nativeSignalAllowsOpen(ctx, "BTCUSDT") {
		t.Fatal("candidate boundary failed")
	}
	delete(ctx.MarketDataMap, "TSLAUSDT")
	if nativeSignalAllowsOpen(ctx, "TSLAUSDT") {
		t.Fatal("missing data must block opening")
	}
	ctx.CandidateCoins = nil
	if nativeSignalAllowsOpen(ctx, "BTCUSDT") {
		t.Fatal("empty signals must block opening")
	}
}

func TestRadarToggleAndEmptyPool(t *testing.T) {
	at := &AutoTrader{config: AutoTraderConfig{SignalConfig: `{"radar_enabled":false}`}}
	at.SetRadarEnabled(true)
	cfg, err := at.signalConfig()
	if err != nil || !cfg.RadarEnabled {
		t.Fatal("live toggle not applied")
	}
	at.SetRadarEnabled(false)
	cfg, _ = at.signalConfig()
	if cfg.RadarEnabled {
		t.Fatal("toggle off not applied")
	}
}

func TestRadarCannotOpenWithStaleEvidence(t *testing.T) {
	item := signals.RadarItem{PriceAsOf: time.Now().Add(-6 * time.Minute)}
	raw, _ := json.Marshal(item)
	ctx := &decision.Context{CandidateCoins: []decision.CandidateCoin{{Symbol: "TSLAUSDT", Sources: []string{"binance_radar"}, SignalEvidence: string(raw)}}, MarketDataMap: map[string]*market.Data{"TSLAUSDT": {}}}
	if nativeSignalAllowsOpen(ctx, "TSLAUSDT") {
		t.Fatal("stale radar permitted opening")
	}
	item.PriceAsOf = time.Now()
	raw, _ = json.Marshal(item)
	ctx.CandidateCoins[0].SignalEvidence = string(raw)
	if !nativeSignalAllowsOpen(ctx, "TSLAUSDT") {
		t.Fatal("fresh evidence rejected")
	}
}
