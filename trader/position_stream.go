package trader

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/adshao/go-binance/v2/futures"
	"github.com/gorilla/websocket"
)

// PositionStreamRow is a display projection. It never writes to the trading
// engine's balance/position caches or submits exchange orders.
type PositionStreamRow struct {
	Symbol           string  `json:"symbol"`
	Side             string  `json:"side"`
	EntryPrice       float64 `json:"entry_price"`
	MarkPrice        float64 `json:"mark_price"`
	Quantity         float64 `json:"quantity"`
	Leverage         float64 `json:"leverage"`
	UnrealizedPnL    float64 `json:"unrealized_pnl"`
	UnrealizedPnLPct float64 `json:"unrealized_pnl_pct"`
	LiquidationPrice float64 `json:"liquidation_price"`
	MarginUsed       float64 `json:"margin_used"`
}

type PositionStreamUpdate struct {
	State       string              `json:"state"`
	Positions   []PositionStreamRow `json:"positions"` // null until the first full snapshot
	AsOf        time.Time           `json:"as_of"`
	SnapshotAt  time.Time           `json:"snapshot_at"`
	PositionsAt time.Time           `json:"positions_at"`
	Warning     string              `json:"warning,omitempty"`
}

type markTick struct {
	Event  string `json:"e"`
	Time   int64  `json:"E"`
	Symbol string `json:"s"`
	Price  string `json:"p"`
	// Declare both cases: encoding/json otherwise lets the later "P" field
	// case-insensitively overwrite "p". Settlement price must never price PnL.
	SettlementPrice string `json:"P"`
	Type            int    `json:"st"`
}

type accountPosition struct {
	Symbol string `json:"s"`
	Side   string `json:"ps"`
	Amount string `json:"pa"`
	Entry  string `json:"ep"`
}

type positionAccountEvent struct {
	Event string `json:"e"`
	Time  int64  `json:"E"`
	Data  struct {
		Positions []accountPosition `json:"P"`
	} `json:"a"`
	Config struct {
		Symbol   string  `json:"s"`
		Leverage float64 `json:"l"`
	} `json:"ac"`
}

type positionFeedEvent struct {
	kind       string
	connected  bool
	marks      []markTick
	account    positionAccountEvent
	rows       []PositionStreamRow
	revision   uint64
	observedAt time.Time
	err        error
}

type positionFeed struct {
	ctx        context.Context
	cancel     context.CancelFunc
	trader     *FuturesTrader
	mu         sync.Mutex
	subs       map[chan PositionStreamUpdate]struct{}
	latest     PositionStreamUpdate
	marketURL  string
	privateURL string
	events     chan positionFeedEvent
	refresh    chan uint64
}

func newPositionFeed(t *FuturesTrader) *positionFeed {
	ctx, cancel := context.WithCancel(context.Background())
	return &positionFeed{
		ctx: ctx, cancel: cancel, trader: t,
		subs:       make(map[chan PositionStreamUpdate]struct{}),
		latest:     PositionStreamUpdate{State: "connecting"},
		marketURL:  "wss://fstream.binance.com/market/ws/!markPrice@arr@1s",
		privateURL: "wss://fstream.binance.com/private/ws/",
		events:     make(chan positionFeedEvent, 64), refresh: make(chan uint64, 1),
	}
}

// A trader shares its two upstream sockets across all viewers. Connections are
// stopped when the last viewer leaves, independently of the trading Run/Stop state.
func (t *FuturesTrader) streamPositions(ctx context.Context, emit func(PositionStreamUpdate) error) error {
	t.positionFeedMu.Lock()
	h := t.positionFeed
	if h == nil || h.ctx.Err() != nil {
		h = newPositionFeed(t)
		t.positionFeed = h
		go h.run()
	}
	ch := make(chan PositionStreamUpdate, 1)
	h.mu.Lock()
	h.subs[ch] = struct{}{}
	ch <- h.latest
	h.mu.Unlock()
	t.positionFeedMu.Unlock()
	defer func() {
		t.positionFeedMu.Lock()
		h.mu.Lock()
		delete(h.subs, ch)
		if len(h.subs) == 0 {
			h.cancel()
		}
		h.mu.Unlock()
		t.positionFeedMu.Unlock()
	}()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-h.ctx.Done():
			return h.ctx.Err()
		case update := <-ch:
			if err := emit(update); err != nil {
				return err
			}
		}
	}
}

func (at *AutoTrader) StreamPositions(ctx context.Context, emit func(PositionStreamUpdate) error) error {
	t, ok := at.trader.(*FuturesTrader)
	if !ok {
		return errors.New("实时持仓推送仅支持币安账户")
	}
	return t.streamPositions(ctx, emit)
}

