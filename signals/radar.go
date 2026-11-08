package signals

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/url"
	"sort"
	"strconv"
	"sync"
	"time"
)

const radarPeriod = 15 * time.Minute

type RadarSignal struct {
	Kind      string `json:"kind"`
	Label     string `json:"label"`
	Direction string `json:"direction"`
}
type RadarItem struct {
	Structure   *RadarStructure `json:"structure_15m,omitempty"`
	Symbol      string          `json:"symbol"`
	Category    string          `json:"category"`
	Price       float64         `json:"price"`
	Change24    float64         `json:"change_24h"`
	QuoteVolume float64         `json:"quote_volume"`
	PriceAsOf   time.Time       `json:"price_as_of"`
	CandleAt    *time.Time      `json:"candle_at,omitempty"`
	Change      *float64        `json:"change,omitempty"`
	VolumeRatio *float64        `json:"volume_ratio,omitempty"`
	OIChange    *float64        `json:"oi_change,omitempty"`
	OIAt        *time.Time      `json:"oi_at,omitempty"`
	DIF         *float64        `json:"dif,omitempty"`
	DEA         *float64        `json:"dea,omitempty"`
	Histogram   *float64        `json:"histogram,omitempty"`
	MACD        string          `json:"macd"`
	Bias        string          `json:"bias"`
	Signals     []RadarSignal   `json:"signals"`
	Notes       []string        `json:"notes"`
	Bull        int             `json:"bull"`
	Bear        int             `json:"bear"`
}

// Closed bars only. Levels are observations, not recommended orders or targets.
type RadarBar struct {
	CloseAt     time.Time `json:"close_at"`
	Open        float64   `json:"open"`
	High        float64   `json:"high"`
	Low         float64   `json:"low"`
	Close       float64   `json:"close"`
	QuoteVolume float64   `json:"quote_volume"`
}
type RadarStructure struct {
	PreviousHigh20       float64    `json:"previous_high_20"`
	PreviousLow20        float64    `json:"previous_low_20"`
	AverageQuoteVolume20 float64    `json:"average_quote_volume_20"`
	EMA20                float64    `json:"ema20"`
	EMA50                float64    `json:"ema50"`
	Bars                 []RadarBar `json:"closed_bars_oldest_first"`
}

func radarEMA(bars []candle, period int) float64 {
	var value float64
	for i, b := range bars {
		if i < period {
			value += b.Close / float64(period)
		} else {
			value += (b.Close - value) * 2 / float64(period+1)
		}
	}
	return value
}

type RadarResult struct {
	Items    []RadarItem `json:"items"`
	AsOf     time.Time   `json:"as_of"`
	Eligible int         `json:"eligible"`
	Scanned  int         `json:"scanned"`
	Analyzed int         `json:"analyzed"`
	Warnings []string    `json:"warnings"`
}
type candle struct {
	OpenAt, CloseAt                int64
	Open, High, Low, Close, Volume float64
}

func finite(v float64) bool { return !math.IsNaN(v) && !math.IsInf(v, 0) }
func rawNumber(raw json.RawMessage) (float64, error) {
	var str string
	if json.Unmarshal(raw, &str) == nil {
		v, e := strconv.ParseFloat(str, 64)
		if e != nil || !finite(v) {
			return 0, fmt.Errorf("invalid number")
		}
		return v, nil
	}
	var v float64
	if err := json.Unmarshal(raw, &v); err != nil || !finite(v) {
		return 0, fmt.Errorf("invalid number")
	}
	return v, nil
}
func closedCandles(rows [][]json.RawMessage, now time.Time) ([]candle, error) {
	out := []candle{}
	for _, row := range rows {
		if len(row) < 8 {
			return nil, fmt.Errorf("K线字段缺失")
		}
		vals := make([]float64, 8)
		for _, i := range []int{0, 1, 2, 3, 4, 6, 7} {
			v, e := rawNumber(row[i])
			if e != nil {
				return nil, fmt.Errorf("K线数值无效")
			}
			vals[i] = v
		}
		if int64(vals[6]) >= now.UnixMilli() {
			continue
		}
		b := candle{int64(vals[0]), int64(vals[6]), vals[1], vals[2], vals[3], vals[4], vals[7]}
		if b.Open <= 0 || b.Close <= 0 || b.Low <= 0 || b.High < math.Max(b.Open, b.Close) || b.Low > math.Min(b.Open, b.Close) || b.Volume < 0 || b.CloseAt-b.OpenAt != radarPeriod.Milliseconds()-1 {
			return nil, fmt.Errorf("K线结构无效")
		}
		if len(out) > 0 && b.OpenAt-out[len(out)-1].OpenAt != radarPeriod.Milliseconds() {
			return nil, fmt.Errorf("K线不连续")
		}
		out = append(out, b)
	}
	if len(out) < 100 {
		return nil, fmt.Errorf("历史K线不足100根")
	}
	if out[len(out)-1].CloseAt != now.Truncate(radarPeriod).UnixMilli()-1 {
		return nil, fmt.Errorf("最新已收盘K线尚未更新")
	}
	return out, nil
}

