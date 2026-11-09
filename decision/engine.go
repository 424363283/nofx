package decision

import (
	"encoding/json"
	"fmt"
	"guanlan/market"
	"guanlan/mcp"
	"guanlan/pool"
	"log"
	"regexp"
	"strings"
	"time"
)

// 预编译正则表达式（性能优化：避免每次调用时重新编译）
var (

	// 新增：XML标签提取（支持思维链中包含任何字符）
	reReasoningTag = regexp.MustCompile(`(?s)<reasoning>(.*?)</reasoning>`)
	reDecisionTag  = regexp.MustCompile(`(?s)<decision>(.*?)</decision>`)
)

// PositionInfo 持仓信息
type PositionInfo struct {
	Symbol           string  `json:"symbol"`
	Side             string  `json:"side"` // "long" or "short"
	EntryPrice       float64 `json:"entry_price"`
	MarkPrice        float64 `json:"mark_price"`
	Quantity         float64 `json:"quantity"`
	Leverage         int     `json:"leverage"`
	UnrealizedPnL    float64 `json:"unrealized_pnl"`
	UnrealizedPnLPct float64 `json:"unrealized_pnl_pct"`
	LiquidationPrice float64 `json:"liquidation_price"`
	MarginUsed       float64 `json:"margin_used"`
	UpdateTime       int64   `json:"update_time"` // 持仓更新时间戳（毫秒）
}

// AccountInfo 账户信息
type AccountInfo struct {
	TotalEquity      float64 `json:"total_equity"`      // 账户净值
	AvailableBalance float64 `json:"available_balance"` // 可用余额
	TotalPnL         float64 `json:"total_pnl"`         // 总盈亏
	TotalPnLPct      float64 `json:"total_pnl_pct"`     // 总盈亏百分比
	MarginUsed       float64 `json:"margin_used"`       // 已用保证金
	MarginUsedPct    float64 `json:"margin_used_pct"`   // 保证金使用率
	PositionCount    int     `json:"position_count"`    // 持仓数量
}

// CandidateCoin 候选币种（来自币种池）
type CandidateCoin struct {
	Category       string   `json:"category,omitempty"`
	SignalEvidence string   `json:"signal_evidence,omitempty"`
	Symbol         string   `json:"symbol"`
	Sources        []string `json:"sources"` // 来源: "ai500" 和/或 "oi_top"
}

// OITopData 持仓量增长Top数据（用于AI决策参考）
type OITopData struct {
	Rank              int     // OI Top排名
	OIDeltaPercent    float64 // 持仓量变化百分比（1小时）
	OIDeltaValue      float64 // 持仓量变化价值
	PriceDeltaPercent float64 // 价格变化百分比
	NetLong           float64 // 净多仓
	NetShort          float64 // 净空仓
}

// Context 交易上下文（传递给AI的完整信息）
type Context struct {
	EquitySession     string                  `json:"equity_session,omitempty"`
	SkippedEquities   []string                `json:"skipped_equities,omitempty"`
	SkipLegacySignals bool                    `json:"-"`
	NativeSignals     bool                    `json:"-"`
	CurrentTime       string                  `json:"current_time"`
	RuntimeMinutes    int                     `json:"runtime_minutes"`
	CallCount         int                     `json:"call_count"`
	Account           AccountInfo             `json:"account"`
	Positions         []PositionInfo          `json:"positions"`
	CandidateCoins    []CandidateCoin         `json:"candidate_coins"`
	MarketDataMap     map[string]*market.Data `json:"-"` // 不序列化，但内部使用
	OITopDataMap      map[string]*OITopData   `json:"-"` // OI Top数据映射
	Performance       interface{}             `json:"-"` // 历史表现分析（logger.PerformanceAnalysis）
	BTCETHLeverage    int                     `json:"-"` // BTC/ETH杠杆倍数（从配置读取）
	AltcoinLeverage   int                     `json:"-"` // 山寨币杠杆倍数（从配置读取）
}

