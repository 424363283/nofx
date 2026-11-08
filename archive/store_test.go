package archive

import (
	"context"
	"encoding/json"
	"fmt"
	"guanlan/signals"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"
)

func fixture(at time.Time, bias string) signals.RadarResult {
	candle := at.Truncate(15 * time.Minute)
	return signals.RadarResult{Items: []signals.RadarItem{{Symbol: "TESTUSDT", Category: "equity", Price: 100, PriceAsOf: at, CandleAt: &candle, Bias: bias, Signals: []signals.RadarSignal{{Kind: "volume", Direction: bias, Label: "放量"}}}}}
}
func TestArchiveForwardObservations(t *testing.T) {
	at := time.Date(2026, 11, 8, 10, 0, 20, 0, time.UTC)
	path := filepath.Join(t.TempDir(), "archive.db")
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	r := fixture(at, "bull")
	if err = s.Capture(r, at); err != nil {
		t.Fatal(err)
	}
	r.Items[0].Price = 999 // same candle evidence must not overwrite first observation
	if err = s.Capture(r, at.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	s.Close()
	s, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	result, err := s.List("TEST", "equity", "bull", 1)
	if err != nil {
		t.Fatal(err)
	}
	entries := result["items"].([]Entry)
	if len(entries) != 1 || entries[0].Snapshot.Price != 100 || len(entries[0].Outcomes) != 3 {
		t.Fatalf("immutable snapshot / restart failed: %+v", entries)
	}
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		var start, end int64
		fmt.Sscan(r.URL.Query().Get("startTime"), &start)
		fmt.Sscan(r.URL.Query().Get("endTime"), &end)
		if start <= at.UnixMilli() {
			t.Error("included pre-signal candle")
		}
		bars := []any{}
		for t0 := start; t0 <= end; t0 += 60000 {
			bars = append(bars, []any{t0, "100", "105", "98", "103", "10", t0 + 59999})
		}
		json.NewEncoder(w).Encode(bars)
	}))
	defer server.Close()
	s.BaseURL = server.URL
	if err = s.Resolve(context.Background(), at.Add(14*time.Minute)); err != nil {
		t.Fatal(err)
	}
	if calls != 0 {
		t.Fatal("lookahead: resolved before deadline")
	}
	if err = s.Resolve(context.Background(), at.Add(17*time.Minute)); err != nil {
		t.Fatal(err)
	}
	result, err = s.List("TEST", "equity", "bull", 1)
	if err != nil {
		t.Fatal(err)
	}
	o := result["items"].([]Entry)[0].Outcomes[0]
	if o.Status != "complete" || o.Return == nil || *o.Return < 2.99 || *o.MFE < 4.99 || *o.MAE > -1.99 {
		t.Fatalf("incorrect outcome: %+v", o)
	}
	stats := result["stats"].([]map[string]any)
	if stats[0]["completed"] != 1 || stats[0]["positive"] != 1 || stats[1]["completed"] != 0 {
		t.Fatalf("incorrect denominator: %+v", stats)
	}
	if err = s.Resolve(context.Background(), at.Add(5*time.Hour)); err != nil {
		t.Fatal(err)
	}
	if calls != 3 {
		t.Fatalf("expected three horizons, got %d", calls)
	}
}
func TestMissingDataNotCountedAndRetry(t *testing.T) {
	at := time.Now().UTC().Add(-time.Hour)
	s, err := Open(filepath.Join(t.TempDir(), "archive.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if err = s.Capture(fixture(at, "bear"), at); err != nil {
		t.Fatal(err)
	}
	complete := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !complete {
			w.Write([]byte(`[]`))
			return
		}
		var start, end int64
		fmt.Sscan(r.URL.Query().Get("startTime"), &start)
		fmt.Sscan(r.URL.Query().Get("endTime"), &end)
		bars := []any{}
		for t0 := start; t0 <= end; t0 += 60000 {
			bars = append(bars, []any{t0, "100", "105", "98", "103", "10", t0 + 59999})
		}
		json.NewEncoder(w).Encode(bars)
	}))
	defer server.Close()
	s.BaseURL = server.URL
	if err = s.Resolve(context.Background(), at.Add(17*time.Minute)); err != nil {
		t.Fatal(err)
	}
	result, err := s.List("", "", "", 1)
	if err != nil {
		t.Fatal(err)
	}
	if result["items"].([]Entry)[0].Outcomes[0].Status != "unavailable" || result["stats"].([]map[string]any)[0]["completed"] != 0 {
		t.Fatal("missing data counted as complete")
	}
	complete = true
	if err = s.Resolve(context.Background(), at.Add(23*time.Minute)); err != nil {
		t.Fatal(err)
	}
	result, _ = s.List("", "", "", 1)
	o := result["items"].([]Entry)[0].Outcomes[0]
	if o.DirectionReturn == nil || *o.DirectionReturn > -2.99 || *o.MFE < 1.99 || *o.MAE > -4.99 {
		t.Fatalf("short returns incorrect %+v", o)
	}
}
func TestNeutralExcludedAndStaleSkipped(t *testing.T) {
	at := time.Now().UTC()
	s, e := Open(filepath.Join(t.TempDir(), "archive.db"))
	if e != nil {
		t.Fatal(e)
	}
	defer s.Close()
	if e = s.Capture(fixture(at, "neutral"), at); e != nil {
		t.Fatal(e)
	}
	if e = s.Capture(fixture(at, "bull"), at.Add(10*time.Minute)); e != nil {
		t.Fatal(e)
	}
	result, e := s.List("", "", "", 1)
	if e != nil {
		t.Fatal(e)
	}
	if result["total"] != 1 {
		t.Fatal("stale signal accepted")
	}
	_, e = s.db.Exec(`UPDATE signal_outcomes SET status='complete',result='{"minutes":15,"status":"complete","return_pct":3,"direction_return_pct":null}' WHERE minutes=15`)
	if e != nil {
		t.Fatal(e)
	}
	result, e = s.List("", "", "", 1)
	if e != nil {
		t.Fatal(e)
	}
	if result["stats"].([]map[string]any)[0]["completed"] != 0 {
		t.Fatal("neutral counted in directional denominator")
	}
	filtered, e := s.List("NOTFOUND", "", "", 1)
	if e != nil || filtered["total"] != 0 {
		t.Fatal("filter mismatch")
	}
}
