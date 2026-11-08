package signals

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"time"
)

// RadarFeed is the shared read-only scanner used by the UI and trading pool.
const RadarFeed = "http://127.0.0.1:8082/api/market/radar"

var radarSymbol = regexp.MustCompile(`^[A-Z0-9]+USDT$`)

type RadarSnapshot struct {
	Result *RadarResult `json:"result"`
	Error  string       `json:"error"`
}

func RadarCandidates(s RadarSnapshot, now time.Time) ([]RadarItem, error) {
	if s.Error != "" {
		return nil, fmt.Errorf("雷达扫描失败，本轮不新增异动候选")
	}
	if s.Result == nil || s.Result.AsOf.IsZero() || now.Sub(s.Result.AsOf) > 5*time.Minute || s.Result.AsOf.After(now.Add(time.Minute)) {
		return nil, fmt.Errorf("雷达结果未就绪或已过期，本轮不新增异动候选")
	}
	out := []RadarItem{}
	seen := map[string]bool{}
	for _, item := range s.Result.Items {
		if seen[item.Symbol] || !radarSymbol.MatchString(item.Symbol) || len(item.Signals) == 0 || item.Bias == "unavailable" || item.CandleAt == nil || now.Sub(*item.CandleAt) > 20*time.Minute || item.CandleAt.After(now) || !finite(item.Price) || item.Price <= 0 {
			continue
		}
		if item.Category != "crypto" && item.Category != "equity" {
			continue
		}
		seen[item.Symbol] = true
		out = append(out, item)
	}
	return out, nil
}
func LoadRadarCandidates(ctx context.Context) ([]RadarItem, error) {
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, RadarFeed, nil)
	if err != nil {
		return nil, err
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("雷达服务暂不可用")
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("雷达服务返回 HTTP %d", res.StatusCode)
	}
	var snap RadarSnapshot
	if err = json.NewDecoder(io.LimitReader(res.Body, 4<<20)).Decode(&snap); err != nil {
		return nil, fmt.Errorf("雷达数据格式错误")
	}
	return RadarCandidates(snap, time.Now())
}
