package decision

import (
	"testing"
	"time"
)

func TestClosedEquitiesFilteredBeforeCandidateBudgetButHoldingsRetained(t *testing.T) {
	closed := time.Date(2026, 11, 8, 15, 0, 0, 0, time.UTC)
	coins := []CandidateCoin{
		{Symbol: "TSLAUSDT", SignalEvidence: `{"category":"equity"}`},
		{Symbol: "SPYUSDT", SignalEvidence: `{"category":"equity"}`},
		{Symbol: "BTCUSDT", SignalEvidence: `{"category":"crypto"}`},
		{Symbol: "ETHUSDT"},
		{Symbol: "UNKNOWNUSDT"},
	}
	held := []PositionInfo{{Symbol: "TSLAUSDT"}}
	kept, skipped := FilterEquityCandidates(coins, held, map[string]string{"ETHUSDT": "crypto"}, closed)
	if len(kept) != 3 || kept[0].Symbol != "TSLAUSDT" || kept[1].Symbol != "BTCUSDT" || kept[2].Symbol != "ETHUSDT" || len(skipped) != 2 {
		t.Fatalf("holding removed or closed equity kept: %+v / %v", kept, skipped)
	}
	ctx := &Context{CandidateCoins: kept, Positions: held}
	ctx.SkippedEquities = skipped
	if !EquityEntryClosed(ctx, "SPYUSDT", closed) {
		t.Fatal("excluded equities must not be opened by a hallucinated decision")
	}
	if !EquityEntryClosed(ctx, "TSLAUSDT", closed) || EquityEntryClosed(ctx, "BTCUSDT", closed) {
		t.Fatal("held equities may be managed but must not open outside session")
	}
	open := time.Date(2026, 11, 9, 15, 0, 0, 0, time.UTC)
	kept, skipped = FilterEquityCandidates(coins, held, nil, open)
	if len(kept) != len(coins) || len(skipped) != 0 || EquityEntryClosed(ctx, "TSLAUSDT", open) {
		t.Fatal("open session filtered incorrectly")
	}
	// Filtering precedes the budget: many closed equities cannot starve crypto.
	many := make([]CandidateCoin, 40)
	for i := range many {
		many[i] = CandidateCoin{Symbol: "SPYUSDT", SignalEvidence: `{"category":"equity"}`}
	}
	many = append(many, coins[2])
	kept, _ = FilterEquityCandidates(many, nil, nil, closed)
	if len(kept) != 1 || kept[0].Symbol != "BTCUSDT" {
		t.Fatal("closed equities consumed analysis slots")
	}
}
