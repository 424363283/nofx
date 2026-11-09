package market

import (
	"math"
	"strings"
	"testing"
	"time"
)

func technicalBars() ([]Kline, time.Time) {
	start := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	bars := make([]Kline, 100)
	for i := range bars {
		at := start.Add(time.Duration(i) * 3 * time.Minute)
		bars[i] = Kline{OpenTime: at.UnixMilli(), CloseTime: at.Add(3*time.Minute).UnixMilli() - 1, Open: 100, Close: 100, High: 101, Low: 99, Volume: 10, QuoteVolume: 1000}
	}
	return bars, start.Add(300 * time.Minute)
}
func TestTechnicalClosedAndInvalidHistory(t *testing.T) {
	bars, now := technicalBars()
	original := AnalyzeTechnical(bars, "3m", 3*time.Minute, now)
	if original.Unavailable != "" || original.RSI14 != 50 {
		t.Fatalf("flat history: %+v", original)
	}
	future := bars[99]
	future.OpenTime += 180000
	future.CloseTime += 180000
	future.Close = 999
	withFuture := AnalyzeTechnical(append(bars, future), "3m", 3*time.Minute, now)
	if withFuture.DIF != original.DIF || withFuture.CandleAt != original.CandleAt {
		t.Fatal("unclosed candle contaminated indicators")
	}
	for _, kind := range []string{"gap", "nan", "ohlc", "stale", "short"} {
		t.Run(kind, func(t *testing.T) {
			b := append([]Kline(nil), bars...)
			at := now
			switch kind {
			case "gap":
				b[50].OpenTime++
			case "nan":
				b[50].Close = math.NaN()
			case "ohlc":
				b[50].Low = 200
			case "stale":
				at = now.Add(4 * time.Minute)
			case "short":
				b = b[:20]
			}
			if AnalyzeTechnical(b, "3m", 3*time.Minute, at).Unavailable == "" {
				t.Fatal("invalid data accepted")
			}
		})
	}
}
func TestTechnicalMACDCrossAndVolume(t *testing.T) {
	for _, direction := range []float64{1, -1} {
		bars, now := technicalBars()
		bars[99].Close += direction
		bars[99].High = 102
		bars[99].Low = 98
		bars[99].QuoteVolume = 500
		r := AnalyzeTechnical(bars, "3m", 3*time.Minute, now)
		want := "MACD金叉"
		volume := "高位缩量"
		if direction < 0 {
			want = "MACD死叉"
			volume = "低位缩量"
		}
		events := strings.Join(r.Events, "\n")
		if !strings.Contains(events, want) || !strings.Contains(events, volume) {
			t.Fatalf("missing cross/volume: %+v", r)
		}
		// First change from a flat series: DIF=(2/13-2/27)*delta; DEA=0.2*DIF.
		expected := (2.0/13 - 2.0/27) * direction
		if math.Abs(r.DIF-expected) > 1e-10 || math.Abs(r.DEA-expected*0.2) > 1e-10 {
			t.Fatalf("bad MACD: %+v", r)
		}
		bars[98] = bars[99]
		bars[98].OpenTime -= 180000
		bars[98].CloseTime -= 180000
		r = AnalyzeTechnical(bars, "3m", 3*time.Minute, now)
		if strings.Contains(strings.Join(r.Events, "\n"), want) {
			t.Fatal("ongoing MACD state mislabeled as new cross")
		}
	}
}
func TestConfirmedDivergence(t *testing.T) {
	bars, _ := technicalBars()
	dif := make([]float64, len(bars))
	bars[80].High = 105
	bars[94].High = 107
	dif[80] = 2
	dif[94] = 1
	events := strings.Join(divergenceEvidence(bars, dif), "\n")
	if !strings.Contains(events, "MACD(DIF)顶背离") || !strings.Contains(events, "距最新5根") {
		t.Fatalf("missing confirmed divergence: %s", events)
	}
	if len(divergenceEvidence(bars[:96], dif[:96])) != 0 {
		t.Fatal("unconfirmed pivot used")
	}
	bars[94].High = 104
	if strings.Contains(strings.Join(divergenceEvidence(bars, dif), "\n"), "顶背离") {
		t.Fatal("lower high incorrectly divergent")
	}
	bars, _ = technicalBars()
	bars[80].Low = 95
	bars[94].Low = 93
	dif[80] = -2
	dif[94] = -1
	if !strings.Contains(strings.Join(divergenceEvidence(bars, dif), "\n"), "MACD(DIF)底背离") {
		t.Fatal("missing bullish divergence")
	}
}
func TestTechnicalPromptEvidence(t *testing.T) {
	bars, now := technicalBars()
	r := AnalyzeTechnical(bars, "3m", 3*time.Minute, now)
	output := Format(&Data{Technical: []TechnicalReport{r, {Interval: "4h", Unavailable: "K线断档"}}})
	for _, s := range []string{"technical-v1", "DIF=0 DEA=0", "RSI14=50", "4h：不可评估：K线断档"} {
		if !strings.Contains(output, s) {
			t.Fatalf("missing %s", s)
		}
	}
}

func TestTechnicalCandleAndBreakoutPatterns(t *testing.T) {
	cases := []struct {
		name                           string
		open, high, low, close, volume float64
		want                           string
	}{
		{"breakout", 100, 104, 99, 103, 3000, "向上突破"},
		{"failed breakout", 100, 105, 99, 100, 1000, "假突破候选"},
		{"failed breakdown", 100, 101, 95, 100, 1000, "假跌破候选"},
		{"lower wick", 100, 101, 90, 100.5, 1000, "长下影"},
		{"upper wick", 100, 110, 99, 100.5, 1000, "长上影"},
		{"stall", 100, 101, 99, 100, 3000, "放量滞涨/滞跌"},
		{"engulfing", 98, 103, 97, 102, 1000, "看涨实体吞没"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			bars, now := technicalBars()
			if c.name == "engulfing" {
				bars[98].Open = 101
				bars[98].Close = 99
			}
			b := &bars[99]
			b.Open = c.open
			b.High = c.high
			b.Low = c.low
			b.Close = c.close
			b.QuoteVolume = c.volume
			r := AnalyzeTechnical(bars, "3m", 3*time.Minute, now)
			if !strings.Contains(strings.Join(r.Events, "\n"), c.want) {
				t.Fatalf("missing %s: %+v", c.want, r)
			}
		})
	}
	bars, now := technicalBars()
	for i := range bars {
		bars[i].QuoteVolume = 0
	}
	if AnalyzeTechnical(bars, "3m", 3*time.Minute, now).VolumeRatio != nil {
		t.Fatal("invented volume ratio")
	}
}

func TestRSIDivergenceUsesSameConfirmedPricePivots(t *testing.T) {
	for _, direction := range []float64{1, -1} {
		bars, _ := technicalBars()
		for i := range bars {
			value := 100 + direction*float64(i)*0.1
			if i > 80 {
				value = 108 - float64(i-80)*0.05
				if direction < 0 {
					value = 200 - value
				}
			}
			bars[i].Open = value
			bars[i].Close = value
			bars[i].High = value + 0.1
			bars[i].Low = value - 0.1
		}
		want := "RSI14顶背离"
		if direction > 0 {
			bars[80].High = 110
			bars[94].High = 112
		} else {
			bars[80].Low = 90
			bars[94].Low = 88
			want = "RSI14底背离"
		}
		dif, _ := macdSeries(bars)
		if !strings.Contains(strings.Join(divergenceEvidence(bars, dif), "\n"), want) {
			t.Fatalf("missing %s", want)
		}
	}
}
