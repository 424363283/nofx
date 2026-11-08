package trader

import (
	"context"
	"fmt"
	"github.com/adshao/go-binance/v2/futures"
	"math/big"
	"sort"
	"strconv"
	"strings"
	"time"
)

type HistoryAmount struct {
	Asset  string  `json:"asset"`
	Amount float64 `json:"amount"`
}
type HistoryIncome struct {
	ID     string  `json:"id"`
	Time   int64   `json:"time"`
	Symbol string  `json:"symbol"`
	Type   string  `json:"type"`
	Asset  string  `json:"asset"`
	Amount float64 `json:"amount"`
}
type HistoryOrder struct {
	ID           string          `json:"id"`
	OrderID      string          `json:"order_id"`
	Symbol       string          `json:"symbol"`
	Action       string          `json:"action"`
	Side         string          `json:"side"`
	PositionSide string          `json:"position_side"`
	FirstTime    int64           `json:"first_time"`
	LastTime     int64           `json:"last_time"`
	Price        float64         `json:"price"`
	Quantity     float64         `json:"quantity"`
	Notional     float64         `json:"notional"`
	RealizedPnL  float64         `json:"realized_pnl"`
	Commissions  []HistoryAmount `json:"commissions"`
	NetPnL       *float64        `json:"net_pnl"`
	Fills        int             `json:"fills"`
}
type HistorySummary struct {
	RealizedPnL float64         `json:"realized_pnl"`
	Commission  float64         `json:"commission"`
	Funding     float64         `json:"funding"`
	TradingNet  float64         `json:"trading_net"`
	Transfers   float64         `json:"transfers"`
	Other       float64         `json:"other"`
	LedgerNet   float64         `json:"ledger_net"`
	OtherAssets []HistoryAmount `json:"other_assets"`
}
type TradingHistory struct {
	cacheVersion   uint64
	Start          int64           `json:"start"`
	End            int64           `json:"end"`
	FetchedAt      time.Time       `json:"fetched_at"`
	Summary        HistorySummary  `json:"summary"`
	Orders         []HistoryOrder  `json:"orders"`
	Income         []HistoryIncome `json:"income"`
	IncomeComplete bool            `json:"income_complete"`
	OrdersComplete bool            `json:"orders_complete"`
	Warnings       []string        `json:"warnings"`
}

type historyTotals map[string]*big.Rat

func (s historyTotals) add(key, value string) bool {
	if _, valid := finiteNumber(value); !valid {
		return false
	}
	r, ok := new(big.Rat).SetString(value)
	if !ok {
		return false
	}
	if s[key] == nil {
		s[key] = new(big.Rat)
	}
	s[key].Add(s[key], r)
	return true
}
func (s historyTotals) value(key string) float64 {
	if s[key] == nil {
		return 0
	}
	v, _ := s[key].Float64()
	return v
}

// Split full responses by time, preserving records at the same millisecond.
func historyWindow[T any](ctx context.Context, start, end int64, budget *int, fetch func(int64, int64) ([]T, error)) ([]T, bool, error) {
	if err := ctx.Err(); err != nil {
		return nil, false, err
	}
	if *budget <= 0 {
		return nil, false, nil
	}
	*budget--
	rows, err := fetch(start, end)
	if err != nil {
		return nil, false, err
	}
	if len(rows) < 1000 {
		return rows, true, nil
	}
	if start >= end {
		return rows, false, nil
	}
	mid := start + (end-start)/2
	left, lOK, err := historyWindow(ctx, start, mid, budget, fetch)
	if err != nil {
		return nil, false, err
	}
	right, rOK, err := historyWindow(ctx, mid+1, end, budget, fetch)
	return append(left, right...), lOK && rOK, err
}

func (at *AutoTrader) GetTradingHistory(ctx context.Context, days int, force ...bool) (*TradingHistory, error) {
	t, ok := at.trader.(*FuturesTrader)
	if !ok {
		return nil, fmt.Errorf("历史订单目前仅支持币安 U 本位账户")
	}
	return t.GetTradingHistory(ctx, days, force...)
}