// Decision AI的交易决策
type Decision struct {
	RiskBudgetPct float64 `json:"risk_budget_pct,omitempty"`
	Symbol        string  `json:"symbol"`
	Action        string  `json:"action"` // "open_long", "open_short", "close_long", "close_short", "update_stop_loss", "update_take_profit", "partial_close", "hold", "wait"

	// 开仓参数
	Leverage        int     `json:"leverage,omitempty"`
	PositionSizeUSD float64 `json:"position_size_usd,omitempty"`
	StopLoss        float64 `json:"stop_loss,omitempty"`
	TakeProfit      float64 `json:"take_profit,omitempty"`

	// 调整参数（新增）
	NewStopLoss     float64 `json:"new_stop_loss,omitempty"`    // 用于 update_stop_loss
	NewTakeProfit   float64 `json:"new_take_profit,omitempty"`  // 用于 update_take_profit
	ClosePercentage float64 `json:"close_percentage,omitempty"` // 用于 partial_close (0-100)

	// 通用参数
	Confidence int     `json:"confidence,omitempty"` // 信心度 (0-100)
	RiskUSD    float64 `json:"risk_usd,omitempty"`   // 最大美元风险
	Reasoning  string  `json:"reasoning"`
}

// FullDecision AI的完整决策（包含思维链）
type FullDecision struct {
	RawResponse  string     `json:"raw_response,omitempty"`
	SystemPrompt string     `json:"system_prompt"` // 系统提示词（发送给AI的系统prompt）
	UserPrompt   string     `json:"user_prompt"`   // 发送给AI的输入prompt
	CoTTrace     string     `json:"cot_trace"`     // 思维链分析（AI输出）
	Decisions    []Decision `json:"decisions"`     // 具体决策列表
	Timestamp    time.Time  `json:"timestamp"`
}

// GetFullDecision 获取AI的完整交易决策（批量分析所有币种和持仓）
func GetFullDecision(ctx *Context, mcpClient *mcp.Client) (*FullDecision, error) {
	return GetFullDecisionWithCustomPrompt(ctx, mcpClient, "", false, "")
}

// GetFullDecisionWithCustomPrompt 获取AI的完整交易决策（支持自定义prompt和模板选择）
func GetFullDecisionWithCustomPrompt(ctx *Context, mcpClient *mcp.Client, customPrompt string, overrideBase bool, templateName string) (*FullDecision, error) {
	// 1. 为所有币种获取市场数据
	if err := fetchMarketDataForContext(ctx); err != nil {
		return nil, fmt.Errorf("获取市场数据失败: %w", err)
	}

	// 2. 构建 System Prompt（固定规则）和 User Prompt（动态数据）
	systemPrompt := buildSystemPromptWithCustom(ctx.Account.TotalEquity, ctx.BTCETHLeverage, ctx.AltcoinLeverage, customPrompt, overrideBase, templateName)
	systemPrompt += "\n\n# 信号分析与执行分离（优先遵守）\n必须逐个分析行情、趋势、结构与入场形态，不检查账户是否有钱。合格信号输出open_long/open_short及止损止盈，position_size_usd=0、risk_usd=0留给执行层；没有合格信号才wait。资金不足、最小下单额及实际风险预算问题由执行层记录为开仓失败，不是观望理由。不得虚构分析资金或假设已有资金。已有持仓仍需管理。\n"
	systemPrompt += technicalAnalysisInstructions
	userPrompt := buildUserPrompt(ctx)

	// 3. 调用AI API（使用 system + user prompt）
	aiResponse, err := mcpClient.CallWithMessages(systemPrompt, userPrompt)
	if err != nil {
		return nil, fmt.Errorf("调用AI API失败: %w", err)
	}

	// 4. 解析AI响应
	decision, err := parseFullDecisionResponse(aiResponse, ctx.Account.TotalEquity, ctx.BTCETHLeverage, ctx.AltcoinLeverage)
	if decision != nil {
		decision.Timestamp = time.Now()
		decision.SystemPrompt = systemPrompt
		decision.UserPrompt = userPrompt
		decision.RawResponse = aiResponse
	}
	if err != nil {
		return decision, fmt.Errorf("解析AI响应失败: %w", err)
	}

	return decision, nil
}

