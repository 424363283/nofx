package market

import (
	"strings"
	"testing"
	"time"
)

func TestClosedMarketKlines(t *testing.T) {
	now := time.UnixMilli(20000)
	bars := []Kline{{CloseTime: 10000, Close: 1}, {CloseTime: 20000, Close: 999}, {CloseTime: 30000, Close: 999}, {CloseTime: 0, Close: 999}}
	closed := closedMarketKlines(bars, now)
	if len(closed) != 1 || closed[0].Close != 1 {
		t.Fatalf("unclosed or untimed bars included: %+v", closed)
	}
}

func TestDecisionIndicatorsPreserveSmallDifferences(t *testing.T) {
	d := &Data{CurrentEMA20: 0.0004372638, CurrentMACD: -0.0000000137, LongerTermContext: &LongerTermData{EMA20: 0.0037331, EMA50: 0.0037339, ATR14: 0.00000001, MACDValues: []float64{-0.0000000137}}}
	prompt := Format(d)
	for _, want := range []string{"current_ema20 = 0.0004372638", "current_macd = -1.37e-08", "EMA: 0.0037331 vs.", "EMA: 0.0037339", "1e-08", "-1.37e-08"} {
		if !strings.Contains(prompt, want) {
			t.Fatalf("lost indicator precision %q: %s", want, prompt)
		}
	}
}
