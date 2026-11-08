package trader

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/adshao/go-binance/v2/futures"
)

func TestClosedPositionInvalidatesInFlightSnapshotAndCachesEmptyArray(t *testing.T) {
	started, release := make(chan struct{}), make(chan struct{})
	var requests atomic.Int64
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if requests.Add(1) == 1 {
			close(started)
			<-release
			fmt.Fprint(w, `[{"symbol":"JCTUSDT","positionAmt":"-1","entryPrice":"100","markPrice":"90","leverage":"5","liquidationPrice":"120","unRealizedProfit":"10"}]`)
			return
		}
		fmt.Fprint(w, `[]`)
	}))
	defer server.Close()
	c := futures.NewClient("test", "test")
	c.BaseURL = server.URL
	tr := &FuturesTrader{client: c, lastClockSync: time.Now(), cacheDuration: 15 * time.Second}
	result := make(chan error, 1)
	go func() {
		rows, asOf, err := tr.GetPositionsSnapshot()
		if err == nil && (rows == nil || len(rows) != 0 || asOf.IsZero()) {
			err = fmt.Errorf("stale/null snapshot returned: %v", rows)
		}
		result <- err
	}()
	<-started
	tr.invalidatePositionCaches() // ACCOUNT_UPDATE closed the position while HTTP was pending.
	close(release)
	if err := <-result; err != nil {
		t.Fatal(err)
	}
	if requests.Load() != 2 {
		t.Fatalf("stale response was not retried: %d", requests.Load())
	}
	rows, firstStamp, err := tr.GetPositionsSnapshot()
	if err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(rows)
	if string(encoded) != "[]" {
		t.Fatalf("empty positions encoded as %s", encoded)
	}
	at := &AutoTrader{trader: tr}
	projected, stamp, err := at.GetPositionsSnapshot()
	encoded, _ = json.Marshal(projected)
	if err != nil || string(encoded) != "[]" || !stamp.Equal(firstStamp) || requests.Load() != 2 {
		t.Fatalf("empty cache/observation time lost: json=%s timestamp=%v error=%v requests=%d", encoded, stamp, err, requests.Load())
	}
}