// fetchMarketDataForContext 为上下文中的所有币种获取市场数据和OI数据
func fetchMarketDataForContext(ctx *Context) error {
	ctx.MarketDataMap = make(map[string]*market.Data)
	ctx.OITopDataMap = make(map[string]*OITopData)

	// 收集所有需要获取数据的币种
	symbolSet := make(map[string]bool)

	// 1. 优先获取持仓币种的数据（这是必须的）
	for _, pos := range ctx.Positions {
		symbolSet[pos.Symbol] = true
	}

	// 2. 候选币种数量根据账户状态动态调整
	maxCandidates := calculateMaxCandidates(ctx)
	for i, coin := range ctx.CandidateCoins {
		if i >= maxCandidates {
			break
		}
		symbolSet[coin.Symbol] = true
	}

	// 并发获取市场数据
	// 持仓币种集合（用于判断是否跳过OI检查）
	positionSymbols := make(map[string]bool)
	for _, pos := range ctx.Positions {
		positionSymbols[pos.Symbol] = true
	}

	for symbol := range symbolSet {
		data, err := market.Get(symbol)
		if err != nil {
			// 单个币种失败不影响整体，只记录错误
			continue
		}

		// ⚠️ 流动性过滤：持仓价值低于阈值的币种不做（多空都不做）
		// 持仓价值 = 持仓量 × 当前价格
		// 但现有持仓必须保留（需要决策是否平仓）
		// 💡 OI 門檻配置：用戶可根據風險偏好調整
		const minOIThresholdMillions = 15.0 // 可調整：15M(保守) / 10M(平衡) / 8M(寬鬆) / 5M(激進)

		isExistingPosition := positionSymbols[symbol]
		if !isExistingPosition && data.OpenInterest != nil && data.CurrentPrice > 0 {
			// 计算持仓价值（USD）= 持仓量 × 当前价格
			oiValue := data.OpenInterest.Latest * data.CurrentPrice
			oiValueInMillions := oiValue / 1_000_000 // 转换为百万美元单位
			if oiValueInMillions < minOIThresholdMillions {
				log.Printf("⚠️  %s 持仓价值过低(%.2fM USD < %.1fM)，跳过此币种 [持仓量:%.0f × 价格:%.4f]",
					symbol, oiValueInMillions, minOIThresholdMillions, data.OpenInterest.Latest, data.CurrentPrice)
				continue
			}
		}

		ctx.MarketDataMap[symbol] = data
	}

	if ctx.NativeSignals || ctx.SkipLegacySignals {
		return nil
	}
	// 加载OI Top数据（不影响主流程）
	oiPositions, err := pool.GetOITopPositions()
	if err == nil {
		for _, pos := range oiPositions {
			// 标准化符号匹配
			symbol := pos.Symbol
			ctx.OITopDataMap[symbol] = &OITopData{
				Rank:              pos.Rank,
				OIDeltaPercent:    pos.OIDeltaPercent,
				OIDeltaValue:      pos.OIDeltaValue,
				PriceDeltaPercent: pos.PriceDeltaPercent,
				NetLong:           pos.NetLong,
				NetShort:          pos.NetShort,
			}
		}
	}

	return nil
}

// calculateMaxCandidates 根据账户状态计算需要分析的候选币种数量
func calculateMaxCandidates(ctx *Context) int {
	// ⚠️ 重要：限制候选币种数量，避免 Prompt 过大
	// 根据持仓数量动态调整：持仓越少，可以分析更多候选币
	const (
		maxCandidatesWhenEmpty    = 30 // 无持仓时最多分析30个候选币
		maxCandidatesWhenHolding1 = 25 // 持仓1个时最多分析25个候选币
		maxCandidatesWhenHolding2 = 20 // 持仓2个时最多分析20个候选币
		maxCandidatesWhenHolding3 = 15 // 持仓3个时最多分析15个候选币（避免 Prompt 过大）
	)

	positionCount := len(ctx.Positions)
	var maxCandidates int

	switch positionCount {
	case 0:
		maxCandidates = maxCandidatesWhenEmpty
	case 1:
		maxCandidates = maxCandidatesWhenHolding1
	case 2:
		maxCandidates = maxCandidatesWhenHolding2
	default: // 3+ 持仓
		maxCandidates = maxCandidatesWhenHolding3
	}

	// 返回实际候选币数量和上限中的较小值
	return min(len(ctx.CandidateCoins), maxCandidates)
}