// SMA-seeded EMA; signal EMA starts at the first valid 26-period DIF.
func macd(bars []candle) (dif, dea, hist, prevHist float64) {
	var fast, slow, signal float64
	difs := []float64{}
	for i, b := range bars {
		if i < 12 {
			fast += b.Close / 12
		} else {
			fast += (b.Close - fast) * 2 / 13
		}
		if i < 26 {
			slow += b.Close / 26
		} else {
			slow += (b.Close - slow) * 2 / 27
		}
		if i < 25 {
			continue
		}
		d := fast - slow
		difs = append(difs, d)
		if len(difs) <= 9 {
			signal += d / 9
		} else {
			signal += (d - signal) * 2 / 10
		}
		prevHist = hist
		dif = d
		dea = signal
		hist = 2 * (dif - dea)
	}
	return
}
func analyzeCandles(item *RadarItem, bars []candle) {
	last := bars[len(bars)-1]
	prev := bars[len(bars)-2]
	change := (last.Close/prev.Close - 1) * 100
	item.Change = &change
	at := time.UnixMilli(last.CloseAt + 1).UTC()
	item.CandleAt = &at
	var avg, high float64
	low := math.MaxFloat64
	for _, b := range bars[len(bars)-21 : len(bars)-1] {
		avg += b.Volume / 20
		high = math.Max(high, b.High)
		low = math.Min(low, b.Low)
	}
	structure := &RadarStructure{PreviousHigh20: high, PreviousLow20: low, AverageQuoteVolume20: avg, EMA20: radarEMA(bars, 20), EMA50: radarEMA(bars, 50)}
	for _, b := range bars[len(bars)-8:] {
		structure.Bars = append(structure.Bars, RadarBar{CloseAt: time.UnixMilli(b.CloseAt + 1).UTC(), Open: b.Open, High: b.High, Low: b.Low, Close: b.Close, QuoteVolume: b.Volume})
	}
	item.Structure = structure
	add := func(kind, label, direction string) {
		item.Signals = append(item.Signals, RadarSignal{kind, label, direction})
	}
	if avg > 0 {
		ratio := last.Volume / avg
		item.VolumeRatio = &ratio
		if ratio >= 2 {
			d := "neutral"
			if change > 0 {
				d = "bull"
				item.Bull++
			} else if change < 0 {
				d = "bear"
				item.Bear++
			}
			add("volume", fmt.Sprintf("放量 %.2f 倍", ratio), d)
		}
	}
	if math.Abs(change) >= 1.5 {
		d := "bull"
		label := "价格急涨"
		if change < 0 {
			d = "bear"
			label = "价格急跌"
		}
		add("price", label, d)
	}
	if last.Close > high {
		item.Bull += 2
		add("breakout", "突破前20根高点", "bull")
	} else if last.Close < low {
		item.Bear += 2
		add("breakout", "跌破前20根低点", "bear")
	}
	dif, dea, hist, previous := macd(bars)
	item.DIF = &dif
	item.DEA = &dea
	item.Histogram = &hist
	item.MACD = "持平"
	if hist > 0 {
		item.MACD = "DIF 在 DEA 上方"
	} else if hist < 0 {
		item.MACD = "DIF 在 DEA 下方"
	}
	if previous <= 0 && hist > 0 {
		item.MACD = "金叉"
		item.Bull += 2
		add("macd", "MACD 金叉", "bull")
	} else if previous >= 0 && hist < 0 {
		item.MACD = "死叉"
		item.Bear += 2
		add("macd", "MACD 死叉", "bear")
	}
}

