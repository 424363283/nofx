package market

import (
	"fmt"
	"math"
	"strings"
	"time"
)

// TechnicalReport is deterministic evidence, not a probability or order signal.
type TechnicalReport struct {
	Interval                                                            string
	CandleAt                                                            time.Time
	Unavailable                                                         string
	DIF, DEA, Histogram, RSI14, EMA20, EMA50, ATR14                     float64
	PreviousDIF, PreviousDEA, PreviousRSI14                             float64
	ReferenceHigh, ReferenceLow, LastOpen, LastHigh, LastLow, LastClose float64
	VolumeRatio                                                         *float64
	Events                                                              []string
}

func emaSeries(values []float64, period int) []float64 {
	out := make([]float64, len(values))
	for i := range out {
		out[i] = math.NaN()
	}
	if len(values) < period {
		return out
	}
	sum := 0.0
	for _, v := range values[:period] {
		sum += v
	}
	out[period-1] = sum / float64(period)
	for i := period; i < len(values); i++ {
		out[i] = out[i-1] + 2/float64(period+1)*(values[i]-out[i-1])
	}
	return out
}

func macdSeries(bars []Kline) ([]float64, []float64) {
	prices := make([]float64, len(bars))
	for i, b := range bars {
		prices[i] = b.Close
	}
	fast, slow := emaSeries(prices, 12), emaSeries(prices, 26)
	dif, dea := make([]float64, len(bars)), make([]float64, len(bars))
	for i := range bars {
		dif[i] = fast[i] - slow[i]
		dea[i] = math.NaN()
	}
	if len(bars) >= 26 {
		signal := emaSeries(dif[25:], 9)
		copy(dea[25:], signal)
	}
	return dif, dea
}

