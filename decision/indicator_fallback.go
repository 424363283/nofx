package decision

import (
	"guanlan/market"
	"math"
	"time"
)

func validReport(r market.TechnicalReport, interval string, now time.Time) bool {
	step := 3 * time.Minute
	if interval == "15m" {
		step = 15 * time.Minute
	}
	if interval == "4h" {
		step = 4 * time.Hour
	}
	if r.Interval != interval || r.Unavailable != "" || r.CandleAt.IsZero() || r.CandleAt.After(now) || now.Sub(r.CandleAt) > step+5*time.Second {
		return false
	}
	for _, v := range []float64{r.DIF, r.DEA, r.PreviousDIF, r.PreviousDEA, r.RSI14, r.PreviousRSI14, r.EMA20, r.EMA50, r.ATR14, r.ReferenceHigh, r.ReferenceLow, r.LastOpen, r.LastHigh, r.LastLow, r.LastClose} {
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return false
		}
	}
	return r.EMA20 > 0 && r.EMA50 > 0 && r.ATR14 > 0 && r.LastLow > 0 && r.LastHigh >= r.LastClose && r.LastClose >= r.LastLow && r.ReferenceHigh > r.ReferenceLow && r.ReferenceLow > 0 && r.RSI14 >= 0 && r.RSI14 <= 100
}

func indicatorEntry(ctx *Context, symbol string, data *market.Data, now time.Time) Decision {
	return assessSystem(ctx, symbol, data, now).Decision
}
func indicatorFallback(ctx *Context, now time.Time) *FullDecision { return systemDecision(ctx, now) }
