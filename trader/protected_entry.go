package trader

import (
	"fmt"
	"guanlan/decision"
	"guanlan/logger"
)

// Resolve price filters before entry, so rule failures cannot create a naked position.
func (at *AutoTrader) prepareEntryProtection(d *decision.Decision) error {
	if exchange, ok := at.trader.(*FuturesTrader); ok {
		stop, err := exchange.protectionTrigger(d.Symbol, d.StopLoss)
		if err != nil {
			return err
		}
		take, err := exchange.protectionTrigger(d.Symbol, d.TakeProfit)
		if err != nil {
			return err
		}
		d.StopLoss, _ = finiteNumber(stop)
		d.TakeProfit, _ = finiteNumber(take)
	}
	return nil
}

func (at *AutoTrader) protectNewEntry(d *decision.Decision, side string, quantity float64, action *logger.DecisionAction) error {
	action.StopLoss, action.TakeProfit = d.StopLoss, d.TakeProfit
	action.ProtectionStatus = "pending"
	err := at.trader.SetStopLoss(d.Symbol, side, quantity, d.StopLoss)
	if err == nil {
		err = at.trader.SetTakeProfit(d.Symbol, side, quantity, d.TakeProfit)
	}
	if err == nil {
		action.ProtectionStatus = "confirmed"
		return nil
	}
	at.entryProtectionBlocked.Store(true)
	action.ProtectionStatus = "failed"
	var closeErr error
	if side == "LONG" {
		_, closeErr = at.trader.CloseLong(d.Symbol, quantity)
	} else {
		_, closeErr = at.trader.CloseShort(d.Symbol, quantity)
	}
	if closeErr != nil {
		return fmt.Errorf("严重：保护单未同步(%v)，本次新仓平仓失败(%v)；已暂停新开仓，需立即人工检查", err, closeErr)
	}
	action.ProtectionStatus = "rolled_back"
	return fmt.Errorf("保护单未同步(%v)，已撤回本次新仓；已暂停新开仓，请检查保护单权限和参数", err)
}