// buildSystemPromptWithCustom 构建包含自定义内容的 System Prompt
func buildSystemPromptWithCustom(accountEquity float64, btcEthLeverage, altcoinLeverage int, customPrompt string, overrideBase bool, templateName string) string {
	// 如果覆盖基础prompt且有自定义prompt，只使用自定义prompt
	if overrideBase && customPrompt != "" {
		return customPrompt
	}

	// 获取基础prompt（使用指定的模板）
	basePrompt := buildSystemPrompt(accountEquity, btcEthLeverage, altcoinLeverage, templateName)

	// 如果没有自定义prompt，直接返回基础prompt
	if customPrompt == "" {
		return basePrompt
	}

	// 添加自定义prompt部分到基础prompt
	var sb strings.Builder
	sb.WriteString(basePrompt)
	sb.WriteString("\n\n")
	sb.WriteString("# 📌 个性化交易策略\n\n")
	sb.WriteString(customPrompt)
	sb.WriteString("\n\n")
	sb.WriteString("注意: 以上个性化策略是对基础规则的补充，不能违背基础风险控制原则。\n")

	return sb.String()
}

// buildSystemPrompt 构建 System Prompt（使用模板+动态部分）
func buildSystemPrompt(accountEquity float64, btcEthLeverage, altcoinLeverage int, templateName string) string {
	var sb strings.Builder

	// 1. 加载提示词模板（核心交易策略部分）
	if templateName == "" {
		templateName = "default" // 默认使用 default 模板
	}

	template, err := GetPromptTemplate(templateName)
	if err != nil {
		// 如果模板不存在，记录错误并使用 default
		log.Printf("⚠️  提示词模板 '%s' 不存在，使用 default: %v", templateName, err)
		template, err = GetPromptTemplate("default")
		if err != nil {
			// 如果连 default 都不存在，使用内置的简化版本
			log.Printf("❌ 无法加载任何提示词模板，使用内置简化版本")
			sb.WriteString("你是专业的加密货币交易AI。请根据市场数据做出交易决策。\n\n")
		} else {
			sb.WriteString(template.Content)
			sb.WriteString("\n\n")
		}
	} else {
		sb.WriteString(template.Content)
		sb.WriteString("\n\n")
	}

	// 2. 硬约束（风险控制）- 动态生成
	sb.WriteString("# 硬约束（风险控制）\n\n")
	sb.WriteString(fmt.Sprintf("1. 毛收益/风险至少%.2g:1；往返成本预算为报价×%.2f%%，(收益-成本)/(风险+成本)至少%.2g:1，由执行层复核。\n", MinEntryRewardRisk, EntryCostRate*100, MinEntryNetRewardRisk))
	sb.WriteString("2. 最多持仓: 3个币种（质量>数量）\n")
	if template != nil && template.Name == "default" {
		sb.WriteString("3. 默认策略采用更严格限额：单笔风险预算≤净值0.5%，单币名义≤净值，最多3个持仓，每轮最多1笔新开仓；按止损距离与成本反推仓位，不设必须用满的最低比例。\n")
		sb.WriteString(fmt.Sprintf("4. 杠杆上限：取3倍与配置上限的较低值；BTC/ETH配置%d倍，其他合约配置%d倍。\n", btcEthLeverage, altcoinLeverage))
		sb.WriteString("5. 默认策略总保证金使用率≤30%；提示词限制不等于后台强制风控。\n")
		sb.WriteString("6. 系统开仓最低金额：BTC/ETH 60 USDT，其他12 USDT；还须满足交易所实际过滤规则。资金与仓位限额由执行层校验；模型不得因资金不足把合格信号改为wait。\n\n")
	} else {
		sb.WriteString(fmt.Sprintf("3. 单币仓位: 山寨%.0f-%.0f U | BTC/ETH %.0f-%.0f U\n",
			accountEquity*0.8, accountEquity*1.5, accountEquity*5, accountEquity*10))
		sb.WriteString(fmt.Sprintf("4. 杠杆限制: **山寨币最大%dx杠杆** | **BTC/ETH最大%dx杠杆** (⚠️ 严格执行，不可超过)\n", altcoinLeverage, btcEthLeverage))
		sb.WriteString("5. 保证金: 总使用率 ≤ 90%\n")
		sb.WriteString("6. 开仓金额: 建议 **≥12 USDT** (交易所最小名义价值 10 USDT + 安全边际)\n\n")
	}

	// 3. 输出格式 - 动态生成
	sb.WriteString("# 输出格式 (严格遵守)\n\n")
	sb.WriteString("**必须使用XML标签 <reasoning> 和 <decision> 标签分隔简要决策依据和决策JSON，避免解析错误**\n\n")
	sb.WriteString("## 格式要求\n\n")
	sb.WriteString("<reasoning>\n")
	sb.WriteString("你的简要决策依据...\n")
	sb.WriteString("- 列出可核验的信号、风险计算和缺失信息 \n")
	sb.WriteString("</reasoning>\n\n")
	sb.WriteString("<decision>\n")
	sb.WriteString("```json\n[\n")
	if template != nil && template.Name == "default" {
		sb.WriteString("  {\"symbol\": \"BTCUSDT\", \"action\": \"wait\", \"reasoning\": \"仅为格式示例：缺少合格入场条件，等待确认\"}\n")
	} else {
		sb.WriteString(fmt.Sprintf("  {\"symbol\": \"BTCUSDT\", \"action\": \"open_short\", \"leverage\": %d, \"position_size_usd\": %.0f, \"stop_loss\": 97000, \"take_profit\": 91000, \"confidence\": 85, \"risk_usd\": 300, \"reasoning\": \"下跌趋势+MACD死叉\"},\n", btcEthLeverage, accountEquity*5))
		sb.WriteString("  {\"symbol\": \"ETHUSDT\", \"action\": \"close_long\", \"reasoning\": \"止盈离场\"}\n")
	}
	sb.WriteString("]\n```\n")
	sb.WriteString("</decision>\n\n")
	sb.WriteString("## 字段说明\n\n")
	sb.WriteString("- `action`: open_long | open_short | close_long | close_short | hold | wait\n")
	sb.WriteString("- `confidence`: 0-100（仅描述模型判断，不是胜率，也不是额外开仓门槛）\n")
	sb.WriteString("- 开仓信号必填: leverage, stop_loss, take_profit, confidence, reasoning；position_size_usd与risk_usd填0，表示由执行层按真实资金计算；risk_budget_pct只可为0.25或0.5，未提供按0.25\n\n")

	return sb.String()
}