// AnalyzeTechnical refuses incomplete, stale, disordered or malformed history.
func AnalyzeTechnical(input []Kline, interval string, step time.Duration, now time.Time) TechnicalReport {
	r := TechnicalReport{Interval: interval}
	bars := closedMarketKlines(input, now)
	if len(bars) < 60 {
		r.Unavailable = "已收盘历史不足60根"
		return r
	}
	for i, b := range bars {
		for _, v := range []float64{b.Open, b.High, b.Low, b.Close, b.Volume, b.QuoteVolume} {
			if math.IsNaN(v) || math.IsInf(v, 0) {
				r.Unavailable = "K线包含非有限数值"
				return r
			}
		}
		if b.Open <= 0 || b.Low <= 0 || b.High < math.Max(b.Open, b.Close) || b.Low > math.Min(b.Open, b.Close) || b.Volume < 0 || b.QuoteVolume < 0 || b.CloseTime-b.OpenTime != step.Milliseconds()-1 {
			r.Unavailable = "K线价格或周期无效"
			return r
		}
		if i > 0 && b.OpenTime-bars[i-1].OpenTime != step.Milliseconds() {
			r.Unavailable = "K线断档或顺序无效"
			return r
		}
	}
	last := bars[len(bars)-1]
	r.CandleAt = time.UnixMilli(last.CloseTime).UTC()
	if now.Sub(r.CandleAt) > step+5*time.Second {
		r.Unavailable = "已收盘K线过期"
		return r
	}
	n := len(bars) - 1
	prev := bars[n-1]
	dif, dea := macdSeries(bars)
	r.DIF, r.DEA, r.Histogram = dif[n], dea[n], 2*(dif[n]-dea[n])
	r.RSI14 = calculateRSI(bars, 14)
	r.EMA20 = calculateEMA(bars, 20)
	r.EMA50 = calculateEMA(bars, 50)
	r.ATR14 = calculateATR(bars, 14)
	add := func(s string) { r.Events = append(r.Events, s) }
	if dif[n-1] <= dea[n-1] && dif[n] > dea[n] {
		add("MACD金叉：最近两根已收盘DIF由下穿上DEA")
	}
	if dif[n-1] >= dea[n-1] && dif[n] < dea[n] {
		add("MACD死叉：最近两根已收盘DIF由上穿下DEA")
	}
	priorRSI := calculateRSI(bars[:n], 14)
	r.PreviousDIF, r.PreviousDEA, r.PreviousRSI14 = dif[n-1], dea[n-1], priorRSI
	r.LastOpen, r.LastHigh, r.LastLow, r.LastClose = last.Open, last.High, last.Low, last.Close
	if r.RSI14 >= 70 {
		add("RSI超买区（不等于应做空）")
	}
	if r.RSI14 <= 30 {
		add("RSI超卖区（不等于应做多）")
	}
	if priorRSI <= 30 && r.RSI14 > 30 {
		add("RSI回升穿越30")
	}
	if priorRSI >= 70 && r.RSI14 < 70 {
		add("RSI回落穿越70")
	}
	if priorRSI <= 50 && r.RSI14 > 50 {
		add("RSI上穿50中轴")
	}
	if priorRSI >= 50 && r.RSI14 < 50 {
		add("RSI下穿50中轴")
	}
	hi, lo, volume := bars[n-20].High, bars[n-20].Low, 0.0
	for _, b := range bars[n-20 : n] {
		hi = math.Max(hi, b.High)
		lo = math.Min(lo, b.Low)
		volume += b.QuoteVolume
	}
	r.ReferenceHigh, r.ReferenceLow = hi, lo
	if volume > 0 {
		ratio := last.QuoteVolume / (volume / 20)
		r.VolumeRatio = &ratio
		position := 0.5
		if hi > lo {
			position = (last.Close - lo) / (hi - lo)
		}
		if ratio <= 0.7 && position >= 0.8 {
			add("高位缩量：收盘在此前20根区间顶部20%，成交额比≤0.7；仅表明参与减弱")
		}
		if ratio <= 0.7 && position <= 0.2 {
			add("低位缩量：收盘在此前20根区间底部20%，成交额比≤0.7；不是见底确认")
		}
		if ratio >= 2 && last.Close > prev.Close {
			add("放量上涨：成交额比≥2且收盘上涨")
		}
		if ratio >= 2 && last.Close < prev.Close {
			add("放量下跌：成交额比≥2且收盘下跌")
		}
		if ratio >= 2 && math.Abs(last.Close-prev.Close) <= 0.25*r.ATR14 {
			add("放量滞涨/滞跌：成交额比≥2且收盘变化≤0.25ATR")
		}
	}
	if last.Close > hi {
		add(fmt.Sprintf("向上突破此前20根高点 %.12g", hi))
	}
	if last.Close < lo {
		add(fmt.Sprintf("向下跌破此前20根低点 %.12g", lo))
	}
	if last.High > hi && last.Close <= hi {
		add("上破后收回区间（假突破候选）")
	}
	if last.Low < lo && last.Close >= lo {
		add("下破后收回区间（假跌破候选）")
	}
	body := math.Abs(last.Close - last.Open)
	span := last.High - last.Low
	if span > 0 {
		upper := last.High - math.Max(last.Open, last.Close)
		lower := math.Min(last.Open, last.Close) - last.Low
		if body <= span*0.1 {
			add("十字星：实体≤全幅10%，方向待确认")
		}
		if lower >= span*0.6 && upper <= span*0.2 && body <= span*0.3 {
			add("长下影形态：下影≥全幅60%，需结合所处位置")
		}
		if upper >= span*0.6 && lower <= span*0.2 && body <= span*0.3 {
			add("长上影形态：上影≥全幅60%，需结合所处位置")
		}
	}
	if prev.Close < prev.Open && last.Close > last.Open && last.Open <= prev.Close && last.Close >= prev.Open {
		add("看涨实体吞没")
	}
	if prev.Close > prev.Open && last.Close < last.Open && last.Open >= prev.Close && last.Close <= prev.Open {
		add("看跌实体吞没")
	}
	r.Events = append(r.Events, divergenceEvidence(bars, dif)...)
	return r
}