// Used on deletion, not when stopping the trading strategy: a stopped trader's
// positions must still be visible and continue receiving market data.
func (at *AutoTrader) ClosePositionStream() {
	if t, ok := at.trader.(*FuturesTrader); ok {
		t.positionFeedMu.Lock()
		if t.positionFeed != nil {
			t.positionFeed.cancel()
		}
		t.positionFeedMu.Unlock()
	}
}

func (h *positionFeed) send(e positionFeedEvent) bool {
	select {
	case h.events <- e:
		return true
	case <-h.ctx.Done():
		return false
	}
}

func (h *positionFeed) publish(update PositionStreamUpdate) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.latest = update
	for ch := range h.subs {
		select {
		case <-ch:
		default:
		}
		ch <- update // bounded latest-value mailbox; a slow browser cannot block others
	}
}

func (h *positionFeed) requestSnapshot(revision uint64) {
	select {
	case <-h.refresh:
	default:
	}
	select {
	case h.refresh <- revision:
	default:
	}
}

func finiteNumber(s string) (float64, bool) {
	v, err := strconv.ParseFloat(s, 64)
	return v, err == nil && !math.IsNaN(v) && !math.IsInf(v, 0)
}

func repricePosition(p *PositionStreamRow, mark float64) {
	p.MarkPrice = mark
	direction := 1.0
	if p.Side == "short" {
		direction = -1
	}
	p.UnrealizedPnL = (mark - p.EntryPrice) * p.Quantity * direction
	if p.Leverage > 0 {
		p.MarginUsed = p.Quantity * mark / p.Leverage
		if p.MarginUsed > 0 {
			p.UnrealizedPnLPct = p.UnrealizedPnL / p.MarginUsed * 100
		}
	}
}

func (h *positionFeed) snapshotWorker() {
	delay := 2 * time.Second
	for {
		select {
		case <-h.ctx.Done():
			return
		case revision := <-h.refresh:
			var observedAt time.Time
			requestCtx, cancel := context.WithTimeout(h.ctx, 8*time.Second)
			rows, err := binanceReadContext(requestCtx, h.trader, func(c *futures.Client, ctx context.Context) ([]*futures.PositionRisk, error) {
				observedAt = time.Now().Add(-time.Duration(c.TimeOffset) * time.Millisecond)
				return c.NewGetPositionRiskService().Do(ctx)
			})
			cancel()
			var projected []PositionStreamRow
			if err == nil {
				projected = make([]PositionStreamRow, 0, len(rows))
				for _, r := range rows {
					amount, valid := finiteNumber(r.PositionAmt)
					if !valid {
						err = errors.New("持仓数量无效")
						break
					}
					if amount == 0 {
						continue
					}
					entry, eOK := finiteNumber(r.EntryPrice)
					mark, mOK := finiteNumber(r.MarkPrice)
					leverage, lOK := finiteNumber(r.Leverage)
					if !eOK || !mOK || !lOK || entry <= 0 || mark <= 0 || leverage <= 0 {
						err = errors.New("持仓快照字段无效")
						break
					}
					liq, liqOK := finiteNumber(r.LiquidationPrice)
					if !liqOK || liq < 0 {
						liq = 0
					}
					side := "long"
					if r.PositionSide == "SHORT" || amount < 0 {
						side = "short"
					}
					p := PositionStreamRow{Symbol: r.Symbol, Side: side, EntryPrice: entry, Quantity: math.Abs(amount), Leverage: leverage, LiquidationPrice: liq}
					repricePosition(&p, mark)
					projected = append(projected, p)
				}
			}
			if !h.send(positionFeedEvent{kind: "snapshot", rows: projected, revision: revision, observedAt: observedAt, err: err}) {
				return
			}
			if err != nil {
				if !waitPositionReconnect(h.ctx, delay) {
					return
				}
				select {
				case h.refresh <- revision:
				default:
				}
				delay = min(30*time.Second, delay*2)
			} else {
				delay = 2 * time.Second
			}
		}
	}
}

