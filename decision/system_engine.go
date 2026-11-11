package decision

import (
	"encoding/json"
	"fmt"
	"guanlan/market"
	"math"
	"sort"
	"strings"
	"time"
)

type SystemAssessment struct {
	Symbol         string    `json:"symbol"`
	Regime         string    `json:"regime"`
	Timeframe      string    `json:"timeframe"`
	CandleAt       time.Time `json:"candle_at"`
	LongScore      int       `json:"long_score"`
	ShortScore     int       `json:"short_score"`
	Setup          string    `json:"setup"`
	EntryReference float64   `json:"entry_reference"`
	Trigger        string    `json:"trigger"`
	Decision       Decision  `json:"decision"`
}

func technicalReport(data *market.Data, interval string, now time.Time) *market.TechnicalReport {
	if data == nil {
		return nil
	}
	for _, r := range data.Technical {
		if validReport(r, interval, now) {
			copy := r
			return &copy
		}
	}
	return nil
}
func marketRegime(r *market.TechnicalReport) string {
	if r.ATR14/r.LastClose > 0.05 {
		return "高波动"
	}
	gap := r.EMA20 - r.EMA50
	if gap > 0.2*r.ATR14 && r.LastClose > r.EMA20 {
		return "上涨趋势"
	}
	if gap < -0.2*r.ATR14 && r.LastClose < r.EMA20 {
		return "下跌趋势"
	}
	return "震荡/过渡"
}
func assessSystem(ctx *Context, symbol string, data *market.Data, now time.Time) SystemAssessment {
	a := SystemAssessment{Symbol: symbol, Regime: "数据不足", Setup: "等待触发", Decision: Decision{Symbol: symbol, Action: "wait"}}
	reject := func(reason string) SystemAssessment { a.Decision.Reasoning = "系统判断v2：" + reason; return a }
	if data == nil || data.CurrentPrice <= 0 || math.IsNaN(data.CurrentPrice) || math.IsInf(data.CurrentPrice, 0) {
		return reject("无有效行情报价")
	}
	r := technicalReport(data, "3m", now)
	if r == nil {
		return reject("3分钟已收盘技术证据缺失、过期或无效")
	}
	base := technicalReport(data, "15m", now)
	if base == nil {
		base = r
	}
	a.Timeframe = base.Interval
	a.CandleAt = r.CandleAt
	a.Regime = marketRegime(base)
	a.EntryReference = data.CurrentPrice
	a.Trigger = fmt.Sprintf("3m趋势突破观察：收盘高于%.12g或低于%.12g，并核验方向、量能与风险空间；其他入场路径见形态规则", r.ReferenceHigh, r.ReferenceLow)
	if r.VolumeRatio == nil || math.IsNaN(*r.VolumeRatio) || math.IsInf(*r.VolumeRatio, 0) || *r.VolumeRatio < 0 {
		return reject("量能证据缺失或无效")
	}
	p, v := data.CurrentPrice, *r.VolumeRatio
	up := base.LastClose > base.EMA20 && base.EMA20 > base.EMA50
	down := base.LastClose < base.EMA20 && base.EMA20 < base.EMA50
	if up {
		a.LongScore += 25
	}
	if down {
		a.ShortScore += 25
	}
	if r.DIF > r.DEA {
		a.LongScore += 10
	}
	if r.DIF < r.DEA {
		a.ShortScore += 10
	}
	if r.RSI14 > 50 {
		a.LongScore += 10
	}
	if r.RSI14 < 50 {
		a.ShortScore += 10
	}
	crossUp := r.PreviousDIF <= r.PreviousDEA && r.DIF > r.DEA
	crossDown := r.PreviousDIF >= r.PreviousDEA && r.DIF < r.DEA
	rsiUp := r.PreviousRSI14 <= 50 && r.RSI14 > 50
	rsiDown := r.PreviousRSI14 >= 50 && r.RSI14 < 50
	breakUp := r.LastClose > r.ReferenceHigh && p > r.ReferenceHigh && v >= 1.2
	breakDown := r.LastClose < r.ReferenceLow && p < r.ReferenceLow && v >= 1.2
	pullUp := r.LastLow <= r.EMA20 && r.LastClose > r.EMA20 && r.LastClose > r.LastOpen && p > r.EMA20 && v >= 0.8
	pullDown := r.LastHigh >= r.EMA20 && r.LastClose < r.EMA20 && r.LastClose < r.LastOpen && p < r.EMA20 && v >= 0.8
	// A rejected range break is a reversal candidate only with opposite momentum
	// and a directional close; no string parsing or unconfirmed divergence.
	reverseUp := r.LastLow < r.ReferenceLow && r.LastClose > r.ReferenceLow && r.LastClose > r.LastOpen && r.RSI14 > r.PreviousRSI14 && r.DIF > r.DEA && p > r.ReferenceLow && v >= 1
	reverseDown := r.LastHigh > r.ReferenceHigh && r.LastClose < r.ReferenceHigh && r.LastClose < r.LastOpen && r.RSI14 < r.PreviousRSI14 && r.DIF < r.DEA && p < r.ReferenceHigh && v >= 1
	longSetup, shortSetup := "", ""
	if up && r.DIF > r.DEA && r.RSI14 > 50 && p > r.EMA20 {
		if breakUp {
			longSetup = "趋势突破"
		} else if pullUp {
			longSetup = "回踩再启动"
		} else if (crossUp || rsiUp) && v >= 1 {
			longSetup = "动量延续"
		}
	}
	if down && r.DIF < r.DEA && r.RSI14 < 50 && p < r.EMA20 {
		if breakDown {
			shortSetup = "趋势突破"
		} else if pullDown {
			shortSetup = "回踩再启动"
		} else if (crossDown || rsiDown) && v >= 1 {
			shortSetup = "动量延续"
		}
	}
	if a.Regime == "震荡/过渡" {
		if reverseUp {
			longSetup = "区间下破收回"
		}
		if reverseDown {
			shortSetup = "区间上破收回"
		}
	}
	// Countertrend reversals require a confirmed rejection on BOTH 15m and 3m.
	if base.Interval == "15m" {
		if down && reverseUp && base.LastLow < base.ReferenceLow && base.LastClose > base.ReferenceLow && base.LastClose > base.LastOpen {
			longSetup = "双周期反转"
		}
		if up && reverseDown && base.LastHigh > base.ReferenceHigh && base.LastClose < base.ReferenceHigh && base.LastClose < base.LastOpen {
			shortSetup = "双周期反转"
		}
	}
	if longSetup != "" {
		a.LongScore += 25
	}
	if shortSetup != "" {
		a.ShortScore += 25
	}
	if v >= 1.2 {
		a.LongScore += 15
		a.ShortScore += 15
	} else if v >= 0.8 {
		a.LongScore += 8
		a.ShortScore += 8
	}
	position := (r.LastClose - r.ReferenceLow) / (r.ReferenceHigh - r.ReferenceLow)
	if up && p > r.EMA20 || reverseUp && position <= 0.5 {
		a.LongScore += 15
	}
	if down && p < r.EMA20 || reverseDown && position >= 0.5 {
		a.ShortScore += 15
	}
	if EquityEntryClosed(ctx, symbol, now) {
		return reject("美股标的不在允许开仓时段")
	}
	if a.Regime == "高波动" {
		return reject("主分析周期ATR/价格超过5%，不新增仓位")
	}
	long := longSetup != "" && a.LongScore >= 60 && a.LongScore-a.ShortScore >= 15
	short := shortSetup != "" && a.ShortScore >= 60 && a.ShortScore-a.LongScore >= 15
	if !long && !short {
		return reject(fmt.Sprintf("%s（%s），多/空规则分%d/%d；尚无形态触发或方向优势不足，等待实际触发", a.Regime, a.Timeframe, a.LongScore, a.ShortScore))
	}
	a.Setup = longSetup
	if short {
		a.Setup = shortSetup
	}
	levels := []float64{r.ReferenceHigh, r.ReferenceLow}
	for _, interval := range []string{"15m", "4h"} {
		if other := technicalReport(data, interval, now); other != nil {
			levels = append(levels, other.ReferenceHigh, other.ReferenceLow)
		}
	}
	stop, target := r.LastLow-0.2*r.ATR14, math.Inf(1)
	if long {
		if a.Setup == "趋势突破" {
			stop = math.Max(r.LastLow, r.ReferenceHigh) - 0.2*r.ATR14
		}
		for _, level := range levels {
			if level > p && level < target {
				target = level
			}
		}
	} else {
		stop = r.LastHigh + 0.2*r.ATR14
		target = math.Inf(-1)
		if a.Setup == "趋势突破" {
			stop = math.Min(r.LastHigh, r.ReferenceLow) + 0.2*r.ATR14
		}
		for _, level := range levels {
			if level < p && level > target {
				target = level
			}
		}
	}
	if math.IsInf(target, 0) || stop <= 0 {
		return reject("没有可核实的结构目标或止损；不虚构目标")
	}
	a.Decision.StopLoss = stop
	a.Decision.TakeProfit = target
	risk, reward := p-stop, target-p
	if short {
		risk, reward = stop-p, p-target
	}
	cost := p * EntryCostRate
	if risk <= 0 || reward <= 0 {
		return reject("当前报价与止盈止损方向不匹配")
	}
	if reward/risk < MinEntryRewardRisk || (reward-cost)/(risk+cost) < MinEntryNetRewardRisk {
		return reject(fmt.Sprintf("%s已触发，但结构空间不足：毛比%.3f，成本后%.3f", a.Setup, reward/risk, (reward-cost)/(risk+cost)))
	}
	leverage := ctx.AltcoinLeverage
	if symbol == "BTCUSDT" || symbol == "ETHUSDT" {
		leverage = ctx.BTCETHLeverage
	}
	if leverage < 1 {
		return reject("未配置有效杠杆上限")
	}
	if leverage > 2 {
		leverage = 2
	}
	a.Decision.Action = "open_long"
	if short {
		a.Decision.Action = "open_short"
	}
	a.Decision.Leverage = leverage
	a.Decision.RiskBudgetPct = .25
	a.Trigger = fmt.Sprintf("%s已确认，3m收盘%s；执行前重新校验报价", a.Setup, r.CandleAt.Format(time.RFC3339))
	a.Decision.Reasoning = fmt.Sprintf("系统判断v2：%s（%s），多/空规则分%d/%d；%s；EMA20/50 %.12g/%.12g，DIF/DEA %.12g/%.12g，RSI %.2f，量比%.2f；参考价%.12g，止损%.12g，目标%.12g；毛比%.3f/成本后%.3f。", a.Regime, a.Timeframe, a.LongScore, a.ShortScore, a.Setup, base.EMA20, base.EMA50, r.DIF, r.DEA, r.RSI14, v, p, stop, target, reward/risk, (reward-cost)/(risk+cost))
	return a
}