// Pivots need two closed bars on each side. Only the latest pair is compared;
// the latest pivot must be within ten bars. No unconfirmed endpoint is used.
func divergenceEvidence(bars []Kline, dif []float64) []string {
	events := []string{}
	for _, high := range []bool{true, false} {
		pivots := []int{}
		start := len(bars) - 60
		if start < 34 {
			start = 34
		}
		price := func(i int) float64 {
			if high {
				return bars[i].High
			}
			return bars[i].Low
		}
		for i := start; i < len(bars)-2; i++ {
			ok := true
			for _, j := range []int{i - 2, i - 1, i + 1, i + 2} {
				if (high && price(i) <= price(j)) || (!high && price(i) >= price(j)) {
					ok = false
				}
			}
			if ok {
				pivots = append(pivots, i)
			}
		}
		if len(pivots) < 2 {
			continue
		}
		a, b := pivots[len(pivots)-2], pivots[len(pivots)-1]
		if b-a < 5 || len(bars)-1-b > 10 {
			continue
		}
		ra, rb := calculateRSI(bars[:a+1], 14), calculateRSI(bars[:b+1], 14)
		label := "底背离"
		priceMove := price(b) < price(a)*0.999
		macdMove := dif[b] > dif[a]
		rsiMove := rb >= ra+3
		if high {
			label = "顶背离"
			priceMove = price(b) > price(a)*1.001
			macdMove = dif[b] < dif[a]
			rsiMove = rb <= ra-3
		}
		if !priceMove {
			continue
		}
		for _, indicator := range []string{"MACD(DIF)", "RSI14"} {
			va, vb, match := dif[a], dif[b], macdMove
			if indicator == "RSI14" {
				va, vb, match = ra, rb, rsiMove
			}
			if match {
				events = append(events, fmt.Sprintf("%s%s：枢轴%s→%s，价格%.12g→%.12g，指标%.12g→%.12g；第二枢轴经右侧2根确认，距最新%d根（非反转保证）", indicator, label, time.UnixMilli(bars[a].CloseTime).UTC().Format(time.RFC3339), time.UnixMilli(bars[b].CloseTime).UTC().Format(time.RFC3339), price(a), price(b), va, vb, len(bars)-1-b))
			}
		}
	}
	return events
}

func formatTechnical(reports []TechnicalReport) string {
	var s strings.Builder
	s.WriteString("\n规则计算的技术证据 technical-v1（仅已收盘；无命中不等于不存在其他形态）：\n")
	for _, r := range reports {
		if r.Unavailable != "" {
			fmt.Fprintf(&s, "%s：不可评估：%s\n", r.Interval, r.Unavailable)
			continue
		}
		fmt.Fprintf(&s, "%s 收盘%s：DIF=%.12g DEA=%.12g HIST(2倍)=%.12g RSI14=%.4f EMA20=%.12g EMA50=%.12g ATR14=%.12g", r.Interval, r.CandleAt.Format(time.RFC3339), r.DIF, r.DEA, r.Histogram, r.RSI14, r.EMA20, r.EMA50, r.ATR14)
		fmt.Fprintf(&s, " 前根DIF=%.12g DEA=%.12g RSI14=%.4f 前20根高/低=%.12g/%.12g 最新OHLC=%.12g/%.12g/%.12g/%.12g", r.PreviousDIF, r.PreviousDEA, r.PreviousRSI14, r.ReferenceHigh, r.ReferenceLow, r.LastOpen, r.LastHigh, r.LastLow, r.LastClose)
		if r.VolumeRatio != nil {
			fmt.Fprintf(&s, " 成交额/此前20根均额=%.4f", *r.VolumeRatio)
		} else {
			s.WriteString(" 成交额比缺失")
		}
		s.WriteString("\n")
		if len(r.Events) == 0 {
			s.WriteString("无规则事件命中\n")
		}
		for _, e := range r.Events {
			s.WriteString("- " + e + "\n")
		}
	}
	return s.String()
}