func (h *positionFeed) run() {
	go h.socketWorker(false)
	go h.socketWorker(true)
	go h.snapshotWorker()
	positions := make(map[string]PositionStreamRow)
	marks := make(map[string]markTick)
	var revision uint64
	var lastAccountTime int64
	var asOf, snapshotAt, marketAt, positionsAt time.Time
	var ready, accountConnected, snapshotFailed, pending bool
	var snapshotError string
	h.requestSnapshot(revision)
	tick := time.NewTicker(time.Second)
	defer tick.Stop()
	calibrate := time.NewTicker(30 * time.Second)
	defer calibrate.Stop()
	emit := func() {
		update := PositionStreamUpdate{State: "reconnecting", AsOf: asOf, SnapshotAt: snapshotAt, PositionsAt: positionsAt}
		if ready {
			update.Positions = make([]PositionStreamRow, 0, len(positions))
			for _, p := range positions {
				update.Positions = append(update.Positions, p)
			}
			sort.Slice(update.Positions, func(i, j int) bool {
				a, b := update.Positions[i], update.Positions[j]
				return a.Symbol+a.Side < b.Symbol+b.Side
			})
		}
		fresh := time.Since(marketAt) < 5*time.Second
		for _, p := range positions {
			if m, ok := marks[p.Symbol]; !ok || time.Since(time.UnixMilli(m.Time)) > 5*time.Second {
				fresh = false
			}
		}
		if ready && accountConnected && !snapshotFailed && !pending && time.Since(snapshotAt) < 45*time.Second && fresh {
			update.State = "live"
		} else if ready && accountConnected && pending && !snapshotFailed && fresh {
			update.State = "syncing"
		} else if !ready {
			update.State = "connecting"
		}
		if update.State != "live" && update.State != "syncing" {
			update.Warning = "实时持仓连接尚未就绪，正在重连并定时校准；请留意数据时间。"
		}
		if snapshotFailed {
			update.Warning = snapshotError + "，正在自动重试；持仓状态暂无法确认。"
		}
		h.publish(update)
	}
	for {
		select {
		case <-h.ctx.Done():
			return
		case <-tick.C:
			emit()
		case <-calibrate.C:
			h.requestSnapshot(revision)
		case e := <-h.events:
			switch e.kind {
			case "private":
				accountConnected = e.connected
				pending = true
				revision++
				if e.connected {
					h.trader.invalidatePositionCaches()
					h.requestSnapshot(revision)
				}
			case "market_down":
				marketAt = time.Time{}
			case "marks":
				for _, m := range e.marks {
					price, ok := finiteNumber(m.Price)
					if !ok || price <= 0 || m.Event != "markPriceUpdate" || m.Type == 2 || m.Time <= 0 || time.Since(time.UnixMilli(m.Time)) > 5*time.Second || time.Until(time.UnixMilli(m.Time)) > 5*time.Second {
						continue
					}
					if old, exists := marks[m.Symbol]; exists && old.Time >= m.Time {
						continue
					}
					marks[m.Symbol] = m
					marketAt = time.Now()
					for _, side := range []string{"long", "short"} {
						key := m.Symbol + "-" + side
						if p, exists := positions[key]; exists {
							repricePosition(&p, price)
							positions[key] = p
							if time.UnixMilli(m.Time).After(asOf) {
								asOf = time.UnixMilli(m.Time)
							}
						}
					}
				}
			case "account":
				if e.account.Time <= 0 || e.account.Time < lastAccountTime {
					continue
				}
				lastAccountTime = e.account.Time
				h.trader.invalidatePositionCaches()
				positionsAt = time.UnixMilli(e.account.Time)
				revision++
				pending = true
				// Events are deltas, never a replacement for the full account.
				for _, delta := range e.account.Data.Positions {
					amount, ok := finiteNumber(delta.Amount)
					if !ok {
						continue
					}
					sides := []string{strings.ToLower(delta.Side)}
					if delta.Side == "BOTH" {
						sides = []string{"long", "short"}
					}
					for _, side := range sides {
						key := delta.Symbol + "-" + side
						if amount == 0 || (delta.Side == "BOTH" && ((amount > 0 && side == "short") || (amount < 0 && side == "long"))) {
							delete(positions, key)
							continue
						}
						if p, exists := positions[key]; exists {
							if entry, valid := finiteNumber(delta.Entry); valid && entry > 0 {
								p.Quantity, p.EntryPrice, p.LiquidationPrice = math.Abs(amount), entry, 0
								repricePosition(&p, p.MarkPrice)
								positions[key] = p
							}
						}
					}
				}
				// Risk metadata may change with collateral or leverage. Hide it
				// until REST provides authoritative values; never invent liquidation prices.
				for key, p := range positions {
					p.LiquidationPrice = 0
					if e.account.Config.Symbol == p.Symbol && e.account.Config.Leverage > 0 {
						p.Leverage = e.account.Config.Leverage
						repricePosition(&p, p.MarkPrice)
					}
					positions[key] = p
				}
				if stamp := time.UnixMilli(e.account.Time); stamp.After(asOf) {
					asOf = stamp
				}
				h.requestSnapshot(revision)
			case "snapshot":
				if e.revision != revision {
					h.requestSnapshot(revision)
					continue
				}
				if e.err != nil {
					snapshotFailed = true
					snapshotError = BinanceReadErrorMessage(e.err)
					break
				}
				positions = make(map[string]PositionStreamRow, len(e.rows))
				for _, p := range e.rows {
					if m, ok := marks[p.Symbol]; ok && time.Since(time.UnixMilli(m.Time)) < 5*time.Second {
						price, _ := finiteNumber(m.Price)
						repricePosition(&p, price)
					}
					positions[p.Symbol+"-"+p.Side] = p
				}
				ready, snapshotFailed, pending = true, false, false
				snapshotAt = time.Now()
				if e.observedAt.After(asOf) {
					asOf = e.observedAt
				}
				positionsAt = e.observedAt
			}
			emit()
		}
	}
}

