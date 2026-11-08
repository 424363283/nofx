// Package signals provides read-only Binance market screening. It never places orders.
package signals

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Config struct {
	RadarEnabled bool    `json:"radar_enabled"`
	Enabled      bool    `json:"enabled"`
	Category     string  `json:"category"`
	Limit        int     `json:"limit"`
	Volume       bool    `json:"volume"`
	OI           bool    `json:"oi"`
	Funding      bool    `json:"funding"`
	Breakout     bool    `json:"breakout"`
	OIMin        float64 `json:"oi_min"`
	FundingMin   float64 `json:"funding_min"` // percentage, e.g. 0.03 = 0.03%
}

func (c Config) Validate() error {
	if !c.Enabled {
		return nil
	}
	if c.Category != "all" && c.Category != "crypto" && c.Category != "equity" && c.Category != "commodity" {
		return fmt.Errorf("无效的信号资产类别")
	}
	if c.Limit < 1 || c.Limit > 20 {
		return fmt.Errorf("候选数量必须为 1–20")
	}
	if !c.Volume && !c.OI && !c.Funding && !c.Breakout {
		return fmt.Errorf("请至少选择一种信号")
	}
	if math.IsNaN(c.OIMin) || math.IsInf(c.OIMin, 0) || c.OIMin < 0 || c.OIMin > 100 || math.IsNaN(c.FundingMin) || math.IsInf(c.FundingMin, 0) || c.FundingMin < 0 || c.FundingMin > 10 {
		return fmt.Errorf("信号阈值超出范围")
	}
	return nil
}
func (c Config) JSON() string { b, _ := json.Marshal(c); return string(b) }
func Parse(raw string) (Config, error) {
	c := Config{Category: "all", Limit: 10, Volume: true, OIMin: 3, FundingMin: 0.03}
	if raw == "" {
		return c, nil
	}
	if err := json.Unmarshal([]byte(raw), &c); err != nil {
		return c, err
	}
	return c, c.Validate()
}

type Item struct {
	Symbol      string    `json:"symbol"`
	QuoteVolume float64   `json:"quote_volume"`
	Price       float64   `json:"price"`
	OIChange    *float64  `json:"oi_change,omitempty"`
	FundingRate *float64  `json:"funding_rate,omitempty"`
	Breakout    string    `json:"breakout,omitempty"`
	Reasons     []string  `json:"reasons"`
	AsOf        time.Time `json:"as_of"`
}
type Result struct {
	Items    []Item    `json:"items"`
	Warnings []string  `json:"warnings"`
	Scanned  int       `json:"scanned"`
	AsOf     time.Time `json:"as_of"`
}
type cached struct {
	body []byte
	at   time.Time
}
type Client struct {
	BaseURL string
	HTTP    *http.Client
	mu      sync.Mutex
	cache   map[string]cached
}

var Default = &Client{BaseURL: "https://fapi.binance.com", HTTP: &http.Client{Timeout: 10 * time.Second}}

