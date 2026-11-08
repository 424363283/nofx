package archive

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"
)

func TestPaperExecutionPaths(t *testing.T) {
	for _, tc := range []struct {
		name, bias string
		bars       []paperBar
		reason     string
		ambiguous  bool
		positive   bool
	}{
		{"long-target", "bull", []paperBar{{0, 100, 103, 100, 102}}, "target", false, true},
		{"short-target", "bear", []paperBar{{0, 100, 100, 97, 98}}, "target", false, true},
		{"both-long-stop-first", "bull", []paperBar{{0, 100, 104, 96, 101}}, "stop", true, false},
		{"both-short-stop-first", "bear", []paperBar{{0, 100, 104, 96, 99}}, "stop", true, false},
		{"gap-long", "bull", []paperBar{{0, 100, 100.2, 99.8, 100}, {60000, 95, 96, 94, 95}}, "stop_gap", false, false},
		{"gap-short", "bear", []paperBar{{0, 100, 100.2, 99.8, 100}, {60000, 105, 106, 104, 105}}, "stop_gap", false, false},
		{"flat-cost-loss", "bull", []paperBar{{0, 100, 100.1, 99.9, 100}}, "timeout", false, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			p := simulate(tc.bars, tc.bias)
			if p.Reason != tc.reason || p.Ambiguous != tc.ambiguous || p.Net == nil || (*p.Net > 0) != tc.positive {
				t.Fatalf("wrong execution: %+v", p)
			}
			if *p.Net >= *p.Gross || *p.Fees <= 0 {
				t.Fatal("costs must reduce return")
			}
			if tc.reason == "stop_gap" && *p.Net > -4.9 {
				t.Fatal("gap loss was capped at stop")
			}
			if tc.name == "flat-cost-loss" && math.Abs(*p.Net+0.119968) > 0.001 {
				t.Fatalf("unexpected costs %.8f", *p.Net)
			}
		})
	}
}
func TestPaperPersistentJobsAndMissingBars(t *testing.T) {
	at := time.Date(2026, 1, 1, 10, 0, 20, 0, time.UTC)
	path := filepath.Join(t.TempDir(), "archive.db")
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	r := fixture(at, "bull")
	r.Items[0].QuoteVolume = 10_000_000
	if err = s.Capture(r, at); err != nil {
		t.Fatal(err)
	}
	// same symbol, new signal candle within window: record but do not double count paper trades
	r = fixture(at.Add(15*time.Minute), "bear")
	r.Items[0].QuoteVolume = 10_000_000
	if err = s.Capture(r, at.Add(15*time.Minute)); err != nil {
		t.Fatal(err)
	}
	p, err := s.paperFor(2)
	if err != nil || p.Status != "skipped" {
		t.Fatalf("cooldown failed %+v %v", p, err)
	}
	s.Close()
	s, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	calls := 0
	mode := "missing"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if mode == "missing" {
			w.Write([]byte(`[]`))
			return
		}
		var start int64
		fmt.Sscan(r.URL.Query().Get("startTime"), &start)
		bars := []any{}
		for i := 0; i < 60; i++ {
			at := start + int64(i)*60000
			bars = append(bars, []any{at, "100", "100.1", "99.9", "100", "5", at + 59999})
		}
		json.NewEncoder(w).Encode(bars)
	}))
	defer srv.Close()
	s.BaseURL = srv.URL
	if err = s.ResolvePaper(context.Background(), at.Add(59*time.Minute)); err != nil {
		t.Fatal(err)
	}
	if calls != 0 {
		t.Fatal("future data requested early")
	}
	if err = s.ResolvePaper(context.Background(), at.Add(62*time.Minute)); err != nil {
		t.Fatal(err)
	}
	p, _ = s.paperFor(1)
	if p.Status != "unavailable" {
		t.Fatal("missing candles marked complete")
	}
	data, err := s.List("", "", "", 1)
	if err != nil {
		t.Fatal(err)
	}
	stats := data["paper_stats"].(PaperStats)
	if stats.Completed != 0 || stats.Unavailable != 1 || stats.Skipped != 1 {
		t.Fatalf("incorrect denominators %+v", stats)
	}
	mode = "complete"
	if err = s.ResolvePaper(context.Background(), at.Add(68*time.Minute)); err != nil {
		t.Fatal(err)
	}
	p, _ = s.paperFor(1)
	if p.Status != "complete" || p.Net == nil || *p.Net >= 0 {
		t.Fatalf("retry failed %+v", p)
	}
	if err = s.ResolvePaper(context.Background(), at.Add(90*time.Minute)); err != nil {
		t.Fatal(err)
	}
	if calls != 2 {
		t.Fatalf("completed trial recomputed %d", calls)
	}
}
func TestSimilarityRejectsFutureAndOtherCohorts(t *testing.T) {
	at := time.Date(2026, 1, 1, 10, 0, 0, 0, time.UTC)
	s, err := Open(filepath.Join(t.TempDir(), "archive.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	// 1 prior known, 2 prior but resolved later, 3 different category, 4 current, 5 future
	for i, offset := range []time.Duration{-3 * time.Hour, -2 * time.Hour, -time.Hour, 0, time.Hour} {
		r := fixture(at.Add(offset), "bull")
		r.Items[0].QuoteVolume = 10_000_000
		if i == 2 {
			r.Items[0].Category = "crypto"
		}
		if err = s.Capture(r, at.Add(offset)); err != nil {
			t.Fatal(err)
		}
	}
	for id := 1; id <= 5; id++ {
		resolved := at.Add(-time.Minute).UnixMilli()
		if id == 2 {
			resolved = at.Add(time.Minute).UnixMilli()
		}
		o := Outcome{Minutes: 15, Status: "complete", ResolvedAt: resolved}
		n := 1.0
		o.DirectionReturn = &n
		raw, _ := json.Marshal(o)
		if _, err = s.db.Exec(`UPDATE signal_outcomes SET status='complete',result=? WHERE entry_id=? AND minutes=15`, string(raw), id); err != nil {
			t.Fatal(err)
		}
		if _, err = s.db.Exec(`UPDATE paper_trials SET status='complete',resolved_at=?,result='{"net_pct":1}' WHERE entry_id=?`, resolved, id); err != nil {
			t.Fatal(err)
		}
	}
	data, err := s.Research(4)
	if err != nil {
		t.Fatal(err)
	}
	if data["matched"] != 2 {
		t.Fatalf("wrong cohort %+v", data)
	}
	stat := data["stats"].([]ResearchStat)[0]
	if stat.Completed != 1 || stat.Positive != 1 || stat.Mean == nil || *stat.Mean != 1 {
		t.Fatalf("future outcome leaked %+v", stat)
	}
	if data["paper"].(PaperStats).Completed != 1 {
		t.Fatal("future paper leaked")
	}
	// Legacy results without a known persistence timestamp cannot support historical decisions.
	if _, err = s.db.Exec(`UPDATE signal_outcomes SET result='{"direction_return_pct":1}' WHERE entry_id=1`); err != nil {
		t.Fatal(err)
	}
	data, err = s.Research(4)
	if err != nil {
		t.Fatal(err)
	}
	if data["stats"].([]ResearchStat)[0].Completed != 0 {
		t.Fatal("unknown availability counted")
	}
}