func unwrapPositionMessage(raw []byte) []byte {
	var envelope struct {
		Data json.RawMessage `json:"data"`
	}
	if json.Unmarshal(raw, &envelope) == nil && len(envelope.Data) > 0 {
		return envelope.Data
	}
	return raw
}

func waitPositionReconnect(ctx context.Context, delay time.Duration) bool {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}

func (h *positionFeed) socketWorker(private bool) {
	delay := 2 * time.Second
	for h.ctx.Err() == nil {
		url := h.marketURL
		key := ""
		if private {
			var err error
			key, err = binanceRead(h.trader, func(c *futures.Client, ctx context.Context) (string, error) {
				return c.NewStartUserStreamService().Do(ctx)
			})
			if err != nil || key == "" {
				h.send(positionFeedEvent{kind: "private", connected: false})
				if !waitPositionReconnect(h.ctx, time.Minute) {
					return
				}
				continue
			}
			url = h.privateURL + key
		}
		dialer := websocket.Dialer{Proxy: http.ProxyFromEnvironment, HandshakeTimeout: 10 * time.Second}
		conn, response, err := dialer.DialContext(h.ctx, url, nil)
		if response != nil && response.Body != nil {
			response.Body.Close()
		}
		if err == nil {
			delay = 2 * time.Second
			if private {
				h.send(positionFeedEvent{kind: "private", connected: true})
			}
			h.readSocket(conn, private, key)
			conn.Close()
		}
		kind := "market_down"
		if private {
			kind = "private"
		}
		h.send(positionFeedEvent{kind: kind, connected: false})
		if !waitPositionReconnect(h.ctx, delay) {
			return
		}
		delay = min(delay*2, 30*time.Second)
	}
}

func (h *positionFeed) readSocket(conn *websocket.Conn, private bool, key string) {
	ctx, cancel := context.WithCancel(h.ctx)
	defer cancel()
	conn.SetReadLimit(2 << 20)
	conn.SetReadDeadline(time.Now().Add(45 * time.Second))
	conn.SetPongHandler(func(string) error { return conn.SetReadDeadline(time.Now().Add(45 * time.Second)) })
	go func() {
		ping := time.NewTicker(15 * time.Second)
		defer ping.Stop()
		keepalive := time.NewTicker(30 * time.Minute)
		defer keepalive.Stop()
		for {
			select {
			case <-ctx.Done():
				conn.Close()
				return
			case <-ping.C:
				if conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(5*time.Second)) != nil {
					conn.Close()
					return
				}
			case <-keepalive.C:
				if private {
					_, err := binanceRead(h.trader, func(c *futures.Client, req context.Context) (bool, error) {
						return true, c.NewKeepaliveUserStreamService().ListenKey(key).Do(req)
					})
					if err != nil {
						conn.Close()
						return
					}
				}
			}
		}
	}()
	// Closing the socket is sufficient. Deleting a listenKey could disconnect
	// other consumers because Binance reuses an account's active listenKey.
	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			return
		}
		conn.SetReadDeadline(time.Now().Add(45 * time.Second))
		raw = unwrapPositionMessage(raw)
		if private {
			var e positionAccountEvent
			if json.Unmarshal(raw, &e) != nil {
				continue
			}
			if e.Event == "listenKeyExpired" {
				return
			}
			if e.Event == "ACCOUNT_UPDATE" || e.Event == "ACCOUNT_CONFIG_UPDATE" || e.Event == "MARGIN_CALL" {
				if !h.send(positionFeedEvent{kind: "account", account: e}) {
					return
				}
			}
		} else {
			var ticks []markTick
			if len(raw) > 0 && raw[0] == '[' {
				err = json.Unmarshal(raw, &ticks)
			} else {
				var m markTick
				err = json.Unmarshal(raw, &m)
				ticks = []markTick{m}
			}
			if err == nil && !h.send(positionFeedEvent{kind: "marks", marks: ticks}) {
				return
			}
		}
	}
}