func systemDecision(ctx *Context, now time.Time) *FullDecision {
	result := &FullDecision{DecisionSource: "system_only", Timestamp: now, Decisions: []Decision{}}
	seen := map[string]bool{}
	for _, pos := range ctx.Positions {
		seen[pos.Symbol] = true
		d := Decision{Symbol: pos.Symbol, Action: "hold", Reasoning: "系统持仓管理：保留交易所保护单；没有确认的双周期反向破位，不主动平仓"}
		data := ctx.MarketDataMap[pos.Symbol]
		r := technicalReport(data, "3m", now)
		base := technicalReport(data, "15m", now)
		if r != nil && base != nil && r.VolumeRatio != nil && !math.IsInf(*r.VolumeRatio, 0) && *r.VolumeRatio >= 1 && data.CurrentPrice > 0 && !math.IsInf(data.CurrentPrice, 0) {
			if strings.EqualFold(pos.Side, "long") && marketRegime(base) == "下跌趋势" && r.LastClose < r.ReferenceLow && r.DIF < r.DEA && r.RSI14 < 50 && data.CurrentPrice < r.ReferenceLow {
				d.Action = "close_long"
			}
			if strings.EqualFold(pos.Side, "short") && marketRegime(base) == "上涨趋势" && r.LastClose > r.ReferenceHigh && r.DIF > r.DEA && r.RSI14 > 50 && data.CurrentPrice > r.ReferenceHigh {
				d.Action = "close_short"
			}
			if d.Action != "hold" {
				d.Reasoning = "系统持仓管理：15m反向趋势与3m放量破位确认，退出当前持仓；本轮不反向开仓"
			}
		}
		result.Decisions = append(result.Decisions, d)
	}
	for _, coin := range ctx.CandidateCoins {
		if seen[coin.Symbol] {
			continue
		}
		seen[coin.Symbol] = true
		result.SystemAnalysis = append(result.SystemAnalysis, assessSystem(ctx, coin.Symbol, ctx.MarketDataMap[coin.Symbol], now))
	}
	// Rank by directional separation; stable ordering preserves candidate rotation on ties.
	sort.SliceStable(result.SystemAnalysis, func(i, j int) bool {
		a, b := result.SystemAnalysis[i], result.SystemAnalysis[j]
		return absInt(a.LongScore-a.ShortScore) > absInt(b.LongScore-b.ShortScore)
	})
	selected := false
	for _, a := range result.SystemAnalysis {
		d := a.Decision
		if strings.HasPrefix(d.Action, "open_") {
			if selected {
				d = Decision{Symbol: d.Symbol, Action: "wait", Reasoning: "系统判断：本轮优先执行方向优势最大的一个机会"}
			} else {
				selected = true
			}
		}
		result.Decisions = append(result.Decisions, d)
	}
	result.CoTTrace = "系统自主判断v2：先区分行情与形态，再比较多空规则分（非胜率），最后核验结构风险回报。每轮最多一笔新开仓，最高2倍杠杆，风险预算0.25%。"
	return result
}
func absInt(v int) int {
	if v < 0 {
		return -v
	}
	return v
}