// buildUserPrompt 构建 User Prompt（动态数据）
func buildUserPrompt(ctx *Context) string {
	var sb strings.Builder

	// 系统状态
	sb.WriteString(fmt.Sprintf("时间: %s | 周期: #%d | 运行: %d分钟\n\n",
		ctx.CurrentTime, ctx.CallCount, ctx.RuntimeMinutes))
	if current, err := time.Parse(time.RFC3339, ctx.CurrentTime); err == nil {
		sb.WriteString(fmt.Sprintf("同一当前时刻（UTC）: %s。信号时间的 Z 表示 UTC；判断数据新鲜度须按时区偏移换算，不能直接比较小时数字。K线时间表示该周期的收盘时刻，与行情快照时间分别核验。\n\n", current.UTC().Format(time.RFC3339)))
	}

	// BTC 市场
	if ctx.EquitySession != "" {
		sb.WriteString("美股标的市场时段核验：" + ctx.EquitySession + "。非时段无持仓美股已在模型调用前排除；休市持仓仍需管理，禁止新开美股仓位。时段开放不替代流动性与风险检查。\n\n")
	}
	if btcData, hasBTC := ctx.MarketDataMap["BTCUSDT"]; hasBTC {
		sb.WriteString(fmt.Sprintf("BTC: %.2f (1h: %+.2f%%, 4h: %+.2f%%) | MACD: %.4f | RSI: %.2f\n\n",
			btcData.CurrentPrice, btcData.PriceChange1h, btcData.PriceChange4h,
			btcData.CurrentMACD, btcData.CurrentRSI7))
	}

	// Funding is intentionally withheld from signal analysis, not fabricated.
	sb.WriteString(fmt.Sprintf("持仓数量: %d。资金、可用余额、实际仓位和保证金检查由执行层负责；不因资金不足停止行情分析或把合格开仓信号改成wait。\n\n", ctx.Account.PositionCount))

	// 持仓（完整市场数据）
	if len(ctx.Positions) > 0 {
		sb.WriteString("## 当前持仓\n")
		for i, pos := range ctx.Positions {
			// 计算持仓时长
			holdingDuration := ""
			if pos.UpdateTime > 0 {
				durationMs := time.Now().UnixMilli() - pos.UpdateTime
				durationMin := durationMs / (1000 * 60) // 转换为分钟
				if durationMin < 60 {
					holdingDuration = fmt.Sprintf(" | 持仓时长%d分钟", durationMin)
				} else {
					durationHour := durationMin / 60
					durationMinRemainder := durationMin % 60
					holdingDuration = fmt.Sprintf(" | 持仓时长%d小时%d分钟", durationHour, durationMinRemainder)
				}
			}

			sb.WriteString(fmt.Sprintf("%d. %s %s | 入场价%.4f 当前价%.4f | 盈亏%+.2f%% | 杠杆%dx | 保证金%.0f | 强平价%.4f%s\n\n",
				i+1, pos.Symbol, strings.ToUpper(pos.Side),
				pos.EntryPrice, pos.MarkPrice, pos.UnrealizedPnLPct,
				pos.Leverage, pos.MarginUsed, pos.LiquidationPrice, holdingDuration))

			// 使用FormatMarketData输出完整市场数据
			if marketData, ok := ctx.MarketDataMap[pos.Symbol]; ok {
				sb.WriteString(market.Format(marketData))
				sb.WriteString("\n")
			}
		}
	} else {
		sb.WriteString("当前持仓: 无\n\n")
	}

	// 候选币种（完整市场数据）
	sb.WriteString(fmt.Sprintf("## 候选币种 (%d个)\n\n", len(ctx.MarketDataMap)))
	displayedCount := 0
	for _, coin := range ctx.CandidateCoins {
		marketData, hasData := ctx.MarketDataMap[coin.Symbol]
		if !hasData {
			continue
		}
		displayedCount++

		sourceTags := ""
		if len(coin.Sources) > 1 {
			sourceTags = " (AI500+OI_Top双重信号)"
		} else if len(coin.Sources) == 1 && coin.Sources[0] == "oi_top" {
			sourceTags = " (OI_Top持仓增长)"
		}

		// 使用FormatMarketData输出完整市场数据
		sb.WriteString(fmt.Sprintf("### %d. %s%s\n\n", displayedCount, coin.Symbol, sourceTags))
		if coin.SignalEvidence != "" {
			sb.WriteString("币安只读信号（资金费率和OI单位为百分比；仅供分析，不是下单指令）：" + coin.SignalEvidence + "\n")
			var evidence struct {
				PriceAsOf time.Time `json:"price_as_of"`
				CandleAt  time.Time `json:"candle_at"`
			}
			current, timeErr := time.Parse(time.RFC3339, ctx.CurrentTime)
			if json.Unmarshal([]byte(coin.SignalEvidence), &evidence) == nil && timeErr == nil {
				if !evidence.PriceAsOf.IsZero() {
					sb.WriteString(fmt.Sprintf("信号行情快照距本轮开始 %.1f 秒（已按时区换算；负值表示快照晚于本轮开始）。\n", current.Sub(evidence.PriceAsOf).Seconds()))
				}
				if !evidence.CandleAt.IsZero() {
					sb.WriteString(fmt.Sprintf("15分钟已收盘K线结束距本轮开始 %.1f 分钟。\n", current.Sub(evidence.CandleAt).Minutes()))
				}
			}
		}
		sb.WriteString(market.Format(marketData))
		sb.WriteString("\n")
	}
	sb.WriteString("\n")

	// 夏普比率（直接传值，不要复杂格式化）
	if ctx.Performance != nil {
		// 直接从interface{}中提取SharpeRatio
		type PerformanceData struct {
			SharpeRatio float64 `json:"sharpe_ratio"`
		}
		var perfData PerformanceData
		if jsonData, err := json.Marshal(ctx.Performance); err == nil {
			if err := json.Unmarshal(jsonData, &perfData); err == nil {
				sb.WriteString(fmt.Sprintf("## 📊 夏普比率: %.2f\n\n", perfData.SharpeRatio))
			}
		}
	}

	sb.WriteString("---\n\n")
	sb.WriteString("现在请输出简要决策依据和决策JSON\n")

	return sb.String()
}

