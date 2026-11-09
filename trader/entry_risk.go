package trader

import (
	"fmt"
	"guanlan/decision"
	"math"
	"time"
)

func decisionEquityEntryClosed(ctx *decision.Context, symbol string) bool {
	return decision.EquityEntryClosed(ctx, symbol, time.Now())
}

// Check the actual entry quote, never infer entry from the proposed exit levels.
func validateOpenEntry(d *decision.Decision, price float64) error {
	for _, v := range []float64{price, d.StopLoss, d.TakeProfit, d.PositionSizeUSD} {
		if v <= 0 || math.IsNaN(v) || math.IsInf(v, 0) {
			return fmt.Errorf("开仓价格、仓位及止盈止损必须为有限正数")
		}
	}
	risk, reward := price-d.StopLoss, d.TakeProfit-price
	if d.Action == "open_short" {
		risk, reward = d.StopLoss-price, price-d.TakeProfit
	}
	if risk <= 0 || reward <= 0 {
		return fmt.Errorf("当前价格%.12g不在止损%.12g与止盈%.12g的正确方向内", price, d.StopLoss, d.TakeProfit)
	}
	if reward/risk < decision.MinEntryRewardRisk {
		return fmt.Errorf("按当前价格%.12g计算盈亏比%.4f:1，不足%.2g:1（止损%.12g，止盈%.12g）", price, reward/risk, decision.MinEntryRewardRisk, d.StopLoss, d.TakeProfit)
	}
	cost := price * decision.EntryCostRate
	netRatio := (reward - cost) / (risk + cost)
	if netRatio < decision.MinEntryNetRewardRisk {
		return fmt.Errorf("扣%.2f%%成本预算后风险回报%.4f:1，不足%.2g:1", decision.EntryCostRate*100, netRatio, decision.MinEntryNetRewardRisk)
	}
	return nil
}
