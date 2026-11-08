package trader

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/adshao/go-binance/v2/futures"
	"github.com/gorilla/websocket"
)

func TestPositionRepricingLongAndShort(t *testing.T) {
	for _, side := range []string{"long", "short"} {
		p := PositionStreamRow{Side: side, EntryPrice: 100, Quantity: 2, Leverage: 5}
		repricePosition(&p, 110)
		want := 20.0
		if side == "short" {
			want = -20
		}
		if p.UnrealizedPnL != want || p.MarginUsed != 44 || math.Abs(p.UnrealizedPnLPct-want/44*100) > 1e-9 {
			t.Fatalf("%s: %+v", side, p)
		}
	}
}

func TestMarkPriceDoesNotUseUppercaseSettlementPrice(t *testing.T) {
	for _, raw := range []string{
		`{"e":"markPriceUpdate","s":"HOTUSDT","p":"0.00044020","P":"0.00046401","i":"0.00045747","ap":"0.00044020"}`,
		`{"e":"markPriceUpdate","s":"HOTUSDT","P":"0.00046401","p":"0.00044020"}`,
	} {
		var tick markTick
		if err := json.Unmarshal([]byte(raw), &tick); err != nil {
			t.Fatal(err)
		}
		if tick.Price != "0.00044020" || tick.SettlementPrice != "0.00046401" {
			t.Fatalf("mark/settlement price confused: %+v", tick)
		}
		mark, _ := finiteNumber(tick.Price)
		row := PositionStreamRow{Symbol: "HOTUSDT", Side: "long", EntryPrice: 0.0004372638, Quantity: 20424353, Leverage: 25}
		repricePosition(&row, mark)
		if math.Abs(row.UnrealizedPnL-59.97) > 0.005 || math.Abs(row.MarkPrice*row.Quantity-8990.80) > 0.005 {
			t.Fatalf("HOT position replay must be approximately 60 USDT PnL: %+v", row)
		}
	}
	var settlementOnly markTick
	_ = json.Unmarshal([]byte(`{"P":"0.00046401"}`), &settlementOnly)
	if settlementOnly.Price != "" {
		t.Fatal("missing mark price substituted by settlement")
	}
}

