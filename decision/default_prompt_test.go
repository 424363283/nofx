package decision

import (
	"guanlan/market"
	"strings"
	"testing"
)

func TestDefaultStrategyAssembly(t *testing.T) {
	previous := globalPromptManager
	globalPromptManager = NewPromptManager()
	t.Cleanup(func() { globalPromptManager = previous })
	if err := globalPromptManager.LoadTemplates("../prompts"); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"default", "", "missing-template"} {
		prompt := buildSystemPrompt(1000, 10, 5, name)
		for _, want := range []string{"观澜永续合约策略", "0.5%", "30%", "BTC/ETH配置10倍", "其他合约配置5倍", "<decision>", "risk_usd", "美股", "wait"} {
			if !strings.Contains(prompt, want) {
				t.Errorf("%q missing %q", name, want)
			}
		}
		for _, forbidden := range []string{"山寨800-1500", "总使用率 ≤ 90%", "\\\"position_size_usd\\\": 5000"} {
			if strings.Contains(prompt, forbidden) {
				t.Errorf("%q contains incompatible rule %q", name, forbidden)
			}
		}
	}
}

func TestUserPromptSignalAgeUsesActualInstant(t *testing.T) {
	prompt := buildUserPrompt(&Context{CurrentTime: "2026-11-08T21:21:47+08:00", Account: AccountInfo{TotalEquity: 100}, CandidateCoins: []CandidateCoin{{Symbol: "PUMPUSDT", SignalEvidence: `{"price_as_of":"2026-11-08T13:19:47Z","candle_at":"2026-11-08T13:15:00Z","structure_15m":{"previous_high_20":0.0037}}`}}, MarketDataMap: map[string]*market.Data{"PUMPUSDT": {}}})
	for _, want := range []string{"快照距本轮开始 120.0 秒", "结束距本轮开始 6.8 分钟", `"previous_high_20":0.0037`} {
		if !strings.Contains(prompt, want) {
			t.Fatalf("missing evidence %q: %s", want, prompt)
		}
	}
}

func TestUserPromptTimeZones(t *testing.T) {
	for _, current := range []string{"2026-11-08T21:21:47+08:00", "2026-11-08T13:21:47Z"} {
		prompt := buildUserPrompt(&Context{CurrentTime: current, Account: AccountInfo{TotalEquity: 100}})
		if !strings.Contains(prompt, "同一当前时刻（UTC）: 2026-11-08T13:21:47Z") {
			t.Fatalf("time %s lost its offset: %s", current, prompt)
		}
	}
}

func TestActiveStrategyHasAlternativeEntriesWithoutLegacyVeto(t *testing.T) {
	previous := globalPromptManager
	globalPromptManager = NewPromptManager()
	t.Cleanup(func() { globalPromptManager = previous })
	if err := globalPromptManager.LoadTemplates("../prompts"); err != nil {
		t.Fatal(err)
	}
	prompt := buildSystemPrompt(100, 3, 3, "default") + technicalAnalysisInstructions
	for _, want := range []string{"策略 v4", "C. 已确认的局部反转", "D. 动量延续", "不要求三个周期同向", "≥1.2", "2:1", "1.25:1", "0.25", "30%"} {
		if !strings.Contains(prompt, want) {
			t.Errorf("missing active rule %q", want)
		}
	}
	for _, old := range []string{"3:1", "1:3", "若4小时已有明确反向趋势", "开仓建议≥75", "A或B满足一种即可"} {
		if strings.Contains(prompt, old) {
			t.Errorf("conflicting legacy rule %q", old)
		}
	}
}
