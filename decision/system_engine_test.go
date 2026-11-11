package decision

import (
	"strings"
	"testing"
	"time"
)

func TestHybridAgreementKeepsSystemRisk(t *testing.T) {
	ctx, now := fallbackFixture(false)
	want := systemDecision(ctx, now).Decisions[0]
	raw := `<decision>[{"symbol":"BTCUSDT","action":"open_long","leverage":3,"position_size_usd":500,"stop_loss":98,"take_profit":110,"confidence":90,"reasoning":"agree"}]</decision>`
	got, err := ResolveModelDecision(ctx, "", "", func(s, u string) (string, error) {
		if !strings.Contains(u, "系统计划") || !strings.Contains(u, "long_score") {
			t.Fatal("AI missing systematic evidence")
		}
		return raw, nil
	}, func() time.Time { return now })
	if err != nil || got.DecisionSource != "hybrid" || got.Decisions[0].Action != want.Action || got.Decisions[0].StopLoss != want.StopLoss || got.Decisions[0].Leverage != want.Leverage || got.Decisions[0].PositionSizeUSD != 0 {
		t.Fatalf("unexpected hybrid result: %+v", got)
	}
}
func TestAIOnlyEntryBlocked(t *testing.T) {
	ctx, now := fallbackFixture(false)
	ctx.MarketDataMap = nil
	raw := `<decision>[{"symbol":"BTCUSDT","action":"open_long","leverage":2,"position_size_usd":500,"stop_loss":98,"take_profit":110,"confidence":90,"reasoning":"buy"}]</decision>`
	got, _ := ResolveModelDecision(ctx, "", "", func(string, string) (string, error) { return raw, nil }, func() time.Time { return now })
	if got.Decisions[0].Action != "wait" {
		t.Fatal("AI bypassed system")
	}
}
func TestSystemUses15mAndPullback(t *testing.T) {
	ctx, now := fallbackFixture(false)
	data := ctx.MarketDataMap["BTCUSDT"]
	base := data.Technical[0]
	base.Interval = "15m"
	data.Technical = append(data.Technical, base)
	a := assessSystem(ctx, "BTCUSDT", data, now)
	if a.Timeframe != "15m" || a.Setup != "回踩再启动" || a.Decision.Action != "open_long" {
		t.Fatalf("bad assessment %+v", a)
	}
	data.Technical[1].ATR14 = 6
	if a = assessSystem(ctx, "BTCUSDT", data, now); a.Decision.Action != "wait" || a.Regime != "高波动" {
		t.Fatal("volatility not respected")
	}
}
func TestSystemConfirmedExitNoReversal(t *testing.T) {
	ctx, now := fallbackFixture(true)
	data := ctx.MarketDataMap["BTCUSDT"]
	data.Technical[0].ReferenceLow = 100.5
	base := data.Technical[0]
	base.Interval = "15m"
	data.Technical = append(data.Technical, base)
	ctx.Positions = []PositionInfo{{Symbol: "BTCUSDT", Side: "long"}}
	got := systemDecision(ctx, now)
	if len(got.Decisions) != 1 || got.Decisions[0].Action != "close_long" {
		t.Fatalf("bad exit %+v", got.Decisions)
	}
	data.Technical[1].CandleAt = now.Add(-time.Hour)
	if systemDecision(ctx, now).Decisions[0].Action != "hold" {
		t.Fatal("stale reversal allowed")
	}
}

func TestRangeRejectionsBothDirections(t *testing.T) {
	for _, short := range []bool{false, true} {
		ctx, now := fallbackFixture(short)
		data := ctx.MarketDataMap["BTCUSDT"]
		r := &data.Technical[0]
		r.EMA20 = 100
		r.EMA50 = 100
		r.ReferenceLow = 99.8
		r.ReferenceHigh = 106
		r.LastLow = 99.5
		r.LastOpen = 99.6
		if short {
			r.ReferenceLow = 94
			r.ReferenceHigh = 100.2
			r.LastHigh = 100.5
			r.LastOpen = 100.4
			r.LastLow = 99
		}
		a := assessSystem(ctx, "BTCUSDT", data, now)
		want := "open_long"
		if short {
			want = "open_short"
		}
		if a.Regime != "震荡/过渡" || a.Decision.Action != want {
			t.Fatalf("range short=%v %+v", short, a)
		}
	}
}
func TestBreakoutRequiresObservedForwardTarget(t *testing.T) {
	ctx, now := fallbackFixture(false)
	data := ctx.MarketDataMap["BTCUSDT"]
	data.Technical[0].ReferenceHigh = 99.8
	if assessSystem(ctx, "BTCUSDT", data, now).Decision.Action != "wait" {
		t.Fatal("invented breakout target")
	}
	base := data.Technical[0]
	base.Interval = "4h"
	base.ReferenceHigh = 106
	data.Technical = append(data.Technical, base)
	a := assessSystem(ctx, "BTCUSDT", data, now)
	if a.Decision.Action != "open_long" || a.Setup != "趋势突破" {
		t.Fatalf("breakout rejected %+v", a)
	}
}
