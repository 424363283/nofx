package trader

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/adshao/go-binance/v2/futures"
	"math"
	"net/http"
	"net/http/httptest"
	"strconv"
	"sync/atomic"
	"testing"
	"time"
)

func TestTradingHistorySeparatesTradingIncomeFromTransfersAndGroupsFills(t *testing.T) {
	stamp := time.Now().Add(-time.Hour).UnixMilli()
	var calls atomic.Int64
	income := []*futures.IncomeHistory{
		{TranID: 1, Time: stamp, Asset: "USDT", Symbol: "JCTUSDT", IncomeType: "REALIZED_PNL", Income: "10"},
		{TranID: 1, Time: stamp, Asset: "USDT", Symbol: "JCTUSDT", IncomeType: "COMMISSION", Income: "-0.4"},
		{TranID: 2, Time: stamp, Asset: "USDT", Symbol: "JCTUSDT", IncomeType: "FUNDING_FEE", Income: "-0.5"},
		{TranID: 3, Time: stamp, Asset: "USDT", IncomeType: "TRANSFER", Income: "100"},
		{TranID: 4, Time: stamp, Asset: "USDT", IncomeType: "COMMISSION_REBATE", Income: "0.2"},
		{TranID: 5, Time: stamp, Asset: "BNB", Symbol: "JCTUSDT", IncomeType: "COMMISSION", Income: "-0.01"},
	}
	income = append(income, income[0]) // Duplicate must not inflate realized profit.
	trades := []*futures.AccountTrade{
		{ID: 1, OrderID: 10, Symbol: "JCTUSDT", Time: stamp - 2, Side: "SELL", PositionSide: "SHORT", Price: "100", Quantity: "0.5", QuoteQuantity: "50", RealizedPnl: "0", Commission: "0.1", CommissionAsset: "USDT"},
		{ID: 2, OrderID: 10, Symbol: "JCTUSDT", Time: stamp - 1, Side: "SELL", PositionSide: "SHORT", Price: "102", Quantity: "0.5", QuoteQuantity: "51", RealizedPnl: "0", Commission: "0.1", CommissionAsset: "USDT"},
		{ID: 3, OrderID: 11, Symbol: "JCTUSDT", Time: stamp, Side: "BUY", PositionSide: "SHORT", Price: "91", Quantity: "1", QuoteQuantity: "91", RealizedPnl: "10", Commission: "0.2", CommissionAsset: "USDT"},
	}
	trades = append(trades, trades[0])
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.Method != "GET" {
			t.Errorf("history attempted a mutation: %s", r.Method)
		}
		start, _ := strconv.ParseInt(r.URL.Query().Get("startTime"), 10, 64)
		end, _ := strconv.ParseInt(r.URL.Query().Get("endTime"), 10, 64)
		if r.URL.Path == "/fapi/v1/income" {
			json.NewEncoder(w).Encode(income)
			return
		}
		if r.URL.Path != "/fapi/v1/userTrades" {
			t.Errorf("unexpected endpoint %s", r.URL.Path)
			w.WriteHeader(404)
			return
		}
		if end-start > 7*24*time.Hour.Milliseconds() {
			t.Error("trade range exceeds seven days")
		}
		if r.URL.Query().Get("symbol") != "JCTUSDT" {
			t.Error("symbol missing")
		}
		rows := []*futures.AccountTrade{}
		for _, trade := range trades {
			if trade.Time >= start && trade.Time <= end {
				rows = append(rows, trade)
			}
		}
		json.NewEncoder(w).Encode(rows)
	}))
	defer server.Close()
	c := futures.NewClient("test", "test")
	c.BaseURL = server.URL
	tr := &FuturesTrader{client: c, lastClockSync: time.Now()}
	h, err := tr.GetTradingHistory(context.Background(), 30)
	if err != nil {
		t.Fatal(err)
	}
	if !h.IncomeComplete || !h.OrdersComplete || len(h.Orders) != 2 || len(h.Income) != 6 {
		t.Fatalf("incomplete history: %+v", h)
	}
	s := h.Summary
	if math.Abs(s.TradingNet-9.1) > 1e-9 || s.Transfers != 100 || math.Abs(s.LedgerNet-109.3) > 1e-9 || s.RealizedPnL != 10 || s.Commission != -.4 || s.Funding != -.5 {
		t.Fatalf("income counted incorrectly: %+v", s)
	}
	if len(s.OtherAssets) != 1 || s.OtherAssets[0].Asset != "BNB" {
		t.Fatal("non-USDT income was lost or converted")
	}
	if h.Orders[0].Action != "close_short" || h.Orders[1].Action != "open_short" || h.Orders[1].Fills != 2 || h.Orders[1].Price != 101 || h.Orders[1].Quantity != 1 {
		t.Fatalf("incorrect fill grouping: %+v", h.Orders)
	}
	if h.Orders[0].NetPnL == nil || math.Abs(*h.Orders[0].NetPnL-9.8) > 1e-9 {
		t.Fatal("per-order net PnL includes funding or double fees")
	}
	before := calls.Load()
	cached, err := tr.GetTradingHistory(context.Background(), 30)
	if err != nil || cached != h || calls.Load() != before {
		t.Fatal("history cache failed")
	}
	if _, err := tr.GetTradingHistory(context.Background(), 30, true); err != nil || calls.Load() <= before {
		t.Fatal("manual refresh did not bypass cache")
	}
	before = calls.Load()
	tr.invalidatePositionCaches()
	if _, err := tr.GetTradingHistory(context.Background(), 30); err != nil || calls.Load() <= before {
		t.Fatal("account event did not invalidate history")
	}
}

