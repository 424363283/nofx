package decision

import (
	"guanlan/market"
	"strings"
	"testing"
	"time"
)

func TestTechnicalEvidenceReachesModelInput(t *testing.T) {
	ctx := &Context{CurrentTime: time.Now().Format(time.RFC3339), CandidateCoins: []CandidateCoin{{Symbol: "BTCUSDT"}}, MarketDataMap: map[string]*market.Data{"BTCUSDT": {Technical: []market.TechnicalReport{{Interval: "3m", Unavailable: "已收盘历史不足60根"}}}}}
	prompt := buildUserPrompt(ctx)
	if !strings.Contains(prompt, "technical-v1") || !strings.Contains(prompt, "已收盘历史不足60根") {
		t.Fatal("technical evidence missing from model input")
	}
}