func ResolveModelDecision(ctx *Context, system, user string, call func(string, string) (string, error), now func() time.Time) (*FullDecision, error) {
	initial := systemDecision(ctx, now())
	evidence, _ := json.Marshal(initial.SystemAnalysis)
	planned, _ := json.Marshal(initial.Decisions)
	user += "\n\n## 系统自主判断v2（规则分不是胜率）\n" + string(evidence) + "\n系统计划：" + string(planned)
	system += "\n\n# 系统与AI协同\n系统已独立评估行情并提供交易计划。你复核每项计划：支持开仓时返回相同方向；发现具体结构或风险问题时返回wait并说明依据；不得因为实际资金不足否决信号。系统未允许的新开仓不会仅凭AI意见执行。已有持仓可建议对应方向平仓或hold。最终仓位、止损止盈及风控由程序决定。"
	raw, err := call(system, user)
	var ai *FullDecision
	if err == nil {
		ai, err = parseFullDecisionResponse(raw, ctx.Account.TotalEquity, ctx.BTCETHLeverage, ctx.AltcoinLeverage)
	}
	result := systemDecision(ctx, now()) // Revalidate evidence after model latency.
	if err != nil {
		result.FallbackReason = fmt.Sprintf("AI不可用，本轮纯系统判断：%v", err)
	} else {
		result.DecisionSource = "hybrid"
		result.AIDecisions = ai.Decisions
		opinions := map[string][]Decision{}
		for _, d := range ai.Decisions {
			opinions[d.Symbol] = append(opinions[d.Symbol], d)
		}
		for i, d := range result.Decisions {
			list := opinions[d.Symbol]
			if strings.HasPrefix(d.Action, "open_") {
				if len(list) == 1 && list[0].Action == d.Action {
					result.Decisions[i].Reasoning += " AI复核同向：" + list[0].Reasoning
				} else if len(list) > 0 {
					result.Decisions[i] = Decision{Symbol: d.Symbol, Action: "wait", Reasoning: "系统计划" + d.Action + "，AI意见不同或重复，本轮等待。系统：" + d.Reasoning + " AI：" + list[0].Reasoning}
				} else {
					result.Decisions[i].Reasoning += " AI未覆盖此标的，按系统计划判断。"
				}
			} else if d.Action == "hold" && len(list) == 1 {
				for _, p := range ctx.Positions {
					if p.Symbol == d.Symbol && ((strings.EqualFold(p.Side, "long") && list[0].Action == "close_long") || (strings.EqualFold(p.Side, "short") && list[0].Action == "close_short")) {
						result.Decisions[i] = Decision{Symbol: d.Symbol, Action: list[0].Action, Reasoning: "AI建议退出已有持仓：" + list[0].Reasoning}
					}
				}
			}
		}
		result.CoTTrace += "\nAI复核：" + ai.CoTTrace
	}
	result.SystemPrompt = system
	result.UserPrompt = user
	result.RawResponse = raw
	return result, nil
}