type oiPoint struct {
	SumOpenInterest string `json:"sumOpenInterest"`
	Timestamp       int64  `json:"timestamp"`
}

func analyzeOI(item *RadarItem, rows []oiPoint) bool {
	if item.CandleAt == nil {
		return false
	}
	end := item.CandleAt.UnixMilli()
	start := end - radarPeriod.Milliseconds()
	var a, b float64
	var haveA, haveB bool
	for _, r := range rows {
		v, e := strconv.ParseFloat(r.SumOpenInterest, 64)
		if e != nil || !finite(v) || v <= 0 {
			continue
		}
		if r.Timestamp == start {
			a = v
			haveA = true
		}
		if r.Timestamp == end {
			b = v
			haveB = true
		}
	}
	if !haveA || !haveB {
		return false
	}
	delta := (b/a - 1) * 100
	item.OIChange = &delta
	item.OIAt = item.CandleAt
	if math.Abs(delta) < 3 {
		return true
	}
	label := "持仓量增加"
	if delta < 0 {
		label = "持仓量减少"
	}
	item.Signals = append(item.Signals, RadarSignal{"oi", fmt.Sprintf("%s %+.2f%%", label, delta), "neutral"})
	if delta > 0 && item.Change != nil {
		if *item.Change >= 0.3 {
			item.Bull++
			item.Notes = append(item.Notes, "价格上涨且增仓，存在顺势资金参与；OI 本身不区分多空。")
		} else if *item.Change <= -0.3 {
			item.Bear++
			item.Notes = append(item.Notes, "价格下跌且增仓，存在下行压力；OI 本身不区分多空。")
		}
	} else if delta < 0 {
		item.Notes = append(item.Notes, "减仓表示合约敞口收缩；不能仅凭 OI 判断多头平仓或空头回补。")
	}
	return true
}
func finalizeRadar(item *RadarItem) {
	item.Bias = "neutral"
	if item.CandleAt == nil {
		item.Bias = "unavailable"
		return
	}
	if item.Bull > 0 && item.Bear > 0 {
		item.Bias = "mixed"
	} else if item.Bull > 0 {
		item.Bias = "bull"
	} else if item.Bear > 0 {
		item.Bias = "bear"
	}
	if len(item.Signals) == 0 {
		item.Notes = append(item.Notes, "本根已收盘K线未触发异动阈值。")
	}
}
func (c *Client) ScanRadar(ctx context.Context) (RadarResult, error) {
	now := time.Now().UTC()
	result := RadarResult{Items: []RadarItem{}, Warnings: []string{}, AsOf: now}
	var info struct {
		Symbols []struct{ Symbol, Status, ContractType, QuoteAsset, MarginAsset, UnderlyingType string }
	}
	if err := c.get(ctx, "/fapi/v1/exchangeInfo", &info); err != nil {
		return result, fmt.Errorf("合约列表获取失败: %w", err)
	}
	allowed := map[string]string{}
	for _, s := range info.Symbols {
		if s.Status != "TRADING" || s.QuoteAsset != "USDT" || s.MarginAsset != "USDT" {
			continue
		}
		if s.ContractType == "PERPETUAL" {
			allowed[s.Symbol] = "crypto"
		}
		if s.ContractType == "TRADIFI_PERPETUAL" && s.UnderlyingType == "EQUITY" {
			allowed[s.Symbol] = "equity"
		}
	}
	result.Eligible = len(allowed)
	var ticks []struct {
		Symbol, QuoteVolume, LastPrice, PriceChangePercent string
		CloseTime                                          int64
	}
	if err := c.get(ctx, "/fapi/v1/ticker/24hr", &ticks); err != nil {
		return result, fmt.Errorf("成交额获取失败: %w", err)
	}
	for _, t := range ticks {
		if allowed[t.Symbol] != "" && number(t.QuoteVolume) > 0 && number(t.LastPrice) > 0 && t.CloseTime > now.Add(-5*time.Minute).UnixMilli() && t.CloseTime <= now.Add(time.Minute).UnixMilli() {
			result.Items = append(result.Items, RadarItem{Symbol: t.Symbol, Category: allowed[t.Symbol], Price: number(t.LastPrice), Change24: number(t.PriceChangePercent), QuoteVolume: number(t.QuoteVolume), PriceAsOf: time.UnixMilli(t.CloseTime).UTC(), Signals: []RadarSignal{}, Notes: []string{}})
		}
	}
	sort.Slice(result.Items, func(i, j int) bool {
		if result.Items[i].QuoteVolume == result.Items[j].QuoteVolume {
			return result.Items[i].Symbol < result.Items[j].Symbol
		}
		return result.Items[i].QuoteVolume > result.Items[j].QuoteVolume
	})
	result.Items = selectRadarUniverse(result.Items)
	if len(result.Items) == 0 {
		return result, fmt.Errorf("没有新鲜的可交易合约行情")
	}
	result.Scanned = len(result.Items)
	// Four workers with a global 200ms dispatch pace; no retry storm on rate limits.
	jobs := make(chan int)
	var wg sync.WaitGroup
	for n := 0; n < 4; n++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := range jobs {
				item := &result.Items[i]
				var rows [][]json.RawMessage
				err := c.get(ctx, "/fapi/v1/klines?symbol="+url.QueryEscape(item.Symbol)+"&interval=15m&limit=200", &rows)
				if err == nil {
					var bars []candle
					bars, err = closedCandles(rows, now)
					if err == nil {
						analyzeCandles(item, bars)
					}
				}
				if err != nil {
					item.Notes = append(item.Notes, "K线分析不可用: "+err.Error())
					finalizeRadar(item)
					continue
				}
				var oi []oiPoint
				if c.get(ctx, "/futures/data/openInterestHist?symbol="+url.QueryEscape(item.Symbol)+"&period=15m&limit=4", &oi) != nil || !analyzeOI(item, oi) {
					item.Notes = append(item.Notes, "同周期持仓量缺失或延迟，未计入方向判断。")
				}
				finalizeRadar(item)
			}
		}()
	}
	ticker := time.NewTicker(200 * time.Millisecond)
	defer ticker.Stop()