func TestPositionFeedPushesIsolatedDeltasAndSharesConnections(t *testing.T) {
	var starts, snapshots atomic.Int64
	var closed atomic.Bool
	var holdSnapshot atomic.Bool
	snapshotStarted := make(chan struct{}, 1)
	releaseSnapshot := make(chan struct{})
	marketMessages, accountMessages := make(chan []byte, 16), make(chan []byte, 16)
	privateConnections := make(chan *websocket.Conn, 4)
	upgrader := websocket.Upgrader{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/fapi/v1/listenKey":
			if r.Method != http.MethodPost {
				t.Errorf("unexpected listen-key method: %s", r.Method)
			}
			starts.Add(1)
			fmt.Fprint(w, `{"listenKey":"test-stream-key"}`)
		case "/fapi/v2/positionRisk":
			snapshots.Add(1)
			rows := []map[string]string{
				{"symbol": "BTCUSDT", "positionSide": "LONG", "positionAmt": "2", "entryPrice": "100", "markPrice": "101", "leverage": "5", "liquidationPrice": "80"},
				{"symbol": "BTCUSDT", "positionSide": "SHORT", "positionAmt": "-1", "entryPrice": "100", "markPrice": "101", "leverage": "5", "liquidationPrice": "120"},
				{"symbol": "ETHUSDT", "positionSide": "LONG", "positionAmt": "1", "entryPrice": "200", "markPrice": "201", "leverage": "3", "liquidationPrice": "150"},
			}
			if closed.Load() {
				rows = rows[1:]
			}
			if holdSnapshot.CompareAndSwap(true, false) {
				snapshotStarted <- struct{}{}
				select {
				case <-releaseSnapshot:
				case <-r.Context().Done():
					return
				}
			}
			json.NewEncoder(w).Encode(rows)
		case "/market/ws/!markPrice@arr@1s", "/private/ws/test-stream-key":
			conn, err := upgrader.Upgrade(w, r, nil)
			if err != nil {
				return
			}
			defer conn.Close()
			messages := marketMessages
			if strings.HasPrefix(r.URL.Path, "/private/") {
				messages = accountMessages
				privateConnections <- conn
			}
			done := make(chan struct{})
			go func() {
				defer close(done)
				for {
					if _, _, err := conn.ReadMessage(); err != nil {
						return
					}
				}
			}()
			for {
				select {
				case <-done:
					return
				case raw := <-messages:
					if conn.WriteMessage(websocket.TextMessage, raw) != nil {
						return
					}
				}
			}
		default:
			t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
			w.WriteHeader(404)
		}
	}))
	defer server.Close()
	c := futures.NewClient("test", "test")
	c.BaseURL = server.URL
	tr := &FuturesTrader{client: c, lastClockSync: time.Now()}
	h := newPositionFeed(tr)
	h.marketURL = "ws" + strings.TrimPrefix(server.URL, "http") + "/market/ws/!markPrice@arr@1s"
	h.privateURL = "ws" + strings.TrimPrefix(server.URL, "http") + "/private/ws/"
	tr.positionFeed = h
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	defer h.cancel()
	updates := make(chan PositionStreamUpdate, 128)
	streamDone := make(chan struct{})
	go func() {
		defer close(streamDone)
		_ = tr.streamPositions(ctx, func(u PositionStreamUpdate) error {
			select {
			case updates <- u:
				return nil
			case <-ctx.Done():
				return ctx.Err()
			}
		})
	}()
	go h.run()
	waitFor := func(match func(PositionStreamUpdate) bool) PositionStreamUpdate {
		t.Helper()
		deadline := time.NewTimer(5 * time.Second)
		defer deadline.Stop()
		for {
			select {
			case u := <-updates:
				if match(u) {
					return u
				}
			case <-deadline.C:
				t.Fatal("timed out waiting for position update")
				return PositionStreamUpdate{}
			}
		}
	}
	waitFor(func(u PositionStreamUpdate) bool { return len(u.Positions) == 3 })
	stamp := time.Now().UnixMilli()
	marketMessages <- []byte(fmt.Sprintf(`[{"e":"markPriceUpdate","E":%d,"s":"BTCUSDT","p":"110","P":"250","st":1},{"e":"markPriceUpdate","E":%d,"s":"ETHUSDT","p":"210","P":"350","st":1}]`, stamp, stamp))
	u := waitFor(func(u PositionStreamUpdate) bool { return u.State == "live" && u.Positions[0].MarkPrice == 110 })
	if u.Positions[0].UnrealizedPnL != 20 || u.Positions[1].UnrealizedPnL != -10 {
		t.Fatalf("hedge prices incorrect: %+v", u.Positions)
	}
	// A delayed/CM/invalid price must not overwrite a newer UM price.
	marketMessages <- []byte(fmt.Sprintf(`[{"e":"markPriceUpdate","E":%d,"s":"BTCUSDT","p":"90"},{"e":"markPriceUpdate","E":%d,"s":"BTCUSDT","p":"NaN"},{"e":"markPriceUpdate","E":%d,"s":"BTCUSDT","p":"99","st":2}]`, stamp-1, stamp+1, stamp+2))
	waitFor(func(u PositionStreamUpdate) bool { return u.State == "live" && u.Positions[0].MarkPrice == 110 })
	// Hold an old full snapshot in flight, then close only the LONG side.
	holdSnapshot.Store(true)
	h.requestSnapshot(1) // the private connection raised revision from 0 to 1
	select {
	case <-snapshotStarted:
	case <-time.After(3 * time.Second):
		t.Fatal("snapshot did not start")
	}
	closed.Store(true)
	accountMessages <- []byte(fmt.Sprintf(`{"e":"ACCOUNT_UPDATE","E":%d,"a":{"P":[{"s":"BTCUSDT","ps":"LONG","pa":"0","ep":"0"}]}}`, stamp+3))
	waitFor(func(u PositionStreamUpdate) bool { return len(u.Positions) == 2 && u.State == "syncing" })
	close(releaseSnapshot)
	u = waitFor(func(u PositionStreamUpdate) bool { return len(u.Positions) == 2 && u.State == "live" })
	if u.Positions[0].Side != "short" || u.Positions[1].Symbol != "ETHUSDT" {
		t.Fatalf("delta removed unrelated positions: %+v", u.Positions)
	}
	if snapshots.Load() < 3 {
		t.Fatal("missing snapshot after private event")
	}
	// A second tab reuses upstream connections, and leaving one does not stop the other.
	otherCtx, otherCancel := context.WithCancel(context.Background())
	otherReady := make(chan struct{})
	otherDone := make(chan struct{})
	var once sync.Once
	go func() {
		defer close(otherDone)
		_ = tr.streamPositions(otherCtx, func(PositionStreamUpdate) error { once.Do(func() { close(otherReady) }); return nil })
	}()
	<-otherReady
	if starts.Load() != 1 {
		t.Fatalf("multiple upstream private streams: %d", starts.Load())
	}
	cancel()
	<-streamDone
	if h.ctx.Err() != nil {
		t.Fatal("first departing viewer closed shared feed")
	}
	// A genuine private disconnect downgrades the displayed mode.
	private := <-privateConnections
	private.Close()
	timeout := time.NewTimer(3 * time.Second)
	defer timeout.Stop()
	for {
		h.mu.Lock()
		state := h.latest.State
		h.mu.Unlock()
		if state == "reconnecting" {
			break
		}
		select {
		case <-timeout.C:
			t.Fatal("disconnect left live status")
		case <-time.After(10 * time.Millisecond):
		}
	}
	otherCancel()
	<-otherDone
	if h.ctx.Err() == nil {
		t.Fatal("upstream not stopped after final viewer left")
	}
}
