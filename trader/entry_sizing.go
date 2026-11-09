package trader

import (
	"fmt"
	"guanlan/decision"
	"math"
)

// Funding changes execution results, never the model's directional signal.
func calculateSignalEntrySize(d *decision.Decision, price, equity, available, usedMargin float64, positionCount int) (float64, error) {
	for _, v := range []float64{price, equity, available, usedMargin, d.StopLoss, d.TakeProfit, d.PositionSizeUSD, d.RiskBudgetPct} {
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return 0, fmt.Errorf("开仓失败：资金或价格字段无效")
		}
	}
	if equity <= 0 || available <= 0 {
		return 0, fmt.Errorf("开仓失败：资金不足（净值%.4f USDT，可用%.4f USDT）；开仓信号已保留", equity, available)
	}
	if d.Leverage < 1 || d.Leverage > 3 {
		return 0, fmt.Errorf("开仓失败：执行杠杆必须在1至3倍内")
	}
	if price <= 0 || d.StopLoss <= 0 || d.TakeProfit <= 0 || d.PositionSizeUSD < 0 || usedMargin < 0 {
		return 0, fmt.Errorf("开仓失败：价格、建议仓位或保证金数据无效")
	}
	if positionCount >= 3 {
		return 0, fmt.Errorf("开仓失败：已达到3个持仓上限")
	}
	pct := d.RiskBudgetPct
	if pct == 0 {
		pct = 0.25
	}
	if pct != 0.25 && pct != 0.5 {
		return 0, fmt.Errorf("开仓失败：单笔风险预算仅支持0.25%%或0.5%%")
	}
	distance := math.Abs(price-d.StopLoss) / price
	const cost = decision.EntryCostRate
	riskBudget := equity * pct / 100
	remaining := math.Max(0, equity*0.3-usedMargin)
	nominal := math.Min(riskBudget/(distance+cost), math.Min(equity, math.Min(remaining*float64(d.Leverage), available*0.8*float64(d.Leverage))))
	if d.PositionSizeUSD > 0 {
		nominal = math.Min(nominal, d.PositionSizeUSD)
	}
	minimum := 12.0
	if d.Symbol == "BTCUSDT" || d.Symbol == "ETHUSDT" {
		minimum = 60
	}
	if nominal < minimum {
		return 0, fmt.Errorf("开仓失败：资金/风险预算允许名义金额%.4f USDT，低于%s最低%.2f USDT；不扩大风险凑单", nominal, d.Symbol, minimum)
	}
	return nominal, nil
}

func (at *AutoTrader) sizeSignalEntry(d *decision.Decision, price float64, positions []map[string]interface{}) error {
	// Read fresh funds at execution time, rather than the model's earlier snapshot.
	if exchange, ok := at.trader.(*FuturesTrader); ok {
		exchange.invalidatePositionCaches()
	}
	balance, err := at.trader.GetBalance()
	if err != nil {
		return fmt.Errorf("开仓失败：无法核验资金: %w", err)
	}
	wallet, wOK := balance["totalWalletBalance"].(float64)
	available, aOK := balance["availableBalance"].(float64)
	pnl, pOK := balance["totalUnrealizedProfit"].(float64)
	if !wOK || !aOK || !pOK {
		return fmt.Errorf("开仓失败：账户资金字段不完整")
	}
	used := 0.0
	count := 0
	for _, p := range positions {
		qty, qOK := p["positionAmt"].(float64)
		if !qOK {
			return fmt.Errorf("开仓失败：现有持仓数量无法核验")
		}
		if qty == 0 {
			continue
		}
		mark, mOK := p["markPrice"].(float64)
		lev, lOK := p["leverage"].(float64)
		if !mOK || !lOK || mark <= 0 || lev <= 0 {
			return fmt.Errorf("开仓失败：现有保证金占用无法核验")
		}
		count++
		used += math.Abs(qty) * mark / lev
	}
	size, err := calculateSignalEntrySize(d, price, wallet+pnl, available, used, count)
	if err != nil {
		return err
	}
	d.PositionSizeUSD = size
	d.RiskUSD = size * (math.Abs(price-d.StopLoss)/price + decision.EntryCostRate)
	return nil
}