loop:
	for i := range result.Items {
		select {
		case <-ctx.Done():
			break loop
		case <-ticker.C:
		}
		select {
		case jobs <- i:
		case <-ctx.Done():
			break loop
		}
	}
	close(jobs)
	wg.Wait()
	for i := range result.Items {
		item := &result.Items[i]
		if item.CandleAt != nil {
			result.Analyzed++
		} else {
			item.Bias = "unavailable"
			if len(item.Notes) == 0 {
				item.Notes = append(item.Notes, "扫描超时，未完成分析。")
			}
		}
	}
	if result.Analyzed < result.Scanned {
		result.Warnings = append(result.Warnings, fmt.Sprintf("%d 个合约K线不可用，已标记数据不足。", result.Scanned-result.Analyzed))
	}
	sort.SliceStable(result.Items, func(i, j int) bool { return len(result.Items[i].Signals) > len(result.Items[j].Signals) })
	if result.Analyzed == 0 {
		return result, fmt.Errorf("本轮未获得可分析的K线，请稍后重试")
	}
	return result, nil
}

// Independent quotas keep high-volume crypto from crowding out equity contracts.
// Input is already sorted by 24-hour quote volume.
func selectRadarUniverse(items []RadarItem) []RadarItem {
	counts := map[string]int{}
	selected := make([]RadarItem, 0, 120)
	for _, item := range items {
		if counts[item.Category] < 60 {
			selected = append(selected, item)
			counts[item.Category]++
		}
	}
	return selected
}