func TestHistoryWindowDoesNotLoseFullPagesOrSameMillisecondRows(t *testing.T) {
	rows := make([]int64, 1500)
	for i := range rows {
		rows[i] = int64(i / 3)
	}
	fetch := func(a, b int64) ([]int64, error) {
		result := []int64{}
		for _, stamp := range rows {
			if stamp >= a && stamp <= b {
				result = append(result, stamp)
				if len(result) == 1000 {
					break
				}
			}
		}
		return result, nil
	}
	budget := 20
	result, complete, err := historyWindow(context.Background(), 0, 1000, &budget, fetch)
	if err != nil || !complete || len(result) != 1500 {
		t.Fatalf("lost page boundary rows: %d complete=%t err=%v", len(result), complete, err)
	}
	budget = 1
	_, complete, _ = historyWindow(context.Background(), 0, 1000, &budget, fetch)
	if complete {
		t.Fatal("truncated response claimed complete")
	}
	budget = 10
	_, complete, _ = historyWindow(context.Background(), 0, 0, &budget, func(int64, int64) ([]int, error) { return make([]int, 1000), nil })
	if complete {
		t.Fatal("saturated millisecond claimed complete")
	}
}

func TestOrderHistoryDoesNotConvertBNBFeesOrGuessOneWayEntries(t *testing.T) {
	rows := aggregateHistoryOrders([]*futures.AccountTrade{{ID: 1, OrderID: 2, Symbol: "BTCUSDT", Time: 10, Side: "BUY", PositionSide: "BOTH", Price: "100", Quantity: "1", RealizedPnl: "0", Commission: "0.001", CommissionAsset: "BNB"}}, 0, 20)
	if len(rows) != 1 || rows[0].Action != "buy" || rows[0].NetPnL != nil {
		t.Fatalf("guessed conversion or trade direction: %+v", rows)
	}
}

func TestSlowBinanceReadDoesNotBlockIndependentRead(t *testing.T) {
	c := futures.NewClient("test", "test")
	tr := &FuturesTrader{client: c, lastClockSync: time.Now()}
	started, release, done := make(chan struct{}), make(chan struct{}), make(chan struct{})
	go func() {
		defer close(done)
		_, _ = binanceRead(tr, func(*futures.Client, context.Context) (int, error) { close(started); <-release; return 1, nil })
	}()
	<-started
	fast := make(chan error, 1)
	go func() {
		value, err := binanceRead(tr, func(*futures.Client, context.Context) (int, error) { return 2, nil })
		if err == nil && value != 2 {
			err = fmt.Errorf("unexpected read result")
		}
		fast <- err
	}()
	select {
	case err := <-fast:
		if err != nil {
			t.Error(err)
		}
	case <-time.After(time.Second):
		t.Error("slow request blocked independent position/history read")
	}
	close(release)
	<-done
}
