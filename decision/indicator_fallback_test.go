package decision

import (
	"errors"
	"guanlan/market"
	"math"
	"strings"
	"testing"
	"time"
)

func fallbackFixture(short bool) (*Context, time.Time) {
	now := time.Date(2026, 11, 10, 12, 0, 0, 0, time.UTC)
	volume := 1.3
	r := market.TechnicalReport{Interval: "3m", CandleAt: now.Add(-time.Minute), EMA20: 99, EMA50: 98, DIF: 1, DEA: .5, PreviousDIF: 0, PreviousDEA: .1, RSI14: 55, PreviousRSI14: 48, ATR14: 1, ReferenceHigh: 106, ReferenceLow: 95, LastOpen: 99, LastHigh: 101, LastLow: 99, LastClose: 100, VolumeRatio: &volume}
	if short {
		r.EMA20 = 101
		r.EMA50 = 102
		r.DIF = -1
		r.DEA = -.5
		r.PreviousDIF = 0
		r.PreviousDEA = -.1
		r.RSI14 = 45
		r.PreviousRSI14 = 52
		r.ReferenceLow = 94
		r.LastLow = 99
		r.LastHigh = 101
	}
	return &Context{BTCETHLeverage: 3, AltcoinLeverage: 3, CandidateCoins: []CandidateCoin{{Symbol: "BTCUSDT", Category: "crypto"}}, MarketDataMap: map[string]*market.Data{"BTCUSDT": {CurrentPrice: 100, Technical: []market.TechnicalReport{r}}}}, now
}
func TestIndicatorFallbackLongShortAndSingleEntry(t *testing.T) {
	for _, short := range []bool{false, true} {
		ctx, now := fallbackFixture(short)
		ctx.CandidateCoins = append(ctx.CandidateCoins, CandidateCoin{Symbol: "ETHUSDT", Category: "crypto"})
		ctx.MarketDataMap["ETHUSDT"] = ctx.MarketDataMap["BTCUSDT"]
		r := indicatorFallback(ctx, now)
		want := "open_long"
		if short {
			want = "open_short"
		}
		if r.Decisions[0].Action != want || r.Decisions[1].Action != "wait" {
			t.Fatalf("wrong decisions: %+v", r.Decisions)
		}
		d := r.Decisions[0]
		if d.RiskBudgetPct != .25 || d.Leverage != 2 || d.PositionSizeUSD != 0 || d.Confidence != 0 {
			t.Fatalf("wrong risk sizing: %+v", d)
		}
	}
}
func TestIndicatorFallbackRejectsBadEvidence(t *testing.T) {
	for _, kind := range []string{"missing", "stale", "future", "nan", "volume", "flat", "target", "cost", "session", "config"} {
		t.Run(kind, func(t *testing.T) {
			ctx, now := fallbackFixture(false)
			r := &ctx.MarketDataMap["BTCUSDT"].Technical[0]
			switch kind {
			case "missing":
				ctx.MarketDataMap = nil
			case "stale":
				r.CandleAt = now.Add(-10 * time.Minute)
			case "future":
				r.CandleAt = now.Add(time.Minute)
			case "nan":
				r.DIF = math.NaN()
			case "volume":
				r.VolumeRatio = nil
			case "flat":
				r.LastLow = 99.2
				r.PreviousRSI14 = 55
				r.PreviousDIF = 1
			case "target":
				r.ReferenceHigh = 99.9
			case "cost":
				r.LastLow = 99.99
				r.ATR14 = .01
				r.ReferenceHigh = 100.03
			case "session":
				ctx.CandidateCoins[0].Category = "equity"
			case "config":
				ctx.BTCETHLeverage = 0
			}
			if d := indicatorFallback(ctx, now).Decisions[0]; d.Action != "wait" {
				t.Fatalf("%s accepted: %+v", kind, d)
			}
		})
	}
}
func TestIndicatorFallbackHoldAndNoOutOfPoolEntry(t *testing.T) {
	ctx, now := fallbackFixture(false)
	ctx.Positions = []PositionInfo{{Symbol: "BTCUSDT", Side: "long"}}
	if r := indicatorFallback(ctx, now); len(r.Decisions) != 1 || r.Decisions[0].Action != "hold" {
		t.Fatalf("holding altered: %+v", r)
	}
	ctx.Positions = nil
	ctx.CandidateCoins = nil
	if r := indicatorFallback(ctx, now); len(r.Decisions) != 0 {
		t.Fatal("opened outside candidate list")
	}
}
func TestModelFailureFallbackAndRecovery(t *testing.T) {
	ctx, now := fallbackFixture(false)
	for _, problem := range []string{"402 Insufficient Balance", "timeout", "429", "500"} {
		r, err := ResolveModelDecision(ctx, "system", "input", func(string, string) (string, error) { return "", errors.New(problem) }, func() time.Time { return now })
		if err != nil || r.DecisionSource != "system_only" || r.Decisions[0].Action != "open_long" || !strings.Contains(r.FallbackReason, problem) {
			t.Fatalf("fallback failed: %+v %v", r, err)
		}
	}
	raw := `<decision>[{"symbol":"BTCUSDT","action":"wait","reasoning":"AI选择观望"}]</decision>`
	r, err := ResolveModelDecision(ctx, "system", "input", func(string, string) (string, error) { return raw, nil }, func() time.Time { return now })
	if err != nil || r.DecisionSource != "hybrid" || r.Decisions[0].Action != "wait" || r.FallbackReason != "" {
		t.Fatalf("AI wait overridden: %+v %v", r, err)
	}
	r, err = ResolveModelDecision(ctx, "system", "input", func(string, string) (string, error) { return "broken JSON", nil }, func() time.Time { return now })
	if err != nil || r.DecisionSource != "system_only" || r.RawResponse != "broken JSON" {
		t.Fatal("invalid response not retained for fallback")
	}
	// API latency must not let old evidence produce a new order.
	r, _ = ResolveModelDecision(ctx, "system", "input", func(string, string) (string, error) { return "", errors.New("timeout") }, func() time.Time { return now.Add(10 * time.Minute) })
	if r.Decisions[0].Action != "wait" {
		t.Fatal("timeout used stale evidence")
	}
}
