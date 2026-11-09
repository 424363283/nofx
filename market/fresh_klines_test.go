package market

import (
	"errors"
	"testing"
	"time"
)

func TestStaleDecisionHistoryRefresh(t *testing.T) {
	bars, now := technicalBars()
	calls := 0
	fetch := func() ([]Kline, error) { calls++; return bars, nil }
	if _, err := freshDecisionKlines(bars, "3m", 3*time.Minute, now, fetch); err != nil || calls != 0 {
		t.Fatalf("fresh cache should not fetch: %v %d", err, calls)
	}
	stale := bars[:90]
	fresh, err := freshDecisionKlines(stale, "3m", 3*time.Minute, now, fetch)
	if err != nil || calls != 1 || len(fresh) != 100 {
		t.Fatalf("refresh failed: %v %d", err, calls)
	}
	for _, kind := range []string{"error", "stale", "empty"} {
		t.Run(kind, func(t *testing.T) {
			result, err := freshDecisionKlines(stale, "3m", 3*time.Minute, now, func() ([]Kline, error) {
				switch kind {
				case "error":
					return nil, errors.New("offline")
				case "stale":
					return stale, nil
				default:
					return nil, nil
				}
			})
			if err == nil || result != nil {
				t.Fatal("stale data used after failed refresh")
			}
		})
	}
}