// parseFullDecisionResponse 解析AI的完整决策响应
func parseFullDecisionResponse(aiResponse string, accountEquity float64, btcEthLeverage, altcoinLeverage int) (*FullDecision, error) {
	// 1. 提取思维链
	cotTrace := extractCoTTrace(aiResponse)

	// 2. 提取JSON决策列表
	decisions, err := extractDecisions(aiResponse)
	if err != nil {
		return &FullDecision{
			CoTTrace:  cotTrace,
			Decisions: []Decision{},
		}, fmt.Errorf("提取决策失败: %w", err)
	}

	// 3. 验证决策
	if err := validateDecisions(decisions, accountEquity, btcEthLeverage, altcoinLeverage); err != nil {
		return &FullDecision{
			CoTTrace:  cotTrace,
			Decisions: decisions,
		}, fmt.Errorf("决策验证失败: %w", err)
	}

	return &FullDecision{
		CoTTrace:  cotTrace,
		Decisions: decisions,
	}, nil
}

// extractCoTTrace 提取思维链分析
func extractCoTTrace(response string) string {
	// 方法1: 优先尝试提取 <reasoning> 标签内容
	if match := reReasoningTag.FindStringSubmatch(response); match != nil && len(match) > 1 {
		log.Printf("✓ 使用 <reasoning> 标签提取思维链")
		return strings.TrimSpace(match[1])
	}

	// 方法2: 如果没有 <reasoning> 标签，但有 <decision> 标签，提取 <decision> 之前的内容
	if decisionIdx := strings.Index(response, "<decision>"); decisionIdx > 0 {
		log.Printf("✓ 提取 <decision> 标签之前的内容作为思维链")
		return strings.TrimSpace(response[:decisionIdx])
	}

	// 方法3: 后备方案 - 查找JSON数组的开始位置
	jsonStart := strings.Index(response, "[")
	if jsonStart > 0 {
		log.Printf("⚠️  使用旧版格式（[ 字符分离）提取思维链")
		return strings.TrimSpace(response[:jsonStart])
	}

	// 如果找不到任何标记，整个响应都是思维链
	return strings.TrimSpace(response)
}