func (t *FuturesTrader) GetTradingHistory(ctx context.Context, days int, force ...bool) (*TradingHistory, error) {
	if days != 1 && days != 7 && days != 30 {
		return nil, fmt.Errorf("历史区间必须为1、7或30天")
	}
	t.historyMu.Lock()
	defer t.historyMu.Unlock()
	version := t.historyVersion.Load()
	forceRefresh := len(force) > 0 && force[0]
	if cached := t.historyCache[days]; !forceRefresh && cached != nil && cached.cacheVersion == version && time.Since(cached.FetchedAt) < 30*time.Second {
		return cached, nil
	}
	ctx, cancel := context.WithTimeout(ctx, 75*time.Second)
	defer cancel()
	end := time.Now().UnixMilli()
	start := end - int64(days)*24*time.Hour.Milliseconds()
	h := &TradingHistory{Start: start, End: end, Orders: []HistoryOrder{}, Income: []HistoryIncome{}, Warnings: []string{}, IncomeComplete: true, OrdersComplete: true}
	h.cacheVersion = version
	budget := 64
	income, complete, err := historyWindow(ctx, start, end, &budget, func(a, b int64) ([]*futures.IncomeHistory, error) {
		return binanceReadContext(ctx, t, func(c *futures.Client, request context.Context) ([]*futures.IncomeHistory, error) {
			return c.NewGetIncomeHistoryService().StartTime(a).EndTime(b).Limit(1000).Do(request)
		})
	})
	if err != nil {
		return nil, err
	}
	h.IncomeComplete = complete
	if !complete {
		h.Warnings = append(h.Warnings, "账变记录超过单次加载范围，汇总仅包含已返回记录；请缩短区间后重试。")
	}
	totals, assets := historyTotals{}, historyTotals{}
	symbols := map[string]bool{}
	seenIncome := map[string]bool{}
	for _, row := range income {
		if row.Time < start || row.Time > end {
			continue
		}
		id := row.IncomeType + "-" + strconv.FormatInt(row.TranID, 10) + "-" + row.Asset
		if seenIncome[id] {
			continue
		}
		seenIncome[id] = true
		amount, valid := finiteNumber(row.Income)
		if !valid {
			h.IncomeComplete = false
			continue
		}
		h.Income = append(h.Income, HistoryIncome{ID: id, Time: row.Time, Symbol: row.Symbol, Type: row.IncomeType, Asset: row.Asset, Amount: amount})
		if row.Asset == "USDT" {
			totals.add(row.IncomeType, row.Income)
			totals.add("ALL", row.Income)
		} else {
			assets.add(row.Asset, row.Income)
		}
		if strings.HasSuffix(row.Symbol, "USDT") && row.Symbol != "USDT" {
			symbols[row.Symbol] = true
		}
	}
	h.Summary = HistorySummary{RealizedPnL: totals.value("REALIZED_PNL"), Commission: totals.value("COMMISSION"), Funding: totals.value("FUNDING_FEE"), Transfers: totals.value("TRANSFER"), LedgerNet: totals.value("ALL"), OtherAssets: []HistoryAmount{}}
	net := new(big.Rat)
	for _, key := range []string{"REALIZED_PNL", "COMMISSION", "FUNDING_FEE"} {
		if totals[key] != nil {
			net.Add(net, totals[key])
		}
	}
	h.Summary.TradingNet, _ = net.Float64()
	h.Summary.Other = h.Summary.LedgerNet - h.Summary.TradingNet - h.Summary.Transfers
	for asset := range assets {
		h.Summary.OtherAssets = append(h.Summary.OtherAssets, HistoryAmount{Asset: asset, Amount: assets.value(asset)})
	}
	sort.Slice(h.Summary.OtherAssets, func(i, j int) bool { return h.Summary.OtherAssets[i].Asset < h.Summary.OtherAssets[j].Asset })
	var names []string
	for symbol := range symbols {
		names = append(names, symbol)
	}
	sort.Strings(names)
	if len(names) > 40 {
		names = names[:40]
		h.OrdersComplete = false
		h.Warnings = append(h.Warnings, "成交合约较多，本轮最多加载40个合约；请缩短查询区间。")
	}
	var trades []*futures.AccountTrade
	for _, symbol := range names {
		for a := start; a <= end; {
			b := min(end, a+7*24*time.Hour.Milliseconds()-1)
			rows, ok, readErr := historyWindow(ctx, a, b, &budget, func(x, y int64) ([]*futures.AccountTrade, error) {
				return binanceReadContext(ctx, t, func(c *futures.Client, request context.Context) ([]*futures.AccountTrade, error) {
					return c.NewListAccountTradeService().Symbol(symbol).StartTime(x).EndTime(y).Limit(1000).Do(request)
				})
			})
			if readErr != nil {
				h.OrdersComplete = false
				h.Warnings = append(h.Warnings, symbol+" 成交读取失败："+BinanceReadErrorMessage(readErr))
				break
			}
			if !ok {
				h.OrdersComplete = false
			}
			trades = append(trades, rows...)
			a = b + 1
		}
	}
	h.Orders = aggregateHistoryOrders(trades, start, end)
	if !h.IncomeComplete {
		h.OrdersComplete = false
	}
	if !h.OrdersComplete {
		h.Warnings = append(h.Warnings, "部分成交记录未加载完整；已实现收益汇总独立取自账变，不用缺失成交推算。")
	}
	sort.Slice(h.Income, func(i, j int) bool {
		if h.Income[i].Time == h.Income[j].Time {
			return h.Income[i].ID < h.Income[j].ID
		}
		return h.Income[i].Time > h.Income[j].Time
	})
	h.FetchedAt = time.Now()
	if t.historyCache == nil {
		t.historyCache = make(map[int]*TradingHistory)
	}
	if h.IncomeComplete && h.OrdersComplete && t.historyVersion.Load() == version {
		t.historyCache[days] = h
	}
	return h, nil
}

