package trader

import (
	"guanlan/decision"
	"math"
	"testing"
)

func TestOpenEntryUsesCurrentPrice(t *testing.T) {
	for _, tc := range []struct {
		action              string
		price, stop, target float64
		allowed             bool
	}{
		{"open_long", 100, 98, 106, true},
		{"open_long", 104, 98, 106, false},
		{"open_long", 97, 98, 106, false},
		{"open_short", 100, 102, 94, true},
		{"open_short", 96, 102, 94, false},
		{"open_short", 103, 102, 94, false},
		{"open_long", math.NaN(), 98, 106, false},
		{"open_long", 100, 98, math.Inf(1), false},
	} {
		d := &decision.Decision{Action: tc.action, StopLoss: tc.stop, TakeProfit: tc.target, PositionSizeUSD: 20}
		if err := validateOpenEntry(d, tc.price); (err == nil) != tc.allowed {
			t.Errorf("%+v: %v", tc, err)
		}
	}
}