// extractDecisions uses JSON's string-aware parser, never punctuation regexes.
func extractDecisions(response string) ([]Decision, error) {
	part := strings.TrimSpace(response)
	explicit := false
	if match := reDecisionTag.FindStringSubmatch(part); len(match) > 1 {
		part = strings.TrimSpace(match[1])
		explicit = true
	}
	if strings.HasPrefix(part, "```") {
		part = strings.TrimSpace(part[3:])
		if strings.HasPrefix(strings.ToLower(part), "json") {
			part = strings.TrimSpace(part[4:])
		}
		if !strings.HasSuffix(part, "```") {
			return nil, fmt.Errorf("JSON代码块未闭合，本轮不执行交易")
		}
		part = strings.TrimSpace(part[:len(part)-3])
		explicit = true
	}

	part = strings.TrimPrefix(part, "\ufeff")
	if strings.HasPrefix(part, "[") {
		explicit = true
	}
	start := strings.Index(part, "[")
	if start < 0 {
		return nil, fmt.Errorf("模型未返回JSON决策数组，本轮不执行交易")
	}
	if explicit && strings.TrimSpace(part[:start]) != "" {
		return nil, fmt.Errorf("决策区包含JSON数组以外的内容")
	}
	decoder := json.NewDecoder(strings.NewReader(part[start:]))
	var raw json.RawMessage
	if err := decoder.Decode(&raw); err != nil {
		return nil, fmt.Errorf("决策JSON语法错误: %w", err)
	}
	if explicit && strings.TrimSpace(part[start+int(decoder.InputOffset()):]) != "" {
		return nil, fmt.Errorf("决策数组之后包含额外内容，本轮不执行交易")
	}
	if err := validateJSONFormat(string(raw)); err != nil {
		return nil, err
	}
	var decisions []Decision
	if err := json.Unmarshal(raw, &decisions); err != nil {
		return nil, fmt.Errorf("决策字段类型错误: %w", err)
	}
	if decisions == nil {
		decisions = []Decision{}
	}
	return decisions, nil
}