func (c *Client) get(ctx context.Context, path string, out any) error {
	c.mu.Lock()
	hit, ok := c.cache[path]
	c.mu.Unlock()
	if ok && time.Since(hit.at) < time.Minute {
		return json.Unmarshal(hit.body, out)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.BaseURL+path, nil)
	if err != nil {
		return err
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("币安返回 HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return err
	}
	if err = json.Unmarshal(body, out); err != nil {
		return err
	}
	c.mu.Lock()
	if c.cache == nil {
		c.cache = map[string]cached{}
	}
	c.cache[path] = cached{body, time.Now()}
	c.mu.Unlock()
	return nil
}
func number(s string) float64 {
	n, _ := strconv.ParseFloat(s, 64)
	if math.IsNaN(n) || math.IsInf(n, 0) {
		return 0
	}
	return n
}
func (c *Client) Scan(ctx context.Context, cfg Config, selected []string) (Result, error) {
	r := Result{Items: []Item{}, Warnings: []string{}, AsOf: time.Now().UTC()}
	if err := cfg.Validate(); err != nil {
		return r, err
	}
	if !cfg.Enabled {
		return r, nil
	}
	ctx, cancel := context.WithTimeout(ctx, 40*time.Second)
	defer cancel()
	var info struct {
		Symbols []struct{ Symbol, Status, ContractType, QuoteAsset, MarginAsset, UnderlyingType string } `json:"symbols"`
	}
	if err := c.get(ctx, "/fapi/v1/exchangeInfo", &info); err != nil {
		return r, fmt.Errorf("合约列表获取失败: %w", err)
	}
	allowed := map[string]bool{}
	restrict := map[string]bool{}
	for _, s := range selected {
		if s = strings.ToUpper(strings.TrimSpace(s)); s != "" {
			restrict[s] = true
		}
	}
	for _, s := range info.Symbols {
		if s.Status != "TRADING" || s.QuoteAsset != "USDT" || s.MarginAsset != "USDT" || (s.ContractType != "PERPETUAL" && s.ContractType != "TRADIFI_PERPETUAL") {
			continue
		}
		category := "crypto"
		if s.ContractType == "TRADIFI_PERPETUAL" {
			category = "other"
			if s.UnderlyingType == "EQUITY" {
				category = "equity"
			}
			if s.UnderlyingType == "COMMODITY" {
				category = "commodity"
			}
		}
		if (cfg.Category == "all" || cfg.Category == category) && (len(restrict) == 0 || restrict[s.Symbol]) {
			allowed[s.Symbol] = true
		}
	}
	var tickers []struct {
		Symbol, QuoteVolume, LastPrice string
		CloseTime                      int64
	}
	if err := c.get(ctx, "/fapi/v1/ticker/24hr", &tickers); err != nil {
		return r, fmt.Errorf("成交量获取失败: %w", err)
	}
	universe := []Item{}
	for _, t := range tickers {
		if allowed[t.Symbol] && number(t.QuoteVolume) > 0 && number(t.LastPrice) > 0 && t.CloseTime > time.Now().Add(-5*time.Minute).UnixMilli() {
			universe = append(universe, Item{Symbol: t.Symbol, QuoteVolume: number(t.QuoteVolume), Price: number(t.LastPrice), AsOf: time.UnixMilli(t.CloseTime).UTC()})
		}
	}
	sort.Slice(universe, func(i, j int) bool {
		if universe[i].QuoteVolume == universe[j].QuoteVolume {
			return universe[i].Symbol < universe[j].Symbol
		}
		return universe[i].QuoteVolume > universe[j].QuoteVolume
	})
	if len(universe) > 30 {
		universe = universe[:30]
	}
	r.Scanned = len(universe)
	funding := map[string]float64{}
	if cfg.Funding {
		var rows []struct {
			Symbol, LastFundingRate string
			Time                    int64
		}
		if err := c.get(ctx, "/fapi/v1/premiumIndex", &rows); err != nil {
			r.Warnings = append(r.Warnings, "资金费率获取失败，该项信号跳过")
		} else {
			for _, row := range rows {
				if row.Time > time.Now().Add(-5*time.Minute).UnixMilli() {
					funding[row.Symbol] = number(row.LastFundingRate) * 100
				}
			}
		}
	}
	var mu sync.Mutex
	var wg sync.WaitGroup
	slots := make(chan struct{}, 4)
	for _, item := range universe {
		wg.Add(1)
		go func(item Item) {
			defer wg.Done()
			slots <- struct{}{}
			defer func() { <-slots }()
			warnings := []string{}
			if cfg.Volume {
				item.Reasons = append(item.Reasons, "24小时成交额排名")
			}
			if cfg.Funding {
				if rate, ok := funding[item.Symbol]; ok {
					item.FundingRate = &rate
					if math.Abs(rate) >= cfg.FundingMin {
						item.Reasons = append(item.Reasons, "资金费率绝对值达到阈值")
					}
				}
			}
			if cfg.OI {
				var rows []struct {
					SumOpenInterest string
					Timestamp       int64
				}
				err := c.get(ctx, "/futures/data/openInterestHist?symbol="+url.QueryEscape(item.Symbol)+"&period=1h&limit=2", &rows)
				if err == nil && len(rows) == 2 && number(rows[0].SumOpenInterest) > 0 && rows[1].Timestamp > time.Now().Add(-2*time.Hour).UnixMilli() && rows[1].Timestamp-rows[0].Timestamp == int64(time.Hour/time.Millisecond) {
					v := (number(rows[1].SumOpenInterest)/number(rows[0].SumOpenInterest) - 1) * 100
					item.OIChange = &v
					if v >= cfg.OIMin {
						item.Reasons = append(item.Reasons, "1小时持仓量增长达到阈值")
					}
				} else {
					warnings = append(warnings, item.Symbol+": 持仓量数据缺失或过期")
				}
			}
			if cfg.Breakout {
				var rows [][]json.RawMessage
				err := c.get(ctx, "/fapi/v1/klines?symbol="+url.QueryEscape(item.Symbol)+"&interval=1h&limit=21", &rows)
				high, low := 0.0, math.MaxFloat64
				count := 0
				var lastClose int64
				if err == nil {
					for index := len(rows) - 1; index >= 0 && count < 20; index-- {
						row := rows[index]
						if len(row) < 7 {
							continue
						}
						var closeTime int64
						var hs, ls string
						json.Unmarshal(row[6], &closeTime)
						json.Unmarshal(row[2], &hs)
						json.Unmarshal(row[3], &ls)
						h, l := number(hs), number(ls)
						if closeTime >= time.Now().UnixMilli() || h <= 0 || l <= 0 {
							continue
						}
						count++
						if h > high {
							high = h
						}
						if l < low {
							low = l
						}
						if closeTime > lastClose {
							lastClose = closeTime
						}
					}
				}
				if count >= 20 && lastClose > time.Now().Add(-2*time.Hour).UnixMilli() {
					if item.Price > high {
						item.Breakout = "向上突破"
					} else if item.Price < low {
						item.Breakout = "向下突破"
					}
					if item.Breakout != "" {
						item.Reasons = append(item.Reasons, item.Breakout+"前20根已收盘1小时K线区间")
					}
				} else {
					warnings = append(warnings, item.Symbol+": 突破数据缺失或过期")
				}
			}
			mu.Lock()
			if len(item.Reasons) > 0 {
				r.Items = append(r.Items, item)
			}
			r.Warnings = append(r.Warnings, warnings...)
			mu.Unlock()
		}(item)
	}
	wg.Wait()
	sort.Slice(r.Items, func(i, j int) bool {
		if len(r.Items[i].Reasons) != len(r.Items[j].Reasons) {
			return len(r.Items[i].Reasons) > len(r.Items[j].Reasons)
		}
		if r.Items[i].QuoteVolume == r.Items[j].QuoteVolume {
			return r.Items[i].Symbol < r.Items[j].Symbol
		}
		return r.Items[i].QuoteVolume > r.Items[j].QuoteVolume
	})
	if len(r.Items) > cfg.Limit {
		r.Items = r.Items[:cfg.Limit]
	}
	sort.Strings(r.Warnings)
	return r, nil
}
