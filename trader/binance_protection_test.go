package trader

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"github.com/adshao/go-binance/v2/futures"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"
)

func TestBinanceProtectionUsesAlgoAPIAndQueriesAmbiguousSubmission(t *testing.T) {
	for _, postFailure := range []bool{false, true} {
		var submitted url.Values
		posts, queries := 0, 0
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/fapi/v1/exchangeInfo" {
				fmt.Fprint(w, `{"symbols":[{"symbol":"HOTUSDT","filters":[{"filterType":"PRICE_FILTER","minPrice":"0","maxPrice":"1000","tickSize":"0.00000010"}]}]}`)
				return
			}
			r.ParseForm()
			p := r.Form
			signature := p.Get("signature")
			unsigned := url.Values{}
			for k, v := range p {
				if k != "signature" {
					unsigned[k] = v
				}
			}
			mac := hmac.New(sha256.New, []byte("test-secret"))
			mac.Write([]byte(unsigned.Encode()))
			if signature != hex.EncodeToString(mac.Sum(nil)) || r.Header.Get("X-MBX-APIKEY") != "test-key" {
				t.Error("request signing incorrect")
			}
			if r.Method == http.MethodPost {
				posts++
				submitted = p
				if p.Get("quantity") != "" || p.Get("reduceOnly") != "" || p.Get("closePosition") != "true" || p.Get("workingType") != "MARK_PRICE" || p.Get("triggerPrice") != "0.0004201" || p.Get("algoType") != "CONDITIONAL" {
					t.Errorf("invalid conditional params: %v", unsigned)
				}
				if postFailure {
					w.WriteHeader(503)
					fmt.Fprint(w, `{"msg":"unknown execution status"}`)
				} else {
					fmt.Fprint(w, `{"algoId":42}`)
				}
				return
			}
			queries++
			json.NewEncoder(w).Encode(protectionAlgo{ID: 42, ClientID: submitted.Get("clientAlgoId"), Symbol: "HOTUSDT", Side: "SELL", PositionSide: "LONG", Type: "STOP_MARKET", Status: "NEW", Trigger: "0.00042010", ClosePosition: true, WorkingType: "MARK_PRICE"})
		}))
		client := futures.NewClient("test-key", "test-secret")
		client.BaseURL = server.URL
		tr := &FuturesTrader{client: client, lastClockSync: time.Now()}
		if err := tr.SetStopLoss("HOTUSDT", "LONG", 99, 0.00042019); err != nil {
			t.Fatal(err)
		}
		if posts != 1 || queries != 1 {
			t.Fatalf("ambiguous mutation was retried: %d %d", posts, queries)
		}
		server.Close()
	}
}

func TestProtectionQueryDoesNotAcceptCanceledOrder(t *testing.T) {
	var id string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/fapi/v1/exchangeInfo" {
			fmt.Fprint(w, `{"symbols":[{"symbol":"BTCUSDT","filters":[{"filterType":"PRICE_FILTER","tickSize":"0.1"}]}]}`)
			return
		}
		r.ParseForm()
		if r.Method == http.MethodPost {
			id = r.Form.Get("clientAlgoId")
			fmt.Fprint(w, `{"algoId":1}`)
			return
		}
		json.NewEncoder(w).Encode(protectionAlgo{ID: 1, ClientID: id, Symbol: "BTCUSDT", Side: "BUY", PositionSide: "SHORT", Type: "TAKE_PROFIT_MARKET", Status: "CANCELED", Trigger: "90", ClosePosition: true, WorkingType: "MARK_PRICE"})
	}))
	defer server.Close()
	client := futures.NewClient("test", "test")
	client.BaseURL = server.URL
	if err := (&FuturesTrader{client: client}).SetTakeProfit("BTCUSDT", "SHORT", 1, 90); err == nil {
		t.Fatal("canceled protection accepted")
	}
}