// Quoted strings may contain commas, ranges, quotes and brackets. Only actual
// JSON syntax and array element types are validated; do not rewrite model text.
func validateJSONFormat(raw string) error {
	var records []json.RawMessage
	if err := json.Unmarshal([]byte(raw), &records); err != nil {
		return fmt.Errorf("决策JSON语法错误: %w", err)
	}
	if !strings.HasPrefix(strings.TrimSpace(raw), "[") {
		return fmt.Errorf("决策必须是JSON数组")
	}
	for i, record := range records {
		if !strings.HasPrefix(strings.TrimSpace(string(record)), "{") {
			return fmt.Errorf("决策第%d项必须为JSON对象", i+1)
		}
	}
	return nil
}

// min 返回两个整数中的较小值
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// validateDecisions 验证所有决策（需要账户信息和杠杆配置）
func validateDecisions(decisions []Decision, accountEquity float64, btcEthLeverage, altcoinLeverage int) error {
	for i, decision := range decisions {
		if err := validateDecision(&decision, accountEquity, btcEthLeverage, altcoinLeverage); err != nil {
			return fmt.Errorf("决策 #%d 验证失败: %w", i+1, err)
		}
	}
	return nil
}

// findMatchingBracket 查找匹配的右括号
func findMatchingBracket(s string, start int) int {
	if start >= len(s) || s[start] != '[' {
		return -1
	}

	depth := 0
	for i := start; i < len(s); i++ {
		switch s[i] {
		case '[':
			depth++
		case ']':
			depth--
			if depth == 0 {
				return i
			}
		}
	}

	return -1
}

// validateDecision 验证单个决策的有效性
func validateDecision(d *Decision, accountEquity float64, btcEthLeverage, altcoinLeverage int) error {
	// 验证action
	validActions := map[string]bool{
		"open_long":          true,
		"open_short":         true,
		"close_long":         true,
		"close_short":        true,
		"update_stop_loss":   true,
		"update_take_profit": true,
		"partial_close":      true,
		"hold":               true,
		"wait":               true,
	}

	if !validActions[d.Action] {
		return fmt.Errorf("无效的action: %s", d.Action)
	}

	// 开仓操作必须提供完整参数
	if d.Action == "open_long" || d.Action == "open_short" {
		// 根据币种使用配置的杠杆上限
		maxLeverage := altcoinLeverage
		if d.Symbol == "BTCUSDT" || d.Symbol == "ETHUSDT" {
			maxLeverage = btcEthLeverage
		}

		if d.Leverage <= 0 || d.Leverage > maxLeverage {
			return fmt.Errorf("杠杆必须在1-%d之间（%s，当前配置上限%d倍）: %d", maxLeverage, d.Symbol, maxLeverage, d.Leverage)
		}
		if d.PositionSizeUSD < 0 {
			return fmt.Errorf("建议仓位不能为负数")
		}
		// Zero means an unsized signal; execution resolves actual funds and limits.
		if d.StopLoss <= 0 || d.TakeProfit <= 0 {
			return fmt.Errorf("止损和止盈必须大于0")
		}

		// 验证止损止盈的合理性
		if d.Action == "open_long" {
			if d.StopLoss >= d.TakeProfit {
				return fmt.Errorf("做多时止损价必须小于止盈价")
			}
		} else {
			if d.StopLoss <= d.TakeProfit {
				return fmt.Errorf("做空时止损价必须大于止盈价")
			}
		}

		// 盈亏比依赖真实入场报价，在下单前由 validateOpenEntry 校验。

	}

	// 动态调整止损验证
	if d.Action == "update_stop_loss" {
		if d.NewStopLoss <= 0 {
			return fmt.Errorf("新止损价格必须大于0: %.2f", d.NewStopLoss)
		}
	}

	// 动态调整止盈验证
	if d.Action == "update_take_profit" {
		if d.NewTakeProfit <= 0 {
			return fmt.Errorf("新止盈价格必须大于0: %.2f", d.NewTakeProfit)
		}
	}

	// 部分平仓验证
	if d.Action == "partial_close" {
		if d.ClosePercentage <= 0 || d.ClosePercentage > 100 {
			return fmt.Errorf("平仓百分比必须在0-100之间: %.1f", d.ClosePercentage)
		}
	}

	return nil
}
