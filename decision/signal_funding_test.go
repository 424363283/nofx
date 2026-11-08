package decision

import (
	"strings"
	"testing"
)

func TestQualifiedUnsizedSignalParsesWithZeroEquity(t *testing.T) {
	response := `<reasoning>15分钟突破及放量，结构完整；执行层校验资金。</reasoning><decision>[{"symbol":"CAPUSDT","action":"open_long","leverage":3,"position_size_usd":0,"stop_loss":98,"take_profit":108,"confidence":80,"risk_usd":0,"reasoning":"突破及放量"}]</decision>`
	result, err := parseFullDecisionResponse(response, 0, 3, 3)
	if err != nil || len(result.Decisions) != 1 || result.Decisions[0].Action != "open_long" {
		t.Fatalf("zero-equity signal rejected: %+v %v", result, err)
	}
}

func TestSignalPromptDoesNotExposeFundingAsAMarketGate(t *testing.T) {
	prompt := buildUserPrompt(&Context{Account: AccountInfo{TotalEquity: 0, AvailableBalance: 0, TotalPnLPct: -100}})
	for _, bad := range []string{"净值0", "余额0", "盈亏-100", "NaN", "Inf"} {
		if strings.Contains(prompt, bad) {
			t.Fatalf("funding leaked into signal context (%s): %s", bad, prompt)
		}
	}
	if !strings.Contains(prompt, "不因资金不足停止行情分析") {
		t.Fatal("missing execution separation")
	}
}
