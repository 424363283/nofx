package trader

import (
	"guanlan/decision"
	"math"
	"strings"
	"testing"
)

type fundingTestTrader struct {
	Trader
	funded bool
}

func (t *fundingTestTrader) GetBalance() (map[string]interface{}, error) {
	wallet, available := 0., 0.
	if t.funded {
		wallet, available = 1000, 900
	}
	return map[string]interface{}{"totalWalletBalance": wallet, "availableBalance": available, "totalUnrealizedProfit": 0.}, nil
}

func TestFundingFailureKeepsSignalAndDoesNotPauseNextCycle(t *testing.T) {
	tr := &fundingTestTrader{}
	at := &AutoTrader{trader: tr}
	d := &decision.Decision{Symbol: "CAPUSDT", Action: "open_long", Leverage: 3, StopLoss: 98, TakeProfit: 108, Reasoning: "qualified breakout"}
	err := at.sizeSignalEntry(d, 100, nil)
	if err == nil || !strings.Contains(err.Error(), "开仓失败：资金不足") || d.Action != "open_long" || d.Reasoning != "qualified breakout" || at.entryProtectionBlocked.Load() {
		t.Fatalf("funding failure lost the signal or paused trading: %v %+v", err, d)
	}
	tr.funded = true
	if err := at.sizeSignalEntry(d, 100, nil); err != nil || d.PositionSizeUSD <= 0 || d.RiskUSD > 2.5+1e-9 {
		t.Fatalf("next funded execution did not recover: %v %+v", err, d)
	}
}

func TestExecutionSizingLimitsAndMinimum(t *testing.T) {
	d := &decision.Decision{Symbol: "CAPUSDT", Action: "open_long", Leverage: 3, StopLoss: 98, TakeProfit: 108, RiskBudgetPct: 0.5}
	size, err := calculateSignalEntrySize(d, 100, 1000, 900, 0, 0)
	if err != nil || math.Abs(size-5/.022) > 1e-8 {
		t.Fatalf("size=%f err=%v", size, err)
	}
	for _, tc := range []struct {
		equity, available, margin float64
		count                     int
	}{
		{0, 0, 0, 0}, {1000, 0, 0, 0}, {1000, 900, 300, 0}, {1000, 900, 0, 3}, {1, 1, 0, 0},
	} {
		if _, err := calculateSignalEntrySize(d, 100, tc.equity, tc.available, tc.margin, tc.count); err == nil {
			t.Errorf("invalid execution accepted: %+v", tc)
		}
	}
	d.PositionSizeUSD = 20
	size, err = calculateSignalEntrySize(d, 100, 1000, 900, 0, 0)
	if err != nil || size != 20 {
		t.Fatal("must not increase an explicit suggested notional")
	}
}
