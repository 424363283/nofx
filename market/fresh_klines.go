package market

import (
	"fmt"
	"time"
)

// The stream cache can freeze after a subscription disconnect. Refresh only
// stale/missing closed history, once per requested symbol/timeframe per cycle.
// The fresh REST snapshot is used for this decision; it does not race stream writes.
func freshDecisionKlines(bars []Kline, interval string, step time.Duration, now time.Time, fetch func() ([]Kline, error)) ([]Kline, error) {
	fresh := func(rows []Kline) bool {
		for i := len(rows) - 1; i >= 0; i-- {
			b := rows[i]
			if b.CloseTime > 0 && b.CloseTime < now.UnixMilli() {
				return now.Sub(time.UnixMilli(b.CloseTime)) <= step+5*time.Second
			}
		}
		return false
	}
	if fresh(bars) {
		return bars, nil
	}
	rows, err := fetch()
	if err != nil {
		return nil, fmt.Errorf("%s缓存过期且REST补取失败: %w", interval, err)
	}
	if !fresh(rows) {
		return nil, fmt.Errorf("%s REST补取仍无新鲜已收盘K线", interval)
	}
	return rows, nil
}

func getDecisionKlines(symbol, interval string, step time.Duration) ([]Kline, error) {
	bars, err := WSMonitorCli.GetCurrentKlines(symbol, interval)
	if err != nil {
		return nil, err
	}
	return freshDecisionKlines(bars, interval, step, time.Now(), func() ([]Kline, error) {
		client := NewAPIClient()
		client.client.Timeout = 10 * time.Second
		return client.GetKlines(symbol, interval, 100)
	})
}
