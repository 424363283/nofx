package decision

import (
	"encoding/json"
	"guanlan/signals"
	"time"
)

// Filter before allocating market-data/model slots. Holdings are always retained.
func FilterEquityCandidates(coins []CandidateCoin, positions []PositionInfo, categories map[string]string, now time.Time) ([]CandidateCoin, []string) {
	open, _ := signals.USEquitySession(now)
	held := map[string]bool{}
	for _, p := range positions {
		held[p.Symbol] = true
	}
	kept := make([]CandidateCoin, 0, len(coins))
	skipped := []string{}
	for _, coin := range coins {
		coin.Category = categories[coin.Symbol]
		if coin.Category == "" {
			var evidence struct {
				Category string `json:"category"`
			}
			if json.Unmarshal([]byte(coin.SignalEvidence), &evidence) == nil {
				coin.Category = evidence.Category
			}
		}
		if !open && !held[coin.Symbol] && (coin.Category == "equity" || coin.Category == "") {
			skipped = append(skipped, coin.Symbol)
			continue
		}
		kept = append(kept, coin)
	}
	return kept, skipped
}

func EquityEntryClosed(ctx *Context, symbol string, now time.Time) bool {
	open, _ := signals.USEquitySession(now)
	if open {
		return false
	}
	for _, coin := range ctx.CandidateCoins {
		if coin.Symbol == symbol && coin.Category == "equity" {
			return true
		}
	}
	for _, excluded := range ctx.SkippedEquities {
		if excluded == symbol {
			return true
		}
	}
	return false
}