func aggregateHistoryOrders(trades []*futures.AccountTrade, start, end int64) []HistoryOrder {
	type group struct {
		row  HistoryOrder
		fees historyTotals
		sum  historyTotals
	}
	groups := map[string]*group{}
	seen := map[string]bool{}
	for _, fill := range trades {
		if fill.Time < start || fill.Time > end || !strings.HasSuffix(fill.Symbol, "USDT") {
			continue
		}
		fillID := fill.Symbol + "-" + strconv.FormatInt(fill.ID, 10)
		if seen[fillID] {
			continue
		}
		seen[fillID] = true
		qty, qOK := finiteNumber(fill.Quantity)
		price, pOK := finiteNumber(fill.Price)
		if !qOK || !pOK || qty <= 0 || price <= 0 {
			continue
		}
		id := fill.Symbol + "-" + strconv.FormatInt(fill.OrderID, 10)
		g := groups[id]
		if g == nil {
			g = &group{row: HistoryOrder{ID: id, OrderID: strconv.FormatInt(fill.OrderID, 10), Symbol: fill.Symbol, Side: string(fill.Side), PositionSide: string(fill.PositionSide), FirstTime: fill.Time, Commissions: []HistoryAmount{}}, fees: historyTotals{}, sum: historyTotals{}}
			groups[id] = g
		}
		g.row.FirstTime = min(g.row.FirstTime, fill.Time)
		g.row.LastTime = max(g.row.LastTime, fill.Time)
		g.row.Fills++
		g.sum.add("qty", fill.Quantity)
		g.sum.add("pnl", fill.RealizedPnl)
		g.fees.add(fill.CommissionAsset, fill.Commission)
		quote, ok := finiteNumber(fill.QuoteQuantity)
		if !ok || quote <= 0 {
			quote = qty * price
		}
		g.sum.add("quote", strconv.FormatFloat(quote, 'f', -1, 64))
	}
	orders := make([]HistoryOrder, 0, len(groups))
	for _, g := range groups {
		g.row.Quantity = g.sum.value("qty")
		g.row.Notional = g.sum.value("quote")
		g.row.Price = g.row.Notional / g.row.Quantity
		g.row.RealizedPnL = g.sum.value("pnl")
		g.row.Action = "buy"
		if g.row.Side == "SELL" {
			g.row.Action = "sell"
		}
		if g.row.PositionSide == "LONG" {
			g.row.Action = "open_long"
			if g.row.Side == "SELL" {
				g.row.Action = "close_long"
			}
		}
		if g.row.PositionSide == "SHORT" {
			g.row.Action = "open_short"
			if g.row.Side == "BUY" {
				g.row.Action = "close_short"
			}
		}
		convertible := true
		for asset := range g.fees {
			value := g.fees.value(asset)
			g.row.Commissions = append(g.row.Commissions, HistoryAmount{Asset: asset, Amount: value})
			if asset != "USDT" && value != 0 {
				convertible = false
			}
		}
		sort.Slice(g.row.Commissions, func(i, j int) bool { return g.row.Commissions[i].Asset < g.row.Commissions[j].Asset })
		if convertible {
			net := g.row.RealizedPnL - g.fees.value("USDT")
			g.row.NetPnL = &net
		}
		orders = append(orders, g.row)
	}
	sort.Slice(orders, func(i, j int) bool {
		if orders[i].LastTime == orders[j].LastTime {
			return orders[i].ID < orders[j].ID
		}
		return orders[i].LastTime > orders[j].LastTime
	})
	return orders
}
